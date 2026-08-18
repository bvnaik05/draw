import { describe, it, expect } from 'vitest'
import { createDiagramStore } from './useDiagramStore.js'
import { createDiagramDocument } from '@/diagram/schema.js'

// #542: duplicateConnectors scanned EVERY connector in the document, not just the
// selected ones — a connector with two free endpoints always passed its "is this
// one duplicated?" check (`!endpoint.shapeId` is trivially true for a free end),
// so Cmd+D on an unrelated shape also silently redrew every free-floating line on
// the canvas, offset +10/+10, and never selected. This file pins the fix: a
// connector is duplicated only when it is itself selected, or when both its
// endpoints are attached to shapes that are being duplicated alongside it.

const unified = () => createDiagramStore(createDiagramDocument(undefined, 'unified'))

describe('duplicating a selected connector (#542)', () => {
  it('copies a selected line, offsets its free endpoints, and selects the copy', () => {
    const store = unified()
    const connectorId = store.addConnector({ from: { x: 0, y: 0 }, to: { x: 100, y: 0 } })

    const newIds = store.duplicate([connectorId])

    expect(newIds).toHaveLength(1)
    const copy = store.connectorById(newIds[0])
    expect(copy).toBeTruthy()
    expect(copy.from).toEqual({ x: 10, y: 10 })
    expect(copy.to).toEqual({ x: 110, y: 10 })
    expect(store.state.connectors).toHaveLength(2)
    expect(store.state.selection).toEqual(newIds)
  })

  it('does NOT duplicate an unrelated free-floating line when duplicating a shape', () => {
    const store = unified()
    const strayLineId = store.addConnector({ from: { x: 500, y: 500 }, to: { x: 600, y: 600 } })
    const shapeId = store.addShape({ type: 'rectangle', x: 0, y: 0, w: 40, h: 40 })

    const newIds = store.duplicate([shapeId])

    expect(newIds).toEqual([expect.stringMatching(/^s/)])
    // Exactly the original stray line, no silent second copy.
    expect(store.state.connectors.map((c) => c.id)).toEqual([strayLineId])
  })

  it('carries a connector along when BOTH shapes it joins are duplicated together', () => {
    const store = unified()
    const shapeA = store.addShape({ type: 'rectangle', x: 0, y: 0, w: 40, h: 40 })
    const shapeB = store.addShape({ type: 'rectangle', x: 100, y: 0, w: 40, h: 40 })
    const connectorId = store.addConnector({
      from: { shapeId: shapeA, anchor: 'right' },
      to: { shapeId: shapeB, anchor: 'left' },
    })

    const newIds = store.duplicate([shapeA, shapeB])

    expect(store.state.connectors).toHaveLength(2)
    const copy = store.state.connectors.find((c) => c.id !== connectorId)
    // Reconnected to the two COPIES, not left pointing at the originals.
    expect(newIds).toContain(copy.from.shapeId)
    expect(newIds).toContain(copy.to.shapeId)
    expect(newIds).toContain(copy.id)
  })

  it('leaves an untouched connector alone when only one of its shapes is duplicated', () => {
    const store = unified()
    const shapeA = store.addShape({ type: 'rectangle', x: 0, y: 0, w: 40, h: 40 })
    const shapeB = store.addShape({ type: 'rectangle', x: 100, y: 0, w: 40, h: 40 })
    store.addConnector({ from: { shapeId: shapeA, anchor: 'right' }, to: { shapeId: shapeB, anchor: 'left' } })

    store.duplicate([shapeA])

    expect(store.state.connectors).toHaveLength(1)
  })
})

import { describe, it, expect } from 'vitest'
import { createDiagramStore } from '@/stores/useDiagramStore.js'
import { createDiagramDocument } from '@/diagram/schema.js'
import { useShapeTransform } from './useShapeTransform.js'

// #542: arrow-key nudge moved a selected shape but silently did nothing for a
// selected connector — the ids filter kept only ids that resolved via
// shapeById. A connector with a free end now nudges too, in the same commit.

const unified = () => createDiagramStore(createDiagramDocument(undefined, 'unified'))

describe('nudging a selected connector (#542)', () => {
  it('moves both free endpoints by the nudge step', () => {
    const store = unified()
    const transform = useShapeTransform(store)
    const connectorId = store.addConnector({ from: { x: 0, y: 0 }, to: { x: 100, y: 0 } })
    store.select(connectorId)

    transform.nudge(1, 0, false) // ArrowRight, small step

    const connector = store.connectorById(connectorId)
    expect(connector.from.x).toBe(1)
    expect(connector.to.x).toBe(101)
  })

  it('uses the larger step with Shift, same as a shape', () => {
    const store = unified()
    const transform = useShapeTransform(store)
    const connectorId = store.addConnector({ from: { x: 0, y: 0 }, to: { x: 100, y: 0 } })
    store.select(connectorId)

    transform.nudge(0, 1, true) // Shift+ArrowDown, large step

    expect(store.connectorById(connectorId).from.y).toBe(10)
  })

  it('undoes a connector nudge as one step', () => {
    const store = unified()
    const transform = useShapeTransform(store)
    const connectorId = store.addConnector({ from: { x: 0, y: 0 }, to: { x: 100, y: 0 } })
    store.select(connectorId)

    transform.nudge(1, 0, false)
    store.undo()

    expect(store.connectorById(connectorId).from.x).toBe(0)
  })

  it('leaves a fully-attached connector untouched — nothing free to nudge', () => {
    const store = unified()
    const transform = useShapeTransform(store)
    const shapeA = store.addShape({ type: 'rectangle', x: 0, y: 0, w: 40, h: 40 })
    const shapeB = store.addShape({ type: 'rectangle', x: 100, y: 0, w: 40, h: 40 })
    const connectorId = store.addConnector({
      from: { shapeId: shapeA, anchor: 'right' },
      to: { shapeId: shapeB, anchor: 'left' },
    })
    store.select(connectorId)

    transform.nudge(1, 0, false)

    const connector = store.connectorById(connectorId)
    expect(connector.from.shapeId).toBe(shapeA)
    expect(connector.to.shapeId).toBe(shapeB)
  })

  it('moves a mixed shape + connector selection together, in one commit', () => {
    const store = unified()
    const transform = useShapeTransform(store)
    const shapeId = store.addShape({ type: 'rectangle', x: 0, y: 0, w: 40, h: 40 })
    const connectorId = store.addConnector({ from: { x: 0, y: 0 }, to: { x: 10, y: 10 } })
    store.select([shapeId, connectorId])

    transform.nudge(1, 0, false)

    expect(store.shapeById(shapeId).x).toBe(1)
    expect(store.connectorById(connectorId).from.x).toBe(1)

    store.undo()
    expect(store.shapeById(shapeId).x).toBe(0)
    expect(store.connectorById(connectorId).from.x).toBe(0)
  })
})

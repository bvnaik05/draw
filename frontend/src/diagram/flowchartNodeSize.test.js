import { describe, it, expect } from 'vitest'
import {
  flowchartNodeSize,
  flowchartTextArea,
  insetsFor,
  FLOWCHART_FONT_SIZE,
} from './flowchartNodeSize.js'
import { NODE_TYPES, NODE_TYPE_META } from './flowchartModel.js'

// The contract this module exists to keep (#441 items 5/14): the box a node is
// given always leaves room for its text INSIDE the shape, not merely inside the
// shape's bounding box. Every assertion below is really that one claim.
describe('flowchartNodeSize', () => {
  it('defaults flowchart text to 12px', () => {
    expect(FLOWCHART_FONT_SIZE).toBe(12)
  })

  it('never returns a box smaller than the type default', () => {
    for (const nodeType of NODE_TYPES) {
      const size = flowchartNodeSize({ nodeType, text: '' })
      const meta = NODE_TYPE_META[nodeType]
      expect(size.w).toBeGreaterThanOrEqual(meta.w)
      expect(size.h).toBeGreaterThanOrEqual(meta.h)
    }
  })

  it('grows downward once the text passes the width cap', () => {
    const short = flowchartNodeSize({ nodeType: 'process', text: 'Go' })
    const long = flowchartNodeSize({
      nodeType: 'process',
      // Long enough to pass the three lines the default 72px box already holds.
      text: 'this is a document i am writing to make the label wrap over a good many lines so the box has to grow downward to pay for all of them rather than stretching sideways forever',
    })
    expect(long.h).toBeGreaterThan(short.h)
    // Width is capped, so a long label makes the node tall rather than endless.
    expect(long.w).toBeLessThanOrEqual(NODE_TYPE_META.process.w * 1.5)
  })

  it('keeps a junction circular', () => {
    const size = flowchartNodeSize({ nodeType: 'connector', text: 'Junction' })
    expect(size.w).toBe(size.h)
  })

  // The specific failures called out in the issue.
  it('fits "Decision?" inside the diamond without wrapping it per character', () => {
    const size = flowchartNodeSize({ nodeType: 'decision', text: 'Decision?' })
    const area = flowchartTextArea({ x: 0, y: 0, ...size, flowchart: { nodeType: 'decision' } })
    // 9 characters at ~6.4px must fit on ONE line of the inscribed rect. The bug in
    // the issue broke this into "Deci / sion?".
    expect(area.w).toBeGreaterThan('Decision?'.length * 6.4)
  })

  it('fits "Junction" inside the circle without splitting it', () => {
    const size = flowchartNodeSize({ nodeType: 'connector', text: 'Junction' })
    const area = flowchartTextArea({ x: 0, y: 0, ...size, flowchart: { nodeType: 'connector' } })
    // The issue showed this rendered as "Juncti / on".
    expect(area.w).toBeGreaterThan('Junction'.length * 6.4)
  })
})

describe('flowchartTextArea', () => {
  it('keeps the text area strictly inside the box for every type', () => {
    for (const nodeType of NODE_TYPES) {
      const size = flowchartNodeSize({ nodeType, text: 'Some label' })
      const shape = { x: 100, y: 50, ...size, flowchart: { nodeType } }
      const area = flowchartTextArea(shape)
      expect(area.x).toBeGreaterThan(shape.x)
      expect(area.y).toBeGreaterThan(shape.y)
      expect(area.x + area.w).toBeLessThan(shape.x + shape.w)
      expect(area.y + area.h).toBeLessThan(shape.y + shape.h)
    }
  })

  it('clears the dead space each shape actually has', () => {
    const box = { x: 0, y: 0, w: 200, h: 100 }
    // A diamond gives up a quarter of each axis on each side.
    const diamond = flowchartTextArea({ ...box, flowchart: { nodeType: 'decision' } })
    expect(diamond.x).toBeCloseTo(0.25 * 200 + 4, 5)
    expect(diamond.w).toBeCloseTo(200 - 2 * (0.25 * 200 + 4), 5)

    // A document's wave dips below 0.82h, so the text stops above it.
    const document = flowchartTextArea({ ...box, flowchart: { nodeType: 'document' } })
    expect(document.y + document.h).toBeLessThan(0.82 * 100)

    // A cylinder's rim arcs down into the top of the box.
    const database = flowchartTextArea({ ...box, flowchart: { nodeType: 'database' } })
    expect(database.y).toBeGreaterThan(0.16 * 100)
  })

  it('falls back to the process frame for an unknown type', () => {
    expect(insetsFor('nonsense')).toEqual(insetsFor('process'))
  })
})

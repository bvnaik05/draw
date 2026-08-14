import { describe, it, expect } from 'vitest'
import {
  flowchartNodeSize,
  flowchartTextArea,
  insetsFor,
  FLOWCHART_FONT_SIZE,
} from './flowchartNodeSize.js'
import { NODE_TYPES, NODE_TYPE_META } from './flowchartModel.js'
import { wrapLineCount, charsPerLine } from './textMetrics.js'

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

  // #441 round 3: a node that outgrows its label scales up AS A WHOLE. It used to
  // widen to 1.5x and then grow only downward, which left a Process as a letterbox
  // and a Decision as a lozenge — the box stopped looking like its own shape.
  it('grows both axes together, keeping the type\'s proportions', () => {
    const short = flowchartNodeSize({ nodeType: 'process', text: 'Go' })
    const long = flowchartNodeSize({
      nodeType: 'process',
      text: 'this is a document i am writing to make the label wrap over a good many lines so the box has to grow to pay for all of them',
    })
    expect(long.w).toBeGreaterThan(short.w)
    expect(long.h).toBeGreaterThan(short.h)
    // Same shape, just bigger. Ceiling of each axis is the only slack allowed.
    const meta = NODE_TYPE_META.process
    expect(long.w / long.h).toBeCloseTo(meta.w / meta.h, 1)
  })

  it('scales every type about its own aspect ratio', () => {
    const wordy = 'a label long enough that this node has to grow well past its default box'
    for (const nodeType of Object.keys(NODE_TYPE_META)) {
      const size = flowchartNodeSize({ nodeType, text: wordy })
      const meta = NODE_TYPE_META[nodeType]
      expect(size.w / size.h).toBeCloseTo(meta.w / meta.h, 1)
    }
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

// #441 round 2: raising the font size has to grow the box. The letters used to grow
// inside a box that stayed put, so a bigger label spilled straight out of the shape.
describe('font size drives the box', () => {
  it('grows a node when its text is set larger', () => {
    const small = flowchartNodeSize({ nodeType: 'process', text: 'Some label here', fontSize: 12 })
    const large = flowchartNodeSize({ nodeType: 'process', text: 'Some label here', fontSize: 28 })
    // A single line grows sideways first — the default 72px box already has the
    // height for one line at any of these sizes — so compare the whole box.
    expect(large.w * large.h).toBeGreaterThan(small.w * small.h)
    expect(large.w).toBeGreaterThan(small.w)
  })

  it('grows downward too once the bigger text has to wrap', () => {
    const small = flowchartNodeSize({ nodeType: 'process', text: 'A rather longer label that has to wrap over several lines even when it is set small', fontSize: 12 })
    const large = flowchartNodeSize({ nodeType: 'process', text: 'A rather longer label that has to wrap over several lines even when it is set small', fontSize: 30 })
    expect(large.h).toBeGreaterThan(small.h)
  })

  it('keeps the label inside the shape at any size', () => {
    // The invariant is that the WRAPPED label fits the inscribed rect — not that it
    // fits on one line. Growing proportionally means a long label may wrap rather
    // than stretch the box sideways, which is the point: the shape stays itself.
    const label = 'Is it ready?'
    for (const fontSize of [12, 16, 20, 28, 36]) {
      const size = flowchartNodeSize({ nodeType: 'decision', text: label, fontSize })
      const area = flowchartTextArea({ x: 0, y: 0, ...size, flowchart: { nodeType: 'decision' } })
      const scale = fontSize / 12
      const lines = wrapLineCount(label, charsPerLine(area.w, 6.4 * scale))
      // Tolerance is for binary floating point only (128 vs 128.00000000000003),
      // not for slack in the box: the solver sizes to exactly what the text needs.
      expect(area.h).toBeGreaterThan(lines * 16 * scale - 1e-6)
    }
  })

  it('retains the junction\'s circle as the font grows', () => {
    const size = flowchartNodeSize({ nodeType: 'connector', text: 'A', fontSize: 32 })
    expect(size.w).toBe(size.h)
  })
})

// Review of #448: `Math.max(...arr)` passes one argument per element, so a pasted
// label of a few hundred thousand words overflowed the call stack. A diagram
// document is untrusted — a shared diagram renders in someone else's browser.
describe('a pathological label', () => {
  it('measures a 200k-word label instead of blowing the stack', () => {
    const size = flowchartNodeSize({ nodeType: 'process', text: 'a '.repeat(200000) })
    expect(Number.isFinite(size.w)).toBe(true)
    expect(Number.isFinite(size.h)).toBe(true)
    expect(size.w).toBeGreaterThan(0)
  })

  it('measures one enormous unbroken word the same way', () => {
    const size = flowchartNodeSize({ nodeType: 'process', text: 'x'.repeat(300000) })
    expect(Number.isFinite(size.w)).toBe(true)
  })
})

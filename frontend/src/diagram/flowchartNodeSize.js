// The one place a flowchart node's box is derived from its text (#441 items 5, 6,
// 14) — the flowchart counterpart of mindmapNodeSize.js.
//
// The difference from a mind map, and the whole reason this module exists: a
// mind-map node is always a rounded rectangle, so one padding constant describes
// it. A flowchart node is eleven different shapes, and most of them are NOT the
// rectangle their x/y/w/h suggests. A diamond wastes three quarters of its box on
// the four corners outside the slanted edges; a document's bottom edge is a wave
// that dips below the text; a cylinder's top rim arcs down into it; a junction is
// a circle whose usable area is the inscribed square.
//
// Editing text used to treat every one of them as a plain rectangle, which is what
// produced the failures in the issue: "Decision?" wrapping one character per line
// inside a diamond that then stretched off-screen, and a document's label sitting
// on top of its own wave.
//
// So each type declares the dead space on each of its four sides as `{ k, c }` —
// a FRACTION of that axis plus a constant. The fraction is what makes it exact:
// the dead space in a diamond is proportional to its size, not a fixed inset. It
// also makes the box solvable in closed form rather than by iteration, since
//
//   w = textWidth + kLeft*w + cLeft + kRight*w + cRight
//     = (textWidth + cLeft + cRight) / (1 - kLeft - kRight)
//
// Deterministic and DOM-free (no canvas measureText), like mindmapNodeSize, so it
// stays unit-testable under vitest's node environment and gives the same answer on
// every machine. What matters is that the renderer and the live editor inset by
// the same frame this measured, so the wrap the box was sized for is the wrap that
// is drawn and text can never escape the shape.

import { wrapLineCount, charsPerLine } from './textMetrics.js'
import { NODE_TYPE_META } from './flowchartTypes.js'

// Every flowchart node renders its label at this size (#441 item 6 — was 16).
// Anything that measures a node it has not created yet must measure at this size
// too, or it promises a box the click will not produce.
export const FLOWCHART_FONT_SIZE = 12

// The metrics are calibrated at this font size and scale linearly from it.
const BASE_FONT_SIZE = 12
const CHAR_WIDTH = 6.4
const LINE_HEIGHT = 16

// How much wider than its type's default box a node may grow before its text
// wraps and the box grows downward instead. Past this a long label makes a node
// tall, not endless — a 600px-wide Process would wreck the column it sits in.
const MAX_WIDTH_FACTOR = 1.5

// Dead space per side, as {k: fraction of that axis, c: constant px}. `k` covers
// the part of the box the SHAPE itself takes away (it scales with the box); `c` is
// the breathing room between the text and that edge (it does not).
//
// The k values are read straight off flowchartShapes.js, so the two stay in step:
//   - decision: the maximal axis-aligned rect inside a diamond is half its width
//     and half its height (a/hw + b/hh = 1 at a = hw/2, b = hh/2) — a quarter of
//     the box lost on each side of each axis.
//   - document: the bottom edge is drawn from 0.82h and the wave dips to h.
//   - database: the top rim is a 0.16h ellipse arced BOTH ways, so it eats ~0.30h
//     at the top and 0.16h at the bottom.
//   - manualInput: the top edge slopes down from 0.28h.
//   - preparation: the hexagon's points cut 0.16w off each side.
//   - offPageRef: the pentagon narrows to a point from 0.62h down.
//   - connector: the inscribed square of a circle leaves (1 - 1/√2)/2 ≈ 0.146 per
//     side on both axes.
//   - inputOutput: the parallelogram's skew is 18px at every on-canvas width
//     (flowchartShapes caps it as a fraction only below ~100px, far under any node
//     box), so it is a constant here rather than a fraction.
const SIDE = { k: 0, c: 12 }
const INSETS = {
  terminator: { left: { k: 0, c: 16 }, right: { k: 0, c: 16 }, top: { k: 0, c: 10 }, bottom: { k: 0, c: 10 } },
  process: { left: SIDE, right: SIDE, top: { k: 0, c: 10 }, bottom: { k: 0, c: 10 } },
  decision: { left: { k: 0.25, c: 4 }, right: { k: 0.25, c: 4 }, top: { k: 0.25, c: 3 }, bottom: { k: 0.25, c: 3 } },
  inputOutput: { left: { k: 0, c: 24 }, right: { k: 0, c: 24 }, top: { k: 0, c: 10 }, bottom: { k: 0, c: 10 } },
  document: { left: SIDE, right: SIDE, top: { k: 0, c: 8 }, bottom: { k: 0.2, c: 4 } },
  database: { left: SIDE, right: SIDE, top: { k: 0.3, c: 2 }, bottom: { k: 0.16, c: 4 } },
  predefinedProcess: { left: { k: 0, c: 18 }, right: { k: 0, c: 18 }, top: { k: 0, c: 10 }, bottom: { k: 0, c: 10 } },
  manualInput: { left: SIDE, right: SIDE, top: { k: 0.28, c: 4 }, bottom: { k: 0, c: 8 } },
  preparation: { left: { k: 0.16, c: 8 }, right: { k: 0.16, c: 8 }, top: { k: 0, c: 10 }, bottom: { k: 0, c: 10 } },
  offPageRef: { left: SIDE, right: SIDE, top: { k: 0, c: 8 }, bottom: { k: 0.38, c: 4 } },
  connector: { left: { k: 0.146, c: 2 }, right: { k: 0.146, c: 2 }, top: { k: 0.146, c: 2 }, bottom: { k: 0.146, c: 2 } },
}

// A junction is a circle, so its box must stay square however its text measures —
// solving the two axes independently would render it as an ellipse.
const SQUARE_TYPES = new Set(['connector'])

export function insetsFor(nodeType) {
  return INSETS[nodeType] || INSETS.process
}

function metaFor(nodeType) {
  return NODE_TYPE_META[nodeType] || NODE_TYPE_META.process
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value))
}

// Solve one axis: the box length that leaves `content` px between its two insets.
// Guarded against a pathological k pair summing to >= 1, which would divide by
// zero or flip the sign.
function solveAxis(content, near, far, length) {
  const k = near.k + far.k
  const constants = near.c + far.c
  if (k >= 0.9) return content + constants + length * k
  return (content + constants) / (1 - k)
}

// The box for a node of `nodeType` holding `text`. Width grows with the text up to
// the type's cap; beyond it the text wraps and the box grows downward with no
// vertical limit. Never smaller than the type's default box, so an empty node
// still looks like the shape it is.
export function flowchartNodeSize({
  nodeType = 'process',
  text = '',
  fontSize = null,
  minW = 0,
  minH = 0,
} = {}) {
  const typeMeta = metaFor(nodeType)
  // An explicit box on the node is its floor, so a hand-sized node never shrinks
  // back to the type default when its label is edited.
  const meta = { w: Math.max(typeMeta.w, minW || 0), h: Math.max(typeMeta.h, minH || 0) }
  const inset = insetsFor(nodeType)
  const scale = (fontSize || FLOWCHART_FONT_SIZE) / BASE_FONT_SIZE
  const charWidth = CHAR_WIDTH * scale
  const lineHeight = LINE_HEIGHT * scale

  // A label can carry hard line breaks (Enter inside a node keeps typing on a new
  // line), and those are lines the box has to pay for — wrapping alone would fold
  // them into one and clip everything below the first.
  const paragraphs = String(text || '').split(/\r?\n/)
  const longest = Math.max(...paragraphs.map((line) => line.length))

  const wanted = solveAxis(longest * charWidth, inset.left, inset.right, meta.w)
  const w = clamp(wanted, meta.w, Math.max(meta.w, meta.w * MAX_WIDTH_FACTOR * scale))

  // Re-wrap at the width actually granted, so the height pays for the real lines.
  const textW = textSpan(w, inset.left, inset.right)
  const perLine = charsPerLine(textW, charWidth)
  const lines = paragraphs.reduce((total, line) => total + wrapLineCount(line, perLine), 0)
  const h = Math.max(meta.h, solveAxis(lines * lineHeight, inset.top, inset.bottom, meta.h))

  // Ceil, never round: these numbers are the room the text REQUIRES, and rounding
  // one down can leave the box a fraction of a pixel too small for the line it was
  // just measured for — which is a wrap, or a clipped descender, for the sake of
  // half a pixel.
  if (SQUARE_TYPES.has(nodeType)) {
    const side = Math.ceil(Math.max(w, h))
    return { w: side, h: side }
  }
  return { w: Math.ceil(w), h: Math.ceil(h) }
}

// The usable text span along one axis of a box `length` long.
function textSpan(length, near, far) {
  return Math.max(8, length - (near.k * length + near.c) - (far.k * length + far.c))
}

// The same measurement for a free-floating flowchart node SHAPE, which carries its
// text, font size and type in the shared shape fields rather than in a sub-model.
export function flowchartSizeForShape(shape) {
  return flowchartNodeSize({
    nodeType: shape?.flowchart?.nodeType,
    text: shape?.text?.content,
    fontSize: shape?.text?.style?.size,
  })
}

// The padded rect the label lives in, in absolute canvas units. The renderer and
// the live editor both lay out inside this, so the wrap the box was measured for
// is the wrap that is drawn — and the text sits inside the SHAPE, not merely
// inside its bounding box.
export function flowchartTextArea(shape) {
  const inset = insetsFor(shape?.flowchart?.nodeType)
  const left = inset.left.k * shape.w + inset.left.c
  const top = inset.top.k * shape.h + inset.top.c
  return {
    x: shape.x + left,
    y: shape.y + top,
    w: textSpan(shape.w, inset.left, inset.right),
    h: textSpan(shape.h, inset.top, inset.bottom),
  }
}

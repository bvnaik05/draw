// Pure geometry for the migrated flowchart "+" add-handle overlay (issue #77, the
// flowchart counterpart of the mind-map "+" handles from #118).
//
// FlowchartHoverHandles.vue draws the on-canvas "+" affordance that lets mouse
// users grow a migrated flowchart without the keyboard (D/T/I add typed steps).
// vitest is headless (no @vue/test-utils), so the component stays a thin renderer
// and every decision that can go wrong — where the "+" sits, when it shows, which
// node the pointer is over — lives here and is unit-tested.
//
// A migrated flowchart node is an ordinary shape (role 'flowchart-node') with
// absolute x/y/w/h, so — like mindmapHandles.js, and unlike FlowchartLayer.vue
// which works in node-local coords under a per-node <g translate> — these handles
// are produced directly in ABSOLUTE logical canvas units and rendered straight
// into the viewport <g>. The radius/glyph/colour conventions mirror the mind-map
// handles so the two migrated-shape overlays read as one feature.
//
// A single "+" sits at the node's EXIT (bottom-centre for the default TB flow the
// migrated add-path uses — see buildFlowchartChild/placeChild, which drop the new
// step one level DOWN). The exit point matches FlowchartLayer's portPoint(node,
// 'out', 'TB'): for every node type the outgoing TB port is the bottom-centre of
// the box (a decision's diamond bottom vertex included), so one formula covers all
// types. addFlowchartChildShape routes a decision through its next free Yes/No
// branch, so a single "+" is enough there too.

import { isFlowchartShape } from './freeFloating.js'
import { assignPorts } from './flowchartRouting.js'

// --- geometry constants (shared with the mind-map handles for visual parity) ----
//
// These are the mind-map numbers exactly (#441 item 12, mirroring #427): a SMALL
// drawn circle inside a much larger invisible hit circle. The flowchart "+" used to
// be a solid 11px disc — big enough to read as a node in its own right, and dark
// enough to pull the eye off the chart — with its hit area no bigger than the ink.
// Drawing less while targeting more is the whole trick: 7px of ink, 15px of target.
export const ADD_R = 7 // drawn "+" circle radius
export const ADD_HIT_R = 15 // invisible hit radius around that circle
export const ADD_OFFSET = 28 // gap from the node's exit edge to the "+" centre
export const GLYPH = 3.5 // half-length of the "+" strokes inside a circle
// The hover region reaches this far below the node, so sliding the pointer off the
// node's bottom edge onto its "+" keeps the handle alive. Measured against the HIT
// radius, not the drawn one, so the region covers the whole target.
export const HOVER_OUT = ADD_OFFSET + ADD_HIT_R + 12

function boxOf(shape) {
  return { x: shape.x, y: shape.y, w: shape.w, h: shape.h }
}

export function pointInBox(point, box) {
  return (
    !!box &&
    point.x >= box.x &&
    point.x <= box.x + box.w &&
    point.y >= box.y &&
    point.y <= box.y + box.h
  )
}

// Where along a node's bottom edge the "+" should hang: the clearest spot, meaning
// the candidate furthest from every connector already leaving that edge (#441 item
// 12 — the "+" must never sit on the node or on its connectors). With nothing in the
// way that is the centre, which is where a first "+" has always been.
const HANDLE_MARGIN = 14 // keeps the handle off the node's own corners

export function exitPoint(box, occupied = []) {
  const y = box.y + box.h
  if (!occupied.length) return { x: box.x + box.w / 2, y }
  const low = box.x + HANDLE_MARGIN
  const high = box.x + box.w - HANDLE_MARGIN
  if (high <= low) return { x: box.x + box.w / 2, y }
  let best = low
  let bestClearance = -1
  const STEPS = 12
  for (let i = 0; i <= STEPS; i += 1) {
    const x = low + ((high - low) * i) / STEPS
    const clearance = Math.min(...occupied.map((taken) => Math.abs(taken - x)))
    if (clearance > bestClearance) {
      bestClearance = clearance
      best = x
    }
  }
  return { x: Math.round(best), y }
}

// A reusable index of the migrated flowchart: each node's absolute box keyed by id
// (for placement + hit-testing), plus where along each node's BOTTOM edge its
// existing outgoing connectors already leave. Built once per render from the shared
// shapes and threaded through the pure helpers below.
//
// The exits matter because the "+" hangs below the bottom edge, which is exactly
// where those connectors run: with a single centred handle, the moment a node had
// one outgoing edge the "+" sat on top of the line (#441 item 12). Passing the
// connectors is optional — without them the handle simply centres, which is the
// right answer for a node that has no outgoing edge yet.
export function buildContext(shapes, connectors = null) {
  const boxes = {}
  for (const shape of shapes || []) {
    if (isFlowchartShape(shape)) boxes[shape.id] = boxOf(shape)
  }
  return { boxes, exits: bottomExits(boxes, connectors) }
}

// The x of every port sitting on a node's bottom edge, from the same distribution
// the router uses — so the handle dodges the lines that will actually be drawn.
function bottomExits(boxes, connectors) {
  const exits = {}
  if (!connectors) return exits
  const edges = []
  for (const connector of connectors) {
    const fromId = connector.from?.shapeId
    const toId = connector.to?.shapeId
    if (!boxes[fromId] || !boxes[toId] || fromId === toId) continue
    edges.push({ id: connector.id, fromId, toId })
  }
  if (!edges.length) return exits
  const ports = assignPorts(boxes, edges)
  for (const edge of edges) {
    const port = ports[edge.id]
    if (!port) continue
    if (port.fromSide === 'bottom') addExit(exits, edge.fromId, port.from.x)
    if (port.toSide === 'bottom') addExit(exits, edge.toId, port.to.x)
  }
  return exits
}

function addExit(exits, nodeId, x) {
  exits[nodeId] = exits[nodeId] || []
  exits[nodeId].push(x)
}

// The "+" handle(s) to draw for one node, in absolute logical coords: a single
// add-child "+" centred ADD_OFFSET below the node's exit edge, with a short stub
// from the exit point down to the circle. Returned as an array (always length 1
// for a flowchart node) so the component renders it with the same flatMap pass as
// the mind-map overlay. Empty for a shape id that is not a migrated flowchart node.
export function handlesForNode(nodeId, ctx) {
  const box = ctx.boxes[nodeId]
  if (!box) return []
  const exit = exitPoint(box, ctx.exits?.[nodeId] || [])
  return [
    {
      key: `add-${nodeId}`,
      kind: 'child',
      nodeId,
      cx: exit.x,
      cy: exit.y + ADD_OFFSET,
      stubX: exit.x,
      stubY: exit.y,
    },
  ]
}

// Whether a node should currently reveal its handle: only with the select tool,
// and only while it is hovered or the sole selection (mirrors the mind-map
// shouldShowHandles / FlowchartLayer.isActive). Kept pure and per-node so the
// component's target set is a plain filter over this predicate.
export function shouldShowHandles({ hovered = false, soleSelected = false, selectTool = false } = {}) {
  return Boolean(selectTool && (hovered || soleSelected))
}

// The topmost migrated flowchart node (by zIndex) whose box is under `point`, or
// null. Drives hover: the node the cursor is actually over wins outright.
export function nodeAtPoint(point, shapes) {
  let best = null
  for (const shape of shapes || []) {
    if (!isFlowchartShape(shape) || !pointInBox(point, boxOf(shape))) continue
    if (!best || (shape.zIndex || 0) >= (best.zIndex || 0)) best = shape
  }
  return best ? best.id : null
}

// The padded region that keeps a node "hovered" while the pointer slides off its
// bottom edge toward the "+", so the handle does not vanish in the gap (mirrors
// the mind-map hoverRegionOf). It only extends downward, past the "+" circle.
export function hoverRegionOf(nodeId, ctx) {
  const box = ctx.boxes[nodeId]
  if (!box) return null
  return {
    x: box.x - 6,
    y: box.y - 8,
    w: box.w + 12,
    h: box.h + HOVER_OUT,
  }
}

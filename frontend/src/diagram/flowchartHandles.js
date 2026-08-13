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
// Handles PROTRUDE FROM THE CENTRE of the side they extend from (#441 round 2):
// a plain node offers one below its bottom edge, and a DECISION offers one per
// branch on a distinct side — Yes below, No to the right — each previewing the
// branch label it would create. A decision is the one node type whose whole point
// is more than one outgoing flow, so making the user discover that through a
// single "+" that silently cycled branches was hiding the feature.
//
// An earlier pass moved the "+" to whichever part of the edge was clearest, to keep
// it off the outgoing connector. That is dropped: it put the handle somewhere
// different on every node, which reads as arbitrary. The "+" now paints above the
// connectors and carries a white disc, so a route passing under it stays legible.

import { isFlowchartShape } from './freeFloating.js'
import { BRANCH_SIDES } from './flowchartLayout.js'

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

// --- where the handles sit ----------------------------------------------------

// Yes goes down, because that is the flow the eye follows; No goes right. Beyond
// four branches the sides repeat, which is rare enough to accept and still better
// than stacking. BRANCH_SIDES comes from the layout, so the "+" a user presses and
// the place the child lands can never disagree.

// The point on a side's CENTRE where a handle's stub leaves the node, and the
// direction it grows in.
function sideAnchor(box, side) {
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  if (side === 'top') return { x: cx, y: box.y, dx: 0, dy: -1 }
  if (side === 'left') return { x: box.x, y: cy, dx: -1, dy: 0 }
  if (side === 'right') return { x: box.x + box.w, y: cy, dx: 1, dy: 0 }
  return { x: cx, y: box.y + box.h, dx: 0, dy: 1 }
}

function makeHandle(box, nodeId, side, { port = null, label = '' } = {}) {
  const anchor = sideAnchor(box, side)
  return {
    key: `add-${nodeId}-${side}`,
    kind: 'child',
    nodeId,
    side,
    port,
    label,
    cx: Math.round(anchor.x + anchor.dx * ADD_OFFSET),
    cy: Math.round(anchor.y + anchor.dy * ADD_OFFSET),
    stubX: anchor.x,
    stubY: anchor.y,
  }
}

// A reusable index of the migrated flowchart: each node's absolute box keyed by id
// (for placement + hit-testing), plus the branch set of any decision node, which is
// what lets a decision offer one labelled handle per branch.
export function buildContext(shapes) {
  const boxes = {}
  const branches = {}
  for (const shape of shapes || []) {
    if (!isFlowchartShape(shape)) continue
    boxes[shape.id] = boxOf(shape)
    if (shape.flowchart?.nodeType === 'decision') {
      branches[shape.id] = (shape.flowchart.branches || []).map((b) => ({ ...b }))
    }
  }
  return { boxes, branches }
}

// The "+" handle(s) for one node, in absolute logical coords. A decision gets one
// per branch, each on its own side and carrying that branch's label so the user can
// see which outcome they are about to extend; everything else gets a single handle
// below its bottom edge. Empty for an id that is not a migrated flowchart node.
export function handlesForNode(nodeId, ctx) {
  const box = ctx.boxes[nodeId]
  if (!box) return []
  const branches = ctx.branches?.[nodeId]
  if (branches?.length) {
    return branches.map((branch, index) =>
      makeHandle(box, nodeId, BRANCH_SIDES[index % BRANCH_SIDES.length], {
        port: branch.port,
        label: branch.label,
      }),
    )
  }
  return [makeHandle(box, nodeId, 'bottom')]
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

// The padded region that keeps a node "hovered" while the pointer travels from the
// node to one of its handles, so the "+" does not vanish in the gap.
//
// Measured from the HANDLES rather than from a fixed reach, exactly as the mind map
// does (#427). The old fixed box was the bug users hit: it reached a constant
// distance below the node, which left about four pixels of slack around the hit
// circle — a straight synthetic pointer path survived it, and a real hand
// overshooting by a few pixels on the way to the "+" did not, so the handle blinked
// out just as it was being aimed at. Deriving the region means it covers every
// handle wherever they sit, which also makes it correct for a decision's handles on
// three or four different sides.
export function hoverRegionOf(nodeId, ctx) {
  const box = ctx.boxes[nodeId]
  if (!box) return null
  let left = box.x
  let right = box.x + box.w
  let top = box.y
  let bottom = box.y + box.h
  for (const handle of handlesForNode(nodeId, ctx)) {
    left = Math.min(left, handle.cx - ADD_HIT_R)
    right = Math.max(right, handle.cx + ADD_HIT_R)
    top = Math.min(top, handle.cy - ADD_HIT_R)
    bottom = Math.max(bottom, handle.cy + ADD_HIT_R)
  }
  const margin = 12
  return {
    x: left - margin,
    y: top - margin,
    w: right - left + margin * 2,
    h: bottom - top + margin * 2,
  }
}

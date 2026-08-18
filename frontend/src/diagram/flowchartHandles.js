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
// Each handle protrudes from the CENTRE of one side of the node, and a DECISION
// gives each branch a side of its own, previewing the label it would create. A
// decision is the one node type whose whole point is more than one outgoing flow,
// so making the user discover that through a single "+" that silently cycled
// branches was hiding the feature.
//
// An earlier pass moved the "+" to whichever part of the edge was clearest, to keep
// it off the outgoing connector. That is dropped: it put the handle somewhere
// different on every node, which reads as arbitrary. The "+" now paints above the
// connectors and carries a white disc, so a route passing under it stays legible.
//
// A handle is an AVAILABLE action, never a decoration (#549 items 2/3/4). A side
// that already carries a connector offers no "+", and a decision branch that has
// already been taken offers none either — so a built-up chart shows a mark only
// where a new flow can actually go, and one connection is not framed by a "+" at
// each of its ends.

import { ROLE, isFlowchartShape } from './freeFloating.js'
import { chooseSides } from './flowchartRouting.js'

// --- geometry constants (shared with the mind-map handles for visual parity) ----
//
// These are the mind-map numbers exactly (#441 item 12, mirroring #427): a SMALL
// drawn circle inside a much larger invisible hit circle. The flowchart "+" used to
// be a solid 11px disc — big enough to read as a node in its own right, and dark
// enough to pull the eye off the chart — with its hit area no bigger than the ink.
// Drawing less while targeting more is the whole trick: 7px of ink, 20px of target
// (the target grew in #511 — the "+" was reported hard to hit, and these two
// overlays share one number so that a fix to either is a fix to both).
export const ADD_R = 7 // drawn "+" circle radius
export const ADD_HIT_R = 20 // invisible hit radius around that circle
export const ADD_OFFSET = 28 // gap from the node's exit edge to the "+" centre
export const GLYPH = 3.5 // half-length of the "+" strokes inside a circle
// The hover region reaches this far below the node, so sliding the pointer off the
// node's bottom edge onto its "+" keeps the handle alive. Measured against the HIT
// radius, not the drawn one, so the region covers the whole target.
export const HOVER_OUT = ADD_OFFSET + ADD_HIT_R + 12
// How far from a node the pointer starts to count as "at" it. The handles reveal on
// APPROACH, not on contact: coming near a node is enough to see what it offers, so
// the "+" is already there to aim at rather than appearing only once the pointer has
// landed on the node and then having to be chased.
export const APPROACH_PAD = 24

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

// Every branch of a decision leaves DOWNWARD, spread across the bottom edge, so a
// fork reads as a fork. An earlier pass put Yes below and No to the right; sending
// one outcome sideways made the two look like different kinds of thing rather than
// two answers to the same question.

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

function makeHandle(box, nodeId, side, { port = null, label = '', key = side } = {}) {
  const anchor = sideAnchor(box, side)
  return {
    key: `add-${nodeId}-${key}`,
    kind: 'child',
    nodeId,
    side,
    port,
    label,
    cx: Math.round(anchor.x + anchor.dx * ADD_OFFSET),
    cy: Math.round(anchor.y + anchor.dy * ADD_OFFSET),
    stubX: Math.round(anchor.x),
    stubY: Math.round(anchor.y),
  }
}

// A reusable index of the migrated flowchart: each node's absolute box keyed by id
// (for placement + hit-testing), the branch set of any decision node, and what is
// already connected — which sides carry a connector, and which decision branches
// have been taken. Everything a handle needs to know whether it is a real offer.
export function buildContext(shapes, connectors) {
  const boxes = {}
  const branches = {}
  for (const shape of shapes || []) {
    if (!isFlowchartShape(shape)) continue
    boxes[shape.id] = boxOf(shape)
    if (shape.flowchart?.nodeType === 'decision') {
      branches[shape.id] = (shape.flowchart.branches || []).map((b) => ({ ...b }))
    }
  }
  return { boxes, branches, ...occupancy(boxes, connectors) }
}

// Which sides and which branch ports are already spoken for.
//
// The SIDE comes from chooseSides — the same function the renderer routes with — so
// "occupied" means exactly the side the drawn connector leaves or arrives on, and it
// stays right after a drag moves a node to the other side of its neighbour. Reading
// the connector's stored anchor instead would go stale the moment anything moved.
function occupancy(boxes, connectors) {
  const usedSides = {}
  const usedPorts = {}
  const mark = (map, id, value) => {
    if (!map[id]) map[id] = new Set()
    map[id].add(value)
  }
  for (const connector of connectors || []) {
    if (connector.role !== ROLE.flowchartEdge) continue
    const fromId = connector.from?.shapeId
    const toId = connector.to?.shapeId
    if (!boxes[fromId] || !boxes[toId] || fromId === toId) continue
    const sides = chooseSides(boxes[fromId], boxes[toId])
    mark(usedSides, fromId, sides.from)
    mark(usedSides, toId, sides.to)
    mark(usedPorts, fromId, connector.flowchart?.fromPort || 'out')
  }
  return { usedSides, usedPorts }
}

// The sides a "+" may take, in the order they are handed out. Bottom leads because
// a flowchart reads downward, so the first offer is always the natural one.
const SIDE_ORDER = ['bottom', 'right', 'left', 'top']

// The sides of `nodeId` that no connector already uses.
function freeSides(nodeId, ctx) {
  const used = ctx.usedSides?.[nodeId]
  return SIDE_ORDER.filter((side) => !used?.has(side))
}

// A decision's branches that have not been extended yet, in branch order.
function openBranches(nodeId, ctx) {
  const used = ctx.usedPorts?.[nodeId]
  return (ctx.branches?.[nodeId] || []).filter((branch) => !used?.has(branch.port))
}

// The "+" handle(s) for one node, in absolute logical coords.
//
// A plain node offers one per FREE side. A decision gives each of its untaken
// branches a free side of its own — Yes down, No right — rather than crowding them
// onto the bottom edge, so the two outcomes read as two separate directions and a
// branch preview can never land on the branch next to it (#549 item 3). A decision
// whose every branch has been extended falls back to the plain offers, which is how
// it grows a further outcome (#441 item 15). Empty for an id that is not a migrated
// flowchart node, and empty for a node whose every side is already connected: there
// is no new flow to offer it.
export function handlesForNode(nodeId, ctx) {
  const box = ctx.boxes[nodeId]
  if (!box) return []
  const branches = openBranches(nodeId, ctx)
  const sides = offerableSides(box, nodeId, ctx, branches.length > 0)
  if (!branches.length) return sides.map((side) => makeHandle(box, nodeId, side))
  // Branches are handed the usable sides in order, so a side that is blocked moves
  // a branch along to the next one rather than costing it its handle.
  return branches
    .slice(0, sides.length)
    .map((branch, index) =>
      makeHandle(box, nodeId, sides[index], {
        port: branch.port,
        label: branch.label,
        key: branch.port,
      }),
    )
}

// The free sides a "+" can actually be offered on: those whose handle would not
// land on ANOTHER node (#441 round 3). A mark in taken space points at room that
// is not there, and covers the node underneath.
//
// If every free side is blocked they all come back rather than nothing: a node
// hemmed in on all sides must still be extendable, and placement will find room
// even when the handle's own spot has none.
function offerableSides(box, nodeId, ctx, preview) {
  const free = freeSides(nodeId, ctx)
  const clear = free.filter(
    (side) => !hitsAnotherNode(footprintOf(makeHandle(box, nodeId, side), preview), nodeId, ctx),
  )
  return clear.length ? clear : free
}

// Whether a footprint overlaps some other node's box.
function hitsAnotherNode(footprint, nodeId, ctx) {
  for (const [otherId, box] of Object.entries(ctx.boxes || {})) {
    if (otherId === nodeId) continue
    if (
      footprint.x + footprint.w >= box.x &&
      footprint.x <= box.x + box.w &&
      footprint.y + footprint.h >= box.y &&
      footprint.y <= box.y + box.h
    ) {
      return true
    }
  }
  return false
}

// What a handle actually covers: its mark, plus — when it carries a branch preview
// — the room the pill takes just beyond the mark, further along the direction that
// branch would travel (#549 item 3). Without this, a "+" could sit in clear space
// while the label announcing it landed on the node behind. The pill's real width
// comes from measuring its text, which is the renderer's job, so this is a nominal
// span sized for a normal branch label.
// Keep in step with the pill FlowchartHoverHandles draws (its drop plus its height).
const PREVIEW_REACH = 34 // how far past the mark a pill hangs
const PREVIEW_HALF_SPAN = 30 // half the room a pill takes across its own direction

function footprintOf(handle, preview = false) {
  let left = handle.cx - ADD_R
  let right = handle.cx + ADD_R
  let top = handle.cy - ADD_R
  let bottom = handle.cy + ADD_R
  if (preview) {
    const vertical = handle.side === 'top' || handle.side === 'bottom'
    if (vertical) {
      left = handle.cx - PREVIEW_HALF_SPAN
      right = handle.cx + PREVIEW_HALF_SPAN
      if (handle.side === 'bottom') bottom = handle.cy + PREVIEW_REACH
      else top = handle.cy - PREVIEW_REACH
    } else {
      if (handle.side === 'right') right = handle.cx + PREVIEW_REACH
      else left = handle.cx - PREVIEW_REACH
    }
  }
  return { x: left, y: top, w: right - left, h: bottom - top }
}

// Whether a node should currently reveal its handle: only with the select tool,
// and only while it is hovered or the sole selection (mirrors the mind-map
// shouldShowHandles / FlowchartLayer.isActive). Kept pure and per-node so the
// component's target set is a plain filter over this predicate.
export function shouldShowHandles({ hovered = false, soleSelected = false, selectTool = false } = {}) {
  return Boolean(selectTool && (hovered || soleSelected))
}

// The handle of `nodeId` under `point`, or null. Measured against the HIT radius,
// which is much wider than the drawn mark — so nearest wins rather than first in
// list order, or a point inside two targets goes to whichever happened to be built
// first instead of the one being aimed at (#511, same change as the mind map's).
export function handleAtPoint(point, nodeId, ctx) {
  let best = null
  for (const handle of handlesForNode(nodeId, ctx)) {
    const distance = Math.hypot(point.x - handle.cx, point.y - handle.cy)
    if (distance > ADD_HIT_R) continue
    if (!best || distance < best.distance) best = { handle, distance }
  }
  return best?.handle || null
}

// Which node owns the hover after the pointer moves to `point` — the flowchart
// counterpart of the mind map's state machine (#427 item 1).
//
// The ORDER is the fix. A "+" belongs to the node that offered it, so while the
// pointer is on one of the current node's handles that node KEEPS the hover, even
// when the point also falls inside a neighbouring node's box. Testing `nodeAtPoint`
// first — which is what the flowchart overlay used to do — let a neighbour steal
// the hover the instant the pointer reached a "+" that happened to overlap it, and
// the handle vanished from under the cursor.
export function nextHoverTarget({ point, currentId = null, ctx, shapes }) {
  if (currentId && ctx.boxes[currentId] && handleAtPoint(point, currentId, ctx)) return currentId
  const direct = nodeAtPoint(point, shapes)
  if (direct) return direct
  if (currentId && pointInBox(point, hoverRegionOf(currentId, ctx))) return currentId
  return nodeInReach(point, ctx)
}

// The nearest node whose hover region `point` has reached, or null. This is what
// makes the "+" reveal on APPROACH: hovering AROUND a node is enough to see the
// handle, so it is already on screen to aim at. Without it the handle appeared only
// once the pointer was on the node — and then had to be chased into open canvas.
//
// Regions of neighbouring nodes can overlap, so nearest-centre decides, which is
// also what keeps the choice stable as the pointer moves through the gap between
// two of them.
export function nodeInReach(point, ctx) {
  let best = null
  let bestDistance = Infinity
  for (const nodeId of Object.keys(ctx.boxes || {})) {
    if (!pointInBox(point, hoverRegionOf(nodeId, ctx))) continue
    const box = ctx.boxes[nodeId]
    const dx = point.x - (box.x + box.w / 2)
    const dy = point.y - (box.y + box.h / 2)
    const distance = dx * dx + dy * dy
    if (distance < bestDistance) {
      bestDistance = distance
      best = nodeId
    }
  }
  return best
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

// The padded region a node answers for: the pointer reaching it REVEALS the node's
// handles (nodeInReach), and staying inside it keeps them alive while the pointer
// travels from the node to one of them, so the "+" does not vanish in the gap.
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
  // Padded on every side, not just where the handles hang: the region is what the
  // pointer must reach for the "+" to reveal, and a node is approached from
  // whichever direction the user happens to come from.
  return {
    x: left - APPROACH_PAD,
    y: top - APPROACH_PAD,
    w: right - left + APPROACH_PAD * 2,
    h: bottom - top + APPROACH_PAD * 2,
  }
}

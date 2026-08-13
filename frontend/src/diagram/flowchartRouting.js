// Orthogonal connector routing for flowcharts (#441 items 7, 8, 9, 16, 19).
//
// What was here before was a single formula in ConnectorView: leave the source,
// run HORIZONTALLY to the midpoint, turn, arrive. That one hardcoded first axis is
// the root of several of the issue's complaints at once:
//
//   - The last segment was therefore always horizontal, so `marker orient="auto"`
//     always drew the arrowhead pointing left or right. A top-to-bottom flow only
//     looked right when the two nodes happened to be exactly aligned, because then
//     the final segment had zero length and SVG silently fell back to the previous
//     one (item 7).
//   - It knew nothing about the other nodes, so a connector would run straight
//     through an unrelated box (item 8).
//   - Every edge leaving a node left from the same point, so branches stacked on
//     top of each other (item 19).
//
// This module answers all of that from the node boxes alone, every render, so a
// route is never stale after a drag (item 17). It is pure and DOM-free, which is
// what lets the routing be unit-tested rather than eyeballed.
//
// The output is a polyline plus the points where this edge should HOP over another
// (item 9). Turning that into an SVG path is flowchartPath.js's job.

const CLEARANCE = 14 // how far a route stays off a node box it is avoiding
const STUB = 16 // straight run off a port before the route may turn
const PORT_MARGIN = 12 // keeps distributed ports off the corners of a side
const TURN_COST = 24 // a bend costs this much length, so routes prefer to stay straight
const MAX_ROUTED_NODES = 60 // above this the grid search is skipped for the plain elbow

const SIDE_NORMALS = {
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}

export function sideNormal(side) {
  return SIDE_NORMALS[side] || SIDE_NORMALS.bottom
}

function isVertical(side) {
  return side === 'top' || side === 'bottom'
}

function centerOf(box) {
  return { x: box.x + box.w / 2, y: box.y + box.h / 2 }
}

// Which side of each node an edge should leave and enter (#441 item 16).
//
// The dominant axis alone is not enough: two nodes side by side but with a small
// vertical offset are "mostly horizontal" by centre distance, yet if their vertical
// spans overlap there is no room to route above or below. So the axis with real
// SEPARATION wins, and centre distance only breaks the tie. That is what keeps a
// connector from entering a node through a side it has no business approaching.
export function chooseSides(fromBox, toBox) {
  const a = centerOf(fromBox)
  const b = centerOf(toBox)
  const dx = b.x - a.x
  const dy = b.y - a.y
  const gapX = gapBetween(fromBox.x, fromBox.w, toBox.x, toBox.w)
  const gapY = gapBetween(fromBox.y, fromBox.h, toBox.y, toBox.h)

  // Prefer the axis the two boxes are actually apart on.
  let vertical
  if (gapY > 0 && gapX <= 0) vertical = true
  else if (gapX > 0 && gapY <= 0) vertical = false
  else vertical = Math.abs(dy) >= Math.abs(dx)

  if (vertical) {
    return dy >= 0 ? { from: 'bottom', to: 'top' } : { from: 'top', to: 'bottom' }
  }
  return dx >= 0 ? { from: 'right', to: 'left' } : { from: 'left', to: 'right' }
}

// Clear space between two spans on one axis; negative when they overlap.
function gapBetween(aStart, aLength, bStart, bLength) {
  return Math.max(aStart - (bStart + bLength), bStart - (aStart + aLength))
}

// ----- port distribution ------------------------------------------------------

// Spread the edges that share one side of one node along that side, instead of
// stacking them all on its midpoint (#441 item 19). Ports are ordered by where the
// far end of each edge sits along the cross axis, so branches leave in the same
// left-to-right order they arrive — routes then fan out cleanly instead of
// crossing each other on the way out.
//
// Returns { [edgeId]: { from: {x,y}, to: {x,y}, fromSide, toSide } }.
export function assignPorts(boxes, edges) {
  const sides = {}
  const groups = new Map()
  for (const edge of edges) {
    const fromBox = boxes[edge.fromId]
    const toBox = boxes[edge.toId]
    if (!fromBox || !toBox) continue
    const chosen = chooseSides(fromBox, toBox)
    sides[edge.id] = chosen
    addToGroup(groups, `${edge.fromId}|${chosen.from}`, { edgeId: edge.id, end: 'from', far: centerOf(toBox) })
    addToGroup(groups, `${edge.toId}|${chosen.to}`, { edgeId: edge.id, end: 'to', far: centerOf(fromBox) })
  }

  const ports = {}
  for (const [key, members] of groups) {
    const [nodeId, side] = key.split('|')
    const box = boxes[nodeId]
    const along = isVertical(side) ? 'x' : 'y'
    members.sort((one, other) => one.far[along] - other.far[along])
    members.forEach((member, index) => {
      const point = portPoint(box, side, index, members.length)
      ports[member.edgeId] = ports[member.edgeId] || {}
      ports[member.edgeId][member.end] = point
    })
  }

  const out = {}
  for (const edge of edges) {
    if (!ports[edge.id]?.from || !ports[edge.id]?.to) continue
    out[edge.id] = { ...ports[edge.id], fromSide: sides[edge.id].from, toSide: sides[edge.id].to }
  }
  return out
}

function addToGroup(groups, key, value) {
  const list = groups.get(key) || []
  list.push(value)
  groups.set(key, list)
}

// The `index`-th of `count` evenly spread points along one side of a box.
function portPoint(box, side, index, count) {
  const vertical = isVertical(side)
  const span = vertical ? box.w : box.h
  const start = vertical ? box.x : box.y
  const usable = Math.max(0, span - PORT_MARGIN * 2)
  const offset = start + PORT_MARGIN + (usable * (index + 1)) / (count + 1)
  if (side === 'top') return { x: offset, y: box.y }
  if (side === 'bottom') return { x: offset, y: box.y + box.h }
  if (side === 'left') return { x: box.x, y: offset }
  return { x: box.x + box.w, y: offset }
}

// ----- the plain elbow --------------------------------------------------------

// An orthogonal route from one port to another that LEAVES along the exit normal
// and ARRIVES along the entry normal. Both ends get a straight stub first, so the
// final segment is always `STUB` long and always points the way the flow actually
// goes — which is what makes the arrowhead correct for every orientation (#441
// item 7), including the aligned case that used to end in a zero-length segment.
export function elbowThroughNormals(from, fromSide, to, toSide) {
  const nFrom = sideNormal(fromSide)
  const nTo = sideNormal(toSide)
  const a = { x: from.x + nFrom.x * STUB, y: from.y + nFrom.y * STUB }
  const b = { x: to.x + nTo.x * STUB, y: to.y + nTo.y * STUB }
  return dedupe([from, ...joinOrthogonal(a, fromSide, b, toSide), to])
}

// Connect the two stub ends with an orthogonal run: a Z when both ports face along
// the same axis (turn at the halfway line), an L when they face across each other.
function joinOrthogonal(a, fromSide, b, toSide) {
  if (isVertical(fromSide) === isVertical(toSide)) {
    if (isVertical(fromSide)) {
      const midY = (a.y + b.y) / 2
      return [a, { x: a.x, y: midY }, { x: b.x, y: midY }, b]
    }
    const midX = (a.x + b.x) / 2
    return [a, { x: midX, y: a.y }, { x: midX, y: b.y }, b]
  }
  // Perpendicular: one corner, placed so the first move continues along the exit.
  const corner = isVertical(fromSide) ? { x: a.x, y: b.y } : { x: b.x, y: a.y }
  return [a, corner, b]
}

function dedupe(points) {
  const out = []
  for (const point of points) {
    const last = out[out.length - 1]
    if (!last || Math.abs(last.x - point.x) > 0.01 || Math.abs(last.y - point.y) > 0.01) out.push(point)
  }
  return out
}

// ----- obstacle avoidance -----------------------------------------------------

function inflate(box, margin) {
  return { x: box.x - margin, y: box.y - margin, w: box.w + margin * 2, h: box.h + margin * 2 }
}

// Whether an axis-aligned segment passes through a rect's interior. Touching the
// boundary is fine — the rects handed here are already inflated by CLEARANCE.
function segmentHitsRect(p, q, rect) {
  const loX = Math.min(p.x, q.x)
  const hiX = Math.max(p.x, q.x)
  const loY = Math.min(p.y, q.y)
  const hiY = Math.max(p.y, q.y)
  return loX < rect.x + rect.w && hiX > rect.x && loY < rect.y + rect.h && hiY > rect.y
}

function pathIsClear(points, obstacles) {
  for (let i = 0; i < points.length - 1; i += 1) {
    for (const rect of obstacles) {
      if (segmentHitsRect(points[i], points[i + 1], rect)) return false
    }
  }
  return true
}

// A route around the obstacles, found on a visibility grid (#441 item 8).
//
// The grid lines are the only places an orthogonal route ever needs to turn: just
// outside each obstacle's edges, plus the two ports' own coordinates. That keeps
// the search a few dozen nodes wide for a normal chart instead of a pixel raster,
// and it is why this can run on every render. Bends are priced (TURN_COST) so the
// result reads as a deliberate route rather than a staircase.
function routeAround(from, fromSide, to, toSide, obstacles) {
  const nFrom = sideNormal(fromSide)
  const nTo = sideNormal(toSide)
  const start = { x: from.x + nFrom.x * STUB, y: from.y + nFrom.y * STUB }
  const goal = { x: to.x + nTo.x * STUB, y: to.y + nTo.y * STUB }

  // Only the obstacles anywhere near this edge can affect it. Filtering them first
  // is what keeps the grid small: an obstacle contributes two lines on each axis, so
  // on a large chart an unfiltered grid would be thousands of intersections wide for
  // a route that only ever needed to step around one box.
  const near = nearbyObstacles(start, goal, obstacles)
  const xs = axisLines(near, 'x', 'w', [start.x, goal.x])
  const ys = axisLines(near, 'y', 'h', [start.y, goal.y])
  const path = searchGrid(start, goal, xs, ys, near)
  if (!path) return null
  return dedupe([from, ...path, to])
}

// Obstacles overlapping the corridor between the two ports, widened enough that a
// route has room to detour around the ones at its edge.
const CORRIDOR_PAD = 120
function nearbyObstacles(start, goal, obstacles) {
  const region = {
    x: Math.min(start.x, goal.x) - CORRIDOR_PAD,
    y: Math.min(start.y, goal.y) - CORRIDOR_PAD,
    w: Math.abs(goal.x - start.x) + CORRIDOR_PAD * 2,
    h: Math.abs(goal.y - start.y) + CORRIDOR_PAD * 2,
  }
  return obstacles.filter(
    (rect) =>
      rect.x < region.x + region.w &&
      rect.x + rect.w > region.x &&
      rect.y < region.y + region.h &&
      rect.y + rect.h > region.y,
  )
}

// Candidate turn lines on one axis: just outside every obstacle, plus the endpoints.
function axisLines(obstacles, key, sizeKey, extra) {
  const values = new Set(extra)
  for (const rect of obstacles) {
    values.add(rect[key] - 1)
    values.add(rect[key] + rect[sizeKey] + 1)
  }
  return [...values].sort((a, b) => a - b)
}

function nearestIndex(values, target) {
  let best = 0
  for (let i = 1; i < values.length; i += 1) {
    if (Math.abs(values[i] - target) < Math.abs(values[best] - target)) best = i
  }
  return best
}

// A binary min-heap on `f`. A plain array re-sorted on every pop turned the search
// into O(n² log n) and made this the most expensive thing on the canvas during a
// drag, when it reruns on every pointer move.
function makeHeap() {
  const items = []
  const swap = (i, j) => {
    const t = items[i]
    items[i] = items[j]
    items[j] = t
  }
  return {
    get size() {
      return items.length
    },
    push(item) {
      items.push(item)
      let i = items.length - 1
      while (i > 0) {
        const parent = (i - 1) >> 1
        if (items[parent].f <= items[i].f) break
        swap(parent, i)
        i = parent
      }
    },
    pop() {
      const top = items[0]
      const last = items.pop()
      if (items.length) {
        items[0] = last
        let i = 0
        for (;;) {
          const left = i * 2 + 1
          const right = left + 1
          let best = i
          if (left < items.length && items[left].f < items[best].f) best = left
          if (right < items.length && items[right].f < items[best].f) best = right
          if (best === i) break
          swap(best, i)
          i = best
        }
      }
      return top
    },
  }
}

// A* over the grid intersections, 4-connected, with a Manhattan heuristic. The
// state includes the direction of travel so a turn can be priced; the route is
// rebuilt from a came-from map at the end rather than carried on every open node.
function searchGrid(start, goal, xs, ys, obstacles) {
  const startNode = { ix: nearestIndex(xs, start.x), iy: nearestIndex(ys, start.y) }
  const goalNode = { ix: nearestIndex(xs, goal.x), iy: nearestIndex(ys, goal.y) }
  const at = (ix, iy) => ({ x: xs[ix], y: ys[iy] })
  const stateKey = (ix, iy, dir) => `${ix},${iy},${dir}`
  const goalPoint = at(goalNode.ix, goalNode.iy)

  const open = makeHeap()
  const best = new Map()
  const cameFrom = new Map()
  const startKey = stateKey(startNode.ix, startNode.iy, null)
  open.push({ ...startNode, dir: null, g: 0, f: 0, key: startKey })
  best.set(startKey, 0)

  let guard = 0
  while (open.size && guard < 20000) {
    guard += 1
    const node = open.pop()
    if (node.g > (best.get(node.key) ?? Infinity)) continue
    if (node.ix === goalNode.ix && node.iy === goalNode.iy) {
      return rebuild(cameFrom, node.key, at, at(startNode.ix, startNode.iy))
    }

    const here = at(node.ix, node.iy)
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ix = node.ix + dx
      const iy = node.iy + dy
      if (ix < 0 || iy < 0 || ix >= xs.length || iy >= ys.length) continue
      const next = at(ix, iy)
      if (obstacles.some((rect) => segmentHitsRect(here, next, rect))) continue
      const dir = dx !== 0 ? 'h' : 'v'
      const step = Math.abs(next.x - here.x) + Math.abs(next.y - here.y)
      const g = node.g + step + (node.dir && node.dir !== dir ? TURN_COST : 0)
      const key = stateKey(ix, iy, dir)
      if (g >= (best.get(key) ?? Infinity)) continue
      best.set(key, g)
      cameFrom.set(key, { from: node.key, ix, iy })
      const h = Math.abs(next.x - goalPoint.x) + Math.abs(next.y - goalPoint.y)
      open.push({ ix, iy, dir, g, f: g + h, key })
    }
  }
  return null
}

function rebuild(cameFrom, endKey, at, startPoint) {
  const points = []
  let key = endKey
  let guard = 0
  while (key && guard < 5000) {
    guard += 1
    const step = cameFrom.get(key)
    if (!step) break // the start state is the only one with no came-from entry
    points.unshift(at(step.ix, step.iy))
    key = step.from
  }
  // The walk above records each state's OWN point, so the start — which no entry
  // points at — has to be put back. Without it the route would begin at its first
  // turn rather than at the port's stub, losing the straight run off the node.
  points.unshift(startPoint)
  return points
}

// ----- jumpers ----------------------------------------------------------------

// Where two routes cross, one of them hops (#441 item 9). Only a horizontal
// segment crossing a vertical one counts — collinear overlaps are not a crossing,
// they are two lines sharing a lane, and an arc there would be noise.
//
// The edge LATER in the list hops, which is stable: the same chart always draws the
// same hops, so nothing flickers as unrelated edges re-render.
export function findCrossings(routes, order) {
  const crossings = {}
  for (const id of order) crossings[id] = []
  for (let i = 0; i < order.length; i += 1) {
    for (let j = 0; j < i; j += 1) {
      const later = routes[order[i]]
      const earlier = routes[order[j]]
      if (!later || !earlier) continue
      for (const point of intersections(later, earlier)) crossings[order[i]].push(point)
    }
  }
  return crossings
}

function intersections(a, b) {
  const found = []
  for (const one of segments(a)) {
    for (const other of segments(b)) {
      const point = crossPoint(one, other)
      if (point) found.push(point)
    }
  }
  return found
}

function segments(points) {
  const out = []
  for (let i = 0; i < points.length - 1; i += 1) out.push([points[i], points[i + 1]])
  return out
}

function crossPoint([p1, p2], [q1, q2]) {
  const pHorizontal = Math.abs(p1.y - p2.y) < 0.01
  const qHorizontal = Math.abs(q1.y - q2.y) < 0.01
  if (pHorizontal === qHorizontal) return null
  const [h1, h2] = pHorizontal ? [p1, p2] : [q1, q2]
  const [v1, v2] = pHorizontal ? [q1, q2] : [p1, p2]
  const x = v1.x
  const y = h1.y
  const withinH = x > Math.min(h1.x, h2.x) + 0.01 && x < Math.max(h1.x, h2.x) - 0.01
  const withinV = y > Math.min(v1.y, v2.y) + 0.01 && y < Math.max(v1.y, v2.y) - 0.01
  return withinH && withinV ? { x, y } : null
}

// ----- the whole pass ---------------------------------------------------------

// Route every edge of a chart. `boxes` is { nodeId: {x,y,w,h} }; `edges` is
// [{ id, fromId, toId }] in a stable order. Returns
// { [edgeId]: { points, crossings, fromSide, toSide } }.
export function routeFlowchartEdges(boxes, edges) {
  const ports = assignPorts(boxes, edges)
  const ids = Object.keys(boxes)
  const canAvoid = ids.length <= MAX_ROUTED_NODES
  const routes = {}
  const order = []

  for (const edge of edges) {
    const port = ports[edge.id]
    if (!port) continue
    order.push(edge.id)
    const plain = elbowThroughNormals(port.from, port.fromSide, port.to, port.toSide)
    // Everything except the two nodes this edge belongs to is an obstacle.
    const obstacles = canAvoid
      ? ids
          .filter((id) => id !== edge.fromId && id !== edge.toId)
          .map((id) => inflate(boxes[id], CLEARANCE))
      : []
    const points =
      obstacles.length && !pathIsClear(plain, obstacles)
        ? routeAround(port.from, port.fromSide, port.to, port.toSide, obstacles) || plain
        : plain
    routes[edge.id] = { points, fromSide: port.fromSide, toSide: port.toSide }
  }

  const crossings = findCrossings(
    Object.fromEntries(order.map((id) => [id, routes[id].points])),
    order,
  )
  for (const id of order) routes[id].crossings = crossings[id]
  return routes
}

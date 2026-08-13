// Turn a routed flowchart polyline into an SVG path (#441 items 7, 9).
//
// Two things have to happen along the way and neither composes with the other for
// free: corners are rounded, and where this route hops another one it lifts into a
// small arc. Both are local edits to a segment, so the walk below emits one segment
// at a time — trimmed at each end for whatever corner radius its neighbours claimed,
// and interrupted in the middle by any jumpers that fall on it.
//
// Kept separate from flowchartRouting.js so the routing can be asserted as
// coordinates (which is readable) rather than as path strings (which is not).

const CORNER_RADIUS = 10
const JUMP_RADIUS = 5

function isHorizontal(a, b) {
  return Math.abs(a.y - b.y) < Math.abs(a.x - b.x)
}

function length(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

// Move from `a` toward `b` by `distance`.
function advance(a, b, distance) {
  const total = length(a, b)
  if (total === 0) return { ...a }
  const t = distance / total
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

// The corner radius usable at vertex `i`: never more than half of either leg, so a
// tight route keeps its corner instead of overshooting into the next one.
function radiusAt(points, i) {
  const before = length(points[i - 1], points[i])
  const after = length(points[i], points[i + 1])
  return Math.min(CORNER_RADIUS, before / 2, after / 2)
}

// The jumper arcs that fall on the segment a→b, ordered along it and far enough
// from both ends that an arc cannot spill past the corner.
function jumpsOn(a, b, crossings) {
  const horizontal = isHorizontal(a, b)
  const span = length(a, b)
  return (crossings || [])
    .filter((point) => onSegment(a, b, point, horizontal))
    .map((point) => ({ point, at: length(a, point) }))
    .filter((jump) => jump.at > JUMP_RADIUS + 1 && jump.at < span - JUMP_RADIUS - 1)
    .sort((one, other) => one.at - other.at)
}

function onSegment(a, b, point, horizontal) {
  if (horizontal) {
    return (
      Math.abs(point.y - a.y) < 0.5 &&
      point.x > Math.min(a.x, b.x) &&
      point.x < Math.max(a.x, b.x)
    )
  }
  return (
    Math.abs(point.x - a.x) < 0.5 &&
    point.y > Math.min(a.y, b.y) &&
    point.y < Math.max(a.y, b.y)
  )
}

// A half-circle over one crossing. `sweep` alternates with direction so the bump
// always sits on the same side of the line however the route is travelling.
function jumpArc(from, to, entry, exit) {
  const sweep = to.x > from.x || to.y < from.y ? 1 : 0
  return `L ${round(entry.x)} ${round(entry.y)} A ${JUMP_RADIUS} ${JUMP_RADIUS} 0 0 ${sweep} ${round(exit.x)} ${round(exit.y)}`
}

function round(value) {
  return Math.round(value * 100) / 100
}

// Build the `d` for a routed polyline. `crossings` are the points where this route
// hops another; pass none for a plain path.
export function flowchartPathData(points, crossings = [], corner = 'rounded') {
  if (!points || points.length < 2) return ''
  const rounded = corner !== 'sharp'
  const parts = [`M ${round(points[0].x)} ${round(points[0].y)}`]

  for (let i = 0; i < points.length - 1; i += 1) {
    const from = points[i]
    const to = points[i + 1]
    // Stop short of the next vertex by its corner radius, and start this segment
    // after the previous corner's arc has already carried us past `from`.
    const endTrim = rounded && i + 2 < points.length ? radiusAt(points, i + 1) : 0
    const segmentEnd = endTrim ? advance(to, from, endTrim) : to

    for (const jump of jumpsOn(from, segmentEnd, crossings)) {
      const entry = advance(from, segmentEnd, jump.at - JUMP_RADIUS)
      const exit = advance(from, segmentEnd, jump.at + JUMP_RADIUS)
      parts.push(jumpArc(from, segmentEnd, entry, exit))
    }
    parts.push(`L ${round(segmentEnd.x)} ${round(segmentEnd.y)}`)

    if (endTrim) {
      const next = points[i + 2]
      const cornerExit = advance(to, next, radiusAt(points, i + 1))
      parts.push(`Q ${round(to.x)} ${round(to.y)} ${round(cornerExit.x)} ${round(cornerExit.y)}`)
    }
  }
  return parts.join(' ')
}

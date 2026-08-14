// Where a connector actually MEETS a flowchart node (#441 round 3).
//
// Ports are chosen on a node's bounding BOX, which is right for a rectangle and
// wrong for most of the eleven shapes. A diamond only touches its box at four
// points, so an arrow aimed at the middle of the box's bottom edge stopped in open
// space below the diamond's tip; a parallelogram's slanted sides leave the same gap
// on the left and right; a document's wavy bottom dips away from the box edge. The
// arrowhead floated, detached from the node it pointed at.
//
// So each type gets a POLYGON silhouette in node-local coordinates — curves sampled
// densely enough that the error is under a pixel — and the port is pulled inward
// along its own side normal until it lands on that silhouette. Sampling every type
// into one representation means one intersection routine covers all of them, rather
// than a special case per shape.
//
// Pure and DOM-free, like the rest of diagram/: the same answer on every machine,
// and unit-testable without a renderer.

import { skewOf } from './flowchartShapes.js'

// Samples per curved SPAN. A span is at most a half turn, where 16 steps keep a
// 200px arc within ~0.2px of true; a full ellipse gets four spans' worth so a
// junction's rim is no coarser than any other curve.
const CURVE_STEPS = 16

// The silhouette of `nodeType` at size w×h, as local points [{x, y}, …]. A closed
// ring: the last point joins the first.
export function outlinePoints(nodeType, w, h) {
  switch (nodeType) {
    case 'decision':
      return [{ x: w / 2, y: 0 }, { x: w, y: h / 2 }, { x: w / 2, y: h }, { x: 0, y: h / 2 }]
    case 'inputOutput': {
      const skew = skewOf(w)
      return [{ x: skew, y: 0 }, { x: w, y: 0 }, { x: w - skew, y: h }, { x: 0, y: h }]
    }
    case 'manualInput':
      return [{ x: 0, y: h * 0.28 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }]
    case 'preparation': {
      const cut = w * 0.16
      return [
        { x: cut, y: 0 }, { x: w - cut, y: 0 }, { x: w, y: h / 2 },
        { x: w - cut, y: h }, { x: cut, y: h }, { x: 0, y: h / 2 },
      ]
    }
    case 'offPageRef': {
      const shoulder = h * 0.62
      return [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: shoulder }, { x: w / 2, y: h }, { x: 0, y: shoulder }]
    }
    case 'document':
      return documentOutline(w, h)
    case 'database':
      return databaseOutline(w, h)
    case 'connector':
      return ellipseOutline(w, h)
    case 'terminator':
      return stadiumOutline(w, h)
    case 'predefinedProcess':
    case 'process':
    default:
      // The side bars are interior detail; the silhouette is the rectangle.
      return [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }]
  }
}

// Rect with the wavy bottom edge sampled off its two quadratic curves.
function documentOutline(w, h) {
  const base = h * 0.82
  const points = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: base }]
  pushQuadratic(points, { x: w, y: base }, { x: w * 0.75, y: h * 0.7 }, { x: w * 0.5, y: base })
  pushQuadratic(points, { x: w * 0.5, y: base }, { x: w * 0.25, y: h }, { x: 0, y: base })
  return points
}

// Cylinder: the top rim arcs UP over the box top, the bottom arcs DOWN under it.
function databaseOutline(w, h) {
  const ry = h * 0.16
  const points = []
  pushArc(points, { x: w / 2, y: ry }, w / 2, ry, Math.PI, Math.PI * 2)
  points.push({ x: w, y: h - ry })
  pushArc(points, { x: w / 2, y: h - ry }, w / 2, ry, 0, Math.PI)
  points.push({ x: 0, y: ry })
  return points
}

function ellipseOutline(w, h) {
  const points = []
  for (let quarter = 0; quarter < 4; quarter += 1) {
    pushArc(points, { x: w / 2, y: h / 2 }, w / 2, h / 2, (quarter * Math.PI) / 2, ((quarter + 1) * Math.PI) / 2)
  }
  return points
}

// Stadium: flat top and bottom between two semicircular ends.
function stadiumOutline(w, h) {
  const r = Math.min(h / 2, w / 2)
  const points = [{ x: r, y: 0 }, { x: w - r, y: 0 }]
  pushArc(points, { x: w - r, y: h / 2 }, r, h / 2, -Math.PI / 2, Math.PI / 2)
  points.push({ x: r, y: h })
  pushArc(points, { x: r, y: h / 2 }, r, h / 2, Math.PI / 2, Math.PI * 1.5)
  return points
}

function pushQuadratic(points, from, control, to) {
  for (let step = 1; step <= CURVE_STEPS; step += 1) {
    const t = step / CURVE_STEPS
    const inverse = 1 - t
    points.push({
      x: inverse * inverse * from.x + 2 * inverse * t * control.x + t * t * to.x,
      y: inverse * inverse * from.y + 2 * inverse * t * control.y + t * t * to.y,
    })
  }
}

function pushArc(points, center, rx, ry, fromAngle, toAngle) {
  for (let step = 0; step <= CURVE_STEPS; step += 1) {
    const angle = fromAngle + ((toAngle - fromAngle) * step) / CURVE_STEPS
    points.push({ x: center.x + rx * Math.cos(angle), y: center.y + ry * Math.sin(angle) })
  }
}

// The direction a connector travels as it enters a node through `side`.
const INWARD = {
  top: { x: 0, y: 1 },
  bottom: { x: 0, y: -1 },
  left: { x: 1, y: 0 },
  right: { x: -1, y: 0 },
}

// Pull `point` — a port sitting on the bounding box of `box` — inward along its
// side normal until it touches the node's real outline. Returns the point unchanged
// for a plain rectangle, or when the ray somehow misses (a degenerate box), so this
// can never make an endpoint worse than the box edge it started from.
export function boundaryPoint(box, nodeType, point, side) {
  const inward = INWARD[side]
  if (!inward || !box?.w || !box?.h) return point
  const outline = outlinePoints(nodeType, box.w, box.h)
  const origin = { x: point.x - box.x, y: point.y - box.y }
  const hit = firstHit(outline, origin, inward, Math.max(box.w, box.h))
  if (hit === null) return point
  return { x: point.x + inward.x * hit, y: point.y + inward.y * hit }
}

// Distance from `origin` along `direction` to the nearest outline crossing, or null.
function firstHit(outline, origin, direction, limit) {
  let best = null
  for (let index = 0; index < outline.length; index += 1) {
    const a = outline[index]
    const b = outline[(index + 1) % outline.length]
    const distance = segmentHit(a, b, origin, direction)
    if (distance === null || distance < 0 || distance > limit) continue
    if (best === null || distance < best) best = distance
  }
  return best
}

// Where the ray origin + t*direction crosses segment a→b, as t. Null when parallel
// or when the crossing falls outside the segment.
function segmentHit(a, b, origin, direction) {
  const edge = { x: b.x - a.x, y: b.y - a.y }
  const denominator = direction.x * edge.y - direction.y * edge.x
  if (Math.abs(denominator) < 1e-9) return null
  const offset = { x: a.x - origin.x, y: a.y - origin.y }
  const t = (offset.x * edge.y - offset.y * edge.x) / denominator
  const u = (offset.x * direction.y - offset.y * direction.x) / denominator
  if (u < -1e-9 || u > 1 + 1e-9) return null
  return t
}

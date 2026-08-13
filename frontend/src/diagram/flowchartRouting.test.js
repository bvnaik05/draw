import { describe, it, expect } from 'vitest'
import {
  chooseSides,
  assignPorts,
  elbowThroughNormals,
  findCrossings,
  routeFlowchartEdges,
} from './flowchartRouting.js'

const box = (x, y, w = 160, h = 72) => ({ x, y, w, h })

// The direction the LAST segment travels, in degrees — which is exactly what SVG's
// `marker orient="auto"` uses to aim the arrowhead. Every claim about arrow
// direction in #441 item 7 is a claim about this number.
function arrowAngle(points) {
  const a = points[points.length - 2]
  const b = points[points.length - 1]
  return Math.round((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI)
}

function finalSegmentLength(points) {
  const a = points[points.length - 2]
  const b = points[points.length - 1]
  return Math.hypot(b.x - a.x, b.y - a.y)
}

describe('chooseSides (#441 item 16)', () => {
  it('leaves the bottom and enters the top when the target is below', () => {
    expect(chooseSides(box(0, 0), box(0, 300))).toEqual({ from: 'bottom', to: 'top' })
  })

  it('leaves the right and enters the left when the target is beside', () => {
    expect(chooseSides(box(0, 0), box(400, 0))).toEqual({ from: 'right', to: 'left' })
  })

  it('reverses both sides when the flow runs back up', () => {
    expect(chooseSides(box(0, 300), box(0, 0))).toEqual({ from: 'top', to: 'bottom' })
  })

  // The case a centre-distance-only rule gets wrong: mostly-horizontal by centre
  // distance, but the vertical spans overlap so there is no room above or below.
  it('prefers the axis the boxes are actually separated on', () => {
    const from = box(0, 0, 160, 72)
    const to = box(400, 40, 160, 72) // overlaps vertically, clear horizontally
    expect(chooseSides(from, to)).toEqual({ from: 'right', to: 'left' })
  })
})

describe('elbowThroughNormals (#441 item 7)', () => {
  it('points the arrowhead DOWN on a top-to-bottom flow, even when offset sideways', () => {
    // The exact shape of the regression: the old router always ran horizontally
    // first, so the final segment was horizontal and the arrow pointed sideways
    // into the side of a node the flow was arriving at from above.
    const points = elbowThroughNormals({ x: 80, y: 72 }, 'bottom', { x: 300, y: 260 }, 'top')
    expect(arrowAngle(points)).toBe(90)
  })

  it('points the arrowhead RIGHT on a left-to-right flow', () => {
    const points = elbowThroughNormals({ x: 160, y: 36 }, 'right', { x: 400, y: 120 }, 'left')
    expect(arrowAngle(points)).toBe(0)
  })

  it('points the arrowhead UP on a bottom-to-top flow', () => {
    const points = elbowThroughNormals({ x: 80, y: 0 }, 'top', { x: 300, y: -260 }, 'bottom')
    expect(arrowAngle(points)).toBe(-90)
  })

  it('points the arrowhead LEFT on a right-to-left flow', () => {
    const points = elbowThroughNormals({ x: 0, y: 36 }, 'left', { x: -400, y: 120 }, 'right')
    expect(arrowAngle(points)).toBe(180)
  })

  // The aligned case only LOOKED right before: the final segment had zero length
  // and SVG quietly fell back to the previous one. A degenerate segment has no
  // direction, so it must never be emitted.
  it('keeps a real final segment even when the two ports line up exactly', () => {
    const points = elbowThroughNormals({ x: 100, y: 72 }, 'bottom', { x: 100, y: 260 }, 'top')
    expect(finalSegmentLength(points)).toBeGreaterThan(0)
    expect(arrowAngle(points)).toBe(90)
  })

  it('arrives along the entry normal when the two ports face across each other', () => {
    const points = elbowThroughNormals({ x: 80, y: 72 }, 'bottom', { x: 300, y: 200 }, 'left')
    expect(arrowAngle(points)).toBe(0)
  })
})

describe('assignPorts (#441 item 19)', () => {
  it('spreads several edges leaving one side instead of stacking them', () => {
    const boxes = { src: box(0, 0), a: box(-200, 300), b: box(0, 300), c: box(200, 300) }
    const edges = [
      { id: 'e1', fromId: 'src', toId: 'a' },
      { id: 'e2', fromId: 'src', toId: 'b' },
      { id: 'e3', fromId: 'src', toId: 'c' },
    ]
    const ports = assignPorts(boxes, edges)
    const xs = ['e1', 'e2', 'e3'].map((id) => ports[id].from.x)
    expect(new Set(xs).size).toBe(3)
    // Ordered by where each target sits, so the branches do not cross on the way out.
    expect(xs[0]).toBeLessThan(xs[1])
    expect(xs[1]).toBeLessThan(xs[2])
    // All still on the source's bottom edge.
    for (const id of ['e1', 'e2', 'e3']) expect(ports[id].from.y).toBe(72)
  })

  it('puts a lone edge at the middle of its side', () => {
    const boxes = { a: box(0, 0), b: box(0, 300) }
    const ports = assignPorts(boxes, [{ id: 'e1', fromId: 'a', toId: 'b' }])
    expect(ports.e1.from.x).toBe(80)
  })
})

describe('routeFlowchartEdges (#441 item 8)', () => {
  it('routes around an unrelated node instead of through it', () => {
    // A above, C below, and B parked squarely between them.
    const boxes = { a: box(0, 0), b: box(0, 150), c: box(0, 320) }
    const routes = routeFlowchartEdges(boxes, [{ id: 'e1', fromId: 'a', toId: 'c' }])
    const points = routes.e1.points
    const blocker = { x: 0, y: 150, w: 160, h: 72 }
    for (let i = 0; i < points.length - 1; i += 1) {
      const p = points[i]
      const q = points[i + 1]
      const hits =
        Math.min(p.x, q.x) < blocker.x + blocker.w &&
        Math.max(p.x, q.x) > blocker.x &&
        Math.min(p.y, q.y) < blocker.y + blocker.h &&
        Math.max(p.y, q.y) > blocker.y
      expect(hits).toBe(false)
    }
    // And it still arrives pointing the way the flow goes.
    expect(arrowAngle(points)).toBe(90)
  })

  // The detour still has to LEAVE along the exit normal. Rebuilding an A* path from
  // a came-from map drops the start state unless it is put back explicitly, which
  // would have begun the route at its first turn instead of at the node's edge.
  it('still leaves the source straight down before it detours', () => {
    const boxes = { a: box(0, 0), b: box(0, 150), c: box(0, 320) }
    const points = routeFlowchartEdges(boxes, [{ id: 'e1', fromId: 'a', toId: 'c' }]).e1.points
    expect(points[0]).toEqual({ x: 80, y: 72 }) // the port itself, on a's bottom edge
    expect(points[1].x).toBe(80) // straight down off it, not sideways
    expect(points[1].y).toBeGreaterThan(72)
  })

  it('leaves a clear route as the plain elbow', () => {
    const boxes = { a: box(0, 0), b: box(0, 300) }
    const routes = routeFlowchartEdges(boxes, [{ id: 'e1', fromId: 'a', toId: 'b' }])
    expect(routes.e1.points).toEqual(
      elbowThroughNormals({ x: 80, y: 72 }, 'bottom', { x: 80, y: 300 }, 'top'),
    )
  })

  it('never treats the edge\'s own two nodes as obstacles', () => {
    const boxes = { a: box(0, 0), b: box(0, 120) }
    const routes = routeFlowchartEdges(boxes, [{ id: 'e1', fromId: 'a', toId: 'b' }])
    expect(routes.e1.points.length).toBeGreaterThan(1)
  })
})

describe('findCrossings (#441 item 9)', () => {
  it('marks the point where two routes cross', () => {
    const routes = {
      h: [{ x: 0, y: 100 }, { x: 200, y: 100 }],
      v: [{ x: 100, y: 0 }, { x: 100, y: 200 }],
    }
    const crossings = findCrossings(routes, ['h', 'v'])
    // The later edge hops, so the earlier one stays flat.
    expect(crossings.h).toEqual([])
    expect(crossings.v).toEqual([{ x: 100, y: 100 }])
  })

  it('ignores two lines merely sharing a lane', () => {
    const routes = {
      a: [{ x: 0, y: 100 }, { x: 200, y: 100 }],
      b: [{ x: 50, y: 100 }, { x: 250, y: 100 }],
    }
    expect(findCrossings(routes, ['a', 'b']).b).toEqual([])
  })

  it('ignores a touch at a shared endpoint', () => {
    const routes = {
      a: [{ x: 0, y: 100 }, { x: 100, y: 100 }],
      b: [{ x: 100, y: 100 }, { x: 100, y: 200 }],
    }
    expect(findCrossings(routes, ['a', 'b']).b).toEqual([])
  })
})

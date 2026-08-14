import { describe, it, expect } from 'vitest'
import {
  chooseSides,
  assignPorts,
  elbowThroughNormals,
  findCrossings,
  separateOverlappingRuns,
  routeFlowchartEdges,
} from './flowchartRouting.js'

const box = (x, y, w = 160, h = 72) => ({ x, y, w, h })
const P = (x, y) => ({ x, y })

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

// #441 round 2: two flows drawn along the same line are worse than an ambiguous
// crossing — they look like ONE line. Found by building two mirror-image flows in
// the app and seeing both routes turn at exactly x=625.
describe('separateOverlappingRuns', () => {
  it('pulls apart two routes sharing a vertical lane', () => {
    const a = [P(0, 0), P(100, 0), P(100, 400), P(200, 400)]
    const b = [P(0, 10), P(100, 10), P(100, 390), P(200, 390)]
    const routes = { a: a.map((p) => ({ ...p })), b: b.map((p) => ({ ...p })) }
    separateOverlappingRuns(routes, ['a', 'b'])
    expect(routes.a[1].x).not.toBe(routes.b[1].x)
    expect(routes.a[1].x).toBe(routes.a[2].x) // still vertical
    expect(routes.b[1].x).toBe(routes.b[2].x)
  })

  it('leaves the port stubs alone', () => {
    const a = [P(0, 0), P(100, 0), P(100, 400), P(200, 400)]
    const b = [P(0, 10), P(100, 10), P(100, 390), P(200, 390)]
    const routes = { a: a.map((p) => ({ ...p })), b: b.map((p) => ({ ...p })) }
    separateOverlappingRuns(routes, ['a', 'b'])
    // First and last points are the ports — moving them would detach the route.
    expect(routes.a[0]).toEqual(P(0, 0))
    expect(routes.a[3]).toEqual(P(200, 400))
    expect(routes.b[0]).toEqual(P(0, 10))
    expect(routes.b[3]).toEqual(P(200, 390))
  })

  it('ignores runs that merely share a coordinate end to end', () => {
    const a = [P(0, 0), P(100, 0), P(100, 100), P(200, 100)]
    const b = [P(0, 300), P(100, 300), P(100, 400), P(200, 400)]
    const routes = { a: a.map((p) => ({ ...p })), b: b.map((p) => ({ ...p })) }
    separateOverlappingRuns(routes, ['a', 'b'])
    expect(routes.a[1].x).toBe(100)
    expect(routes.b[1].x).toBe(100)
  })

  it('separates the mirror-image pair that shared a 400px lane in the app', () => {
    // The exact shape seen while testing: two opposed flows both turned at x=625
    // and ran down the same line for 400px, drawn as one visible route.
    const boxes = { p1: box(220, 90), c1: box(870, 520), p2: box(870, 90), c2: box(220, 520) }
    const routes = routeFlowchartEdges(boxes, [
      { id: 'e1', fromId: 'p1', toId: 'c1' },
      { id: 'e2', fromId: 'p2', toId: 'c2' },
    ])
    const verticalLane = (points) =>
      points.find((p, i) => i > 0 && i < points.length - 1 && p.x === points[i + 1]?.x)?.x
    expect(verticalLane(routes.e1.points)).not.toBe(verticalLane(routes.e2.points))
    // Both still start and end on their own ports.
    expect(routes.e1.points[0]).toEqual({ x: 380, y: 126 })
    expect(routes.e2.points[0]).toEqual({ x: 870, y: 126 })
  })
})

// Review of #448, two defects in the same pass.
describe('separation and the node cap', () => {
  // A shift reaches SEPARATION * (n-1)/2 — 18px once four runs share a lane — past
  // the 14px CLEARANCE the route was built to hold, so separating overlapping runs
  // could shove one straight back through the node the A* had just detoured around.
  it('abandons a shift that would push a run into a node', () => {
    const blocker = { x: 100, y: 0, w: 100, h: 200 }
    // Four runs sharing one horizontal lane, right against the blocker's edge.
    const routes = {}
    const order = []
    for (let i = 0; i < 4; i += 1) {
      const id = `e${i}`
      order.push(id)
      routes[id] = [
        { x: 0, y: 220 },
        { x: 50, y: 220 },
        { x: 300, y: 220 },
        { x: 320, y: 220 },
      ]
    }
    separateOverlappingRuns(routes, order, [blocker])
    for (const id of order) {
      const [, a, b] = routes[id]
      const crossesBlocker =
        Math.min(a.x, b.x) < blocker.x + blocker.w &&
        Math.max(a.x, b.x) > blocker.x &&
        a.y > blocker.y &&
        a.y < blocker.y + blocker.h
      expect(crossesBlocker).toBe(false)
    }
  })

  it('still separates runs that have room to move', () => {
    const routes = {
      a: [{ x: 0, y: 100 }, { x: 40, y: 100 }, { x: 200, y: 100 }, { x: 240, y: 100 }],
      b: [{ x: 0, y: 100 }, { x: 40, y: 100 }, { x: 200, y: 100 }, { x: 240, y: 100 }],
    }
    separateOverlappingRuns(routes, ['a', 'b'], [])
    expect(routes.a[1].y).not.toBe(routes.b[1].y)
  })

  // The cap counted every node in the document, so nodes parked far off-canvas
  // switched avoidance off for a route they could never reach.
  it('keeps avoiding a blocker however many distant nodes exist', () => {
    const near = {
      source: { x: 0, y: 0, w: 100, h: 60 },
      blocker: { x: 300, y: -60, w: 120, h: 200 },
      target: { x: 700, y: 0, w: 100, h: 60 },
    }
    const edges = [{ id: 'e1', fromId: 'source', toId: 'target' }]
    const cutsBlocker = (boxes) => {
      const points = routeFlowchartEdges(boxes, edges).e1.points
      const rect = boxes.blocker
      for (let i = 0; i < points.length - 1; i += 1) {
        const p = points[i]
        const q = points[i + 1]
        if (
          Math.min(p.x, q.x) < rect.x + rect.w &&
          Math.max(p.x, q.x) > rect.x &&
          Math.min(p.y, q.y) < rect.y + rect.h &&
          Math.max(p.y, q.y) > rect.y
        ) {
          return true
        }
      }
      return false
    }
    const crowded = { ...near }
    for (let i = 0; i < 80; i += 1) crowded[`far${i}`] = { x: 5000 + i * 200, y: 5000, w: 100, h: 60 }
    expect(cutsBlocker(near)).toBe(false)
    expect(cutsBlocker(crowded)).toBe(false)
  })
})

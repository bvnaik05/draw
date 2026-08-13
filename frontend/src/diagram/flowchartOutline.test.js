import { describe, it, expect } from 'vitest'
import { outlinePoints, boundaryPoint } from './flowchartOutline.js'

// #441 round 3: "I don't see the arrow starting from the boundary of the node" for
// decisions, input/output and documents. Ports are chosen on the bounding BOX, and
// most of the eleven shapes fall away from it — so the endpoint sat in open space
// beside the shape it pointed at.
describe('boundaryPoint', () => {
  const box = { x: 100, y: 200, w: 160, h: 80 }

  it('leaves a rectangle alone — its outline IS its box', () => {
    const point = { x: 180, y: 280 }
    expect(boundaryPoint(box, 'process', point, 'bottom')).toEqual(point)
  })

  it('pulls a diamond\'s port up onto the slanted edge', () => {
    // A port a quarter of the way along the bottom edge. The diamond's lower-left
    // edge runs from (100, 240) to (180, 280), so at x=140 it sits at y=260.
    const moved = boundaryPoint(box, 'decision', { x: 140, y: 280 }, 'bottom')
    expect(moved.x).toBe(140)
    expect(moved.y).toBeCloseTo(260, 6)
  })

  it('meets a diamond exactly at its tip when the port is centred', () => {
    const moved = boundaryPoint(box, 'decision', { x: 180, y: 280 }, 'bottom')
    expect(moved).toEqual({ x: 180, y: 280 })
  })

  it('pulls a parallelogram\'s side port in by the skew', () => {
    // inputOutput slants right at the top, so its LEFT edge runs from (skew, 0) to
    // (0, h) in local terms — a port on the box's left is outside the shape.
    const moved = boundaryPoint(box, 'inputOutput', { x: 100, y: 220 }, 'left')
    expect(moved.x).toBeGreaterThan(100)
    expect(moved.y).toBe(220)
  })

  it('follows a document\'s wave instead of its box edge', () => {
    // The wave dips below 0.82h at the right and rises at the left, so a port on
    // the box bottom must move UP onto the curve rather than staying at y = 280.
    const moved = boundaryPoint(box, 'document', { x: 140, y: 280 }, 'bottom')
    expect(moved.y).toBeLessThan(280)
    expect(moved.y).toBeGreaterThan(200)
  })

  it('lands on the circle for a junction', () => {
    const square = { x: 0, y: 0, w: 72, h: 72 }
    const moved = boundaryPoint(square, 'connector', { x: 24, y: 72 }, 'bottom')
    const dx = moved.x - 36
    const dy = moved.y - 36
    // Sampled, so a fraction of a pixel inside the true circle is expected.
    expect(Math.hypot(dx, dy)).toBeGreaterThan(35.9)
    expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(36)
  })

  it('never moves the point outside the box, whatever the type', () => {
    for (const nodeType of ['decision', 'inputOutput', 'document', 'database', 'manualInput', 'preparation', 'offPageRef', 'terminator', 'connector', 'process']) {
      for (const [side, point] of [
        ['bottom', { x: 140, y: 280 }],
        ['top', { x: 140, y: 200 }],
        ['left', { x: 100, y: 240 }],
        ['right', { x: 260, y: 240 }],
      ]) {
        const moved = boundaryPoint(box, nodeType, point, side)
        expect(moved.x).toBeGreaterThanOrEqual(box.x - 1e-6)
        expect(moved.x).toBeLessThanOrEqual(box.x + box.w + 1e-6)
        expect(moved.y).toBeGreaterThanOrEqual(box.y - 1e-6)
        expect(moved.y).toBeLessThanOrEqual(box.y + box.h + 1e-6)
      }
    }
  })

  it('falls back to the given point for a degenerate box or unknown side', () => {
    const point = { x: 1, y: 2 }
    expect(boundaryPoint({ x: 0, y: 0, w: 0, h: 0 }, 'decision', point, 'bottom')).toEqual(point)
    expect(boundaryPoint(box, 'decision', point, 'sideways')).toEqual(point)
  })
})

describe('outlinePoints', () => {
  it('stays inside the box it was measured for', () => {
    for (const nodeType of ['decision', 'document', 'database', 'terminator', 'connector', 'offPageRef']) {
      for (const point of outlinePoints(nodeType, 160, 80)) {
        expect(point.x).toBeGreaterThanOrEqual(-1e-6)
        expect(point.x).toBeLessThanOrEqual(160 + 1e-6)
        expect(point.y).toBeGreaterThanOrEqual(-1e-6)
        expect(point.y).toBeLessThanOrEqual(80 + 1e-6)
      }
    }
  })

  it('gives an unknown type the plain rectangle', () => {
    expect(outlinePoints('nonesuch', 10, 20)).toEqual([
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 20 }, { x: 0, y: 20 },
    ])
  })
})

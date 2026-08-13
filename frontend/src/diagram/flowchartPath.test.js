import { describe, it, expect } from 'vitest'
import { flowchartPathData } from './flowchartPath.js'

const P = (x, y) => ({ x, y })

describe('flowchartPathData', () => {
  it('returns nothing for a degenerate route', () => {
    expect(flowchartPathData([])).toBe('')
    expect(flowchartPathData([P(0, 0)])).toBe('')
  })

  it('draws a straight run as a single line', () => {
    expect(flowchartPathData([P(0, 0), P(0, 100)])).toBe('M 0 0 L 0 100')
  })

  it('rounds an interior corner and still ends on the final vertex', () => {
    const d = flowchartPathData([P(0, 0), P(0, 100), P(200, 100)])
    expect(d).toContain('Q 0 100') // the quadratic pivots on the corner itself
    expect(d.endsWith('L 200 100')).toBe(true)
  })

  it('keeps literal corners when asked for sharp', () => {
    const d = flowchartPathData([P(0, 0), P(0, 100), P(200, 100)], [], 'sharp')
    expect(d).toBe('M 0 0 L 0 100 L 200 100')
    expect(d).not.toContain('Q')
  })

  // #441 item 9: a crossing becomes a visible hop, so two flows reading over each
  // other stay distinguishable.
  it('lifts an arc over a crossing on the segment it falls on', () => {
    const d = flowchartPathData([P(0, 100), P(200, 100)], [P(100, 100)])
    expect(d).toContain('A 5 5 0 0')
    // The arc is entered and left either side of the crossing, not at it.
    expect(d).toContain('L 95 100')
    expect(d).toContain('105 100')
  })

  it('orders several hops along the segment', () => {
    const d = flowchartPathData([P(0, 100), P(300, 100)], [P(200, 100), P(80, 100)])
    expect(d.indexOf('L 75 100')).toBeLessThan(d.indexOf('L 195 100'))
  })

  it('ignores a crossing that is not on this route', () => {
    const d = flowchartPathData([P(0, 100), P(200, 100)], [P(100, 400)])
    expect(d).not.toContain('A 5 5')
  })

  // An arc that started inside a corner's arc would leave a visible kink.
  it('skips a hop too close to either end to fit', () => {
    const d = flowchartPathData([P(0, 100), P(200, 100)], [P(2, 100), P(198, 100)])
    expect(d).not.toContain('A 5 5')
  })

  it('clamps the corner radius on a route with very short legs', () => {
    // Legs of 6px cannot carry the full 10px radius without overshooting.
    const d = flowchartPathData([P(0, 0), P(0, 6), P(6, 6)])
    expect(d).toContain('M 0 0')
    expect(d.endsWith('L 6 6')).toBe(true)
  })
})

import { describe, it, expect } from 'vitest'
import { pruneTrail, trailSegments, LASER_FADE_MS, LASER_WIDTH } from './laser.js'

// The laser trail is the one whiteboard element that is pure chrome: it fades on
// its own and never reaches the document (spec C5/C10). These cover the two rules
// the render layer depends on — expiry, and the taper along the tail.

const trail = (now) => [
  { x: 0, y: 0, at: now - LASER_FADE_MS - 1 }, // expired
  { x: 10, y: 0, at: now - LASER_FADE_MS / 2 },
  { x: 20, y: 0, at: now },
]

describe('pruneTrail', () => {
  it('drops points older than the fade window and keeps the rest', () => {
    const now = 10_000
    expect(pruneTrail(trail(now), now).map((point) => point.x)).toEqual([10, 20])
  })

  it('empties the trail once the pointer has been still for the fade window', () => {
    const now = 10_000
    const points = [{ x: 5, y: 5, at: now }]
    expect(pruneTrail(points, now + LASER_FADE_MS)).toEqual([])
  })
})

describe('trailSegments', () => {
  it('fades and thins each segment with the age of its newer end', () => {
    const now = 10_000
    const segments = trailSegments(trail(now), now)

    expect(segments).toHaveLength(1)
    expect(segments[0].from.x).toBe(10)
    expect(segments[0].to.x).toBe(20)
    expect(segments[0].opacity).toBe(1)
    expect(segments[0].width).toBe(LASER_WIDTH)
  })

  it('gives an older segment less opacity and width than a newer one', () => {
    const now = 10_000
    const points = [
      { x: 0, y: 0, at: now - LASER_FADE_MS * 0.75 },
      { x: 10, y: 0, at: now - LASER_FADE_MS * 0.5 },
      { x: 20, y: 0, at: now },
    ]
    const [older, newer] = trailSegments(points, now)

    expect(older.opacity).toBeLessThan(newer.opacity)
    expect(older.width).toBeLessThan(newer.width)
    expect(older.opacity).toBeGreaterThan(0)
  })

  it('drops expired points instead of drawing a segment from a stale position', () => {
    // The caller is not required to prune first: an expired point must not survive
    // as the `from` end of the next segment, or the trail would grow a leg back to
    // where the pointer was a second ago.
    const now = 10_000
    const points = [
      { x: 0, y: 0, at: now - LASER_FADE_MS * 2 }, // expired
      { x: 10, y: 0, at: now - LASER_FADE_MS }, // expired
      { x: 20, y: 0, at: now },
      { x: 30, y: 0, at: now },
    ]
    const segments = trailSegments(points, now)

    expect(segments).toHaveLength(1)
    expect(segments[0].from.x).toBe(20)
    expect(segments[0].to.x).toBe(30)
  })

  it('has no segments once every point has expired', () => {
    const now = 10_000
    const points = [
      { x: 0, y: 0, at: now - LASER_FADE_MS * 2 },
      { x: 10, y: 0, at: now - LASER_FADE_MS },
    ]
    expect(trailSegments(points, now)).toEqual([])
  })

  it('has no segments for a single point', () => {
    expect(trailSegments([{ x: 1, y: 1, at: 0 }], 0)).toEqual([])
  })
})

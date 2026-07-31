// Laser-pointer trail geometry (spec C5: self-fading trail, no persistent marks).
// Pure and browser-free: the composable owns the timestamps and the animation
// loop, the render layer only binds what these helpers return. Nothing here ever
// reaches the document — the trail is chrome and is never saved or exported.

// How long a trail point lives. Long enough to read as a comet tail while the
// pointer moves, short enough that it is gone right after it stops.
export const LASER_FADE_MS = 800

export const LASER_COLOR = '#E03636'
// Canvas units, like stroke widths (spec C10): the trail scales with zoom.
export const LASER_WIDTH = 5
export const LASER_HEAD_RADIUS = 5

// Drop points older than the fade window. Callers pass `now` so one timestamp
// drives a whole frame.
export function pruneTrail(points, now) {
  return points.filter((point) => now - point.at < LASER_FADE_MS)
}

// The trail as one segment per pair of consecutive points, each carrying the
// opacity and width for the age of its newer end. Drawing per segment (rather
// than one path) is what makes the tail taper and fade along its length; round
// caps join the segments back into a smooth line.
//
// Expired points are dropped here rather than assumed away: skipping only the
// segments that END on an expired point would still draw the next segment FROM
// that stale position, and callers would have to remember to prune first.
export function trailSegments(points, now) {
  const live = pruneTrail(points, now)
  const segments = []
  for (let i = 1; i < live.length; i += 1) {
    const life = 1 - (now - live[i].at) / LASER_FADE_MS
    segments.push({
      from: live[i - 1],
      to: live[i],
      opacity: life,
      width: LASER_WIDTH * (0.3 + 0.7 * life),
    })
  }
  return segments
}

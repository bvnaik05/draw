// The strings a diagram row and a diagram tile both show: how long ago something
// happened, and who owns it. One module rather than a copy in each view, so the
// two never drift apart — and so they can be tested without mounting either.

const TIME_UNITS = [
  [60, 1, 's'],
  [3600, 60, 'm'],
  [86400, 3600, 'h'],
  [Infinity, 86400, 'd'],
]

// Compact "3h ago" style label from an ISO/Frappe datetime string.
export function relativeTime(value) {
  if (!value) return '—'
  const elapsedSeconds = (Date.now() - new Date(value.replace(' ', 'T')).getTime()) / 1000
  for (const [limit, divisor, unit] of TIME_UNITS) {
    if (elapsedSeconds < limit) return `${Math.max(1, Math.round(elapsedSeconds / divisor))}${unit} ago`
  }
  return 'just now'
}

// Owner column (I3): friendly name — drop the @domain from a user-id email.
export function ownerLabel(diagram) {
  const owner = diagram?.owner || ''
  return owner.includes('@') ? owner.split('@')[0] : owner
}

// Full timestamps for the info dialog: "2026-08-14 · 07:52".
export function stampLabel(value) {
  return value ? value.slice(0, 16).replace(' ', ' · ') : '—'
}

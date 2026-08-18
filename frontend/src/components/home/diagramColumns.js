// Frappe-ui-free by design: this module is imported by the browser-free node
// tests (homeList.test.js) alongside the SFCs, and pulling in frappe-ui itself
// (as `copyDiagramLink` briefly did, via `toast`) breaks module resolution
// outside a Vite build. Clipboard + toast stay in TileGrid.vue, which already
// depends on frappe-ui for everything else on the page.

// Column model for the list-view browser (#541), read by DiagramListView's
// header and by the tile's metadata line, so both draw the same owner/relative
// time formatting instead of carrying a second copy of the same 20 lines.
//
// `width` matches frappe-ui ListView's own convention: a number is a `fr` grid
// track, a string is passed through as-is (`'15%'`, `'48px'`).
export const COLUMNS = [
  { key: 'title', label: 'Name', width: 2, sortable: true },
  { key: 'owner', label: 'Owner', width: '15%', sortable: true },
  { key: 'creation', label: 'Created', width: '15%', sortable: true },
  { key: 'modified', label: 'Last edited', width: '15%', sortable: true },
  { key: 'options', label: '', align: 'right', width: '48px', sortable: false },
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

const TIME_UNITS = [
  [60, 1, 's'],
  [3600, 60, 'm'],
  [86400, 3600, 'h'],
  [Infinity, 86400, 'd'],
]

// Friendly owner label: drop the @domain from a user-id email.
export function ownerLabel(diagram) {
  const owner = diagram.owner || ''
  return owner.includes('@') ? owner.split('@')[0] : owner
}

// The curated ⋯ menu shared by the tile and the list row (Drive-style, I5):
// copy link, show info, rename, duplicate, delete. `emit` is the caller's own
// defineEmits function, so a click reports back through whichever events that
// surface already wires up — including 'copy-link', which TileGrid turns into
// an actual clipboard write + toast (see the note above). (Move / Share need
// dedicated dialogs — tracked separately.)
export function diagramMenuItems(diagram, emit) {
  return [
    { label: 'Copy link', icon: 'link', onClick: () => emit('copy-link', diagram) },
    { label: 'Show info', icon: 'file-text', onClick: () => emit('show-info', diagram) },
    { label: 'Rename', icon: 'edit-2', onClick: () => emit('rename', diagram) },
    { label: 'Duplicate', icon: 'copy', onClick: () => emit('duplicate', diagram) },
    { label: 'Delete', icon: 'trash-2', theme: 'red', onClick: () => emit('delete', diagram) },
  ]
}

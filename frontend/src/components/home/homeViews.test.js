import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  isPinned,
  pinnedOnly,
  unpinned,
  DEFAULT_LAYOUT,
  readLayout,
  writeLayout,
  EMPTY_HOME,
  NO_MATCHES,
  emptyStateFor,
  compareDiagrams,
  defaultDirection,
  DEFAULT_SORT,
  nextSort,
  readSort,
  sortLabelFor,
  writeSort,
} from './homeViews.js'

// Browser-free (node env, no @vue/test-utils): assert the MODEL the home page
// renders and the pin FILTERS its list uses, then source-check that the SFCs
// actually bind that model — a regression guard against the old nav / inline filters
// creeping back. Mirrors ShareMenu.test.js (import the model, string-check the SFC).
const here = path.dirname(fileURLToPath(import.meta.url))
const read = (rel) => readFileSync(path.join(here, rel), 'utf8')
const tileGrid = read('TileGrid.vue')
const diagramTile = read('DiagramTile.vue')
const listView = read('DiagramListView.vue')
const homeShell = read('../../pages/HomeShell.vue')

// #407: Home showed a row of tabs — Home · Recent · Shared with you · Pinned ·
// Trash — over a page that is already the whole library. The tabs are gone; the
// app menu carries Trash, the one view Home does not contain.
describe('the home page has no view switcher (#407)', () => {
  it('drops the tab row from the top bar', () => {
    expect(homeShell).not.toContain('TabButtons')
    expect(homeShell).not.toContain('SIDEBAR_NAV')
  })

  it('keeps Trash reachable from the app menu', () => {
    expect(homeShell).toContain("label: 'Trash'")
    expect(homeShell).toContain("view.value = 'trash'")
  })

  it('leads back out of Trash with a breadcrumb, not a tab', () => {
    // Otherwise Trash is a room with no door: the menu can only take you in.
    expect(homeShell).toContain('<Breadcrumbs')
    expect(homeShell).toContain("view.value = 'home'")
  })

  it('leaves the grid with a single view to render', () => {
    // The mode prop and the per-mode lists went with the tabs.
    expect(tileGrid).not.toContain('props.mode')
    expect(tileGrid).not.toContain('modeList')
    expect(tileGrid).not.toContain('shared_with_me')
  })
})

describe('pin filters (#116)', () => {
  const rows = [
    { name: 'a', is_pinned: 1 },
    { name: 'b', is_pinned: 0 },
    { name: 'c' }, // missing flag reads as unpinned
    { name: 'd', is_pinned: 1 },
  ]

  it('isPinned reads the flag as a boolean', () => {
    expect(isPinned(rows[0])).toBe(true)
    expect(isPinned(rows[1])).toBe(false)
    expect(isPinned(rows[2])).toBe(false)
  })

  it('pinnedOnly / unpinned partition the list', () => {
    expect(pinnedOnly(rows).map((r) => r.name)).toEqual(['a', 'd'])
    expect(unpinned(rows).map((r) => r.name)).toEqual(['b', 'c'])
  })
})

describe('the SFCs bind the shared model', () => {
  it('TileGrid partitions the list through the shared pin predicates', () => {
    expect(tileGrid).toContain('pinnedOnly')
    expect(tileGrid).toContain('unpinned')
    // The old flat "all diagrams" list must be gone.
    expect(tileGrid).not.toContain('allFlat')
  })
})

// #302 / #449: the Home list is a flat table with sortable, direction-aware column
// headers. It is now built from frappe-ui's ListView primitives, so the row
// geometry, dividers, hover surface and selection surface come from the design
// system instead of a hand-aligned run of flex columns.
describe('Home list is built on frappe-ui ListView (#302, #449)', () => {
  it('renders rows through the ListView family, not hand-rolled divs', () => {
    expect(listView).toContain("from 'frappe-ui'")
    expect(listView).toContain('<ListView')
    expect(listView).toContain('<ListHeader')
    expect(listView).toContain('<ListRows')
    expect(listView).toContain('row-key="name"')
  })

  it('wires sortable, direction-aware column headers', () => {
    for (const key of ['title', 'creation', 'modified']) {
      expect(listView).toContain(`sortKey: '${key}'`)
    }
    expect(listView).toContain("emit('sort', column.sortKey)")
    expect(listView).toContain('sortArrow')
    expect(tileGrid).toContain('function setSort')
  })

  it('keeps one selection for both views', () => {
    // ListView owns a selection Set of its own; the grid stays the single source
    // of truth so a selection made in the list survives a switch to tiles.
    expect(listView).toContain('syncFromParent')
    expect(tileGrid).toContain('function replaceSelection')
  })
})

// #222: the tile/list choice survives a reload. #221 rides on the same fix — a
// user who switches to tiles and is returned to the list sees no previews at all
// and reads that as thumbnails having stopped working.
describe('Home layout preference (#222)', () => {
  const original = globalThis.localStorage

  beforeEach(() => {
    const map = new Map()
    globalThis.localStorage = {
      getItem: (key) => (map.has(key) ? map.get(key) : null),
      setItem: (key, value) => map.set(key, value),
    }
  })
  afterEach(() => {
    globalThis.localStorage = original
  })

  it('starts a new user in the list', () => {
    expect(DEFAULT_LAYOUT).toBe('list')
    expect(readLayout()).toBe('list')
  })

  it('remembers a switch to tiles', () => {
    writeLayout('tile')
    expect(readLayout()).toBe('tile')
  })

  it('remembers a switch back to the list', () => {
    writeLayout('tile')
    writeLayout('list')
    expect(readLayout()).toBe('list')
  })

  it('falls back to the list when the stored value is not a layout', () => {
    // Home renders one branch per layout, so an unrecognised value would show
    // neither. A stale key from an older release must not blank the page.
    globalThis.localStorage.setItem('frappe-draw-home-layout', JSON.stringify('grid'))
    expect(readLayout()).toBe('list')
  })

  it('refuses to store a value that is not a layout', () => {
    writeLayout('tile')
    writeLayout('nonsense')
    expect(readLayout()).toBe('tile')
  })

  it('survives localStorage throwing, as in private mode', () => {
    globalThis.localStorage = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
    }
    expect(readLayout()).toBe('list')
    expect(() => writeLayout('tile')).not.toThrow()
  })

  it('TileGrid seeds its view from the stored layout and persists a change', () => {
    expect(tileGrid).toContain('ref(readLayout())')
    expect(tileGrid).toContain('watch(view, writeLayout)')
    // The old hardcoded default must be gone, or the preference never applies.
    expect(tileGrid).not.toContain("const view = ref('list')")
  })
})

// #221: a stored thumbnail can outlive its File. The diagram keeps the path, the
// <img> 404s, and because the raster wins over the live preview the tile showed an
// empty box for a diagram that renders fine.
describe('tile preview survives a dead thumbnail (#221)', () => {
  it('treats a failed image load as "no raster"', () => {
    expect(diagramTile).toContain('@error="thumbnailFailed = true"')
    expect(diagramTile).toContain('thumbnailFailed.value ? null')
  })

  it('retries when the diagram gets a new thumbnail path', () => {
    // Otherwise one dead path would suppress the raster for the rest of the session.
    expect(diagramTile).toMatch(/watch\(\s*\(\)\s*=>\s*props\.diagram\.thumbnail/)
  })

  it('still prefers the raster, then the live SVG, then the blank placeholder', () => {
    expect(diagramTile).toContain('v-if="thumbnailUrl"')
    expect(diagramTile).toContain('v-else-if="previewSvg"')
    expect(diagramTile).toContain('Diagram is blank')
  })
})

// #220: Home closed every populated view with "You've reached the end · made with
// Frappe Draw". It told the user nothing they could act on, and anyone who met it
// before scrolling read it as an empty state. It is gone; the empty views carry
// the message instead, worded for the tab they belong to.
describe('empty states (#220)', () => {
  it('invites a first-time user to start, rather than reporting emptiness', () => {
    const home = emptyStateFor()
    expect(home.title).toBe('Start a drawing')
    expect(home.hint).toMatch(/create/i)
  })

  it('says it was the filter when a search or chip matched nothing', () => {
    // "Start a drawing" would be wrong when the library does have diagrams and
    // the query is what excluded them.
    expect(emptyStateFor(true)).toEqual(NO_MATCHES)
    expect(emptyStateFor(true).title).toBe('No diagrams match')
  })

  it('gives every state a complete lucide class', () => {
    // Tailwind's JIT only emits classes it reads literally (#292).
    for (const state of [EMPTY_HOME, NO_MATCHES]) {
      expect(state.icon).toMatch(/^lucide-[a-z0-9-]+$/)
    }
  })

  it('drops the end-of-list marker from Home', () => {
    expect(tileGrid).not.toContain("You've reached the end")
    expect(tileGrid).not.toContain('made with Frappe Draw')
  })

  it('drives the empty view from the shared model', () => {
    expect(tileGrid).toContain('emptyStateFor(hasActiveFilter.value)')
  })
})

// #218: every list row drew the same 'lucide-shapes' glyph. Types stopped being a
// user-facing concept in #114, which left one identical icon on every row — it
// distinguished nothing and only pushed the titles right.
describe('list rows carry no type glyph (#218)', () => {
  it('drops the glyph and the constant behind it', () => {
    expect(diagramTile).not.toContain("const icon = 'lucide-shapes'")
    expect(diagramTile).not.toContain('lucide-shapes')
  })

  it('gives the columns one definition, shared by header and rows', () => {
    // One COLUMNS array drives both, so a heading cannot drift out of its lane.
    expect(listView).toContain('const COLUMNS')
    expect(listView).not.toContain('lucide-shapes')
    // The pin lane stays — the rows still have a pin button.
    expect(listView).toContain("key: 'pin'")
  })

  it('keeps the tile view showing previews, not a glyph', () => {
    expect(diagramTile).toContain('v-if="thumbnailUrl"')
    expect(diagramTile).toContain('v-else-if="previewSvg"')
  })
})

// #223: Home used to pull every diagram's full document just so the few tiles with
// no saved raster could draw a live preview. That made the list response about nine
// times larger, and it grew with the library.
describe('Home fetches documents only where a preview needs one (#223)', () => {
  it('keeps the document out of the list query', () => {
    const listFields = tileGrid.match(/fields: \[([^\]]*)\],\n\s*filters: \{ is_trashed: 0 \}/)?.[1]
    expect(listFields, 'could not find the main list query').toBeTruthy()
    expect(listFields).not.toContain("'document'")
    expect(listFields).toContain("'thumbnail'")
  })

  it('fetches documents in one call, filtered to diagrams with no thumbnail', () => {
    expect(tileGrid).toContain("filters: { is_trashed: 0, thumbnail: ['is', 'not set'] }")
    expect(tileGrid).toContain("fields: ['name', 'document']")
  })

  it('reloads that second call after a change, since a save can clear a thumbnail', () => {
    expect(tileGrid).toContain('previewDocuments.reload()')
  })

  it('reads the source document on demand when duplicating', () => {
    // A diagram with a thumbnail has no document on its row any more.
    expect(tileGrid).toContain("call('frappe.client.get_value'")
    expect(tileGrid).toContain("fieldname: 'document'")
  })

  it('tells "not fetched yet" apart from "blank" on a tile', () => {
    // Both are falsy. Treating them the same flashes "Diagram is blank" on every
    // tile that is about to draw a preview.
    expect(diagramTile).toContain('props.diagram.document !== undefined')
    expect(diagramTile).toContain('showsBlankLabel')
    expect(diagramTile).toContain('v-else-if="showsBlankLabel"')
  })

  it('shows a stored raster without needing the document at all', () => {
    // save_thumbnail clears the thumbnail when the diagram is emptied, so a raster
    // now means real content and the old emptiness gate is unnecessary.
    expect(diagramTile).toMatch(/thumbnailUrl = computed\(\s*\(\)\s*=>\s*\n?\s*thumbnailFailed\.value \? null/)
  })
})

// #449: Sort did nothing at all. The trigger was a frappe-ui Button wrapped in a
// Tooltip, and reka-ui's `as-child` trigger binds to its single child — the Tooltip
// swallowed the binding, so clicking the control never opened the menu.
describe('sorting the list (#449)', () => {
  const rows = [
    { name: 'a', title: 'Beta', creation: '2026-08-01 10:00:00', modified: '2026-08-10 10:00:00' },
    { name: 'b', title: 'alpha', creation: '2026-08-03 10:00:00', modified: '2026-08-02 10:00:00' },
    { name: 'c', title: 'Gamma', creation: '2026-08-02 10:00:00', modified: '2026-08-12 10:00:00', is_pinned: 1 },
  ]
  const order = (sort) => [...rows].sort((a, b) => compareDiagrams(sort, a, b)).map((r) => r.name)

  it('orders by each field in both directions', () => {
    expect(order({ key: 'modified', direction: 'desc' })).toEqual(['c', 'a', 'b'])
    expect(order({ key: 'modified', direction: 'asc' })).toEqual(['b', 'a', 'c'])
    expect(order({ key: 'creation', direction: 'desc' })).toEqual(['b', 'c', 'a'])
  })

  it('sorts names case-insensitively, the way a reader reads them', () => {
    // A plain codepoint compare would file "alpha" after "Gamma".
    expect(order({ key: 'title', direction: 'asc' })).toEqual(['b', 'a', 'c'])
    expect(order({ key: 'title', direction: 'desc' })).toEqual(['c', 'a', 'b'])
  })

  it('puts pinned first under Smart, then the most recently edited', () => {
    expect(order({ key: 'smart', direction: 'desc' })).toEqual(['c', 'a', 'b'])
  })

  it('starts names A→Z and everything else newest-first', () => {
    expect(defaultDirection('title')).toBe('asc')
    expect(defaultDirection('modified')).toBe('desc')
  })

  it('flips direction on the active column and resets it on a new one', () => {
    const active = { key: 'modified', direction: 'desc' }
    expect(nextSort(active, 'modified')).toEqual({ key: 'modified', direction: 'asc' })
    expect(nextSort(active, 'title')).toEqual({ key: 'title', direction: 'asc' })
  })

  it('names the active sort for the toolbar button', () => {
    expect(sortLabelFor('modified')).toBe('Last edited')
    expect(sortLabelFor('nonsense')).toBe('Sort')
  })

  it('binds the trigger directly to the Dropdown, with no Tooltip in between', () => {
    const sortBlock = tileGrid.slice(tileGrid.indexOf('<Dropdown :options="sortOptions"'))
    expect(sortBlock.slice(0, 400)).not.toContain('<Tooltip')
    // Button carries its own tooltip prop, which is the supported way to do this.
    expect(sortBlock.slice(0, 400)).toContain(':tooltip=')
  })

  it('ticks the active option so the menu shows what is applied', () => {
    expect(tileGrid).toContain("? 'lucide-check' : undefined")
  })
})

describe('sort preference survives a reload (#449)', () => {
  const original = globalThis.localStorage

  beforeEach(() => {
    const map = new Map()
    globalThis.localStorage = {
      getItem: (key) => (map.has(key) ? map.get(key) : null),
      setItem: (key, value) => map.set(key, value),
    }
  })
  afterEach(() => {
    globalThis.localStorage = original
  })

  it('starts on the most recently edited', () => {
    expect(DEFAULT_SORT).toEqual({ key: 'modified', direction: 'desc' })
    expect(readSort()).toEqual(DEFAULT_SORT)
  })

  it('remembers the field and the direction', () => {
    writeSort({ key: 'title', direction: 'asc' })
    expect(readSort()).toEqual({ key: 'title', direction: 'asc' })
  })

  it('falls back to the default when the stored value is not a sort', () => {
    globalThis.localStorage.setItem('frappe-draw-home-sort', JSON.stringify({ key: 'colour' }))
    expect(readSort()).toEqual(DEFAULT_SORT)
  })

  it('refuses to store a field that cannot be sorted on', () => {
    writeSort({ key: 'title', direction: 'asc' })
    writeSort({ key: 'colour', direction: 'asc' })
    expect(readSort()).toEqual({ key: 'title', direction: 'asc' })
  })

  it('TileGrid seeds its sort from the stored one and persists a change', () => {
    expect(tileGrid).toContain('ref(readSort())')
    expect(tileGrid).toContain('watch(sort, writeSort')
  })
})

// #449: Home carried a page heading, a Drive banner and a Collections strip above
// the one thing it is for. All three are gone, and the page sits in a single
// centred container so every row starts and ends on the same line.
describe('Home is the diagrams and nothing else (#449)', () => {
  it('drops the "Home" heading', () => {
    expect(homeShell).not.toContain('>Home</div>')
    expect(homeShell).not.toContain('text-3xl')
  })

  it('drops the yellow Drive banner', () => {
    expect(homeShell).not.toContain('<Alert')
    expect(homeShell).not.toContain('shouldShowInstallDriveBanner')
    expect(homeShell).not.toContain('lucide-hard-drive')
  })

  it('drops Collections and its "+" everywhere on the page', () => {
    for (const source of [homeShell, tileGrid, diagramTile, listView]) {
      expect(source).not.toContain('CollectionChips')
      expect(source).not.toContain('CollectionPicker')
      expect(source).not.toContain('Add to collection')
      expect(source).not.toContain("@/data/collections.js")
    }
  })

  it('holds the page in one centred container with even gutters', () => {
    expect((homeShell.match(/max-w-\[1100px\]/g) || []).length).toBe(2)
    expect(homeShell).not.toContain('px-9')
  })

  it('puts search, sort, layout and Create in one toolbar row', () => {
    expect(tileGrid).toContain('placeholder="Search diagrams"')
    expect(tileGrid).toContain('<TabButtons')
    expect(tileGrid).toContain("emit('create')")
  })
})

// #449: the ⋯ menu is the actions with nowhere else to live. Pin is the row's own
// control, rename is a double-click on the name, and deleting one diagram asks
// first — it sits one item below Duplicate.
describe('the ⋯ menu (#449)', () => {
  it('carries exactly Copy link, Show info, Duplicate and Delete', () => {
    const menu = tileGrid.slice(tileGrid.indexOf('function menuFor'))
    const labels = [...menu.slice(0, 700).matchAll(/label: '([^']+)'/g)].map((m) => m[1])
    expect(labels).toEqual(['Copy link', 'Show info', 'Duplicate', 'Delete'])
  })

  it('asks before moving a single diagram to Trash', () => {
    expect(tileGrid).toContain('function askTrash')
    expect(tileGrid).toContain("confirm({")
    expect(tileGrid).toContain("confirmLabel: 'Delete'")
  })

  it('renames in place on a double-click, with no dialog', () => {
    expect(tileGrid).not.toContain('dialog.prompt')
    for (const source of [listView, diagramTile]) {
      expect(source).toContain('@dblclick')
      expect(source).toContain('startRename')
    }
  })

  it('anchors the menu with align, not the placement alias', () => {
    // `placement` only accepts left|right|center; "bottom-end" matched nothing, so
    // the menu aligned left and hung off the right edge of the page.
    for (const source of [listView, diagramTile]) {
      expect(source).toContain('align="end"')
      expect(source).not.toContain('placement="bottom-end"')
    }
  })
})

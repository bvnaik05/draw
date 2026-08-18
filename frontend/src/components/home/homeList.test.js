import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { COLUMNS, relativeTime, ownerLabel, diagramMenuItems } from './diagramColumns.js'

// Browser-free source checks + model tests for the #541 rework: Create moved to
// the page header, the standalone sort control is gone in favour of column
// headers, and pinning no longer exists anywhere under components/home.
const here = path.dirname(fileURLToPath(import.meta.url))
const read = (rel) => readFileSync(path.join(here, rel), 'utf8')
const homeShell = read('../../pages/HomeShell.vue')
const tileGrid = read('TileGrid.vue')
const diagramListView = read('DiagramListView.vue')

describe('the column model (#541)', () => {
  it('offers Owner as a sortable column, alongside Name / Created / Last edited', () => {
    const keys = COLUMNS.filter((c) => c.sortable).map((c) => c.key)
    expect(keys).toEqual(['title', 'owner', 'creation', 'modified'])
  })

  it('carries a trailing, unsortable column for the row menu', () => {
    const last = COLUMNS[COLUMNS.length - 1]
    expect(last.sortable).toBe(false)
  })
})

describe('relativeTime / ownerLabel', () => {
  it('reads a missing value as an em dash', () => {
    expect(relativeTime(undefined)).toBe('—')
  })

  it('drops the @domain from an email owner', () => {
    expect(ownerLabel({ owner: 'alice@example.com' })).toBe('alice')
  })

  it('passes a bare username through unchanged', () => {
    expect(ownerLabel({ owner: 'Administrator' })).toBe('Administrator')
  })
})

describe('diagramMenuItems', () => {
  it('offers Copy link, Show info, Rename, Duplicate, and a red Delete', () => {
    const emit = () => {}
    const items = diagramMenuItems({ name: 'd1', title: 'Untitled' }, emit)
    expect(items.map((i) => i.label)).toEqual(['Copy link', 'Show info', 'Rename', 'Duplicate', 'Delete'])
    expect(items.find((i) => i.label === 'Delete').theme).toBe('red')
  })

  it('reports Rename / Duplicate / Delete / Show info back through the caller\'s own emit', () => {
    const calls = []
    const emit = (event, diagram) => calls.push([event, diagram.name])
    const diagram = { name: 'd1', title: 'Untitled' }
    for (const label of ['Show info', 'Rename', 'Duplicate', 'Delete']) {
      diagramMenuItems(diagram, emit).find((i) => i.label === label).onClick()
    }
    expect(calls).toEqual([
      ['show-info', 'd1'],
      ['rename', 'd1'],
      ['duplicate', 'd1'],
      ['delete', 'd1'],
    ])
  })
})

// #541 item 5: Create moves from the list toolbar into the page header, aligned
// with "Frappe Draw", and the view toggle becomes the last thing in the toolbar.
describe('Create lives in the page header (#541 item 5)', () => {
  it('HomeShell renders Create in the header, not TileGrid', () => {
    expect(homeShell).toMatch(/<Button[^>]*label="Create"/)
    expect(tileGrid).not.toMatch(/label="Create"/)
  })

  it('HomeShell owns the create() call TileGrid used to trigger', () => {
    expect(homeShell).toContain('async function create()')
    expect(tileGrid).not.toContain("emit('create')")
  })
})

// Tile view has no header row, so it keeps its own master checkbox (#404);
// list view gets one for free from frappe-ui's ListHeader.
describe('tile view keeps Select all (#404)', () => {
  it('renders SelectAllCheckbox, wired to a whole-page select/clear', () => {
    expect(tileGrid).toContain('SelectAllCheckbox')
    expect(tileGrid).toMatch(/<SelectAllCheckbox[^>]*:all-selected="allSelected"/)
    expect(tileGrid).toMatch(/<SelectAllCheckbox[^>]*@change="setAllSelected"/)
  })
})

// #541: no pin control, no Pinned section, no is_pinned field, anywhere under
// components/home.
describe('pinning is gone from every home component (#541)', () => {
  it('never re-adds a pin affordance to the list view', () => {
    expect(diagramListView).not.toMatch(/is_pinned|togglePin|PinIcon|Unpin/i)
  })
})

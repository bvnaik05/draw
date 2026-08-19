// Structural edits to a whiteboard table: insert / delete a row or column, and
// which rows read as the header (#553). Kept out of whiteboardModel.js because
// that file already carries the whole board's model; this is one subject —
// reshaping a grid — and every function here takes a table and mutates it.
//
// Reshaping a grid means moving every keyed thing that hangs off a row/column
// index: the cell text, its formatting runs, its per-cell style overrides, the
// merge rectangles, and the resized column widths / row heights. Miss one and a
// cell keeps its text but loses its colour, so all five move together here.

import {
  MAX_TABLE_DIM,
  tableCols,
  tableMerges,
  tableRows,
  setTableCellRuns,
} from './whiteboardModel.js'

// Keys of `cells` / `cellRuns` / `cellStyles` are "row,col". Shift every key on
// one axis at or past `at` by `delta`; a delete (delta -1) drops that line's own
// keys. Returns undefined for an empty result — absent beats empty in a saved
// document, the rule withKey already follows.
function shiftKeyedCells(map, axis, at, delta) {
  if (!map) return undefined
  const out = {}
  for (const [key, value] of Object.entries(map)) {
    const [row, col] = key.split(',').map(Number)
    const index = axis === 'row' ? row : col
    if (delta < 0 && index === at) continue
    const moved = index >= at ? index + delta : index
    out[axis === 'row' ? `${moved},${col}` : `${row},${moved}`] = value
  }
  return Object.keys(out).length ? out : undefined
}

// The merge fields for an axis: where the rectangle starts, and how far it runs.
function mergeFields(axis) {
  return axis === 'row' ? ['row', 'rowspan'] : ['col', 'colspan']
}

// A new line pushes the merges after it along, and GROWS any merge it lands
// inside — inserting a row through a merged block splits nothing, it makes the
// block one row taller, which is what a spreadsheet does.
function mergesAfterInsert(table, axis, at) {
  const [start, span] = mergeFields(axis)
  return tableMerges(table).map((merge) => {
    if (merge[start] >= at) return { ...merge, [start]: merge[start] + 1 }
    if (merge[start] + merge[span] > at) return { ...merge, [span]: merge[span] + 1 }
    return { ...merge }
  })
}

// Deleting a line pulls the merges after it back and shrinks any it ran
// through. A merge left covering a single cell is no longer a merge.
function mergesAfterDelete(table, axis, at) {
  const [start, span] = mergeFields(axis)
  return tableMerges(table)
    .map((merge) => {
      if (merge[start] > at) return { ...merge, [start]: merge[start] - 1 }
      if (merge[start] + merge[span] > at) return { ...merge, [span]: merge[span] - 1 }
      return { ...merge }
    })
    .filter((merge) => merge.rowspan * merge.colspan > 1)
}

// Explicit sizes only exist once a border has been dragged, so an untouched
// table stays sparse: absent in, absent out.
function sizesAfterInsert(sizes, at, size) {
  if (!sizes) return undefined
  const next = [...sizes]
  next.splice(at, 0, size)
  return next
}

function sizesAfterDelete(sizes, at) {
  if (!sizes) return undefined
  const next = [...sizes]
  next.splice(at, 1)
  return next
}

// Absent beats empty in a saved document, so a table with no merges left keeps
// no `merges` key at all.
function keptMerges(merges) {
  return merges.length ? merges : undefined
}

function clampIndex(index, max) {
  return Math.max(0, Math.min(max, Math.floor(index) || 0))
}

// Insert an empty row so that it becomes row `at` (so "above" is the row's own
// index, "below" is index + 1). Bounded by MAX_TABLE_DIM like every other count.
export function insertTableRow(table, at) {
  const rows = tableRows(table)
  if (rows >= MAX_TABLE_DIM) return
  const index = clampIndex(at, rows)
  table.cells = shiftKeyedCells(table.cells, 'row', index, 1) || {}
  table.cellRuns = shiftKeyedCells(table.cellRuns, 'row', index, 1)
  table.cellStyles = shiftKeyedCells(table.cellStyles, 'row', index, 1)
  table.merges = keptMerges(mergesAfterInsert(table, 'row', index))
  table.rowHeights = sizesAfterInsert(table.rowHeights, index, table.cellH)
  table.rows = rows + 1
  if (index < tableHeaderRows(table)) setTableHeaderRows(table, tableHeaderRows(table) + 1)
}

// Delete row `row`. The last row is kept: a table with no rows has nothing to
// select, and deleting the whole table is its own action.
export function deleteTableRow(table, row) {
  const rows = tableRows(table)
  if (rows <= 1) return
  const index = clampIndex(row, rows - 1)
  const headers = tableHeaderRows(table)
  table.cells = shiftKeyedCells(table.cells, 'row', index, -1) || {}
  table.cellRuns = shiftKeyedCells(table.cellRuns, 'row', index, -1)
  table.cellStyles = shiftKeyedCells(table.cellStyles, 'row', index, -1)
  table.merges = keptMerges(mergesAfterDelete(table, 'row', index))
  table.rowHeights = sizesAfterDelete(table.rowHeights, index)
  table.rows = rows - 1
  if (index < headers) setTableHeaderRows(table, headers - 1)
}

// Insert an empty column so that it becomes column `at` ("before" is the
// column's own index, "after" is index + 1).
export function insertTableColumn(table, at) {
  const cols = tableCols(table)
  if (cols >= MAX_TABLE_DIM) return
  const index = clampIndex(at, cols)
  table.cells = shiftKeyedCells(table.cells, 'col', index, 1) || {}
  table.cellRuns = shiftKeyedCells(table.cellRuns, 'col', index, 1)
  table.cellStyles = shiftKeyedCells(table.cellStyles, 'col', index, 1)
  table.merges = keptMerges(mergesAfterInsert(table, 'col', index))
  table.colWidths = sizesAfterInsert(table.colWidths, index, table.cellW)
  table.cols = cols + 1
  if (index < tableHeaderCols(table)) setTableHeaderCols(table, tableHeaderCols(table) + 1)
}

// Delete column `col`, keeping the last one for the same reason as the row.
export function deleteTableColumn(table, col) {
  const cols = tableCols(table)
  if (cols <= 1) return
  const index = clampIndex(col, cols - 1)
  const headerCols = tableHeaderCols(table)
  table.cells = shiftKeyedCells(table.cells, 'col', index, -1) || {}
  table.cellRuns = shiftKeyedCells(table.cellRuns, 'col', index, -1)
  table.cellStyles = shiftKeyedCells(table.cellStyles, 'col', index, -1)
  table.merges = keptMerges(mergesAfterDelete(table, 'col', index))
  table.colWidths = sizesAfterDelete(table.colWidths, index)
  table.cols = cols - 1
  if (index < headerCols) setTableHeaderCols(table, headerCols - 1)
}

// ----- header rows -----------------------------------------------------------
// A header is the first N rows, as in a document editor: you pick a row and
// every row down to it becomes header. The count generalises the older
// `hasHeader` boolean (#338), which is still read for documents saved before
// this and still written, so an older client keeps showing the first-row band.

export function tableHeaderRows(table) {
  const stored = Number.isFinite(table.headerRows) ? table.headerRows : table.hasHeader ? 1 : 0
  return clampIndex(stored, tableRows(table))
}

export function isHeaderRow(table, row) {
  return row < tableHeaderRows(table)
}

export function setTableHeaderRows(table, count) {
  const next = clampIndex(count, tableRows(table))
  table.headerRows = next || undefined
  table.hasHeader = next > 0
}

// One click on a selected row: make the header run down to it, or — when it is
// already a header row — end the header just above it, which is how the same
// button reverts.
export function toggleHeaderThroughRow(table, row) {
  const index = clampIndex(row, Math.max(0, tableRows(table) - 1))
  setTableHeaderRows(table, isHeaderRow(table, index) ? index : index + 1)
}

// ----- header columns ---------------------------------------------------------
// Same shape as header rows, mirrored onto the column axis, independently
// configurable (#556). No legacy boolean here — `hasHeader` only existed for
// documents saved before the row count generalised it (#338); columns never had
// a single-column predecessor to stay compatible with.

export function tableHeaderCols(table) {
  return clampIndex(Number.isFinite(table.headerCols) ? table.headerCols : 0, tableCols(table))
}

export function isHeaderColumn(table, col) {
  return col < tableHeaderCols(table)
}

export function setTableHeaderCols(table, count) {
  table.headerCols = clampIndex(count, tableCols(table)) || undefined
}

// One click on a selected column: make the header run out to it, or — when it
// is already a header column — end the header just before it.
export function toggleHeaderThroughColumn(table, col) {
  const index = clampIndex(col, Math.max(0, tableCols(table) - 1))
  setTableHeaderCols(table, isHeaderColumn(table, index) ? index : index + 1)
}

// Empty the given cells, keeping their style overrides — "clear contents" is
// about the text, not about undoing the formatting of the cells that held it.
export function clearTableCells(table, cells) {
  for (const { row, col } of cells) setTableCellRuns(table, row, col, [])
}

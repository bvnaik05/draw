// Structural table edits (#553): a row/column insert or delete has to carry the
// cell text, its runs, its style overrides, the merges and the dragged sizes
// with it — these lock that down, plus the header-row rule.
import { describe, it, expect } from 'vitest'
import { makeTable, tableCellRuns, tableCellStyle } from './whiteboardModel.js'
import {
  insertTableRow,
  deleteTableRow,
  insertTableColumn,
  deleteTableColumn,
  tableHeaderRows,
  isHeaderRow,
  toggleHeaderThroughRow,
  clearTableCells,
} from './tableStructure.js'

function table(partial = {}) {
  return makeTable(0, 0, { rows: 3, cols: 3, ...partial })
}

describe('insertTableRow', () => {
  it('pushes the rows at and below the insert point down', () => {
    const grid = table({ cells: { '0,0': 'top', '1,0': 'middle' } })
    insertTableRow(grid, 1)
    expect(grid.rows).toBe(4)
    expect(grid.cells).toEqual({ '0,0': 'top', '2,0': 'middle' })
  })

  it('carries formatting runs and style overrides with the text', () => {
    const grid = table({
      cells: { '1,1': 'hi' },
      cellRuns: { '1,1': [{ text: 'hi', bold: true }] },
      cellStyles: { '1,1': { color: '#EE5A5A' } },
    })
    insertTableRow(grid, 0)
    expect(tableCellRuns(grid, 2, 1)).toEqual([{ text: 'hi', bold: true }])
    expect(tableCellStyle(grid, 2, 1).color).toBe('#EE5A5A')
  })

  it('grows a merge it lands inside and moves the ones below it', () => {
    const grid = table({ merges: [{ row: 0, col: 0, rowspan: 2, colspan: 1 }] })
    insertTableRow(grid, 1)
    expect(grid.merges).toEqual([{ row: 0, col: 0, rowspan: 3, colspan: 1 }])
    insertTableRow(grid, 0)
    expect(grid.merges).toEqual([{ row: 1, col: 0, rowspan: 3, colspan: 1 }])
  })

  it('splices dragged row heights and leaves un-dragged tables sparse', () => {
    const dragged = table({ rowHeights: [10, 20, 30] })
    insertTableRow(dragged, 1)
    expect(dragged.rowHeights).toEqual([10, dragged.cellH, 20, 30])
    const plain = table()
    insertTableRow(plain, 1)
    expect(plain.rowHeights).toBeUndefined()
  })
})

describe('deleteTableRow', () => {
  it('drops that row and pulls the rows below it up', () => {
    const grid = table({ cells: { '0,0': 'a', '1,0': 'b', '2,0': 'c' } })
    deleteTableRow(grid, 1)
    expect(grid.rows).toBe(2)
    expect(grid.cells).toEqual({ '0,0': 'a', '1,0': 'c' })
  })

  it('keeps the last row', () => {
    const grid = table({ rows: 1 })
    deleteTableRow(grid, 0)
    expect(grid.rows).toBe(1)
  })

  it('shrinks a merge it ran through and drops one left covering a single cell', () => {
    const grid = table({ merges: [{ row: 0, col: 0, rowspan: 2, colspan: 1 }] })
    deleteTableRow(grid, 0)
    expect(grid.merges).toBeUndefined()
  })
})

describe('column edits', () => {
  it('inserts a column, shifting the cells at and past it', () => {
    const grid = table({ cells: { '0,0': 'a', '0,1': 'b' } })
    insertTableColumn(grid, 1)
    expect(grid.cols).toBe(4)
    expect(grid.cells).toEqual({ '0,0': 'a', '0,2': 'b' })
  })

  it('deletes a column, dropping its cells and pulling the rest left', () => {
    const grid = table({ cells: { '0,0': 'a', '0,1': 'b', '0,2': 'c' } })
    deleteTableColumn(grid, 0)
    expect(grid.cols).toBe(2)
    expect(grid.cells).toEqual({ '0,0': 'b', '0,1': 'c' })
  })

  it('keeps the last column', () => {
    const grid = table({ cols: 1 })
    deleteTableColumn(grid, 0)
    expect(grid.cols).toBe(1)
  })
})

describe('header rows', () => {
  it('reads the legacy hasHeader boolean as one header row', () => {
    expect(tableHeaderRows(table({ hasHeader: true }))).toBe(1)
    expect(tableHeaderRows(table())).toBe(0)
  })

  it('makes the header run down to the selected row, and reverts it', () => {
    const grid = table()
    toggleHeaderThroughRow(grid, 1)
    expect(tableHeaderRows(grid)).toBe(2)
    expect(isHeaderRow(grid, 1)).toBe(true)
    expect(grid.hasHeader).toBe(true)
    toggleHeaderThroughRow(grid, 1)
    expect(tableHeaderRows(grid)).toBe(1)
    toggleHeaderThroughRow(grid, 0)
    expect(tableHeaderRows(grid)).toBe(0)
    expect(grid.hasHeader).toBe(false)
  })

  it('follows the rows inserted above or deleted from the header', () => {
    const grid = table({ headerRows: 1 })
    insertTableRow(grid, 0)
    expect(tableHeaderRows(grid)).toBe(2)
    deleteTableRow(grid, 0)
    expect(tableHeaderRows(grid)).toBe(1)
  })
})

describe('clearTableCells', () => {
  it('empties the text but keeps the cell style', () => {
    const grid = table({ cells: { '0,0': 'a', '1,1': 'b' }, cellStyles: { '0,0': { color: '#EE5A5A' } } })
    clearTableCells(grid, [{ row: 0, col: 0 }])
    expect(grid.cells['0,0']).toBeUndefined()
    expect(grid.cells['1,1']).toBe('b')
    expect(tableCellStyle(grid, 0, 0).color).toBe('#EE5A5A')
  })
})

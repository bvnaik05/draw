// Structural table edits through the store (#553): each one is a single
// undoable step, and each reaches the model's own reshaping code rather than
// poking rows/cols by hand.
import { describe, it, expect } from 'vitest'
import { createDiagramStore } from './useDiagramStore.js'
import { createDiagramDocument } from '@/diagram/schema.js'
import { tableById } from '@/diagram/whiteboardModel.js'
import { tableHeaderRows } from '@/diagram/tableStructure.js'

function setup() {
  const store = createDiagramStore(createDiagramDocument(undefined, 'unified'))
  const id = store.addTable(0, 0, { rows: 3, cols: 3 })
  return { store, id, table: () => tableById(store.state.whiteboard, id) }
}

describe('table row and column actions', () => {
  it('inserts a row, carrying the cells below it down', () => {
    const { store, id, table } = setup()
    store.setTableCell(id, 1, 0, 'second')
    store.insertTableRow(id, 1)
    expect(table().rows).toBe(4)
    expect(table().cells['2,0']).toBe('second')
  })

  it('undoes an insert in one step', () => {
    const { store, id, table } = setup()
    store.insertTableRow(id, 0)
    store.undo()
    expect(table().rows).toBe(3)
  })

  it('deletes rows and columns, a whole range in one undo step', () => {
    const { store, id, table } = setup()
    store.deleteTableRows(id, [0, 1])
    store.deleteTableColumns(id, [2])
    expect(table().rows).toBe(1)
    expect(table().cols).toBe(2)
    store.undo()
    expect(table().cols).toBe(3)
    store.undo()
    expect(table().rows).toBe(3)
  })

  it('inserts a column, carrying the cells to its right along', () => {
    const { store, id, table } = setup()
    store.setTableCell(id, 0, 1, 'B')
    store.insertTableColumn(id, 1)
    expect(table().cols).toBe(4)
    expect(table().cells['0,2']).toBe('B')
  })
})

describe('header rows', () => {
  it('makes the header run down to the row that was picked, then reverts it', () => {
    const { store, id, table } = setup()
    store.toggleTableHeaderThroughRow(id, 1)
    expect(tableHeaderRows(table())).toBe(2)
    store.toggleTableHeaderThroughRow(id, 1)
    expect(tableHeaderRows(table())).toBe(1)
  })

  it('keeps the legacy hasHeader flag in step with the count', () => {
    const { store, id, table } = setup()
    store.setTableHeaderRows(id, 2)
    expect(table().hasHeader).toBe(true)
    store.setTableHeaderRows(id, 0)
    expect(table().hasHeader).toBe(false)
  })
})

describe('clearTableCells', () => {
  it('empties every cell it is given in one undo step', () => {
    const { store, id, table } = setup()
    store.setTableCell(id, 0, 0, 'a')
    store.setTableCell(id, 0, 1, 'b')
    store.clearTableCells(id, [{ row: 0, col: 0 }, { row: 0, col: 1 }])
    expect(table().cells['0,0']).toBeUndefined()
    expect(table().cells['0,1']).toBeUndefined()
    store.undo()
    expect(table().cells['0,0']).toBe('a')
    expect(table().cells['0,1']).toBe('b')
  })
})

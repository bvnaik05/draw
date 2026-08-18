<script setup>
// Row / column grips for a selected table (#553) — the thin bars a document
// editor puts outside the grid. Clicking one selects that whole row or column,
// dragging across them selects several, and the square in the corner selects the
// whole table. Hovering a grip offers a "+" that inserts a row below it / a
// column after it, which is the one-click insert the grid itself has no room for.
//
// SVG, drawn inside the table's own <g>: the grips sit in canvas coordinates so
// they pan and zoom with the table. Everything they do goes through
// useTableSelection, so the toolbar's table menu acts on exactly what these set.
//
// Each grip carries an invisible hit area that reaches from the "+" to the
// table's edge. Without it the pointer crosses a gap on its way to the "+",
// which counts as leaving the grip — and the button it is travelling to
// disappears from under it.
import { computed, ref } from 'vue'
import { useEditorUi } from '@/stores/useEditorUi.js'
import { useTableSelection } from '@/composables/useTableSelection.js'
import { clientToLogical } from '@/composables/pointer.js'
import {
  colOffsets,
  rowOffsets,
  tableColumnAt,
  tableRowAt,
  tableHeight,
  tableWidth,
} from '@/diagram/whiteboardModel.js'
import { TABLE_GRID_COLOR, TABLE_SELECT_COLOR } from '@/diagram/whiteboardColors.js'

const props = defineProps({
  table: { type: Object, required: true },
})

const editorUi = useEditorUi()
const {
  rows: selectedRows,
  columns: selectedColumns,
  spansAllRows,
  spansAllColumns,
  selectRow,
  selectColumn,
  selectWholeTable,
  insertRowBelow,
  insertColumnAfter,
} = useTableSelection()

// Canvas units. The bar is thin enough to read as chrome and wide enough to aim
// at; the gap keeps it off the table's own border.
const GRIP = 12
const GAP = 3
const PLUS_RADIUS = 7
const LANE = GRIP + GAP + PLUS_RADIUS * 2

const hovered = ref(null) // `c${col}` / `r${row}` — which grip owns the "+"

const gripTop = computed(() => props.table.y - GRIP - GAP)
const gripLeft = computed(() => props.table.x - GRIP - GAP)

const columnGrips = computed(() => {
  const offsets = colOffsets(props.table)
  return offsets.slice(0, -1).map((offset, col) => {
    const x = props.table.x + offset
    const w = offsets[col + 1] - offset
    return {
      key: `c${col}`,
      col,
      x,
      w,
      selected: spansAllRows.value && selectedColumns.value.includes(col),
      plus: { x: x + w, y: gripTop.value - PLUS_RADIUS - 2 },
      hit: { x, y: props.table.y - LANE, width: w + PLUS_RADIUS, height: LANE },
    }
  })
})

const rowGrips = computed(() => {
  const offsets = rowOffsets(props.table)
  return offsets.slice(0, -1).map((offset, row) => {
    const y = props.table.y + offset
    const h = offsets[row + 1] - offset
    return {
      key: `r${row}`,
      row,
      y,
      h,
      selected: spansAllColumns.value && selectedRows.value.includes(row),
      plus: { x: gripLeft.value - PLUS_RADIUS - 2, y: y + h },
      hit: { x: props.table.x - LANE, y, width: LANE, height: h + PLUS_RADIUS },
    }
  })
})

const wholeTableSelected = computed(() => spansAllRows.value && spansAllColumns.value)

// A "+" glyph as one path, so the button is a circle and two strokes rather than
// an icon font the canvas has no way to load.
function plusPath({ x, y }) {
  return `M${x - 3.5},${y}h7M${x},${y - 3.5}v7`
}

// A press on a grip selects that line, then drags to extend across neighbours —
// the gesture a spreadsheet's headers have.
function onColumnPress(event, col) {
  beginGripDrag(event, () => selectColumn(col), (point) =>
    selectColumn(col, tableColumnAt(props.table, point.x)),
  )
}

function onRowPress(event, row) {
  beginGripDrag(event, () => selectRow(row), (point) =>
    selectRow(row, tableRowAt(props.table, point.y)),
  )
}

function beginGripDrag(event, start, extend) {
  claim(event)
  const surface = event.target.closest('[data-fdpreset]')
  const rect = surface ? surface.getBoundingClientRect() : { left: 0, top: 0 }
  start()
  const move = (moveEvent) => extend(clientToLogical(moveEvent, rect, editorUi.viewport))
  const finish = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', finish)
    window.removeEventListener('pointercancel', finish)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', finish)
  window.addEventListener('pointercancel', finish)
}

function onCornerPress(event) {
  claim(event)
  selectWholeTable()
}

function onInsertColumn(event, col) {
  claim(event)
  selectColumn(col)
  insertColumnAfter()
}

function onInsertRow(event, row) {
  claim(event)
  selectRow(row)
  insertRowBelow()
}

// The table's own pointerdown moves it or opens a cell; a grip press is neither.
function claim(event) {
  event.stopPropagation()
  event.preventDefault()
}
</script>

<template>
  <g>
    <!-- Corner: selects the whole table. -->
    <rect
      :x="gripLeft"
      :y="gripTop"
      :width="GRIP"
      :height="GRIP"
      rx="2"
      :fill="wholeTableSelected ? TABLE_SELECT_COLOR : TABLE_GRID_COLOR"
      style="cursor: pointer"
      @pointerdown="onCornerPress"
    >
      <title>Select whole table</title>
    </rect>

    <!-- Column grips, above the table. -->
    <g
      v-for="grip in columnGrips"
      :key="grip.key"
      @pointerenter="hovered = grip.key"
      @pointerleave="hovered = null"
    >
      <rect v-bind="grip.hit" fill="transparent" />
      <rect
        :x="grip.x"
        :y="gripTop"
        :width="grip.w"
        :height="GRIP"
        rx="2"
        :fill="grip.selected ? TABLE_SELECT_COLOR : TABLE_GRID_COLOR"
        style="cursor: pointer"
        @pointerdown="onColumnPress($event, grip.col)"
      >
        <title>Select column</title>
      </rect>
      <g v-if="hovered === grip.key" style="cursor: pointer" @pointerdown="onInsertColumn($event, grip.col)">
        <circle
          :cx="grip.plus.x"
          :cy="grip.plus.y"
          :r="PLUS_RADIUS"
          fill="#FFFFFF"
          :stroke="TABLE_SELECT_COLOR"
          stroke-width="1.5"
        >
          <title>Insert column right</title>
        </circle>
        <path
          :d="plusPath(grip.plus)"
          :stroke="TABLE_SELECT_COLOR"
          stroke-width="1.5"
          stroke-linecap="round"
          style="pointer-events: none"
        />
      </g>
    </g>

    <!-- Row grips, left of the table. -->
    <g
      v-for="grip in rowGrips"
      :key="grip.key"
      @pointerenter="hovered = grip.key"
      @pointerleave="hovered = null"
    >
      <rect v-bind="grip.hit" fill="transparent" />
      <rect
        :x="gripLeft"
        :y="grip.y"
        :width="GRIP"
        :height="grip.h"
        rx="2"
        :fill="grip.selected ? TABLE_SELECT_COLOR : TABLE_GRID_COLOR"
        style="cursor: pointer"
        @pointerdown="onRowPress($event, grip.row)"
      >
        <title>Select row</title>
      </rect>
      <g v-if="hovered === grip.key" style="cursor: pointer" @pointerdown="onInsertRow($event, grip.row)">
        <circle
          :cx="grip.plus.x"
          :cy="grip.plus.y"
          :r="PLUS_RADIUS"
          fill="#FFFFFF"
          :stroke="TABLE_SELECT_COLOR"
          stroke-width="1.5"
        >
          <title>Insert row below</title>
        </circle>
        <path
          :d="plusPath(grip.plus)"
          :stroke="TABLE_SELECT_COLOR"
          stroke-width="1.5"
          stroke-linecap="round"
          style="pointer-events: none"
        />
      </g>
    </g>

    <!-- The frame band: the one place a drag still MOVES the table, now that a
         drag inside the cells selects a cell range instead. Transparent and
         hit-tested on its stroke alone, so it reads only through its cursor. -->
    <rect
      :x="table.x"
      :y="table.y"
      :width="tableWidth(table)"
      :height="tableHeight(table)"
      fill="none"
      stroke="transparent"
      stroke-width="8"
      data-table-frame
      style="pointer-events: stroke; cursor: move"
    >
      <title>Drag to move table</title>
    </rect>
  </g>
</template>

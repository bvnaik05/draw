<script setup>
// Row / column grips for a selected table (#553) — the thin bars a document
// editor puts outside the grid. Clicking one selects that whole row or column,
// dragging across them selects several, and the square in the corner selects the
// whole table. Hovering a grip offers a "+" that inserts a row below it / a
// column after it, which is the one-click insert the grid itself has no room for.
//
// SVG, drawn inside the table's own <g>: a grip's POSITION and length are canvas
// geometry, so it pans and follows its column's width, while its thickness is a
// screen size divided by zoom. Everything they do goes through useTableSelection,
// so the toolbar's table menu acts on exactly what these set.
//
// Each grip carries an invisible hit lane that reaches from the "+" to the
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

// Screen sizes, divided by zoom wherever they are used: the grips are drawn
// inside the viewport <g>, so a fixed canvas size would be a 3px sliver at 25%
// and a slab at 400%. Same rule SelectionLayer's handles follow. Only the
// thickness scales — a grip's length is its column's width, which is canvas
// geometry and must not.
//
// The bar is thin enough to read as chrome and wide enough to aim at; the gap
// keeps it off the table's own border. MOVE_BAND is the one place a drag still
// moves the table, so it is sized to be caught rather than hunted for.
const GRIP = 12
const GAP = 3
const PLUS_RADIUS = 7
const MOVE_BAND = 14

const hovered = ref(null) // `c${col}` / `r${row}` — which grip owns the "+"

const zoom = computed(() => editorUi.viewport.state.zoom || 1)
const gripSize = computed(() => GRIP / zoom.value)
const gap = computed(() => GAP / zoom.value)
const plusRadius = computed(() => PLUS_RADIUS / zoom.value)
const moveBand = computed(() => MOVE_BAND / zoom.value)
// How far the whole strip reaches out from the table: the bar, its gap, and the
// "+" hanging beyond it.
const lane = computed(() => gripSize.value + gap.value * 2 + plusRadius.value * 2)

const gripTop = computed(() => props.table.y - gripSize.value - gap.value)
const gripLeft = computed(() => props.table.x - gripSize.value - gap.value)

// A grip's hit lane is shifted along its own axis by the "+" radius, so the lane
// ENDS where its own "+" ends and the next one begins there. Sized from the grip's
// own edge instead, each lane reached a radius past its "+", covering half of the
// previous grip's button — and because a later sibling paints over an earlier one,
// the pointer aiming at that half landed on the NEXT grip's lane, which moved the
// hover and took the button out from under it.
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
      plus: { x: x + w, y: gripTop.value - plusRadius.value - gap.value },
      hit: { x: x + plusRadius.value, y: props.table.y - lane.value, width: w, height: lane.value },
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
      plus: { x: gripLeft.value - plusRadius.value - gap.value, y: y + h },
      hit: { x: props.table.x - lane.value, y: y + plusRadius.value, width: lane.value, height: h },
    }
  })
})

const wholeTableSelected = computed(() => spansAllRows.value && spansAllColumns.value)

// A "+" glyph as one path, so the button is a circle and two strokes rather than
// an icon font the canvas has no way to load.
function plusPath({ x, y }) {
  const arm = plusRadius.value / 2
  return `M${x - arm},${y}h${arm * 2}M${x},${y - arm}v${arm * 2}`
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
      :width="gripSize"
      :height="gripSize"
      :rx="2 / zoom"
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
        :height="gripSize"
        :rx="2 / zoom"
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
          :r="plusRadius"
          fill="#FFFFFF"
          :stroke="TABLE_SELECT_COLOR"
          :stroke-width="1.5 / zoom"
        >
          <title>Insert column right</title>
        </circle>
        <path
          :d="plusPath(grip.plus)"
          :stroke="TABLE_SELECT_COLOR"
          :stroke-width="1.5 / zoom"
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
        :width="gripSize"
        :height="grip.h"
        :rx="2 / zoom"
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
          :r="plusRadius"
          fill="#FFFFFF"
          :stroke="TABLE_SELECT_COLOR"
          :stroke-width="1.5 / zoom"
        >
          <title>Insert row below</title>
        </circle>
        <path
          :d="plusPath(grip.plus)"
          :stroke="TABLE_SELECT_COLOR"
          :stroke-width="1.5 / zoom"
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
      :stroke-width="moveBand"
      data-table-frame
      style="pointer-events: stroke; cursor: move"
    >
      <title>Drag to move table</title>
    </rect>
  </g>
</template>

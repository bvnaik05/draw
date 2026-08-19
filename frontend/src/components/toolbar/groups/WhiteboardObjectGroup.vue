<script setup>
// Controls for the current whiteboard selection (#363): a lone line or table's
// options, and Delete.
//
// That Delete is the only one a line, table or stroke has by mouse, which is why
// the bar it replaces had to mount on a unified document as well as a whiteboard
// one. A lone sticky is handled by its own richer group, so it is skipped here.
import { computed } from 'vue'
import { Popover } from 'frappe-ui'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useWhiteboardUi } from '@/composables/useWhiteboardUi.js'
import { lineById, tableById } from '@/diagram/whiteboardModel.js'
import { tableHeaderRows } from '@/diagram/tableStructure.js'
import LineOptions from '@/components/floating/LineOptions.vue'
import TableOptions from '@/components/floating/TableOptions.vue'
import EspressoSwatchGrid from '@/components/palette-right/EspressoSwatchGrid.vue'
import ToolbarButton from '../ToolbarButton.vue'

const store = useDiagramStore()
const ui = useWhiteboardUi()

const selection = computed(() => ui.state.selection || [])
const multi = computed(() => selection.value.length > 1)
const selected = computed(() => ui.state.selected)
const kind = computed(() => selected.value?.kind)

const line = computed(() =>
  kind.value === 'line' ? lineById(store.state.whiteboard, selected.value.id) : null,
)
const table = computed(() =>
  kind.value === 'table' ? tableById(store.state.whiteboard, selected.value.id) : null,
)
const show = computed(() => multi.value || Boolean(selected.value && kind.value !== 'sticky'))

// A table's colour is its TEXT colour (#553) — the grid and the header band are
// neutral chrome — so it is set from the same "A" control a text box carries,
// rather than from a drawing palette buried in the table's options.
const tableColor = computed(() => table.value?.color || '#171717')

// The header checkbox now writes a header ROW COUNT, and that has to travel
// through the model's own writer so the legacy `hasHeader` flag stays in step.
function changeTable(patch) {
  if ('headerRows' in patch) store.setTableHeaderRows(table.value.id, patch.headerRows)
  else store.updateTable(table.value.id, patch)
}

function remove() {
  store.removeWhiteboardObjects([...selection.value])
  ui.clearSelection()
}
</script>

<template>
  <template v-if="show">
    <span v-if="multi" class="px-1.5 text-sm text-ink-gray-6">{{ selection.length }} selected</span>

    <Popover v-else-if="line || table">
      <template #trigger>
        <ToolbarButton
          :label="line ? 'Edit line' : 'Edit table'"
          :icon="line ? 'lucide-minus' : 'lucide-table'"
        />
      </template>
      <template #default>
        <LineOptions
          v-if="line"
          :start="line.start"
          :end="line.end"
          :color="line.color"
          :width="line.width"
          @change="store.updateLine(line.id, $event)"
        />
        <TableOptions
          v-else
          mode="edit"
          :rows="table.rows"
          :cols="table.cols"
          :header-rows="tableHeaderRows(table)"
          :align="table.align"
          @change="changeTable"
        />
      </template>
    </Popover>

    <!-- The table's text colour, in the same shape as the text box's control. -->
    <Popover v-if="table">
      <template #trigger>
        <ToolbarButton label="Table text colour">
          <template #icon>
            <span class="grid size-4 place-items-center rounded text-sm font-semibold" :style="{ color: tableColor }">A</span>
          </template>
        </ToolbarButton>
      </template>
      <template #default>
        <div class="p-2">
          <EspressoSwatchGrid
            mode="fill"
            :model-value="tableColor"
            :allow-none="false"
            @select="store.updateTable(table.id, { color: $event })"
          />
        </div>
      </template>
    </Popover>

    <ToolbarButton
      :label="multi ? 'Delete selection' : 'Delete'"
      icon="lucide-trash-2"
      theme="red"
      @click="remove"
    />
  </template>
</template>

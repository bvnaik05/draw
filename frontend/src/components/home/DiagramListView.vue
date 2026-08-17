<script setup>
// The list-view diagram browser (#541), built on frappe-ui's ListView family —
// the same primitives Frappe Drive's own file list uses — instead of the
// hand-rolled column-header row + row markup this replaces. `ListRow` already
// gives Drive's hover (rounded, `hover:bg-surface-sidebar`) and its type scale
// (`text-base`, first column `ink-gray-9`, the rest `ink-gray-7`) for free.
//
// Two things frappe-ui's stock rendering does not give, added here: the header
// loses its grey pill background, and both the row checkbox and the header's
// sort glyph reveal on hover rather than sitting on screen at rest.
import { ref, watch, onMounted } from 'vue'
import { ListView, ListHeader, ListHeaderItem, ListRows, ListRow, Button, Dropdown } from 'frappe-ui'
import { COLUMNS, relativeTime, ownerLabel, diagramMenuItems } from './diagramColumns.js'

const props = defineProps({
  diagrams: { type: Array, default: () => [] },
  selected: { type: Object, default: () => new Set() },
  sortKey: { type: String, required: true },
  sortDir: { type: String, required: true },
})
const emit = defineEmits(['open', 'select-all', 'sort', 'copy-link', 'rename', 'duplicate', 'delete', 'show-info'])

const listRef = ref(null)

// The row checkbox and the "select all" one in the header both come from
// ListRow / ListHeader themselves — there is no slot to swap them for the
// shared SelectAllCheckbox tile view uses, so their state is a SEPARATE Set
// that frappe-ui owns internally. Since this component is only ever mounted
// while list view is active (TileGrid renders it behind a `v-if`), "on mount"
// already means "list view just became active" — that is the one moment a
// selection made in tile view needs to be carried in.
function syncFromExternalSelection() {
  const internal = listRef.value?.selections
  if (!internal) return
  internal.clear()
  props.selected.forEach((name) => internal.add(name))
}
onMounted(syncFromExternalSelection)

// A bulk delete (or the toolbar's Clear) empties the shared Set from outside
// this component; mirror that into frappe-ui's internal one so a deleted row's
// checkbox does not linger "on" for a name that no longer has a row.
watch(
  () => props.selected.size,
  (size) => {
    if (size === 0) listRef.value?.selections.clear()
  },
)

// Every row click and shift-click updates frappe-ui's own Set; forward the
// whole thing up so TileGrid's bulk bar (shared with tile view) agrees with it.
function onSelectionsChanged(selections) {
  emit('select-all', new Set(selections))
}

// The header names the active sort with a fixed direction arrow; every other
// sortable column shows a neutral ↕ only while the pointer is in the header row
// (the named `group/list`, not `ListHeaderItem`'s own unnamed `group`).
function sortArrowClass(key) {
  if (props.sortKey !== key) {
    return 'lucide-arrow-up-down opacity-0 group-hover/list:opacity-100'
  }
  return props.sortDir === 'asc' ? 'lucide-arrow-up' : 'lucide-arrow-down'
}
</script>

<template>
  <ListView
    ref="listRef"
    row-key="name"
    :columns="COLUMNS"
    :rows="diagrams"
    :options="{
      selectable: true,
      showTooltip: true,
      resizeColumn: false,
      rowHeight: 44,
      onRowClick: (row) => emit('open', row.name),
    }"
    class="diagram-list"
    @update:selections="onSelectionsChanged"
  >
    <!-- frappe-ui-exempt: overriding ListHeader's stock grey-pill background so the header reads as a hairline row, matching Drive rather than frappe-ui's default table chrome -->
    <ListHeader class="group/list !mb-1 !rounded-none !border-b !border-outline-gray-1 !bg-transparent !p-2">
      <ListHeaderItem v-for="column in COLUMNS" :key="column.key" :item="column">
        <!-- frappe-ui-exempt: sortable column label, not a control — Button's own height and padding would break the column alignment with the rows beneath --><button
          v-if="column.sortable"
          class="flex items-center gap-1 truncate text-sm text-ink-gray-5 hover:text-ink-gray-7"
          @click="emit('sort', column.key)"
        >
          {{ column.label }}
          <span class="h-3.5 w-3.5 flex-none text-ink-gray-4" :class="sortArrowClass(column.key)" aria-hidden="true" />
        </button>
        <span v-else class="truncate text-sm text-ink-gray-5">{{ column.label }}</span>
      </ListHeaderItem>
    </ListHeader>

    <ListRows>
      <ListRow v-for="row in diagrams" :key="row.name" :row="row" class="group" data-diagram-row>
        <template #default="{ column, item }">
          <span v-if="column.key === 'title'" class="truncate text-base font-medium text-ink-gray-9">{{ item }}</span>
          <span v-else-if="column.key === 'owner'" class="truncate text-base text-ink-gray-7">{{ ownerLabel(row) }}</span>
          <span v-else-if="column.key === 'creation'" class="text-base text-ink-gray-7">{{ relativeTime(item) }}</span>
          <span v-else-if="column.key === 'modified'" class="text-base text-ink-gray-7">{{ relativeTime(item) }}</span>
          <Dropdown v-else :options="diagramMenuItems(row, emit)" placement="bottom-end">
            <Button
              variant="ghost"
              size="sm"
              icon="lucide-ellipsis"
              class="opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
              :label="`More actions for ${row.title}`"
              @click.stop
            />
          </Dropdown>
        </template>
      </ListRow>
    </ListRows>
  </ListView>
</template>

<!-- frappe-ui-exempt: ListRow / ListHeader render their own Checkbox with no
     slot to style it through, so reaching the input to hide it until hover
     needs a descendant selector. -->
<style scoped>
.diagram-list :deep(input[type='checkbox']) {
  opacity: 0;
  transition: opacity 120ms ease;
}
.diagram-list :deep(input[type='checkbox']:checked),
.diagram-list :deep(input[type='checkbox']:indeterminate),
.diagram-list :deep(input[type='checkbox']:focus-visible),
.diagram-list :deep(.group:hover input[type='checkbox']),
.diagram-list :deep(.group\/list:hover input[type='checkbox']) {
  opacity: 1;
}
</style>

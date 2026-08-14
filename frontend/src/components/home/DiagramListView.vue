<script setup>
// Home's list view, built on frappe-ui's ListView primitives (#449). The row
// geometry, dividers, hover surface, selection surface and header chrome all come
// from ListView/ListHeader/ListRow, so the list matches every other Frappe product
// instead of being a hand-aligned run of flex columns.
//
// The default slot is supplied deliberately: it drops ListView's floating select
// banner, because Home already turns its toolbar into the bulk-action bar, and it
// lets the header carry sortable column buttons (#302).
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import {
  Button,
  Dropdown,
  ListHeader,
  ListHeaderItem,
  ListRows,
  ListView,
  TextInput,
} from 'frappe-ui'
import PinIcon from './PinIcon.vue'
import { ownerLabel, relativeTime } from './diagramLabels.js'

const props = defineProps({
  diagrams: { type: Array, default: () => [] },
  selected: { type: Object, default: () => new Set() },
  sort: { type: Object, required: true },
  pinLimitReached: { type: Boolean, default: false },
  renaming: { type: String, default: '' },
  // The ⋯ menu is built by the grid, which owns the actions behind it.
  menuFor: { type: Function, required: true },
})
const emit = defineEmits([
  'open',
  'selection',
  'sort',
  'toggle-pin',
  'rename-start',
  'rename-commit',
  'rename-cancel',
])

// Metadata columns are fixed-width so every row lands on the same lane; the name
// takes the rest. ListView scrolls horizontally rather than squashing them.
const COLUMNS = [
  { key: 'pin', label: '', width: '28px' },
  { key: 'title', label: 'Name', width: 2, sortKey: 'title' },
  { key: 'owner', label: 'Owner', width: '140px' },
  { key: 'creation', label: 'Created', width: '120px', sortKey: 'creation' },
  { key: 'modified', label: 'Last edited', width: '120px', sortKey: 'modified' },
  { key: 'actions', label: '', width: '40px', align: 'right' },
]

const listOptions = computed(() => ({
  selectable: true,
  showTooltip: false,
  rowHeight: 40,
  getRowRoute: (row) => ({ name: 'Editor', params: { name: row.name } }),
}))

// The arrow's COMPLETE lucide class for a column, or null when it is not the
// active sort — Tailwind's JIT reads these literally.
function sortArrow(column) {
  if (!column.sortKey || props.sort.key !== column.sortKey) return null
  return props.sort.direction === 'asc' ? 'lucide-chevron-up' : 'lucide-chevron-down'
}

// --- selection ------------------------------------------------------------
// The grid owns the selection (the tile view shares it), so ListView's internal
// set is mirrored rather than trusted: parent changes flow in, row clicks flow out.
const listRef = ref(null)
const sameMembers = (a, b) => a.size === b.size && [...a].every((name) => b.has(name))

function syncFromParent() {
  const internal = listRef.value?.selections
  if (!internal || sameMembers(internal, props.selected)) return
  internal.clear()
  props.selected.forEach((name) => internal.add(name))
}
onMounted(syncFromParent)
watch(() => [...props.selected], syncFromParent, { flush: 'post' })

function onSelections(selections) {
  if (sameMembers(selections, props.selected)) return
  emit('selection', [...selections])
}

// --- rename ---------------------------------------------------------------
// Double-clicking a name renames it in place. The row is a link, so the name
// swallows its own clicks and re-issues the open on a short delay — otherwise the
// first click of the double-click has already navigated to the editor.
const OPEN_DELAY = 220
const draftTitle = ref('')
const renameInput = ref(null)
let openTimer = null

function clickName(diagram) {
  clearTimeout(openTimer)
  openTimer = setTimeout(() => emit('open', diagram.name), OPEN_DELAY)
}
async function startRename(diagram) {
  clearTimeout(openTimer)
  draftTitle.value = diagram.title || ''
  emit('rename-start', diagram)
  await nextTick()
  renameInput.value?.el?.select()
}
// Blur commits, so an unchanged title has to settle as a no-op rather than a save.
function commitRename(diagram) {
  const title = draftTitle.value.trim()
  if (!title || title === diagram.title) return emit('rename-cancel')
  emit('rename-commit', diagram, title)
}

function pinTitle(diagram) {
  if (diagram.is_pinned) return 'Unpin'
  return props.pinLimitReached ? 'Pin limit reached (max 5)' : 'Pin'
}
</script>

<template>
  <ListView
    ref="listRef"
    row-key="name"
    :columns="COLUMNS"
    :rows="diagrams"
    :options="listOptions"
    @update:selections="onSelections"
  >
    <ListHeader>
      <ListHeaderItem v-for="column in COLUMNS" :key="column.key" :item="column">
        <Button
          v-if="column.sortKey"
          class="-ml-2"
          variant="ghost"
          size="sm"
          :label="column.label"
          @click="emit('sort', column.sortKey)"
        >
          {{ column.label }}
          <template v-if="sortArrow(column)" #suffix>
            <span class="size-3" aria-hidden="true" :class="sortArrow(column)" />
          </template>
        </Button>
        <span v-else>{{ column.label }}</span>
      </ListHeaderItem>
    </ListHeader>

    <ListRows />

    <template #cell="{ column, row }">
      <!-- Pin: one click, always visible, filled when pinned. -->
      <Button
        v-if="column.key === 'pin'"
        variant="ghost"
        size="sm"
        :label="pinTitle(row)"
        :tooltip="pinTitle(row)"
        :disabled="!row.is_pinned && pinLimitReached"
        @click.stop.prevent="emit('toggle-pin', row)"
      >
        <PinIcon
          :pinned="Boolean(row.is_pinned)"
          :class="row.is_pinned ? 'text-ink-gray-8' : 'text-ink-gray-4'"
        />
      </Button>

      <template v-else-if="column.key === 'title'">
        <TextInput
          v-if="renaming === row.name"
          ref="renameInput"
          v-model="draftTitle"
          variant="ghost"
          size="sm"
          class="w-full"
          :aria-label="`Rename ${row.title}`"
          @click.stop.prevent
          @blur="commitRename(row)"
          @keydown.enter.stop.prevent="commitRename(row)"
          @keydown.esc.stop.prevent="emit('rename-cancel')"
        />
        <span
          v-else
          class="truncate text-base font-semibold text-ink-gray-9"
          @click.stop.prevent="clickName(row)"
          @dblclick.stop.prevent="startRename(row)"
        >
          {{ row.title }}
        </span>
      </template>

      <span v-else-if="column.key === 'owner'" class="truncate text-sm text-ink-gray-6">
        {{ ownerLabel(row) }}
      </span>
      <span v-else-if="column.key === 'creation'" class="truncate text-sm text-ink-gray-6">
        {{ relativeTime(row.creation) }}
      </span>
      <span v-else-if="column.key === 'modified'" class="truncate text-sm text-ink-gray-6">
        {{ relativeTime(row.modified) }}
      </span>

      <!-- align="end" keeps the menu inside the list's right edge. `placement` is
           a deprecated alias that only accepts left|right|center — the old
           "bottom-end" matched nothing and silently aligned left, which is how the
           menu came to hang off the side of the page (#449). -->
      <Dropdown
        v-else-if="column.key === 'actions'"
        align="end"
        :options="menuFor(row)"
      >
        <Button
          variant="ghost"
          size="sm"
          icon="lucide-ellipsis"
          :label="`More actions for ${row.title}`"
          @click.stop.prevent
        />
      </Dropdown>
    </template>
  </ListView>
</template>

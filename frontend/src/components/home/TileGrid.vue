<script setup>
// Home's diagram browser (spec §2). One toolbar — search, sort, layout, Create —
// over one flat list of diagrams, pinned ones first. The toolbar becomes a
// bulk-action bar while anything is selected.
//
// The list view is frappe-ui's ListView (DiagramListView); the tile view is a grid
// of DiagramTile. Deleting from the bulk bar is optimistic and batched — see
// "trash (#402)" below. Collections were removed with the feature (#449).
import { computed, reactive, ref, watch } from 'vue'
import { call, useList, Button, Dialog, Dropdown, TabButtons, TextInput, toast } from 'frappe-ui'
import DiagramListView from './DiagramListView.vue'
import DiagramTile from './DiagramTile.vue'
import SelectAllCheckbox from './SelectAllCheckbox.vue'
import { confirm } from '@/composables/useConfirm.js'
import { useOptimisticTrash } from '@/composables/useOptimisticTrash.js'
import { ownerLabel, stampLabel } from './diagramLabels.js'
import {
  compareDiagrams,
  defaultDirection,
  emptyStateFor,
  nextSort,
  pinnedOnly,
  readLayout,
  readSort,
  sortLabelFor,
  SORT_FIELDS,
  unpinned,
  writeLayout,
  writeSort,
} from '@/components/home/homeViews.js'
import { submitOrThrow } from '@/data/submit.js'
import { createDiagramDocument } from '@/diagram/schema.js'

// `creating` rides on the shell's create call, so the toolbar's Create button
// shows the spinner while the new diagram is being inserted.
defineProps({ creating: { type: Boolean, default: false } })
const emit = defineEmits(['create', 'open', 'changed'])

const MAX_PINNED = 5

// `refetch: false` keeps writes from triggering their own list reload — every
// mutation here already ends in an explicit refresh(), so the default would
// re-fetch twice per change (and once per diagram during a bulk delete).
const enriched = useList({
  doctype: 'Draw Diagram',
  // `thumbnail` is the saved raster preview shown on tiles. `document` is NOT here:
  // carrying every diagram's full JSON made this response about nine times larger,
  // to serve a live preview that only the diagrams without a raster ever need (#223).
  fields: ['name', 'title', 'creation', 'modified', 'diagram_type', 'is_pinned', 'owner', 'thumbnail'],
  filters: { is_trashed: 0 },
  orderBy: 'modified desc',
  limit: 500,
  refetch: false,
})

// The live-SVG fallback, fetched for exactly the diagrams that need it: those with
// no saved thumbnail. In a library where diagrams have been opened and saved that
// is almost none, so this second request usually comes back empty. An emptied
// diagram has its thumbnail cleared on save, so "no raster" is the whole answer —
// a tile never needs a document to know it is blank.
const previewDocuments = useList({
  doctype: 'Draw Diagram',
  fields: ['name', 'document'],
  filters: { is_trashed: 0, thumbnail: ['is', 'not set'] },
  limit: 500,
  refetch: false,
})
const documentsByName = computed(() =>
  Object.fromEntries((previewDocuments.data || []).map((d) => [d.name, d.document])),
)

// Merge each thumbnail-less diagram's document back onto its row, so the tiles
// keep reading `diagram.document` and only the fetching changed. A row whose
// document has not arrived yet leaves the key undefined, which the tile reads as
// "not known yet" rather than "blank".
const rows = computed(() => {
  const documents = documentsByName.value
  return (enriched.data || []).map((row) =>
    row.thumbnail ? row : { ...row, document: documents[row.name] },
  )
})
const pinnedTotal = computed(() => rows.value.filter((d) => d.is_pinned).length)
const pinLimitReached = computed(() => pinnedTotal.value >= MAX_PINNED)

// --- view / search / sort --------------------------------------------------
// Both preferences survive a reload (#222, #449). Someone who switches to tiles and
// comes back to a list has to switch again on every visit — and, seeing no previews,
// reads it as thumbnails having stopped working (#221).
const view = ref(readLayout())
watch(view, writeLayout)
const sort = ref(readSort())
watch(sort, writeSort, { deep: true })
const query = ref('')

function matchesQuery(diagram) {
  const wanted = query.value.trim().toLowerCase()
  return !wanted || (diagram.title || '').toLowerCase().includes(wanted)
}

// The button says which sort is active; the menu ticks it. Picking a field from the
// menu resets its direction, while clicking the active column header flips it.
const sortLabel = computed(() => sortLabelFor(sort.value.key))
const sortOptions = computed(() =>
  SORT_FIELDS.map((field) => ({
    label: field.label,
    icon: field.key === sort.value.key ? 'lucide-check' : undefined,
    onClick: () => (sort.value = { key: field.key, direction: defaultDirection(field.key) }),
  })),
)
function setSort(key) {
  sort.value = nextSort(sort.value, key)
}

// Deleting is optimistic and batched (#402): the rows leave the shelf on click and
// one request settles the whole selection behind them, so `notTrashing` filters out
// the ones on their way to Trash before the reloaded list has caught up.
const { notTrashing, trashDiagrams } = useOptimisticTrash(refresh)

const visibleRows = computed(() => rows.value.filter((d) => notTrashing(d) && matchesQuery(d)))

// Pinned diagrams lead the list, then everything else, each in the chosen sort.
// Sorting the two halves separately is what pinning is for; a "Pinned" section
// heading over them would be a second heading on a page that just lost its first.
const compare = (a, b) => compareDiagrams(sort.value, a, b)
const ordered = computed(() => [
  ...pinnedOnly(visibleRows.value).sort(compare),
  ...unpinned(visibleRows.value).sort(compare),
])

// --- selection + bulk delete ----------------------------------------------
const selected = reactive(new Set())
const selectedCount = computed(() => selected.size)
// Set the wanted state rather than flipping the current one. frappe-ui's Checkbox
// emits update:modelValue twice per click (#405), and a flip run twice is a no-op —
// which is why clicking a tile's checkbox used to do nothing at all.
function setSelected(name, wanted) {
  if (wanted) selected.add(name)
  else selected.delete(name)
}
function clearSelection() {
  selected.clear()
}
// The list view reports its whole selection at once (frappe-ui's ListView owns the
// checkbox column), so it replaces rather than toggles.
function replaceSelection(names) {
  selected.clear()
  names.forEach((name) => selected.add(name))
}

// Nothing on the shelf (a search excluded everything — the truly-empty home
// renders HomeShell's EmptyState instead of this grid).
const nothingHere = computed(() => !ordered.value.length)
const hasActiveFilter = computed(() => Boolean(query.value.trim()))

// A search that matched nothing wants different words (and glyph) than a fresh,
// unused Home.
const emptyState = computed(() => emptyStateFor(hasActiveFilter.value))
const allSelected = computed(
  () => ordered.value.length > 0 && ordered.value.every((d) => selected.has(d.name)),
)
// Some-but-not-all selected → the master checkbox shows Gmail's indeterminate dash.
const someSelected = computed(() => selectedCount.value > 0 && !allSelected.value)
// Gmail behaviour: any selection → the master box clears it; nothing selected →
// it takes everything on screen. Idempotent for the same reason setSelected is.
function setAllSelected(wanted) {
  clearSelection()
  if (wanted) ordered.value.forEach((d) => selected.add(d.name))
}

// The selection empties as the rows go, so the bulk bar collapses back to the
// search field in the same frame rather than sitting there over nothing.
function deleteSelected() {
  const names = [...selected]
  clearSelection()
  trashDiagrams(names)
}

// --- per-diagram actions ---------------------------------------------------
async function togglePin(diagram) {
  if (!diagram.is_pinned && pinLimitReached.value) return
  await submitOrThrow(enriched.setValue, { name: diagram.name, is_pinned: diagram.is_pinned ? 0 : 1 })
  refresh()
}

// Rename happens in place, by double-clicking the title (#449) — `renaming` holds
// the diagram being edited, so only one row is ever a field.
const renaming = ref('')
async function commitRename(diagram, title) {
  renaming.value = ''
  await submitOrThrow(enriched.setValue, { name: diagram.name, title })
  refresh()
}

// The list no longer carries documents (#223), so read the source's on demand.
// A diagram with a saved thumbnail never has one on its row.
async function duplicate(diagram) {
  const source = await call('frappe.client.get_value', {
    doctype: 'Draw Diagram',
    filters: { name: diagram.name },
    fieldname: 'document',
  })
  const document = source?.document || diagram.document || createDiagramDocument()
  await submitOrThrow(enriched.insert, { title: `${diagram.title} copy`, document })
  refresh()
}

// Deleting one diagram asks first (#449). The bulk bar stays optimistic with an
// Undo (#402); a single ⋯ → Delete is a click away from Duplicate, so it confirms.
function askTrash(diagram) {
  confirm({
    title: 'Move to Trash?',
    message: `“${diagram.title}” moves to Trash. You can restore it from there for 30 days.`,
    theme: 'red',
    confirmLabel: 'Delete',
    onConfirm: () => trashDiagrams([diagram.name]),
  })
}

// Copy the diagram's editor link to the clipboard (spec I5, "under sharing").
function copyLink(diagram) {
  const url = `${window.location.origin}/draw/d/${diagram.name}`
  navigator.clipboard?.writeText(url).then(
    () => toast.success('Link copied'),
    () => toast.error('Could not copy link'),
  )
}

// The ⋯ menu, built once for both views. Pin lives on the row itself and rename on
// a double-click, so the menu carries only what has nowhere else to be (#449).
function menuFor(diagram) {
  return [
    { label: 'Copy link', icon: 'lucide-link', onClick: () => copyLink(diagram) },
    { label: 'Show info', icon: 'lucide-info', onClick: () => startInfo(diagram) },
    { label: 'Duplicate', icon: 'lucide-copy', onClick: () => duplicate(diagram) },
    { label: 'Delete', icon: 'lucide-trash-2', theme: 'red', onClick: () => askTrash(diagram) },
  ]
}

// --- show info (I5) --------------------------------------------------------
const info = reactive({ open: false, diagram: null })
function startInfo(diagram) {
  Object.assign(info, { open: true, diagram })
}
const infoRows = computed(() => {
  const diagram = info.diagram
  if (!diagram) return []
  return [
    ['Name', diagram.title],
    ['Owner', ownerLabel(diagram) || '—'],
    ['Created', stampLabel(diagram.creation)],
    ['Last edited', stampLabel(diagram.modified)],
  ]
})

// Awaitable so the optimistic trash can hold its rows hidden until the reloaded
// list agrees they are gone, instead of flashing them back in the gap (#402).
function refresh() {
  emit('changed')
  return Promise.all([
    enriched.reload(),
    // A save may have added or cleared a thumbnail, which changes which diagrams
    // still need their document fetched.
    previewDocuments.reload(),
  ])
}

const tileHandlers = {
  open: (name) => emit('open', name),
  select: setSelected,
  'toggle-pin': togglePin,
  'rename-start': (diagram) => (renaming.value = diagram.name),
  'rename-commit': commitRename,
  'rename-cancel': () => (renaming.value = ''),
}
</script>

<template>
  <div>
    <!-- Toolbar: search + sort on the left, layout and Create on the right; a
         bulk-action bar while anything is selected. -->
    <div class="mb-5 flex items-center gap-2">
      <template v-if="selectedCount">
        <span class="ml-1 mr-1 flex flex-none items-center">
          <SelectAllCheckbox
            :all-selected="allSelected"
            :some-selected="someSelected"
            @change="setAllSelected"
          />
        </span>
        <span class="text-base font-semibold text-ink-gray-9">{{ selectedCount }} selected</span>
        <Button variant="subtle" theme="red" icon-left="lucide-trash-2" label="Delete" @click="deleteSelected">
          Delete
        </Button>
        <Button variant="ghost" label="Clear" @click="clearSelection">Clear</Button>
        <div class="flex-1" />
      </template>

      <template v-else>
        <TextInput
          v-model="query"
          type="search"
          size="md"
          placeholder="Search diagrams"
          aria-label="Search diagrams"
          class="w-full max-w-sm"
        >
          <template #prefix>
            <span class="lucide-search size-4 text-ink-gray-5" aria-hidden="true" />
          </template>
        </TextInput>

        <!-- The trigger is the Dropdown's own child: a Tooltip wrapped around it
             swallows the trigger binding, which is why Sort never opened (#449). -->
        <Dropdown :options="sortOptions" align="start">
          <Button
            size="md"
            icon-left="lucide-arrow-up-down"
            :label="`Sort by ${sortLabel}`"
            :tooltip="`Sort by ${sortLabel}`"
          >
            {{ sortLabel }}
          </Button>
        </Dropdown>

        <div class="flex-1" />

        <TabButtons
          v-model="view"
          size="md"
          :options="[
            { value: 'list', label: 'List view', icon: 'lucide-list' },
            { value: 'tile', label: 'Tile view', icon: 'lucide-grid-2x2' },
          ]"
        />
        <Button
          variant="solid"
          size="md"
          icon-left="lucide-plus"
          label="Create"
          :loading="creating"
          @click="emit('create')"
        >
          Create
        </Button>
      </template>
    </div>

    <DiagramListView
      v-if="view === 'list' && !nothingHere"
      :diagrams="ordered"
      :selected="selected"
      :sort="sort"
      :pin-limit-reached="pinLimitReached"
      :renaming="renaming"
      :menu-for="menuFor"
      @selection="replaceSelection"
      @sort="setSort"
      v-on="tileHandlers"
    />

    <div
      v-else-if="!nothingHere"
      class="grid gap-[18px]"
      style="grid-template-columns: repeat(auto-fill, minmax(224px, 1fr))"
    >
      <DiagramTile
        v-for="diagram in ordered"
        :key="diagram.name"
        :diagram="diagram"
        :selected="selected.has(diagram.name)"
        :selection-active="selectedCount > 0"
        :pin-limit-reached="pinLimitReached"
        :renaming="renaming === diagram.name"
        :menu-for="menuFor"
        v-on="tileHandlers"
      />
    </div>

    <!-- Empty shelf — worded for a search that matched nothing vs. a fresh Home. -->
    <div v-else class="flex flex-col items-center gap-3 py-20 text-center">
      <div class="flex h-12 w-12 items-center justify-center rounded-full bg-surface-gray-2">
        <span class="h-5 w-5 text-ink-gray-5" aria-hidden="true" :class="emptyState.icon" />
      </div>
      <div>
        <p class="text-lg font-semibold text-ink-gray-8">{{ emptyState.title }}</p>
        <p class="mt-0.5 text-base text-ink-gray-5">{{ emptyState.hint }}</p>
      </div>
    </div>

    <!-- Show info (I5): read-only metadata. -->
    <Dialog v-model:open="info.open" title="Diagram info">
      <template #default>
        <dl class="grid grid-cols-[92px_1fr] gap-x-3 gap-y-2 text-base">
          <template v-for="[label, value] in infoRows" :key="label">
            <dt class="text-ink-gray-5">{{ label }}</dt>
            <dd class="truncate text-ink-gray-8">{{ value }}</dd>
          </template>
        </dl>
      </template>
    </Dialog>
  </div>
</template>

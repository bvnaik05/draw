<script setup>
// One diagram as a grid tile (spec §2): a live thumbnail, the title, when it was
// created and last edited, a selection checkbox, a pin and the ⋯ menu. The list
// view is DiagramListView, built on frappe-ui's ListView primitives (#449) — this
// file is the gallery half only.
import { computed, nextTick, ref, watch } from 'vue'
import { Button, Checkbox, Dropdown, TextInput } from 'frappe-ui'
import { documentToSvg, isDocumentEmpty } from '@/composables/useThumbnail.js'
import { relativeTime } from './diagramLabels.js'
import PinIcon from './PinIcon.vue'

const props = defineProps({
  diagram: { type: Object, required: true },
  selected: { type: Boolean, default: false },
  selectionActive: { type: Boolean, default: false },
  pinLimitReached: { type: Boolean, default: false },
  renaming: { type: Boolean, default: false },
  // The ⋯ menu is built by the grid, which owns the actions behind it.
  menuFor: { type: Function, required: true },
})
// `select` carries the wanted state, not "flip it" (#405). frappe-ui's Checkbox
// emits update:modelValue TWICE per click — once from its `defineModel` setter and
// once from an explicit emit in the same handler — so a toggling listener ran an
// even number of times and selection never took. Setting a value is idempotent,
// which makes the duplicate harmless.
const emit = defineEmits(['open', 'select', 'toggle-pin', 'rename-start', 'rename-commit', 'rename-cancel'])

// A non-empty diagram ALWAYS shows a preview: the saved raster thumbnail when we
// have one (cheap), otherwise a live SVG rendered from the document. Only a truly
// blank canvas shows neither — it gets the "empty" text placeholder instead of a
// misleading preview or icon.
//
// Home no longer sends every diagram's document (#223) — it fetches them only for
// the diagrams with no raster, since a diagram emptied after a save has its
// thumbnail cleared. So `document` is undefined until that second request lands,
// which is NOT the same as blank: showing "Diagram is blank" in the meantime would
// flash the wrong answer on every tile that is about to draw a preview.
const documentKnown = computed(() => props.diagram.document !== undefined)
const isEmpty = computed(() => {
  const document = props.diagram.document
  return documentKnown.value && (!document || isDocumentEmpty(document))
})
// A stored thumbnail can outlive the File it points at: the diagram keeps the
// path after the attachment is gone, and the <img> then 404s. Because the raster
// wins over the live preview, that left an empty box on a diagram that renders
// perfectly well — "the thumbnail stopped rendering" (#221). Treat a failed load
// as "no raster" so the live SVG takes over. Reset when the path changes, since
// the next one may well be fine.
const thumbnailFailed = ref(false)
watch(
  () => props.diagram.thumbnail,
  () => (thumbnailFailed.value = false),
)

// A diagram emptied after a save has its thumbnail CLEARED by save_thumbnail now
// (#93, #223), so a stored raster means real content and is shown as-is. Home
// therefore never fetches a document for a tile that has one.
const thumbnailUrl = computed(() =>
  thumbnailFailed.value ? null : props.diagram.thumbnail || null,
)
const previewSvg = computed(() => {
  if (thumbnailUrl.value || isEmpty.value || !documentKnown.value) return null
  return documentToSvg(props.diagram.document)
})
// While the document is still on its way, draw an empty frame rather than claiming
// the diagram is blank.
const showsBlankLabel = computed(() => !thumbnailUrl.value && !previewSvg.value && documentKnown.value)

const isPinned = computed(() => Boolean(props.diagram.is_pinned))
const createdLabel = computed(() => relativeTime(props.diagram.creation))
const editedLabel = computed(() => relativeTime(props.diagram.modified))

// Pinning is capped (5). An unpinned diagram can't be pinned once the cap is hit —
// its button greys out and says why.
const pinBlocked = computed(() => !isPinned.value && props.pinLimitReached)
const pinTitle = computed(() =>
  isPinned.value ? 'Unpin' : pinBlocked.value ? 'Pin limit reached (max 5)' : 'Pin',
)
function togglePin() {
  if (!pinBlocked.value) emit('toggle-pin', props.diagram)
}

// --- rename in place ------------------------------------------------------
// Double-clicking the title renames it, the same gesture as the list view. The
// single click that opens the diagram is held back briefly so the first click of
// a double-click doesn't navigate away mid-rename.
const OPEN_DELAY = 220
const draftTitle = ref('')
const renameInput = ref(null)
let openTimer = null

function clickTitle() {
  clearTimeout(openTimer)
  openTimer = setTimeout(() => emit('open', props.diagram.name), OPEN_DELAY)
}
async function startRename() {
  clearTimeout(openTimer)
  draftTitle.value = props.diagram.title || ''
  emit('rename-start', props.diagram)
  await nextTick()
  renameInput.value?.el?.select()
}
// Blur commits, so an unchanged title has to settle as a no-op rather than a save.
function commitRename() {
  const title = draftTitle.value.trim()
  if (!title || title === props.diagram.title) return emit('rename-cancel')
  emit('rename-commit', props.diagram, title)
}
</script>

<template>
  <div
    class="group relative overflow-hidden rounded-xl border text-left transition-shadow"
    :class="selected ? 'border-outline-blue-3 ring-1 ring-outline-blue-2' : 'border-outline-gray-1'"
  >
    <Checkbox
      class="absolute left-2 top-2 z-10 transition-opacity"
      :class="selected || selectionActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'"
      size="sm"
      :model-value="selected"
      :aria-label="`Select ${diagram.title || 'Untitled'}`"
      @click.stop
      @update:model-value="(wanted) => emit('select', diagram.name, wanted)"
    />

    <!-- One-click pin (Gmail-style): always shown when pinned, on hover otherwise. -->
    <Button
      class="absolute right-2 top-2 z-10"
      variant="ghost"
      size="sm"
      :class="isPinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'"
      :label="pinTitle"
      :tooltip="pinTitle"
      :disabled="pinBlocked"
      @click.stop="togglePin"
    >
      <PinIcon :pinned="isPinned" :class="isPinned ? 'text-ink-gray-8' : 'text-ink-gray-5'" />
    </Button>

    <!-- frappe-ui-exempt: the preview plate is a picture surface, not chrome — a Button would paint its own background and padding over the thumbnail, and the plate stays light in dark mode so the preview matches the canvas --><button class="block w-full" :aria-label="`Open ${diagram.title || 'Untitled'}`" @click="emit('open', diagram.name)">
      <div
        class="flex h-[120px] items-center justify-center border-b border-outline-gray-1 p-2"
        style="background-color: #ffffff"
      >
        <img
          v-if="thumbnailUrl"
          :src="thumbnailUrl"
          alt=""
          loading="lazy"
          decoding="async"
          class="h-full w-full object-contain"
          @error="thumbnailFailed = true"
        />
        <div v-else-if="previewSvg" class="h-full w-full [&>svg]:h-full [&>svg]:w-full" v-html="previewSvg" />
        <span v-else-if="showsBlankLabel" class="text-sm italic text-ink-gray-4">Diagram is blank</span>
      </div>
    </button>

    <div class="flex items-center gap-1 bg-surface-base px-3 py-2.5">
      <div class="min-w-0 flex-1">
        <TextInput
          v-if="renaming"
          ref="renameInput"
          v-model="draftTitle"
          variant="ghost"
          size="sm"
          class="w-full"
          :aria-label="`Rename ${diagram.title}`"
          @click.stop
          @blur="commitRename"
          @keydown.enter.stop.prevent="commitRename"
          @keydown.esc.stop.prevent="emit('rename-cancel')"
        />
        <div
          v-else
          class="cursor-pointer truncate text-base font-semibold text-ink-gray-9"
          @click.stop="clickTitle"
          @dblclick.stop="startRename"
        >
          {{ diagram.title }}
        </div>
        <!-- One line: at 13px the pair wraps on a narrow tile, which pushes the
             tiles in that row taller than their neighbours. -->
        <div class="truncate text-sm text-ink-gray-5">
          Created {{ createdLabel }} · Edited {{ editedLabel }}
        </div>
      </div>

      <Dropdown align="end" :options="menuFor(diagram)">
        <Button
          variant="ghost"
          size="sm"
          icon="lucide-ellipsis"
          class="opacity-0 group-hover:opacity-100"
          :label="`More actions for ${diagram.title}`"
          @click.stop
        />
      </Dropdown>
    </div>
  </div>
</template>

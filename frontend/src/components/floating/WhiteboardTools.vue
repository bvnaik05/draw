<script setup>
// The live annotation tools — Draw, Eraser, Laser — as a group on the static
// canvas toolbar (#364). It rendered bare buttons for the bottom palette to
// place, so moving it up was mostly deleting that bar's leading divider. Tools
// ARM AND OPEN on a single click: a tool with options is its own Popover
// trigger, so arming it and revealing its size/color/etc. controls happen
// together, and clicking the same tool again toggles the popover shut — no
// separate "options" disclosure to reach for. Board-wide settings and
// the selected-object editor follow. All chrome is Frappe UI.
import { computed } from 'vue'
import { Popover, Slider, TabButtons } from 'frappe-ui'
import { useEditorUi } from '@/stores/useEditorUi.js'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useWhiteboardUi } from '@/composables/useWhiteboardUi.js'
import { CHALK_COLORS, STICKY_COLORS, PEN_WIDTHS, HIGHLIGHTER_WIDTHS } from '@/diagram/whiteboardColors.js'
import { ERASER_SIZES } from '@/diagram/eraser.js'
import { visibleWhiteboardTools } from './whiteboardTools.js'
import ToolbarButton from '@/components/toolbar/ToolbarButton.vue'
import LineOptions from './LineOptions.vue'
import TableSizePicker from './TableSizePicker.vue'
import { tableInsertOrigin } from './tableSizePicker.js'
import { useImageInsert } from '@/composables/useImageInsert.js'

// `exclude` hides tools the surrounding context already provides — on the unified
// canvas the block group owns text/line/image, so they're excluded here to avoid
// duplicate buttons and tool-name collisions.
const props = defineProps({
  exclude: { type: Array, default: () => [] },
})

const editorUi = useEditorUi()
const store = useDiagramStore()
const ui = useWhiteboardUi()
const imageInsert = useImageInsert(store)

// Tools that carry their own options popover, opened by clicking the tool
// itself. The table tool is absent: clicking it opens the size picker (which
// commits directly), so it never arms or needs a persistent options popover
// (#134). 'pen' is the merged Draw tool (#242, see whiteboardTools.js for why
// its id stays 'pen' rather than 'draw').
const OPTION_TOOLS = ['pen', 'eraser', 'sticky', 'line']

// Eraser modes (#39). 'ink' is the classic whiteboard eraser — it takes only what
// the tip covers; 'object' takes the whole element under it, the only way to erase
// a table, sticky, shape or connector.
// `icon` holds the COMPLETE lucide utility class. Tailwind's JIT only emits
// classes it can read literally, so `lucide-${name}` produces no CSS.
const ERASER_MODES = [
  { key: 'ink', icon: 'lucide-eraser', label: 'Erase' },
  { key: 'object', icon: 'lucide-square-x', label: 'Erase by object' },
]
// TabButtons shape for the same list.
const ERASER_MODE_TABS = ERASER_MODES.map((m) => ({
  value: m.key,
  label: m.label,
  iconLeft: m.icon,
}))

// The Draw tool's pen/highlighter sub-modes (#242). Icon-only (no `label`, just
// `icon` + `tooltip`) so the switch reads as a compact segmented toggle rather
// than a labeled tab bar — TabButtons hides the text and falls back to
// the tooltip as the accessible name whenever an option carries `icon` instead
// of `iconLeft`.
// `icon` holds the COMPLETE lucide utility class. Tailwind's JIT only emits
// classes it can read literally in the source, so building one with
// `lucide-${name}` produces no CSS and the icon renders blank.
const DRAW_KINDS = [
  { key: 'pen', icon: 'lucide-pen-line', label: 'Pen' },
  { key: 'highlighter', icon: 'lucide-highlighter', label: 'Highlighter' },
]
const DRAW_KIND_TABS = DRAW_KINDS.map((kind) => ({
  value: kind.key,
  icon: kind.icon,
  tooltip: kind.label,
}))

const activeTool = computed(() => editorUi.state.tool)
const visibleTools = computed(() => visibleWhiteboardTools(props.exclude))
const showImageInsert = computed(() => !props.exclude.includes('image'))

// Pen and highlighter each keep their own width/opacity preference, so
// switching sub-mode never carries one ink's settings onto the other. These
// pick the pair the Draw popover reads and writes for whichever is active.
const activeDrawWidths = computed(() => (ui.state.drawKind === 'highlighter' ? HIGHLIGHTER_WIDTHS : PEN_WIDTHS))
const activeDrawWidthKey = computed(() => (ui.state.drawKind === 'highlighter' ? 'highlighterWidth' : 'penWidth'))
const activeDrawOpacityKey = computed(() => (ui.state.drawKind === 'highlighter' ? 'highlighterOpacity' : 'penOpacity'))

// Slider works in whole numbers on a [min,max] array model; the opacity state is
// a 0-1 float, so this is the seam between the two.
const drawOpacityPercent = computed({
  get: () => [Math.round(ui.state[activeDrawOpacityKey.value] * 100)],
  set: (value) => {
    const current = Math.round(ui.state[activeDrawOpacityKey.value] * 100)
    ui.state[activeDrawOpacityKey.value] = (value?.[0] ?? current) / 100
  },
})

// The biggest tip is wider than the swatch row, so the preview dot is capped —
// the canvas cursor is what shows the true tip size. Shared by the eraser and
// the Draw tool's size swatches.
function dotStyle(size) {
  const dot = Math.min(size, 18)
  return { width: `${dot}px`, height: `${dot}px` }
}

// New-line defaults live on ui.state; LineOptions emits a partial patch and this
// copies each present field onto the right default.
function applyLineDefault(patch) {
  const fields = { start: 'lineStart', end: 'lineEnd', color: 'penColor', width: 'penWidth' }
  for (const [key, target] of Object.entries(fields)) {
    if (patch[key] !== undefined) ui.state[target] = patch[key]
  }
}

// Commit a table of the picked size: drop it centred in view, select it, and
// remember the size so the keyboard-armed quick-place uses the same one (#134).
function insertTable({ rows, cols }, close) {
  const origin = tableInsertOrigin(editorUi.viewport.visibleRect(), rows, cols)
  const id = store.addTable(origin.x, origin.y, { rows, cols, color: ui.state.penColor })
  if (id) {
    editorUi.setTool('select')
    ui.selectTable(id)
    ui.state.tableRows = rows
    ui.state.tableCols = cols
  }
  close?.()
}
</script>

<template>
  <!-- Tools: a single click arms; the next canvas action draws. The table tool is
       the exception — clicking it opens the size picker, which inserts on pick.
       An OPTION_TOOLS button is itself a Popover trigger, so arming and opening
       its options happen on the same click, and a repeat click toggles the
       popover shut. -->
  <template v-for="t in visibleTools" :key="t.tool">
    <Popover v-if="t.tool === 'table'">
      <template #trigger>
        <ToolbarButton
          allows-blur
          :data-testid="'wtool-' + t.tool"
          :active="activeTool === t.tool"
          :icon="t.icon"
          :label="t.label"
        />
      </template>
      <template #default="{ toggle }">
        <TableSizePicker @pick="insertTable($event, toggle)" />
      </template>
    </Popover>

    <Popover v-else-if="OPTION_TOOLS.includes(t.tool)">
      <template #trigger>
        <ToolbarButton
          allows-blur
          :data-testid="'wtool-' + t.tool"
          :active="activeTool === t.tool"
          :icon="t.icon"
          :label="t.label"
          @click="editorUi.setTool(t.tool)"
        />
      </template>
      <template #default>
        <!-- Draw (#242): pen/highlighter sub-mode picker, shared color,
             and a size + opacity pair that belongs to whichever ink is active. -->
        <div v-if="t.tool === 'pen'" class="w-48 p-2">
          <TabButtons v-model="ui.state.drawKind" class="mb-2" size="sm" :options="DRAW_KIND_TABS" />

          <div class="mb-1 text-sm font-semibold text-ink-gray-5">Color</div>
          <div class="mb-2 grid grid-cols-8 gap-1.5">
            <!-- frappe-ui-exempt: swatch paints a literal color Button cannot render --><button v-for="c in CHALK_COLORS" :key="c" class="h-5 w-5 rounded-full border" :class="ui.state.penColor === c ? 'border-[1.5px] border-outline-gray-9' : 'border-outline-gray-2'" :style="{ background: c }" @click="ui.state.penColor = c" />
          </div>

          <div class="mb-1 text-sm font-semibold text-ink-gray-5">Size</div>
          <div class="mb-2 flex gap-2">
            <!-- frappe-ui-exempt: swatch renders a literal size-preview dot --><button v-for="w in activeDrawWidths" :key="w" :aria-label="`Size ${w}`" :aria-pressed="ui.state[activeDrawWidthKey] === w" class="flex h-7 flex-1 items-center justify-center rounded-md" :class="ui.state[activeDrawWidthKey] === w ? 'bg-surface-gray-3' : 'bg-surface-gray-1 hover:bg-surface-gray-2'" @click="ui.state[activeDrawWidthKey] = w">
              <span class="rounded-full bg-surface-gray-10" :style="dotStyle(w)" />
            </button>
          </div>

          <div class="mb-1 text-sm font-semibold text-ink-gray-5">Opacity</div>
          <Slider v-model="drawOpacityPercent" :min="10" :max="100" :step="5" size="sm" />
        </div>

        <!-- Eraser: mode + tip size (#39). The canvas cursor shows the real tip. -->
        <div v-else-if="t.tool === 'eraser'" class="w-48 p-2">
          <div class="mb-1 text-sm font-semibold text-ink-gray-5">Mode</div>
          <TabButtons v-model="ui.state.eraserMode" class="mb-2" size="sm" vertical :options="ERASER_MODE_TABS" />
          <div class="mb-1 text-sm font-semibold text-ink-gray-5">Size</div>
          <div class="flex gap-2">
            <!-- frappe-ui-exempt: swatch renders a literal size-preview dot --><button v-for="size in ERASER_SIZES" :key="size" :aria-label="`Eraser size ${size}`" :aria-pressed="ui.state.eraserSize === size" class="flex h-7 flex-1 items-center justify-center rounded-md" :class="ui.state.eraserSize === size ? 'bg-surface-gray-3' : 'bg-surface-gray-1 hover:bg-surface-gray-2'" @click="ui.state.eraserSize = size">
              <span class="rounded-full bg-surface-gray-10" :style="dotStyle(size)" />
            </button>
          </div>
        </div>

        <!-- Sticky: color. -->
        <div v-else-if="t.tool === 'sticky'" class="w-48 p-2">
          <div class="mb-1 text-sm font-semibold text-ink-gray-5">Color</div>
          <div class="grid grid-cols-9 gap-1.5">
            <!-- frappe-ui-exempt: swatch paints a literal color Button cannot render --><button v-for="c in STICKY_COLORS" :key="c" :aria-label="`Sticky colour ${c}`" :aria-pressed="ui.state.stickyColor === c" class="h-5 w-5 rounded-sm border" :class="ui.state.stickyColor === c ? 'border-[1.5px] border-outline-gray-9' : 'border-outline-gray-2'" :style="{ background: c }" @click="ui.state.stickyColor = c" />
          </div>
        </div>

        <!-- Line: endpoints + color + width. -->
        <LineOptions
          v-else-if="t.tool === 'line'"
          :start="ui.state.lineStart"
          :end="ui.state.lineEnd"
          :color="ui.state.penColor"
          :width="ui.state.penWidth"
          @change="applyLineDefault"
        />
      </template>
    </Popover>

    <ToolbarButton
      v-else
      allows-blur
      :data-testid="'wtool-' + t.tool"
      :active="activeTool === t.tool"
      :icon="t.icon"
      :label="t.label"
      @click="editorUi.setTool(t.tool)"
    />
  </template>

  <!-- Insert image (action, not a tool). Hidden when the surrounding palette owns it. -->
  <ToolbarButton
    v-if="showImageInsert"
    allows-blur
    icon="lucide-image"
    label="Insert image"
    @click="imageInsert.pick(() => editorUi.viewport.centerPoint())"
  />
</template>

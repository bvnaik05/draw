<script setup>
// Grid guides — the one canvas-wide control left on the bar once theme presets
// were dropped. It sits at the right end of the fixed prefix and is always
// present, so the bar still says something useful when nothing is selected.
//
// Guides moved up from the bottom-left viewport controls, where they sat beside
// zoom for want of a better home.
import { computed } from 'vue'
import { Popover, TabButtons } from 'frappe-ui'
import { useEditorUi } from '@/stores/useEditorUi.js'
import { useModeStrategy } from '@/stores/useModeStrategy.js'
import ToolbarButton from '../ToolbarButton.vue'

const editorUi = useEditorUi()
const modeStrategy = useModeStrategy()

// A dotted grid is not wanted on a whiteboard (Q4), so the whole control hides
// there rather than being offered and quietly ignored.
const showGuides = computed(() => modeStrategy?.value?.type !== 'whiteboard')

const GUIDE_OPTIONS = [
  { label: 'None', value: 'none' },
  { label: 'Rare', value: 'sparse' },
  { label: 'Dense', value: 'dense' },
]
const guides = computed(() => (editorUi.state.gridVisible ? editorUi.state.gridDensity : 'none'))

function setGuides(value) {
  editorUi.state.gridVisible = value !== 'none'
  if (value !== 'none') editorUi.setGridDensity(value)
}
</script>

<template>
  <Popover v-if="showGuides" align="end">
    <template #trigger>
      <ToolbarButton label="Guides" icon-left="lucide-grid-2x2" />
    </template>
    <template #default>
      <div class="w-[180px] p-2">
        <!-- frappe-ui-exempt: text-2xs popover sub-header, the established convention across every toolbar group (ZoomGroup, MindmapStyleGroup, ...) --><div class="px-1 pb-1.5 text-2xs font-semibold text-ink-gray-4">Guides</div>
        <TabButtons class="w-full" size="sm" :model-value="guides" :options="GUIDE_OPTIONS" @update:model-value="setGuides" />
      </div>
    </template>
  </Popover>
</template>

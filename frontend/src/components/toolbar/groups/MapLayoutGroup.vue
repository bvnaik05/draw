<script setup>
// Whole-map layout actions (#362): flow direction for a flowchart, and the mind
// map's tidy / collapse / expand.
//
// A flowchart's "Tidy up" and "Number steps" are gone (#549 items 5/7). Both asked
// the user to re-arrange a chart they had already arranged by hand; the flow
// direction is the one whole-chart action that changes what the chart MEANS, so it
// is the one that stays.
//
// These had two homes. A legacy single-type document got them from the bottom
// palette; a free-floating map got them from a bar pinned to the top-centre of
// the canvas, which is exactly where the static toolbar now sits. Both routes
// end here, so "re-flow this chart" is in one place whichever kind of document
// holds it.
//
// The two routes still differ underneath: a legacy document edits its sub-model
// through updateFlowchartModel, while a free-floating map re-flows the selected
// node's connected component through applyFlowchartShapeLayout, which keeps a
// second chart on the same canvas out of it (#167 / #48).
import { computed } from 'vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useEditorUi } from '@/stores/useEditorUi.js'
import { useSelectionContext } from '@/composables/useSelectionContext.js'
import { isMindmapShape, isFlowchartShape } from '@/diagram/freeFloating.js'
import { flowchartDirectionOfShapes } from '@/diagram/freeFloatingOps.js'
import { flowchartComponentIds } from '@/diagram/freeFloatingGraph.js'
import { toggleDirection } from '@/diagram/flowchartLayout.js'
import { collapseAll } from '@/diagram/mindmapOperations.js'
import ToolbarButton from '../ToolbarButton.vue'

const store = useDiagramStore()
const editorUi = useEditorUi()
const { chromeType } = useSelectionContext()

const selectedShapes = computed(() =>
  (store.state.selection || []).map((id) => store.shapeById(id)).filter(Boolean),
)
const flowchartRootId = computed(() => selectedShapes.value.find(isFlowchartShape)?.id || null)
const mindmapRootId = computed(() => selectedShapes.value.find(isMindmapShape)?.id || null)

const isLegacyFlowchart = computed(() => chromeType.value === 'flowchart')
const isLegacyMindmap = computed(() => chromeType.value === 'mindmap')
const showsFlowchart = computed(() => isLegacyFlowchart.value || flowchartRootId.value !== null)
const showsMindmap = computed(() => isLegacyMindmap.value || mindmapRootId.value !== null)

// Direction is a whole-graph property. For a free-floating chart it is read off
// the selected chart's own shapes, so a second chart pointing the other way does
// not skew the readout.
const memberIds = computed(() =>
  flowchartRootId.value
    ? flowchartComponentIds(store.state.shapes, store.state.connectors, flowchartRootId.value)
    : null,
)
const direction = computed(() => {
  if (!memberIds.value) return store.state.flowchart?.direction || 'TB'
  return flowchartDirectionOfShapes(store.state.shapes.filter((s) => memberIds.value.has(s.id)))
})

function applyFlowchart(label, mutate) {
  if (flowchartRootId.value) store.applyFlowchartShapeLayout(label, mutate, flowchartRootId.value)
  else store.updateFlowchartModel(label, mutate)
}

function flipFlowchart() {
  editorUi.pulseLayoutAnimation()
  applyFlowchart('Flow direction', (m) => toggleDirection(m))
}

function tidyMindmap() {
  editorUi.pulseLayoutAnimation()
  store.applyMindmapShapeLayout('Tidy up', mindmapRootId.value)
}
</script>

<template>
  <template v-if="showsFlowchart">
    <ToolbarButton
      label="Flow direction"
      :tooltip="direction === 'TB' ? 'Flow left → right' : 'Flow top → bottom'"
      :icon="direction === 'TB' ? 'lucide-arrow-right' : 'lucide-arrow-down'"
      @click="flipFlowchart"
    />
  </template>

  <template v-if="showsMindmap">
    <!-- A legacy mind map lays itself out live, so it needs collapse/expand
         rather than a tidy. A free-floating map is a set of ordinary draggable
         shapes with no live reflow, so it needs the tidy instead. -->
    <template v-if="isLegacyMindmap">
      <ToolbarButton label="Collapse all" icon="lucide-chevrons-down-up" @click="collapseAll(store, true)" />
      <ToolbarButton label="Expand all" icon="lucide-chevrons-up-down" @click="collapseAll(store, false)" />
    </template>
    <ToolbarButton
      v-else
      label="Tidy up"
      tooltip="Tidy up — re-flow the whole mind map"
      icon="lucide-grid-2x2"
      @click="tidyMindmap"
    />
  </template>
</template>

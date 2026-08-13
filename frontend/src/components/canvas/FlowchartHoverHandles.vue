<script setup>
// On-canvas "+" add-handle for MIGRATED flowchart nodes (issue #77, the flowchart
// counterpart of the mind-map "+" handles from #118). After the free-floating
// refactor (#122) a flowchart node is an ordinary shape with role 'flowchart-node';
// keyboard add already works (D/T/I drop a typed step below), but mouse users had no
// affordance. This overlay gives them the same on-canvas "+" FlowchartLayer.vue
// draws for legacy charts: a single "+" reveals below a node while it is hovered or
// the sole selection (select tool only), and clicking it opens the node-type picker
// so the step added below is the type the user actually wants (#410).
//
// It mirrors MindmapHoverHandles.vue exactly — the same HoverArrows.vue structure: a
// <g> inside the viewport transform that attaches a pointermove listener to the SVG
// surface, converts the pointer to logical canvas units via the group's CTM, and
// renders SVG affordances in those units — so the handle's hit-area lines up with
// the drawn "+". All placement/visibility logic lives in the pure, unit-tested
// flowchartHandles.js; this file only renders + wires the click to the existing
// store op (it never reimplements the add). It is a no-op when there are no migrated
// flowchart shapes, so legacy single-type flowcharts (which still render via
// FlowchartLayer from the non-null state.flowchart) are untouched.
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useEditorUi } from '@/stores/useEditorUi.js'
import { openFlowchartPicker, closeFlowchartPicker } from '@/stores/flowchartUi.js'
import {
  ADD_R,
  ADD_HIT_R,
  GLYPH,
  buildContext,
  handlesForNode,
  shouldShowHandles,
  nodeAtPoint,
  hoverRegionOf,
  pointInBox,
} from '@/diagram/flowchartHandles.js'

const store = useDiagramStore()
const editorUi = useEditorUi()

const layer = ref(null)
let svg = null

// The migrated flowchart index (boxes by id), rebuilt whenever shapes change.
const ctx = computed(() => buildContext(store.state.shapes, store.state.connectors))
const hasNodes = computed(() => Object.keys(ctx.value.boxes).length > 0)
const selectTool = computed(() => editorUi.state.tool === 'select')

// The flowchart node the cursor is over (or reaching toward). Only the select tool
// drives it — the "+" is a select-mode affordance, like FlowchartLayer's.
const hoveredId = ref(null)

// Convert a pointer event into logical canvas units via the group CTM (HoverArrows).
function toLogical(event) {
  const ctm = layer.value?.getScreenCTM()
  if (!ctm) return { x: 0, y: 0 }
  const point = svg.createSVGPoint()
  point.x = event.clientX
  point.y = event.clientY
  const local = point.matrixTransform(ctm.inverse())
  return { x: local.x, y: local.y }
}

// Hover tracking: the node the pointer is directly over wins; failing that, the
// current node stays hovered while the pointer is within its padded region, so the
// handle doesn't vanish as the cursor slides off the node's bottom edge toward the "+".
function onPointerMove(event) {
  if (!hasNodes.value || !selectTool.value) {
    hoveredId.value = null
    return
  }
  const point = toLogical(event)
  const hit = nodeAtPoint(point, store.state.shapes)
  if (hit) {
    hoveredId.value = hit
    return
  }
  if (hoveredId.value) {
    const region = hoverRegionOf(hoveredId.value, ctx.value)
    if (!pointInBox(point, region)) hoveredId.value = null
  }
}

function onPointerLeave() {
  hoveredId.value = null
}

onMounted(() => {
  svg = layer.value?.ownerSVGElement
  if (!svg) return
  svg.addEventListener('pointermove', onPointerMove)
  svg.addEventListener('pointerleave', onPointerLeave)
})

onBeforeUnmount(() => {
  // Leaving the canvas with a menu open would strand it, since the component that
  // renders it lives outside this overlay's lifetime.
  closeFlowchartPicker()
  if (!svg) return
  svg.removeEventListener('pointermove', onPointerMove)
  svg.removeEventListener('pointerleave', onPointerLeave)
})

// The nodes that should show a handle right now: the hovered one AND the sole
// selection (both, like FlowchartLayer.isActive), deduped via the pure predicate.
const targetIds = computed(() => {
  const selection = store.state.selection
  const sole = selection.length === 1 ? selection[0] : null
  return Object.keys(ctx.value.boxes).filter((id) =>
    shouldShowHandles({
      hovered: hoveredId.value === id,
      soleSelected: sole === id,
      selectTool: selectTool.value,
    }),
  )
})

const handles = computed(() => targetIds.value.flatMap((id) => handlesForNode(id, ctx.value)))

// One neutral colour for every "+", not the source node's border colour (#441 item
// 12, mirroring #427 item 2). A new node is always created with the default look, so
// a coloured parent tinting its "+" promised a colour the node would not have.
const HANDLE_COLOR = '#A1A1A1'
const HANDLE_INK = '#6B7280'

// The "+" glyph centred in a handle circle.
function glyphPath(handle) {
  return `M${handle.cx - GLYPH} ${handle.cy} H${handle.cx + GLYPH} M${handle.cx} ${handle.cy - GLYPH} V${handle.cy + GLYPH}`
}

// Clicking a "+" opens the node-type menu (the full standard set, spec B3/B4) at
// that handle instead of silently dropping a fixed Process step — a plain click no
// longer forces every added node down one type (#410).
//
// The menu itself is rendered by FlowchartNodeTypeMenu, OUTSIDE the canvas <svg>;
// this overlay only records which node it belongs to and where that node is on
// screen (#441 item 10). It cannot render the menu here: Vue creates elements in
// the namespace of the surrounding template, so a <div> declared inside this SVG
// is built as an SVG-namespaced div with no CSS box — `position: fixed` never
// applies and the menu collapses to zero width. A <Teleport> relocates such a node
// but cannot change the namespace it was created in.
function openPicker(handle) {
  openFlowchartPicker(handle.nodeId, screenBoxOf(handle.nodeId))
}

// The source node's box in SCREEN pixels, straight off its rendered group — so the
// anchor already accounts for pan and zoom without re-deriving the transform.
function screenBoxOf(nodeId) {
  const node = document.querySelector(`[data-shape-id="${CSS.escape(nodeId)}"]`)
  if (!node) return null
  const rect = node.getBoundingClientRect()
  return { x: rect.x, y: rect.y, w: rect.width, h: rect.height }
}

</script>

<template>
  <g ref="layer" data-flowchart-hover-handles>
    <!-- One "+" per handle. pointerdown is stopped so pressing a "+" never starts a
         marquee or clears the selection; the click opens the type picker. The hit
         circle is a plain transparent disc wider than the mark, so the target is
         generous while the mark stays small; the stub and glyph are
         non-interactive. -->
    <g
      v-for="handle in handles"
      :key="handle.key"
      style="cursor: pointer"
      @click.stop="openPicker(handle)"
      @pointerdown.stop
    >
      <title>Add step</title>
      <line
        :x1="handle.stubX"
        :y1="handle.stubY"
        :x2="handle.cx"
        :y2="handle.cy"
        :stroke="HANDLE_COLOR"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-dasharray="2 3"
        style="pointer-events: none"
      />
      <circle :cx="handle.cx" :cy="handle.cy" :r="ADD_HIT_R" fill="transparent" />
      <!-- A white disc under the mark so a connector passing behind the handle
           reads as passing behind it, instead of through the "+". -->
      <circle
        :cx="handle.cx"
        :cy="handle.cy"
        :r="ADD_R"
        fill="#FFFFFF"
        :stroke="HANDLE_COLOR"
        stroke-width="1.25"
        style="pointer-events: none"
      />
      <path
        :d="glyphPath(handle)"
        :stroke="HANDLE_INK"
        stroke-width="1.5"
        stroke-linecap="round"
        fill="none"
        style="pointer-events: none"
      />
    </g>

  </g>
</template>

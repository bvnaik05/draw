<script setup>
// The "add node" menu for a flowchart "+" handle, rendered in the canvas's HTML
// layer rather than inside its <svg> (#441 items 10/11).
//
// Two things forced it out of the SVG. First, paint order: inside the canvas the
// menu obeyed document order, and on a unified document the shapes are painted by
// WhiteboardLayer, which mounts AFTER the overlay that draws the "+". So the menu
// opened behind the very nodes it was opened from, and no z-index could help —
// SVG has no z-index, only document order.
//
// Second, and less obviously, namespace. Vue creates elements in the namespace of
// the surrounding template, so a <div> declared inside the SVG is built as an
// SVG-namespaced div: it has no CSS box, `position: fixed` never applies, and the
// menu collapses to zero width. A <Teleport> does not fix that — it relocates the
// node but cannot change the namespace it was created in. The menu has to be
// DECLARED out here, which is why its open state lives in flowchartUi rather than
// in the overlay that triggers it.
//
// Position is a screen point captured when the menu opened. Any pointerdown on the
// canvas closes it (and panning starts with one), so the only things that can move
// the canvas underneath it are the wheel and a resize — both close it too.
import { computed, onMounted, onBeforeUnmount } from 'vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useTextEditing } from '@/composables/useTextEditing.js'
import { flowchartUi, closeFlowchartPicker } from '@/stores/flowchartUi.js'
import { placePicker } from '@/diagram/flowchartLayout.js'
import FlowchartNodeTypePicker from './FlowchartNodeTypePicker.vue'

const store = useDiagramStore()
const editing = useTextEditing()

// Kept in step with the picker's own `w-[372px]`; the height is its eleven rows in
// two columns plus the header, measured at 211px in the browser.
const MENU_W = 372
const MENU_H = 216
const MARGIN = 8

const position = computed(() => {
  const box = flowchartUi.picker?.box
  if (!box) return { x: 0, y: 0 }
  const bounds = {
    x: MARGIN,
    y: MARGIN,
    w: window.innerWidth - MARGIN * 2,
    h: window.innerHeight - MARGIN * 2,
  }
  return placePicker({ box, menu: { w: MENU_W, h: MENU_H }, bounds, direction: 'TB' })
})

// Create the chosen type through the existing representation-aware store op, which
// builds the tagged shape + flow-edge connector and commits as one undoable unit (a
// decision parent is routed through its next free branch inside the op), then drop
// the text cursor straight in — so the very next keystroke names the node instead
// of being read as a flowchart keyboard shortcut (#410).
function chooseType(nodeType) {
  const parentId = flowchartUi.picker?.nodeId
  const port = flowchartUi.picker?.port || null
  // The side the pressed "+" grew from, so the child lands where it pointed.
  const side = flowchartUi.picker?.side || null
  closeFlowchartPicker()
  if (!parentId) return
  const id = store.addFlowchartChildShape(parentId, nodeType, port, side)
  if (!id) return
  // beginTextEdit selects the node itself, so there is no separate store.select here.
  editing.beginTextEdit(id, { selectAll: true })
}

// A press anywhere outside the open menu closes it. Capture phase, so it runs
// before the menu's own pointerdown.stop — which is exactly why the menu's own DOM
// is excluded here: stopPropagation on the target cannot stop a listener that
// already ran on the way down to it, so without this guard choosing a type would
// close the menu (and clear the picker) before the click handler that reads it
// ever fired.
function onDocumentPointerDown(event) {
  if (event.target?.closest?.('[data-fc-picker]')) return
  closeFlowchartPicker()
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown, true)
  window.addEventListener('wheel', closeFlowchartPicker, true)
  window.addEventListener('resize', closeFlowchartPicker)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown, true)
  window.removeEventListener('wheel', closeFlowchartPicker, true)
  window.removeEventListener('resize', closeFlowchartPicker)
})
</script>

<template>
  <div
    v-if="flowchartUi.picker"
    class="fixed z-50"
    :style="{ left: `${position.x}px`, top: `${position.y}px` }"
  >
    <FlowchartNodeTypePicker @choose="chooseType" @close="closeFlowchartPicker" />
  </div>
</template>

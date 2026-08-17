<script setup>
// Link, duplicate and delete for the current block selection (#361), extended
// to a selected authored connector (#542) — a line drawn onto empty canvas
// gets the same Link/Duplicate/Delete a shape does.
//
// Delete is the one control here that is not gated on `editing` by its caller:
// it hides while a label is being edited, because at that moment the target is
// the text, not the shape.
import { computed } from 'vue'
import { Popover } from 'frappe-ui'
import { useBlockSelection } from '@/composables/useBlockSelection.js'
import LinkSection from '@/components/palette-right/LinkSection.vue'
import ToolbarButton from '../ToolbarButton.vue'

const { store, selection, hasShapes, hasConnectors } = useBlockSelection()
const hasTargets = computed(() => hasShapes.value || hasConnectors.value)

function duplicate() {
  const ids = store.duplicate(selection.value)
  if (ids?.length) store.select(ids)
}

function remove() {
  store.removeSelectionOrIds(selection.value)
}
</script>

<template>
  <Popover v-if="hasTargets">
    <template #trigger><ToolbarButton label="Link" icon="lucide-link" /></template>
    <template #default>
      <div class="max-h-[70vh] w-[300px] overflow-y-auto"><LinkSection /></div>
    </template>
  </Popover>

  <ToolbarButton v-if="hasTargets" label="Duplicate" icon="lucide-copy" @click="duplicate" />
  <ToolbarButton label="Delete" icon="lucide-trash-2" theme="red" @click="remove" />
</template>

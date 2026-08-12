<script setup>
// Home's master "Select all" box (#404). Two places show it — the list-view column
// header and the tile-view toolbar — and they were two copies of the same hand-rolled
// native checkbox, which rendered in the browser's blue accent next to rows of
// Espresso-black frappe-ui checkboxes. One component, one Checkbox, both places.
//
// Gmail behaviour: with anything selected the box clears the selection; with nothing
// selected it selects everything on screen. The label says which.
import { computed } from 'vue'
import { Checkbox, Tooltip } from 'frappe-ui'

const props = defineProps({
  allSelected: { type: Boolean, default: false },
  // Some but not all — the box shows the half-selected dash.
  someSelected: { type: Boolean, default: false },
})
// `change` carries the wanted state, not "flip it" (#405): frappe-ui's Checkbox
// emits update:modelValue twice per click, so a toggling listener cancels itself out.
const emit = defineEmits(['change'])

const anySelected = computed(() => props.allSelected || props.someSelected)
const label = computed(() => (anySelected.value ? 'Clear selection' : 'Select all'))

// Read from the props rather than from the checkbox's own value, so a half-selected
// box CLEARS (Gmail) instead of completing the selection — and so both of the
// duplicate emissions compute the same answer.
function requestChange() {
  emit('change', !anySelected.value)
}
</script>

<template>
  <Tooltip :text="label">
    <!-- Checkbox has no `indeterminate` prop; the attribute falls through to the
         native control underneath, which is the element that owns the dash. -->
    <Checkbox
      size="sm"
      :model-value="allSelected"
      :indeterminate="someSelected"
      :aria-label="label"
      @update:model-value="requestChange"
    />
  </Tooltip>
</template>

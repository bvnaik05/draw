<script setup>
// Renders a set of diagrams as a tile grid and forwards every per-tile action
// up. List view is DiagramListView's job (#541). The `append` slot lets a
// caller add a trailing item (e.g. the "New diagram" affordance) inside the
// same grid.
import DiagramTile from './DiagramTile.vue'

defineProps({
  diagrams: { type: Array, default: () => [] },
  selected: { type: Object, default: () => new Set() },
})
const emit = defineEmits(['open', 'select', 'copy-link', 'rename', 'duplicate', 'delete', 'show-info'])

const TILE_COLS = 'grid-template-columns: repeat(auto-fill, minmax(224px, 1fr))'
</script>

<template>
  <div class="grid gap-[18px]" :style="TILE_COLS">
    <DiagramTile
      v-for="diagram in diagrams"
      :key="diagram.name"
      :diagram="diagram"
      :selected="selected.has(diagram.name)"
      :selection-active="selected.size > 0"
      @open="emit('open', $event)"
      @select="(name, wanted) => emit('select', name, wanted)"
      @copy-link="emit('copy-link', $event)"
      @rename="emit('rename', $event)"
      @duplicate="emit('duplicate', $event)"
      @delete="emit('delete', $event)"
      @show-info="emit('show-info', $event)"
    />
    <slot name="append" />
  </div>
</template>

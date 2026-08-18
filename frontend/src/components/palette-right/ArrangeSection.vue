<script setup>
// Arrange: z-order + group/ungroup (spec §4.3). Wired directly to the store's
// ordering and grouping methods, operating on the selected shapes AND authored
// connectors (#542) — a line can move above or below a shape now too. Group/
// Ungroup stay shapes-only: a line has no group membership of its own to fold
// into one. Group needs 2+ shapes; Ungroup appears only when a grouped shape is
// selected (intersection rule, spec §4.3).
import { computed } from 'vue'
import PaletteSection from './PaletteSection.vue'
import ActionTile from './ActionTile.vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useBlockSelection } from '@/composables/useBlockSelection.js'

const store = useDiagramStore()
const { shapes, authoredConnectors } = useBlockSelection()
const shapeIds = computed(() => shapes.value.map((shape) => shape.id))
// The z-order ops act on shapes AND lines together, so Arrange still moves a
// mixed selection as one call rather than two separate reorders.
const orderIds = computed(() => [...shapeIds.value, ...authoredConnectors.value.map((c) => c.id)])

const hasTargets = computed(() => orderIds.value.length > 0)
const canGroup = computed(() => shapes.value.length > 1)
const canUngroup = computed(() => shapes.value.some((shape) => shape.groupId))
</script>

<template>
  <PaletteSection v-if="hasTargets" label="Arrange">
    <!-- Two per row (#267), which is also what the now-visible 14px tile labels
         need — "Backward" / "To front" would truncate in a 3-column tile. -->
    <div class="grid grid-cols-4 gap-1.5">
      <ActionTile icon="lucide-chevrons-up" label="To front" @click="store.bringToFront(orderIds)" />
      <ActionTile icon="lucide-chevron-up" label="Forward" @click="store.bringForward(orderIds)" />
      <ActionTile icon="lucide-chevron-down" label="Backward" @click="store.sendBackward(orderIds)" />
      <ActionTile icon="lucide-chevrons-down" label="To back" @click="store.sendToBack(orderIds)" />
      <ActionTile v-if="canGroup" icon="lucide-group" label="Group" @click="store.group(shapeIds)" />
      <ActionTile v-if="canUngroup" icon="lucide-ungroup" label="Ungroup" @click="store.ungroup(shapeIds)" />
    </div>
  </PaletteSection>
</template>

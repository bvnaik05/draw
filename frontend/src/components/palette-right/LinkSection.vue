<script setup>
// Attach a hyperlink to the selected object(s) (spec 6.5 — generalised from the
// sticky-note link, and to a selected line/arrow by #542). Stored as
// shape.link / connector.link; ShapeView and ConnectorView each render a small
// badge that opens it. A bare "example.com" is normalised to https:// on save.
import { computed } from 'vue'
import { Button, TextInput } from 'frappe-ui'
import PaletteSection from './PaletteSection.vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useBlockSelection } from '@/composables/useBlockSelection.js'

const store = useDiagramStore()
const { shapes, authoredConnectors } = useBlockSelection()
const shapeIds = computed(() => shapes.value.map((s) => s.id))
const connectorIds = computed(() => authoredConnectors.value.map((c) => c.id))
// The reference object drives what the field displays: whichever kind was
// selected first, so a mixed selection still shows SOME current value rather
// than nothing.
const reference = computed(() => shapes.value[0] || authoredConnectors.value[0])
const link = computed(() => reference.value?.link || '')

function setLink(value) {
  const url = normalize(value)
  if (shapeIds.value.length) store.updateShapes(shapeIds.value, { link: url })
  if (connectorIds.value.length) store.updateConnectors(connectorIds.value, { link: url })
}

function clearLink() {
  setLink('')
}

// Add a scheme when the user types a bare host; leave mailto:/relative as-is.
function normalize(value) {
  const trimmed = (value || '').trim()
  if (!trimmed) return ''
  if (/^(https?:|mailto:|\/)/i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}
</script>

<template>
  <PaletteSection label="Link">
    <TextInput
      class="w-full"
      variant="outline"
      :model-value="link"
      placeholder="Add a link…"
      label="Link URL"
      @update:model-value="setLink"
    >
      <template #prefix>
        <span class="lucide-link size-4 text-ink-gray-5" aria-hidden="true" />
      </template>
      <template v-if="link" #suffix>
        <Button
          variant="ghost"
          theme="gray"
          size="sm"
          icon="lucide-x"
          tooltip="Remove link"
          label="Remove link"
          @click="clearLink"
        />
      </template>
    </TextInput>
  </PaletteSection>
</template>

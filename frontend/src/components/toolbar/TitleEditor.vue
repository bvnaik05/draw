<script setup>
// Click-to-edit diagram title (spec §3, §4.4, README §4a). Figma/Docs-style:
// shows the title with a faint pencil; clicking turns it into an inline input.
// Enter / blur commits, Escape cancels. Empty titles fall back to the default.
// Emits update:title; EditorShell renames through the diagram resource.
import { ref, nextTick, watch } from 'vue'
import { Button, TextInput } from 'frappe-ui'

const props = defineProps({
  title: { type: String, default: 'Untitled diagram' },
})
const emit = defineEmits(['update:title'])

const DEFAULT_TITLE = 'Untitled diagram'
const editing = ref(false)
const draft = ref(props.title)
const input = ref(null)

// A new diagram now opens with its auto-name already saved (e.g. "Diagram 2") and
// is NOT auto-opened for editing (S3): auto-selecting risked clobbering the name
// if the user clicked away without typing. The user clicks the title to rename.

// Keep the draft in sync when the title arrives/changes from outside (e.g. the
// doc loads asynchronously) and we are not mid-edit.
watch(
  () => props.title,
  (next) => {
    if (!editing.value) draft.value = next
  },
)

async function startEditing() {
  draft.value = props.title
  editing.value = true
  await nextTick()
  // The ref holds the TextInput component, so the field is its exposed `el`.
  input.value?.el?.focus()
  input.value?.el?.select()
}

function commit() {
  if (!editing.value) return
  editing.value = false
  const next = draft.value.trim() || DEFAULT_TITLE
  draft.value = next
  if (next !== props.title) emit('update:title', next)
}

function cancel() {
  draft.value = props.title
  editing.value = false
}
</script>

<template>
  <div class="flex min-w-0 items-center gap-1.5">
    <TextInput
      v-if="editing"
      ref="input"
      v-model="draft"
      variant="outline"
      size="sm"
      class="w-56 max-w-full"
      @blur="commit"
      @keyup.enter="commit"
      @keyup.esc="cancel"
    />
    <!-- `shrink` overrides Button's own shrink-0 so a long title ellipsises
         inside the toolbar column instead of pushing the actions cluster. -->
    <Button
      v-else
      variant="ghost"
      theme="gray"
      size="sm"
      class="group min-w-0 shrink"
      @click="startEditing"
    >
      <!-- 14px/600 is the toolbar title style (README §Type); Button's own size
           classes stop at the regular weight. -->
      <span class="text-base-semibold">{{ title }}</span>
      <template #suffix>
        <span class="lucide-pencil h-3.5 w-3.5 flex-none text-ink-gray-4 opacity-0 group-hover:opacity-100" aria-hidden="true" />
      </template>
    </Button>
  </div>
</template>

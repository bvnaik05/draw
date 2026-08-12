<script setup>
// Home page — composes the tile grid (+ empty state) + trash view, and routes to
// the editor on create/open (spec §2). "Create" makes a unified canvas and lands
// straight on the editor — no type picker (canvas unification). No folders
// (#115): diagrams are one flat, pinnable list.
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Alert, Breadcrumbs, Button, Dropdown, toast } from 'frappe-ui'
import { errorMessage } from '@/utils/errorText.js'
import Logomark from '@/components/Logomark.vue'
import SettingsDialog from '@/components/home/SettingsDialog.vue'
import TileGrid from '@/components/home/TileGrid.vue'
import EmptyState from '@/components/home/EmptyState.vue'
import TrashView from '@/components/home/TrashView.vue'
import { diagrams, createDiagram } from '@/data/diagrams.js'
import { logout } from '@/data/session.js'
import { getDriveAvailability, shouldShowInstallDriveBanner } from '@/data/drive.js'

const router = useRouter()
// The whole library is Home; Trash is the one place apart from it (#407).
const view = ref('home')

// Nudge users without Frappe Drive to install it (so their diagrams are tracked
// as files). Hidden until we've confirmed Drive is absent, and after a dismiss.
const driveStatus = ref(null)
const bannerDismissed = ref(false)
const showInstallDriveBanner = computed(
  () => !bannerDismissed.value && shouldShowInstallDriveBanner(driveStatus.value),
)

onMounted(async () => {
  diagrams.fetch()
  driveStatus.value = await getDriveAvailability()
})

const list = computed(() => diagrams.data || [])
const isEmpty = computed(() => list.value.length === 0)

// Trash is the only place left to navigate to, so it is a breadcrumb rather than
// a bar of tabs (#407): Home is the whole library, and the trail only appears
// once you have stepped out of it.
const inTrash = computed(() => view.value === 'trash')
const breadcrumbs = [{ label: 'Home', onClick: () => (view.value = 'home') }, { label: 'Trash' }]

// Real logged-in user, injected into the page boot by www/draw.py.
const fullName = computed(() => window.full_name || 'You')
const showSettings = ref(false)

// Log out, keeping the user here with an error if the session survives — a
// silent no-op would look like the old "403 Not Permitted" logout.
async function signOut() {
  try {
    await logout()
  } catch (error) {
    toast.error('Could not log out', { text: error?.message || '' })
  }
}

// App menu, mirroring the Frappe Drive navbar dropdown: where you can go on top,
// then what you can do to the app. Trash lives here now that the view switcher is
// gone (#407) — it is the one view Home does not already contain.
const appMenu = computed(() => [
  {
    group: 'Views',
    hideLabel: true,
    options: [
      { label: 'Trash', icon: 'lucide-trash-2', onClick: () => (view.value = 'trash') },
    ],
  },
  {
    group: 'App',
    hideLabel: true,
    options: [
      { label: 'Apps', icon: 'lucide-layout-grid', onClick: () => (window.location.href = '/apps') },
      { label: 'Settings', icon: 'lucide-settings', onClick: () => (showSettings.value = true) },
      { label: 'Log out', icon: 'lucide-log-out', onClick: signOut },
    ],
  },
])

// Guard against double-submission: a fast double-click (or a stray double event)
// on "Create" would otherwise fire create() twice and insert two diagrams.
const isCreating = ref(false)
async function create() {
  if (isCreating.value) return
  isCreating.value = true
  try {
    // Every new diagram is a unified canvas now (canvas unification) — no type
    // picker; the user lands straight on the blank canvas and just starts drawing.
    const name = await createDiagram(undefined, null, 'unified', null)
    if (!name) throw new Error('Server returned no diagram name')
    diagrams.reload()
    // `new` selects the title for inline renaming on the fresh canvas.
    router.push({ name: 'Editor', params: { name }, query: { new: '1' } })
  } catch (error) {
    // Say why, in the UI. A refused create (the common case: no permission on
    // Draw Diagram) used to leave the empty state sitting there with the reason
    // only in the console (#174).
    console.error('Create diagram failed:', error)
    toast.error('Could not create the diagram', { text: errorMessage(error) })
  } finally {
    isCreating.value = false
  }
}

function open(name) {
  router.push({ name: 'Editor', params: { name } })
}
</script>

<template>
  <div class="flex h-screen flex-col">
    <!-- Top bar: app identity + menu, and nothing else (#407). Home is the whole
         library, so it needs no navigation of its own; the trail appears only in
         Trash, to lead back. No sidebar — the gallery gets the full width. -->
    <header
      class="flex flex-none items-center gap-4 border-b border-outline-gray-1 bg-surface-base px-9 py-2"
    >
      <Dropdown :options="appMenu">
        <Button variant="ghost" theme="gray" size="md" :label="`Frappe Draw — ${fullName}`">
          <template #prefix><Logomark :size="22" /></template>
          <span class="text-base font-medium text-ink-gray-8">Frappe Draw</span>
          <template #suffix>
            <span class="lucide-chevron-down size-4 text-ink-gray-5" aria-hidden="true" />
          </template>
        </Button>
      </Dropdown>

      <Breadcrumbs v-if="inTrash" :items="breadcrumbs" />
    </header>

    <main class="min-h-0 flex-1 overflow-y-auto px-9 py-7">
      <TrashView v-if="inTrash" />

      <template v-else>
        <div class="mb-6 flex items-center justify-between">
          <!-- frappe-ui-exempt: page title, the H1 of the gallery — the type scale governs body and control text, not the page heading --><div class="text-3xl font-bold text-ink-gray-9">Home</div>
          <Button variant="solid" :loading="isCreating" @click="create">
            <template #prefix><span class="lucide-plus h-4 w-4" aria-hidden="true" /></template>
            Create
          </Button>
        </div>

        <Alert
          v-if="showInstallDriveBanner"
          class="mb-6"
          theme="yellow"
          title="Install Drive to track your files"
          description="Your diagrams save to Draw. Add Frappe Drive to keep them alongside the rest of your files."
          dismissible
          @dismiss="bannerDismissed = true"
        >
          <template #icon>
            <span class="lucide-hard-drive size-5 shrink-0" aria-hidden="true" />
          </template>
        </Alert>

        <EmptyState v-if="isEmpty" @create="create" />
        <TileGrid v-else @create="create" @open="open" />
      </template>
    </main>

    <SettingsDialog v-model:open="showSettings" />
  </div>
</template>

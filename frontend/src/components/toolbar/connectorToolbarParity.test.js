import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// #542: a selected line only ever showed Line + Delete on the toolbar — Arrange,
// Link and Duplicate all stayed gated on hasShapes, so a lone authored connector
// selection never satisfied it. None of these components mount in the node env
// (no @vue/test-utils here), so pin the wiring by source inspection (house
// pattern, cf. canvasToolbar.test.js).
const here = path.dirname(fileURLToPath(import.meta.url))
const read = (rel) => readFileSync(path.join(here, rel), 'utf8')

describe('a selected connector gets the same actions a shape does (#542)', () => {
  it('gates Link and Duplicate on a connector selection too, not shapes alone', () => {
    const group = read('groups/BlockActionsGroup.vue')
    expect(group).toContain("const { store, selection, hasShapes, hasConnectors } = useBlockSelection()")
    expect(group).toContain('const hasTargets = computed(() => hasShapes.value || hasConnectors.value)')
    expect(group).toContain('<Popover v-if="hasTargets">')
    expect(group).toContain('<ToolbarButton v-if="hasTargets" label="Duplicate"')
  })

  it('folds a selected authored connector into the same z-order call as shapes', () => {
    const section = read('../palette-right/ArrangeSection.vue')
    expect(section).toContain(
      'const orderIds = computed(() => [...shapeIds.value, ...authoredConnectors.value.map((c) => c.id)])',
    )
    expect(section).toContain('store.bringToFront(orderIds)')
    expect(section).toContain('store.sendToBack(orderIds)')
    // Group/Ungroup stay shapes-only — a line has no group membership to fold into.
    expect(section).toContain('store.group(shapeIds)')
    expect(section).toContain('store.ungroup(shapeIds)')
  })

  it('shows ArrangeGroup for a connector-only selection, not only when a shape is selected', () => {
    const toolbar = read('CanvasToolbar.vue')
    expect(toolbar).toContain(
      'const showsConnectorArrange = computed(\n  () => showsBlockGroups.value && !shapeSelected.value && hasConnectors.value && !editing.value,\n)',
    )
    expect(toolbar).toContain('<template v-if="showsConnectorArrange">')
  })

  it('lets a shape and a connector share one Link, keyed to whichever field is selected', () => {
    const link = read('../palette-right/LinkSection.vue')
    expect(link).toContain("import { useBlockSelection } from '@/composables/useBlockSelection.js'")
    expect(link).toContain('if (shapeIds.value.length) store.updateShapes(shapeIds.value, { link: url })')
    expect(link).toContain('if (connectorIds.value.length) store.updateConnectors(connectorIds.value, { link: url })')
  })
})

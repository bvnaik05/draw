import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// #542: a line drawn onto empty canvas could be selected, but not dragged — only
// its endpoint handles moved, and only once already selected. ConnectorView can't
// mount in the node env, so pin the wiring by source inspection (house pattern,
// cf. structuralConnector.test.js).
const src = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), './ConnectorView.vue'),
  'utf8',
)

describe('a connector can be selected and dragged by its own body (#542)', () => {
  it('gates the drag on the same geometry the pure module uses', () => {
    expect(src).toContain(
      "import { connectorBodyMovable, translateConnectorBody } from '@/diagram/connectorMove.js'",
    )
    expect(src).toContain('if (!connectorBodyMovable(props.connector)) return')
  })

  it('selects on press before deciding whether there is anything to drag', () => {
    expect(src).toContain('store.select(props.connector.id)')
    expect(src).toMatch(
      /function startBodyDrag\(event\) \{[\s\S]*?store\.select\(props\.connector\.id\)[\s\S]*?if \(!connectorBodyMovable/,
    )
  })

  it('leaves a shift/modifier press to the click handler\'s add-to-selection, not a drag', () => {
    expect(src).toMatch(/function startBodyDrag\(event\) \{\s*if \(event\.shiftKey \|\| event\.metaKey \|\| event\.ctrlKey\) return/)
  })

  it('wires the drag onto the same hit path as click/dblclick, not a separate element', () => {
    expect(src).toMatch(
      /<path v-if="!isBranch"[^>]*@pointerdown\.stop\.prevent="startBodyDrag"[^>]*@pointermove="onBodyDrag"[^>]*@pointerup="endBodyDrag"/,
    )
  })

  it('is excluded for a structural mind-map branch, same as click (#272)', () => {
    // The whole hit path is v-if="!isBranch" — asserting the drag handlers live
    // on THAT path (previous test) already covers this, but pin the shared gate
    // explicitly so a future refactor that splits the path back out is caught.
    expect(src).not.toMatch(/isBranch[\s\S]{0,80}startBodyDrag[\s\S]{0,80}v-if="!isBranch"/)
  })
})

describe('a connector can carry a link, like a shape (#542)', () => {
  it('gates the badge through the same safeHref scheme check ShapeView uses', () => {
    expect(src).toContain("import { safeHref } from '@/utils/safeUrl.js'")
    expect(src).toContain('const safeLink = computed(() => safeHref(props.connector.link))')
  })

  it('positions the badge clear of the label pill and the endpoint markers', () => {
    expect(src).toContain('const linkBadgeAnchor = computed(() => ({ x: labelAnchor.value.x, y: labelAnchor.value.y - 20 }))')
  })

  it('isolates the badge click so it never selects, moves, or opens the label editor', () => {
    expect(src).toMatch(/<a\s+v-if="safeLink"[\s\S]*?@pointerdown\.stop[\s\S]*?@click\.stop/)
  })
})

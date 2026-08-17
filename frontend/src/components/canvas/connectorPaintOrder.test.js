import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// #542: on a unified document, DiagramCanvas's block substrate AND WhiteboardLayer
// both used to loop over store.state.connectors unconditionally — the same
// double-paint bug #27 fixed for shapes, but never fixed for connectors. Every
// connector got two <defs> marker sets, two hit paths and two sets of endpoint
// handles; harmless while connectors couldn't be dragged, fatal the moment they
// could (a body-drag handler firing twice). ConnectorView can't mount in the node
// env, so pin the wiring by source inspection (house pattern, cf.
// editorPaintOrder.test.js).
const here = path.dirname(fileURLToPath(import.meta.url))
const read = (file) => readFileSync(path.join(here, file), 'utf8')
const canvas = read('DiagramCanvas.vue')
const whiteboardLayer = read('WhiteboardLayer.vue')

describe('a connector paints exactly once, whatever layer owns the shapes (#542)', () => {
  it('gates the block substrate to a single connectors source', () => {
    // The block substrate only ever loops blockLayerConnectors — never the raw
    // store array — and that computed empties itself under the exact condition
    // (whiteboardOwnsShapes) blockLayerShapes already uses for shapes.
    expect(canvas).not.toMatch(/v-for="connector in store\.state\.connectors"/)
    expect(canvas).toContain(
      'const blockLayerConnectors = computed(() => (whiteboardOwnsShapes.value ? [] : store.state.connectors))',
    )
  })

  it('interleaves connectors and shapes by one shared zIndex scale', () => {
    expect(canvas).toContain("kind: 'connector', key: connector.id, object: connector")
    expect(canvas).toMatch(/\.sort\(\(a, b\) => \(a\.object\.zIndex \|\| 0\) - \(b\.object\.zIndex \|\| 0\)\)/)
    expect(canvas).toContain('<ConnectorView v-if="item.kind === \'connector\'" :connector="item.object" />')
  })

  it('folds connectors into WhiteboardLayer\'s own ordered pass instead of a leading loop', () => {
    expect(whiteboardLayer).not.toMatch(/v-for="connector in store\.state\.connectors"/)
    expect(whiteboardLayer).toContain("kind: 'connector'")
    expect(whiteboardLayer).toContain('<ConnectorView v-else-if="item.kind === \'connector\'" :connector="item.object" />')
  })
})

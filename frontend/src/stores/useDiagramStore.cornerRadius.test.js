import { describe, it, expect, vi } from 'vitest'
import { createDiagramStore } from './useDiagramStore.js'
import { parseDiagramDocument } from '@/diagram/schema.js'
import { CORNER_RADIUS_OPTIONS, shapeCornerRadius } from '@/diagram/shapeGeometry.js'

// frappe-ui's source only resolves through its vite plugin, and useThumbnail imports
// createResource to save the raster — documentToSvg itself is pure (same stub as
// useThumbnail.test.js).
vi.mock('frappe-ui', () => ({ createResource: () => ({ submit: () => {} }) }))
const { documentToSvg } = await import('@/composables/useThumbnail.js')

// `cornerRadius` (#411) is the first property the roundedness picker writes, and no
// shape carried it before — createShape spreads its partial last and getDocument
// serialises state.shapes wholesale, so it should survive untouched. Nothing pinned
// that, and a radius the canvas honours but a reload drops is worse than no picker.
const [SMALLEST, , , LARGEST] = CORNER_RADIUS_OPTIONS

// The save path the editor actually uses: getDocument -> JSON -> parseDiagramDocument
// -> loadDocument (useAutosave stringifies, EditorShell parses on open).
function reopen(store) {
  const reopened = createDiagramStore()
  reopened.loadDocument(parseDiagramDocument(JSON.stringify(store.getDocument())))
  return reopened
}

describe('a picked corner radius survives a save and reload', () => {
  it('round-trips through the document', () => {
    const store = createDiagramStore()
    const id = store.addShape({ type: 'rounded', x: 10, y: 10 })
    store.updateShapes([id], { cornerRadius: LARGEST })

    expect(reopen(store).shapeById(id).cornerRadius).toBe(LARGEST)
  })

  it('leaves a shape that was never picked without the property, on the type default', () => {
    const store = createDiagramStore()
    const id = store.addShape({ type: 'rounded', x: 10, y: 10 })

    const shape = reopen(store).shapeById(id)
    expect(shape.cornerRadius).toBeUndefined()
    expect(shapeCornerRadius(shape.type, shape.cornerRadius)).toBe(shapeCornerRadius('rounded'))
  })

  // The reload and the export read the same serialised document, so pin them together:
  // this is the pair that used to disagree, at 20 on the canvas and 8 in every export.
  it('reaches the export renderer at the picked radius', () => {
    const store = createDiagramStore()
    const id = store.addShape({ type: 'rounded', x: 10, y: 10 })
    store.updateShapes([id], { cornerRadius: SMALLEST })

    const svg = documentToSvg(JSON.stringify(store.getDocument()))
    expect(svg).toMatch(new RegExp(`<rect[^>]*\\srx="${SMALLEST}"`))
  })
})

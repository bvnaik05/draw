import { describe, it, expect } from 'vitest'
import { nodeShape } from './flowchartShapes.js'
import { NODE_TYPES } from './flowchartModel.js'

// nodeShape is the geometry the flowchart layer AND (post free-floating #122)
// ShapeView render migrated flowchart nodes with, so every node type must return
// a well-formed drawable primitive.
describe('nodeShape', () => {
  const W = 160
  const H = 80

  it('returns a drawable primitive for every node type', () => {
    for (const type of NODE_TYPES) {
      const shape = nodeShape(type, W, H)
      expect(['rect', 'ellipse', 'polygon', 'path']).toContain(shape.kind)
      if (shape.kind === 'polygon') expect(shape.points).toBeTruthy()
      if (shape.kind === 'path') expect(shape.d).toBeTruthy()
    }
  })

  it('maps the core types to the expected primitive', () => {
    expect(nodeShape('process', W, H).kind).toBe('rect')
    expect(nodeShape('terminator', W, H)).toEqual({ kind: 'rect', rx: H / 2 }) // stadium
    expect(nodeShape('decision', W, H).kind).toBe('polygon') // diamond
    expect(nodeShape('inputOutput', W, H).kind).toBe('polygon') // parallelogram
    expect(nodeShape('document', W, H).kind).toBe('path') // wavy bottom
    expect(nodeShape('database', W, H).kind).toBe('path') // cylinder
    expect(nodeShape('connector', W, H).kind).toBe('ellipse') // junction
  })

  it('falls back to a rounded rect for an unknown type', () => {
    expect(nodeShape('nonsense', W, H)).toEqual({ kind: 'rect', rx: 6 })
  })

  it('scales polygon points to the given box', () => {
    // Decision diamond spans the full box: its points touch each edge midpoint.
    const { points } = nodeShape('decision', W, H)
    expect(points).toContain(`${W / 2},0`)
    expect(points).toContain(`${W},${H / 2}`)
  })

  // ShapeGlyph draws these same shapes into a 24×24 icon (longest side 18), which
  // is where a px-constant inset used to exceed the whole box (#441 item 2).
  describe('at icon scale', () => {
    // The box ShapeGlyph produces for the Input / Output tile: 160×72 scaled to fit 18.
    const IW = 18
    const IH = 8.1

    it('keeps the Input / Output parallelogram a parallelogram', () => {
      const { points } = nodeShape('inputOutput', IW, IH)
      const vertices = points.split(' ')
      // Regression: an 18px skew on an 18px box collapsed this to "18,0 18,0 0,8.1
      // 0,8.1" — two pairs of coincident vertices, drawn as a bare diagonal line.
      expect(new Set(vertices).size).toBe(4)
    })

    it('keeps the Predefined process bars inside the box', () => {
      const { d } = nodeShape('predefinedProcess', IW, IH)
      const bars = [...d.matchAll(/M(\d+(?:\.\d+)?) 0 V/g)].map((m) => Number(m[1]))
      // Both bars sit strictly inside the width, and the left one is left of the right.
      for (const bar of bars) expect(bar).toBeGreaterThan(0)
      for (const bar of bars) expect(bar).toBeLessThan(IW)
      expect(bars[0]).toBeLessThan(bars[1])
    })
  })

  it('keeps on-canvas geometry unchanged by the icon-scale caps', () => {
    // The fraction only binds on a small box, so a real node is byte-identical.
    expect(nodeShape('inputOutput', 160, 72).points).toBe('18,0 160,0 142,72 0,72')
    expect(nodeShape('predefinedProcess', 172, 72).d).toContain('M10 0 V72')
  })

  it('draws the database rim so the cylinder reads as a cylinder', () => {
    const { d } = nodeShape('database', W, H)
    // Two subpaths: the silhouette, then the back half of the top ellipse.
    expect(d.match(/M/g).length).toBe(2)
  })
})

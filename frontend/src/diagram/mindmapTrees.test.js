import { describe, it, expect } from 'vitest'
import {
  createEmptyMindMap,
  addTree,
  addChild,
  deleteTree,
  isRoot,
  rootNodes,
  rootOf,
  nodeById,
} from './mindmapModel.js'
import { layoutMindMap, mindmapTreeRects } from './mindmapLayout.js'

// #48: a map holds SEVERAL independent trees, so inserting a mind map next to one
// that already exists makes its own instead of grafting a branch onto the old one.

function seedTree(model, label, origin) {
  const root = addTree(model, `${label} root`, origin)
  addChild(model, root, `${label} 1`, 'right')
  addChild(model, root, `${label} 2`, 'left')
  return root
}

const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

describe('a mind map holding several trees', () => {
  it('treats every parentless node as a root', () => {
    const model = createEmptyMindMap()
    const first = seedTree(model, 'A')
    const second = seedTree(model, 'B', { x: 0, y: 800 })

    expect(rootNodes(model).map((n) => n.id)).toEqual([first, second])
    expect(isRoot(model, first)).toBe(true)
    expect(isRoot(model, second)).toBe(true)
    // model.rootId keeps pointing at the FIRST root, so single-tree documents —
    // every one saved before this — read back unchanged.
    expect(model.rootId).toBe(first)
  })

  it('resolves each node against its own root', () => {
    const model = createEmptyMindMap()
    seedTree(model, 'A')
    const second = seedTree(model, 'B', { x: 0, y: 800 })
    const child = addChild(model, second, 'deeper')

    expect(rootOf(model, child).id).toBe(second)
  })

  it('deletes one tree without touching the others', () => {
    const model = createEmptyMindMap()
    const first = seedTree(model, 'A')
    const second = seedTree(model, 'B', { x: 0, y: 800 })

    const removed = deleteTree(model, first)

    expect(removed).toHaveLength(3)
    expect(rootNodes(model).map((n) => n.id)).toEqual([second])
    expect(model.nodes).toHaveLength(3)
    // The pointer follows the surviving tree rather than dangling.
    expect(model.rootId).toBe(second)
  })

  it('empties the map when the last tree goes', () => {
    const model = createEmptyMindMap()
    const only = seedTree(model, 'A')

    deleteTree(model, only)

    expect(model.nodes).toEqual([])
    expect(model.rootId).toBeNull()
  })
})

describe('laying out several trees', () => {
  it('lays out a second tree without moving the first', () => {
    const model = createEmptyMindMap()
    const first = seedTree(model, 'A')
    const before = layoutMindMap(model).positions[first]

    seedTree(model, 'B', { x: 0, y: 900 })

    expect(layoutMindMap(model).positions[first]).toEqual(before)
  })

  it('offsets a tree by its own origin, and only that tree', () => {
    const model = createEmptyMindMap()
    const first = seedTree(model, 'A')
    const second = seedTree(model, 'B', { x: 0, y: 900 })

    const { positions } = layoutMindMap(model)
    expect(positions[second].y - positions[first].y).toBeCloseTo(900, 6)
    expect(positions[second].x).toBeCloseTo(positions[first].x, 6)

    // Moving one tree leaves the other where it is.
    const firstBefore = positions[first]
    nodeById(model, second).origin = { x: -1200, y: -1500 }
    expect(layoutMindMap(model).positions[first]).toEqual(firstBefore)
  })

  // The layout anchor must not depend on any tree's origin: anchoring on the first
  // tree AFTER its origin was applied cancelled that origin out, so moving the
  // first map slid every other map the opposite way instead.
  it('moves the first tree without dragging the others along', () => {
    const model = createEmptyMindMap()
    const first = seedTree(model, 'A')
    const second = seedTree(model, 'B', { x: 0, y: 900 })
    const secondBefore = layoutMindMap(model).positions[second]

    nodeById(model, first).origin = { x: 400, y: 250 }

    const { positions } = layoutMindMap(model)
    expect(positions[second]).toEqual(secondBefore)
    expect(positions[first].x).toBeCloseTo(secondBefore.x + 400, 6)
  })

  it('reports one hit-rect per tree, clear of each other', () => {
    const model = createEmptyMindMap()
    const first = seedTree(model, 'A')
    const second = seedTree(model, 'B', { x: 0, y: 900 })

    const rects = mindmapTreeRects(model, layoutMindMap(model).positions, 12)

    expect(rects.map((r) => r.rootId)).toEqual([first, second])
    expect(overlaps(rects[0], rects[1])).toBe(false)
  })

  it('reaches above the first tree with a negative bbox origin', () => {
    const model = createEmptyMindMap()
    seedTree(model, 'A')
    seedTree(model, 'B', { x: 0, y: -900 })

    const { bbox } = layoutMindMap(model)
    expect(bbox.y).toBeLessThan(0)
    expect(bbox.h).toBeGreaterThan(900)
  })

  it('lays a single tree out exactly as before, anchored at the margin', () => {
    const model = createEmptyMindMap()
    seedTree(model, 'A')

    const { bbox } = layoutMindMap(model)
    expect(bbox.x).toBe(0)
    expect(bbox.y).toBe(0)
  })
})

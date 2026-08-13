import { describe, it, expect } from 'vitest'
import {
  ADD_R,
  ADD_HIT_R,
  ADD_OFFSET,
  GLYPH,
  HOVER_OUT,
  buildContext,
  handlesForNode,
  shouldShowHandles,
  nodeAtPoint,
  hoverRegionOf,
  pointInBox,
} from './flowchartHandles.js'
import {
  ADD_R as MM_ADD_R,
  ADD_HIT_R as MM_ADD_HIT_R,
  ADD_OFFSET as MM_ADD_OFFSET,
  GLYPH as MM_GLYPH,
} from './mindmapHandles.js'
import { ROLE, flattenSubmodels } from './freeFloating.js'
import { createFlowchart, addFlowchartNode, addFlowchartEdge } from './flowchartModel.js'

// A migrated flowchart node is an ordinary shape tagged role 'flowchart-node' with
// an absolute x/y/w/h and a flowchart.nodeType. These helpers build them with known
// boxes so the "+" placement can be asserted to the pixel, independent of layout.
function fcNode(id, x, y, w = 160, h = 72, nodeType = 'process', extra = {}) {
  return {
    id,
    type: 'rounded',
    x,
    y,
    w,
    h,
    zIndex: 1,
    fill: '#FFFFFF',
    border: { color: '#525252', width: 1.5, dash: 'solid' },
    text: { content: id, align: 'center', valign: 'middle', style: {} },
    role: ROLE.flowchartNode,
    flowchart: {
      nodeType,
      branches: nodeType === 'decision' ? [{ port: 'yes', label: 'Yes' }, { port: 'no', label: 'No' }] : [],
      ...extra,
    },
  }
}

// A plain (non-flowchart) block shape, to prove the overlay ignores it.
function block(id, x, y, w, h, zIndex = 1) {
  return { id, type: 'rectangle', x, y, w, h, zIndex }
}

// #441 item 12: this suite was named for mind-map parity but pinned numbers that
// were not the mind map's (an 11px disc against its 7px one). Assert against the
// mind-map constants themselves, so the two overlays cannot drift apart again.
describe('geometry constants match the mind-map handles', () => {
  it('draws the same small mark inside the same generous target', () => {
    expect(ADD_R).toBe(MM_ADD_R)
    expect(ADD_HIT_R).toBe(MM_ADD_HIT_R)
    expect(GLYPH).toBe(MM_GLYPH)
    expect(ADD_OFFSET).toBe(MM_ADD_OFFSET)
  })

  it('reaches the whole hit target with its hover region', () => {
    // Far edge of the TARGET is ADD_OFFSET + ADD_HIT_R below the node; +12 is margin.
    expect(HOVER_OUT).toBe(ADD_OFFSET + ADD_HIT_R + 12)
  })
})

// #441 item 12: the "+" hangs below the bottom edge, which is where the outgoing
// connectors run — so with a fixed centred handle it sat on the line as soon as the
// node had one child. It now stands in the clearest part of the edge.
describe('the "+" keeps clear of the connectors already leaving a node', () => {
  it('centres the handle on a node with no outgoing edge', () => {
    const ctx = buildContext([fcNode('a', 0, 0, 160, 72)], [])
    expect(handlesForNode('a', ctx)[0].cx).toBe(80)
  })

  it('steps aside once an edge occupies the middle of the bottom edge', () => {
    const shapes = [fcNode('a', 0, 0, 160, 72), fcNode('b', 0, 300, 160, 72)]
    const connectors = [
      { id: 'e1', role: ROLE.flowchartEdge, from: { shapeId: 'a' }, to: { shapeId: 'b' } },
    ]
    const ctx = buildContext(shapes, connectors)
    const handle = handlesForNode('a', ctx)[0]
    // The lone edge leaves at the centre (80); the handle must not be there.
    expect(ctx.exits.a).toEqual([80])
    expect(Math.abs(handle.cx - 80)).toBeGreaterThan(ADD_R)
    // And it stays on the node's own edge rather than floating off it.
    expect(handle.cx).toBeGreaterThanOrEqual(0)
    expect(handle.cx).toBeLessThanOrEqual(160)
  })

  it('still finds a gap when several edges already leave the same edge', () => {
    const shapes = [
      fcNode('a', 0, 0, 160, 72),
      fcNode('b', -200, 300, 160, 72),
      fcNode('c', 200, 300, 160, 72),
    ]
    const connectors = [
      { id: 'e1', role: ROLE.flowchartEdge, from: { shapeId: 'a' }, to: { shapeId: 'b' } },
      { id: 'e2', role: ROLE.flowchartEdge, from: { shapeId: 'a' }, to: { shapeId: 'c' } },
    ]
    const handle = handlesForNode('a', buildContext(shapes, connectors))[0]
    for (const taken of [53.33, 106.67]) {
      expect(Math.abs(handle.cx - taken)).toBeGreaterThan(6)
    }
  })

  it('falls back to the centre when no connectors are supplied', () => {
    const ctx = buildContext([fcNode('a', 0, 0, 160, 72)])
    expect(handlesForNode('a', ctx)[0].cx).toBe(80)
  })
})

describe('buildContext', () => {
  it('indexes only migrated flowchart shapes, by id, with absolute boxes', () => {
    const ctx = buildContext([fcNode('a', 0, 0, 160, 72), block('blk', 10, 10, 50, 50)])
    expect(Object.keys(ctx.boxes)).toEqual(['a'])
    expect(ctx.boxes['a']).toEqual({ x: 0, y: 0, w: 160, h: 72 })
  })

  it('is empty for a canvas with no flowchart shapes', () => {
    expect(buildContext([block('blk', 0, 0, 50, 50)]).boxes).toEqual({})
    expect(buildContext([]).boxes).toEqual({})
    expect(buildContext(undefined).boxes).toEqual({})
  })
})

describe('handlesForNode', () => {
  it('gives a node a single "+" at its bottom-centre exit, one drop below', () => {
    const ctx = buildContext([fcNode('a', 100, 200, 160, 72)])
    const handles = handlesForNode('a', ctx)
    expect(handles).toHaveLength(1)
    const [handle] = handles
    expect(handle.kind).toBe('child')
    expect(handle.nodeId).toBe('a')
    // Exit is bottom-centre (x 180, y 272); the "+" hangs ADD_OFFSET below it, and
    // the stub leaves the node from the exit point.
    expect(handle).toMatchObject({ cx: 180, cy: 272 + ADD_OFFSET, stubX: 180, stubY: 272 })
  })

  it('places the "+" clear of the node box (no overlap with the bottom edge)', () => {
    const ctx = buildContext([fcNode('a', 100, 200, 160, 72)])
    const [handle] = handlesForNode('a', ctx)
    const nodeBottom = 272
    // The top of the circle sits below the node edge by exactly ADD_OFFSET - ADD_R.
    expect(handle.cy - ADD_R).toBeGreaterThan(nodeBottom)
    expect(handle.cy - ADD_R - nodeBottom).toBe(ADD_OFFSET - ADD_R)
  })

  it('puts a decision node\'s "+" at the diamond bottom vertex (still bottom-centre)', () => {
    // portPoint(decision, 'out', 'TB') resolves to the box's bottom-centre — the
    // diamond's bottom vertex — so one formula covers every node type.
    const ctx = buildContext([fcNode('d', 0, 0, 150, 96, 'decision')])
    const [handle] = handlesForNode('d', ctx)
    expect(handle).toMatchObject({ cx: 75, cy: 96 + ADD_OFFSET, stubX: 75, stubY: 96 })
  })

  it('returns nothing for a non-flowchart / unknown id', () => {
    const ctx = buildContext([fcNode('a', 0, 0)])
    expect(handlesForNode('missing', ctx)).toEqual([])
  })

  it('round-trips through the real migration (flatten → handles below the box)', () => {
    // A genuinely migrated flowchart: boxes come from the flatten, not hand values.
    const model = createFlowchart('TB')
    const a = addFlowchartNode(model, 'process', 'Step A', 40, 40)
    const b = addFlowchartNode(model, 'process', 'Step B', 40, 240)
    addFlowchartEdge(model, a, b)
    const out = flattenSubmodels(docWith({ flowchart: model }))
    const ctx = buildContext(out.shapes)

    const handles = handlesForNode(a, ctx)
    expect(handles).toHaveLength(1)
    const [handle] = handles
    const box = ctx.boxes[a]
    // Centred on the box and one drop below its bottom edge.
    expect(handle.cx).toBe(box.x + box.w / 2)
    expect(handle.cy).toBe(box.y + box.h + ADD_OFFSET)
    expect(handle.cy).toBeGreaterThan(box.y + box.h)
  })
})

describe('shouldShowHandles', () => {
  it('shows only with the select tool, when hovered or sole-selected', () => {
    expect(shouldShowHandles({ selectTool: true, hovered: true })).toBe(true)
    expect(shouldShowHandles({ selectTool: true, soleSelected: true })).toBe(true)
    expect(shouldShowHandles({ selectTool: true })).toBe(false)
    // Never while another tool is armed, even if hovered/selected.
    expect(shouldShowHandles({ selectTool: false, hovered: true, soleSelected: true })).toBe(false)
    expect(shouldShowHandles()).toBe(false)
  })
})

describe('nodeAtPoint', () => {
  it('returns the flowchart node under the point, topmost by zIndex', () => {
    const shapes = [fcNode('a', 0, 0, 100, 100)]
    expect(nodeAtPoint({ x: 50, y: 50 }, shapes)).toBe('a')
    // Empty space outside the box.
    expect(nodeAtPoint({ x: 300, y: 300 }, shapes)).toBeNull()
  })

  it('ignores non-flowchart shapes and picks the higher zIndex on overlap', () => {
    const shapes = [
      fcNode('under', 0, 0, 100, 100),
      { ...fcNode('over', 10, 10, 40, 40), zIndex: 9 },
      block('blk', 0, 0, 100, 100, 99),
    ]
    expect(nodeAtPoint({ x: 20, y: 20 }, shapes)).toBe('over')
  })
})

describe('hoverRegionOf', () => {
  it('extends below the node to cover the "+", a hair on the sides', () => {
    const ctx = buildContext([fcNode('a', 100, 200, 160, 72)])
    const region = hoverRegionOf('a', ctx)
    const box = ctx.boxes['a']
    expect(region).toEqual({ x: box.x - 6, y: box.y - 8, w: box.w + 12, h: box.h + HOVER_OUT })
    // The "+" centre and its circle's bottom edge both fall inside the region.
    const [handle] = handlesForNode('a', ctx)
    expect(pointInBox({ x: handle.cx, y: handle.cy }, region)).toBe(true)
    expect(pointInBox({ x: handle.cx, y: handle.cy + ADD_R }, region)).toBe(true)
  })

  it('is null for an unknown id', () => {
    const ctx = buildContext([fcNode('a', 0, 0)])
    expect(hoverRegionOf('missing', ctx)).toBeNull()
  })
})

describe('pointInBox', () => {
  it('is inclusive on the edges and false for a null box', () => {
    const box = { x: 0, y: 0, w: 10, h: 10 }
    expect(pointInBox({ x: 0, y: 0 }, box)).toBe(true)
    expect(pointInBox({ x: 10, y: 10 }, box)).toBe(true)
    expect(pointInBox({ x: 11, y: 5 }, box)).toBe(false)
    expect(pointInBox({ x: 5, y: 5 }, null)).toBe(false)
  })
})

// Matches the doc shape the migration expects (mirrors freeFloatingGraph.test.js).
function docWith(partial) {
  return {
    schemaVersion: 2,
    diagramType: 'unified',
    canvas: { width: 1920, height: 1080, background: null },
    shapes: [],
    connectors: [],
    sections: [],
    mindmap: null,
    flowchart: null,
    whiteboard: null,
    ...partial,
  }
}

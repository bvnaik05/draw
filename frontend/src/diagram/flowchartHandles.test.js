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
  handleAtPoint,
  nextHoverTarget,
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

// #441 round 2: the "+" PROTRUDES FROM THE CENTRE of the side it extends from.
// An earlier pass slid it to whichever part of the edge was clearest so it would
// miss the outgoing connector; that put the handle in a different place on every
// node, which read as arbitrary. It is centred again, and it stays legible over a
// route because it paints above the connectors on a white disc.
describe('the "+" protrudes from the centre of its side', () => {
  it('centres a plain node\'s handle below its bottom edge', () => {
    const ctx = buildContext([fcNode('a', 0, 0, 160, 72)])
    const [handle] = handlesForNode('a', ctx)
    expect(handle.cx).toBe(80) // the node's centre line
    expect(handle.cy).toBe(72 + ADD_OFFSET)
    expect(handle.side).toBe('bottom')
  })

  it('stays centred whether or not the node already has a child', () => {
    const shapes = [fcNode('a', 0, 0, 160, 72), fcNode('b', 0, 300, 160, 72)]
    const alone = handlesForNode('a', buildContext([shapes[0]]))[0]
    const withChild = handlesForNode('a', buildContext(shapes))[0]
    expect(withChild.cx).toBe(alone.cx)
  })
})

// #441 round 2: a decision is the one type whose point is more than one outgoing
// flow, so it previews each branch on its own side rather than hiding them behind
// a single "+" that silently cycled through them.
describe('a decision offers one labelled handle per branch', () => {
  function decision(id, x, y) {
    return fcNode(id, x, y, 150, 96, 'decision', {
      flowchart: {
        nodeType: 'decision',
        branches: [
          { port: 'yes', label: 'Yes' },
          { port: 'no', label: 'No' },
        ],
      },
    })
  }

  // #549 item 3: each branch takes a SIDE OF ITS OWN, in side order, so Yes and No
  // read as two directions rather than two marks ~40px apart on one edge — which is
  // what let a branch preview land on the branch beside it.
  it('gives every branch a side of its own, in branch order', () => {
    const handles = handlesForNode('d', buildContext([decision('d', 0, 0)])).filter((h) => h.port)
    expect(handles).toHaveLength(2)
    expect(handles.map((h) => h.label)).toEqual(['Yes', 'No'])
    expect(handles.map((h) => h.side)).toEqual(['bottom', 'right'])
  })

  it('carries the branch port, so pressing one extends THAT branch', () => {
    const handles = handlesForNode('d', buildContext([decision('d', 0, 0)]))
    expect(handles.filter((h) => h.port).map((h) => h.port)).toEqual(['yes', 'no'])
  })

  it('offers nothing but its branches, so no unlabelled "+" competes with them', () => {
    const handles = handlesForNode('d', buildContext([decision('d', 0, 0)]))
    expect(handles.every((handle) => handle.port)).toBe(true)
  })

  it('hangs the first branch one drop below the node, on its centre line', () => {
    const [yes] = handlesForNode('d', buildContext([decision('d', 0, 0)])).filter((h) => h.port)
    expect(yes.cy).toBe(96 + ADD_OFFSET)
    expect(yes.cx).toBe(75) // half of 150
  })

  it('gives a plain node unlabelled handles on every side', () => {
    const handles = handlesForNode('a', buildContext([fcNode('a', 0, 0)]))
    expect(handles).toHaveLength(4)
    for (const handle of handles) {
      expect(handle.label).toBe('')
      expect(handle.port).toBeNull()
    }
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
  // #441 round 3: a child can be added from ANY direction, so every node offers a
  // "+" on all four sides. A chart is not always a column, and forcing every child
  // below its parent is what pushed later additions into long detouring routes.
  const bottomOf = (handles) => handles.find((handle) => handle.side === 'bottom')

  it('offers a "+" on every side, one drop clear of each edge', () => {
    const ctx = buildContext([fcNode('a', 100, 200, 160, 72)])
    const handles = handlesForNode('a', ctx)
    expect(handles.map((handle) => handle.side).sort()).toEqual(['bottom', 'left', 'right', 'top'])
    for (const handle of handles) {
      expect(handle.kind).toBe('child')
      expect(handle.nodeId).toBe('a')
    }
    // Each sits ADD_OFFSET beyond the centre of its own edge, stub on the edge.
    expect(handles.find((h) => h.side === 'bottom')).toMatchObject({ cx: 180, cy: 272 + ADD_OFFSET, stubX: 180, stubY: 272 })
    expect(handles.find((h) => h.side === 'top')).toMatchObject({ cx: 180, cy: 200 - ADD_OFFSET, stubX: 180, stubY: 200 })
    expect(handles.find((h) => h.side === 'right')).toMatchObject({ cx: 260 + ADD_OFFSET, cy: 236, stubX: 260, stubY: 236 })
    expect(handles.find((h) => h.side === 'left')).toMatchObject({ cx: 100 - ADD_OFFSET, cy: 236, stubX: 100, stubY: 236 })
  })

  it('places every "+" clear of the node box', () => {
    const ctx = buildContext([fcNode('a', 100, 200, 160, 72)])
    const box = ctx.boxes['a']
    for (const handle of handlesForNode('a', ctx)) {
      const clear =
        handle.cy - ADD_R > box.y + box.h ||
        handle.cy + ADD_R < box.y ||
        handle.cx - ADD_R > box.x + box.w ||
        handle.cx + ADD_R < box.x
      expect(clear).toBe(true)
    }
  })

  it('hangs a decision\'s first branch below the diamond, off its bottom edge', () => {
    const ctx = buildContext([fcNode('d', 0, 0, 150, 96, 'decision')])
    const branches = handlesForNode('d', ctx).filter((handle) => handle.port)
    expect(branches.map((handle) => handle.port)).toEqual(['yes', 'no'])
    const [yes] = branches
    expect(yes.cy).toBe(96 + ADD_OFFSET)
    expect(yes.stubY).toBe(96)
    // Each branch owns a side, so nothing else on the node offers a "+".
    expect(handlesForNode('d', ctx).filter((handle) => !handle.port)).toEqual([])
  })

  it('returns nothing for a non-flowchart / unknown id', () => {
    const ctx = buildContext([fcNode('a', 0, 0)])
    expect(handlesForNode('missing', ctx)).toEqual([])
  })

  it('round-trips through the real migration (flatten \u2192 handles around the box)', () => {
    // A genuinely migrated flowchart: boxes come from the flatten, not hand values.
    const model = createFlowchart('TB')
    const a = addFlowchartNode(model, 'process', 'Step A', 40, 40)
    const b = addFlowchartNode(model, 'process', 'Step B', 40, 240)
    addFlowchartEdge(model, a, b)
    const out = flattenSubmodels(docWith({ flowchart: model }))
    const ctx = buildContext(out.shapes)

    const handles = handlesForNode(a, ctx)
    expect(handles).toHaveLength(4)
    const handle = bottomOf(handles)
    const box = ctx.boxes[a]
    // Centred on the box and one drop below its bottom edge.
    expect(handle.cx).toBe(box.x + box.w / 2)
    expect(handle.cy).toBe(box.y + box.h + ADD_OFFSET)
    expect(handle.cy).toBeGreaterThan(box.y + box.h)
  })
})

// #549 items 2 and 4. A "+" is an offer to create something; a side that already
// carries a connector has nothing to offer, and the pair of "+" marks that used to
// frame every finished connection made a completed flow read as an unfinished one.
describe('an occupied connection point offers no "+"', () => {
  // The two nodes of `twoNodeChart`, connected a \u2192 b with b directly below a.
  function twoNodeChart() {
    const model = createFlowchart('TB')
    const a = addFlowchartNode(model, 'process', 'Step A', 40, 40)
    const b = addFlowchartNode(model, 'process', 'Step B', 40, 300)
    addFlowchartEdge(model, a, b)
    const out = flattenSubmodels(docWith({ flowchart: model }))
    return { ...out, a, b }
  }

  it('drops the source\'s bottom and the target\'s top \u2014 one connection, no marks', () => {
    const { shapes, connectors, a, b } = twoNodeChart()
    const ctx = buildContext(shapes, connectors)
    expect(handlesForNode(a, ctx).map((handle) => handle.side).sort()).toEqual(['left', 'right', 'top'])
    expect(handlesForNode(b, ctx).map((handle) => handle.side).sort()).toEqual(['bottom', 'left', 'right'])
  })

  it('follows the connector after a drag, because the side is derived not stored', () => {
    const { shapes, connectors, a, b } = twoNodeChart()
    // Move the target to the RIGHT of its source: the edge now leaves through the
    // source's right side, so that is the side that stops offering a "+".
    const target = shapes.find((shape) => shape.id === b)
    target.x = shapes.find((shape) => shape.id === a).x + 400
    target.y = shapes.find((shape) => shape.id === a).y
    const ctx = buildContext(shapes, connectors)
    expect(handlesForNode(a, ctx).map((handle) => handle.side)).not.toContain('right')
    expect(handlesForNode(a, ctx).map((handle) => handle.side)).toContain('bottom')
  })

  it('hides a decision branch that has already been extended', () => {
    const model = createFlowchart('TB')
    const decisionId = addFlowchartNode(model, 'decision', 'Ship it?', 40, 40)
    const yes = addFlowchartNode(model, 'process', 'Ship', 40, 300)
    addFlowchartEdge(model, decisionId, yes, { fromPort: 'yes', label: 'Yes' })
    const out = flattenSubmodels(docWith({ flowchart: model }))
    const handles = handlesForNode(decisionId, buildContext(out.shapes, out.connectors))
    // Only the branch still free is offered, and it takes the first side left over.
    expect(handles.map((handle) => handle.port)).toEqual(['no'])
    expect(handles[0].label).toBe('No')
    expect(handles[0].side).toBe('right')
  })

  it('moves a branch off a side whose PREVIEW would land on a node', () => {
    // The "+" below the decision is in clear space, but the pill announcing the
    // branch would hang straight onto the node parked just past it.
    const decision = fcNode('d', 0, 0, 150, 96, 'decision')
    const blocker = fcNode('near', 40, 96 + ADD_OFFSET + 20, 160, 72)
    const handles = handlesForNode('d', buildContext([decision, blocker]))
    expect(handles.find((handle) => handle.port === 'yes').side).not.toBe('bottom')
  })

  it('ignores connectors that are not flowchart edges', () => {
    const { shapes, connectors, a } = twoNodeChart()
    const plain = { ...connectors[0], id: 'plain', role: undefined }
    expect(handlesForNode(a, buildContext(shapes, [plain]))).toHaveLength(4)
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
  it('covers every handle, measured from the handles themselves', () => {
    const ctx = buildContext([fcNode('a', 100, 200, 160, 72)])
    const region = hoverRegionOf('a', ctx)
    // The whole hit circle of every handle is inside, with margin to spare. The old
    // fixed-reach region left ~4px of slack, so a real pointer overshooting on its
    // way to the "+" dropped the hover and the handle blinked out.
    for (const handle of handlesForNode('a', ctx)) {
      for (const [dx, dy] of [[0, 0], [ADD_HIT_R, 0], [-ADD_HIT_R, 0], [0, ADD_HIT_R], [0, -ADD_HIT_R]]) {
        expect(pointInBox({ x: handle.cx + dx, y: handle.cy + dy }, region)).toBe(true)
      }
    }
    // And the node itself still counts as hovered.
    const box = ctx.boxes['a']
    expect(pointInBox({ x: box.x + box.w / 2, y: box.y + box.h / 2 }, region)).toBe(true)
  })

  it('is null for an unknown id', () => {
    const ctx = buildContext([fcNode('a', 0, 0)])
    expect(hoverRegionOf('missing', ctx)).toBeNull()
  })
})

// #441 round 2: "the + disappears as soon as I go to click it". Two separate
// causes, and the region test above only covered the first one.
describe('handleAtPoint / nextHoverTarget', () => {
  it('finds a handle anywhere inside its hit radius, not just on the drawn mark', () => {
    const ctx = buildContext([fcNode('a', 100, 200, 160, 72)])
    const [handle] = handlesForNode('a', ctx)
    expect(handleAtPoint({ x: handle.cx, y: handle.cy }, 'a', ctx)?.nodeId).toBe('a')
    expect(handleAtPoint({ x: handle.cx + ADD_HIT_R - 1, y: handle.cy }, 'a', ctx)).toBeTruthy()
    expect(handleAtPoint({ x: handle.cx + ADD_HIT_R + 2, y: handle.cy }, 'a', ctx)).toBeNull()
    expect(handleAtPoint({ x: handle.cx, y: handle.cy }, 'missing', ctx)).toBeNull()
  })

  it('keeps the hover on the node that OFFERED the "+", even over a neighbour', () => {
    // The neighbour sits exactly where the parent's handle hangs — the common case
    // once a chart has two rows. Asking "which node is under the pointer?" first,
    // which is what the overlay used to do, handed the hover to the neighbour the
    // moment the pointer reached the "+", and the handle vanished under the cursor.
    const parent = fcNode('parent', 100, 100, 160, 72)
    const ctx0 = buildContext([parent])
    const handle = handlesForNode('parent', ctx0).find((one) => one.side === 'bottom')
    // Close enough that the handle's HIT radius (15) reaches into the neighbour,
    // but clear of its 7px mark — so the handle survives the keep-off filter and
    // the two genuinely compete for the pointer.
    const neighbour = fcNode('neighbour', handle.cx + 10, handle.cy - 20, 160, 72)
    const shapes = [parent, neighbour]
    const ctx = buildContext(shapes)
    const point = { x: handle.cx, y: handle.cy }

    // The pointer is on the parent's handle, which reaches into the neighbour.
    expect(nextHoverTarget({ point, currentId: 'parent', ctx, shapes })).toBe('parent')
    // And a point genuinely INSIDE the neighbour still hands it the hover, even
    // while the parent is the one being defended.
    const inside = { x: neighbour.x + 40, y: neighbour.y + 40 }
    expect(nodeAtPoint(inside, shapes)).toBe('neighbour')
    expect(nextHoverTarget({ point: inside, currentId: 'parent', ctx, shapes })).toBe('neighbour')
  })

  it('holds the hover across the empty gap between a node and its "+"', () => {
    const shapes = [fcNode('a', 100, 200, 160, 72)]
    const ctx = buildContext(shapes)
    const [handle] = handlesForNode('a', ctx)
    const gap = { x: handle.cx, y: (200 + 72 + handle.cy) / 2 }
    expect(nodeAtPoint(gap, shapes)).toBeNull()
    expect(nextHoverTarget({ point: gap, currentId: 'a', ctx, shapes })).toBe('a')
    // Far away, the hover drops.
    const away = { x: 1000, y: 1000 }
    expect(nextHoverTarget({ point: away, currentId: 'a', ctx, shapes })).toBeNull()
  })

  it('reveals a node\'s handles on APPROACH, before the pointer touches it', () => {
    const shapes = [fcNode('a', 200, 200, 160, 72)]
    const ctx = buildContext(shapes)
    // Just outside the box on each side, but within reach. Nothing is hovered yet,
    // so this is the acquisition path, not the defend-what-we-have path.
    const near = [
      { x: 200 - 10, y: 236 }, // left
      { x: 360 + 10, y: 236 }, // right
      { x: 280, y: 200 - 10 }, // above
    ]
    for (const point of near) {
      expect(nodeAtPoint(point, shapes)).toBeNull()
      expect(nextHoverTarget({ point, currentId: null, ctx, shapes })).toBe('a')
    }
    // Well outside, still nothing.
    expect(nextHoverTarget({ point: { x: 200 - 90, y: 236 }, currentId: null, ctx, shapes })).toBeNull()
  })

  it('gives an overlapping approach to the nearer node', () => {
    // Two siblings close enough that their reach regions overlap — the pointer in
    // the gap must pick one and stay with it, not flicker between them.
    const shapes = [fcNode('left', 0, 0, 160, 72), fcNode('right', 190, 0, 160, 72)]
    const ctx = buildContext(shapes)
    expect(nextHoverTarget({ point: { x: 170, y: 36 }, currentId: null, ctx, shapes })).toBe('left')
    expect(nextHoverTarget({ point: { x: 182, y: 36 }, currentId: null, ctx, shapes })).toBe('right')
  })

  it('defends every branch handle of a decision, not just the first', () => {
    const shapes = [fcNode('d', 100, 100, 160, 72, 'decision')]
    const ctx = buildContext(shapes)
    for (const handle of handlesForNode('d', ctx)) {
      const point = { x: handle.cx, y: handle.cy }
      expect(nextHoverTarget({ point, currentId: 'd', ctx, shapes })).toBe('d')
    }
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

// #441 round 3: with a "+" on every side, a node in a built-up chart was offering
// handles that sat ON TOP of its neighbours — a mark pointing at space that is
// already taken, covering the node underneath.
describe('handles keep off the neighbours', () => {
  it('drops a "+" that would land on another node', () => {
    const parent = fcNode('p', 0, 0, 160, 72)
    // A neighbour sitting exactly where the bottom handle hangs.
    const below = fcNode('below', 40, 72 + ADD_OFFSET - 10, 160, 72)
    const handles = handlesForNode('p', buildContext([parent, below]))
    expect(handles.map((handle) => handle.side)).not.toContain('bottom')
    expect(handles.map((handle) => handle.side).sort()).toEqual(['left', 'right', 'top'])
  })

  it('moves a decision\'s branch off a blocked side rather than dropping it', () => {
    const decision = fcNode('d', 0, 0, 150, 96, 'decision')
    const ctx0 = buildContext([decision])
    const yes = handlesForNode('d', ctx0).find((handle) => handle.port === 'yes')
    const child = fcNode('child', yes.cx - 10, yes.cy - 10, 20, 20)
    const handles = handlesForNode('d', buildContext([decision, child]))
    // Both outcomes are still offered; Yes simply took the next side along.
    expect(handles.map((handle) => handle.port)).toEqual(['yes', 'no'])
    expect(handles[0].side).not.toBe('bottom')
  })

  it('falls back to the full set when every side is blocked', () => {
    const parent = fcNode('p', 0, 0, 160, 72)
    const ring = [
      fcNode('n1', -400, -400, 1000, 380), // above
      fcNode('n2', -400, 90, 1000, 400), // below
      fcNode('n3', -400, -400, 380, 1000), // left
      fcNode('n4', 180, -400, 400, 1000), // right
    ]
    const handles = handlesForNode('p', buildContext([parent, ...ring]))
    expect(handles).toHaveLength(4)
  })
})

import { describe, it, expect } from 'vitest'
import { startPaletteDrag, isConnectorType, DATA_TRANSFER_KEY, useShapeCreation } from './useShapeCreation.js'

// The palette-drag gesture has two halves in different files: the tile produces a
// dataTransfer payload (startPaletteDrag) and the canvas consumes it
// (onCanvasDrop -> readToolPayload). They agree only via DATA_TRANSFER_KEY, and a
// mismatch fails silently — the drag just does nothing — so pin the contract.

function fakeDragEvent() {
  const data = {}
  return {
    dataTransfer: {
      effectAllowed: null,
      setData: (key, value) => (data[key] = value),
      getData: (key) => data[key] || '',
      types: [],
    },
    _data: data,
  }
}

function fakeEditorUi() {
  const calls = []
  return { calls, setDrawShape: (type) => calls.push(type) }
}

describe('startPaletteDrag', () => {
  it('writes the tool type under the key the canvas drop handler reads', () => {
    const event = fakeDragEvent()
    startPaletteDrag(event, 'ellipse', fakeEditorUi())
    expect(event._data[DATA_TRANSFER_KEY]).toBe('ellipse')
  })

  it('arms draw mode for the dragged type, so releasing off-canvas still leaves the tool ready', () => {
    const editorUi = fakeEditorUi()
    startPaletteDrag(fakeDragEvent(), 'diamond', editorUi)
    expect(editorUi.calls).toEqual(['diamond'])
  })

  it('marks the drag as a copy so the cursor reads correctly', () => {
    const event = fakeDragEvent()
    startPaletteDrag(event, 'rect', fakeEditorUi())
    expect(event.dataTransfer.effectAllowed).toBe('copy')
  })

  it('does not throw when dataTransfer is absent (synthetic events)', () => {
    expect(() => startPaletteDrag({}, 'rect', fakeEditorUi())).not.toThrow()
  })
})

// The canvas ghosts the draft with ShapeView, which needs the armed type — without
// it every shape previewed as a rectangle (issue #31).
function fakeDrawUi(type) {
  return {
    state: { tool: 'draw', drawShapeType: type },
    viewport: { state: { panX: 0, panY: 0, zoom: 1 } },
    setTool: () => {},
  }
}

// The drag arms edge auto-pan, which schedules a frame; the node test env has no
// rAF, and the pan itself is not what these tests are about.
globalThis.requestAnimationFrame ??= () => 0

function fakePointerEvent(x, y) {
  return {
    button: 0,
    clientX: x,
    clientY: y,
    currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0 }), scrollLeft: 0, scrollTop: 0 },
  }
}

describe('draw preview', () => {
  it('carries the armed shape type through the drag', () => {
    const creation = useShapeCreation({}, fakeDrawUi('ellipse'))
    creation.onCanvasPointerDown(fakePointerEvent(10, 10))
    creation.onCanvasPointerMove(fakePointerEvent(110, 60))
    expect(creation.preview.value).toMatchObject({ box: true, type: 'ellipse', x: 10, y: 10, w: 100, h: 50 })
  })

  it('previews a connector as a line, with no shape type', () => {
    const creation = useShapeCreation({}, fakeDrawUi('arrow'))
    creation.onCanvasPointerDown(fakePointerEvent(10, 10))
    creation.onCanvasPointerMove(fakePointerEvent(50, 30))
    expect(creation.preview.value).toMatchObject({ line: true, x1: 10, y1: 10, x2: 50, y2: 30 })
  })
})

describe('isConnectorType', () => {
  it('separates connectors from shapes, which the drop path branches on', () => {
    expect(isConnectorType('rect')).toBe(false)
    // A connector drops as a two-endpoint line, not a boxed shape.
    expect(isConnectorType('line')).toBe(true)
  })
})

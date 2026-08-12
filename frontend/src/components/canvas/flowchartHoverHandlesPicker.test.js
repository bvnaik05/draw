import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// #410: the "+" handle used to hardcode `store.addFlowchartChildShape(handle.nodeId,
// 'process')` — clicking it could only ever grow the chart with a Process step, no
// matter which of the eleven standard flowchart shapes (spec B3) the user actually
// wanted next, and #2 in that issue made converting it afterwards impossible.
// FlowchartHoverHandles can't mount in the node env, so pin the fix by source
// inspection (house pattern, cf. structuralConnector.test.js).
const src = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), './FlowchartHoverHandles.vue'),
  'utf8',
)

describe('the "+" handle opens the node-type picker instead of a hardcoded Process (#410)', () => {
  it('no longer creates a node directly off a "+" click', () => {
    expect(src).not.toContain("addFlowchartChildShape(handle.nodeId, 'process')")
  })

  it('a click opens FlowchartNodeTypePicker, which offers every standard type', () => {
    expect(src).toContain('@click.stop="openPicker(handle)"')
    expect(src).toContain('<FlowchartNodeTypePicker @choose="chooseType" @close="closePicker" />')
  })

  it('choosing a type creates it and drops straight into naming it', () => {
    expect(src).toContain('store.addFlowchartChildShape(parentId, nodeType)')
    expect(src).toContain('editing.beginTextEdit(id, { selectAll: true })')
  })

  it('positions the picker through the shared placePicker, not by hand', () => {
    expect(src).toContain("import { placePicker } from '@/diagram/flowchartLayout.js'")
    expect(src).toContain('placePicker({ box, menu: { w: PICKER_W, h: PICKER_H }, bounds, direction:')
  })

  // The subtle one. The outside-close listener is on the CAPTURE phase, so it has
  // already run by the time the picker's own pointerdown.stop could stop it —
  // without excluding the picker's DOM, choosing a type would null pickerNodeId
  // before the click handler that reads it ever fired.
  it('excludes the picker itself from the capture-phase outside-close', () => {
    expect(src).toContain("event.target?.closest?.('[data-fc-picker]')")
    expect(src).toContain("document.addEventListener('pointerdown', onDocumentPointerDown, true)")
    expect(src).toContain("document.removeEventListener('pointerdown', onDocumentPointerDown, true)")
  })
})

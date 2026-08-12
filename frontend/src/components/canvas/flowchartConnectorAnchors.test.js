import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { edgeAnchors } from '@/diagram/freeFloating.js'

// #410: a flowchart edge's from/to anchor (top/bottom/left/right) used to be read
// straight off the connector, but it is only ever WRITTEN at creation time (or by an
// explicit whole-chart Tidy/flip) — dragging one of the two nodes anywhere else left
// it stale, so the route kept leaving/arriving on whichever side used to be correct:
// an arrow that doubled back instead of flowing forward. ConnectorView can't mount in
// the node env, so pin the wiring by source inspection (house pattern, cf.
// structuralConnector.test.js) and the repro itself against the pure formula.
const src = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), './ConnectorView.vue'),
  'utf8',
)

describe('a flowchart edge recomputes its anchor live, not from the stored value (#410)', () => {
  it('derives the anchor from the two nodes CURRENT boxes via edgeAnchors', () => {
    expect(src).toContain('props.connector.role !== ROLE.flowchartEdge')
    expect(src).toContain('edgeAnchors(fromShape, toShape)')
  })

  it('the live anchor overrides the stored one when resolving each endpoint', () => {
    expect(src).toContain('resolve(props.connector.from, liveFlowchartAnchors.value?.from)')
    expect(src).toContain('resolve(props.connector.to, liveFlowchartAnchors.value?.to)')
    expect(src).toContain('anchorPoint(shape, anchorOverride || endpoint.anchor')
  })

  it('leaves a non-flowchart connector on its stored anchor', () => {
    // Only flowchart edges are self-correcting: a hand-drawn block connector's
    // anchor is a user choice and must survive a node move untouched.
    expect(src).toContain('if (props.connector.role !== ROLE.flowchartEdge) return null')
  })

  // The repro from the issue: Start above Process flows bottom→top, and dragging
  // Process ABOVE Start has to flip it, which is what the stale stored value never did.
  it('flips the anchor once the target node moves above its source', () => {
    const start = { x: 0, y: 0, w: 120, h: 60 }
    expect(edgeAnchors(start, { x: 0, y: 200, w: 120, h: 60 })).toEqual({ from: 'bottom', to: 'top' })
    expect(edgeAnchors(start, { x: 0, y: -200, w: 120, h: 60 })).toEqual({ from: 'top', to: 'bottom' })
  })
})

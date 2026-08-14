import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { chooseSides } from '@/diagram/flowchartRouting.js'

// #410: a flowchart edge's from/to anchor (top/bottom/left/right) used to be read
// straight off the connector, but it is only ever WRITTEN at creation time (or by an
// explicit whole-chart Tidy/flip) — dragging one of the two nodes anywhere else left
// it stale, so the route kept leaving/arriving on whichever side used to be correct:
// an arrow that doubled back instead of flowing forward.
//
// #441 moved that live recomputation into the whole-chart routing pass, which is the
// only place that can also see the nodes an edge must avoid and the sibling edges it
// must spread away from. The guarantee is unchanged and stronger; the mechanism now
// lives in flowchartRouting.chooseSides. ConnectorView can't mount in the node env,
// so pin the wiring by source inspection (house pattern) and the rule itself against
// the pure formula.
const src = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), './ConnectorView.vue'),
  'utf8',
)

describe('a flowchart edge takes its geometry from the live route (#410, #441)', () => {
  it('reads its route out of the shared whole-chart pass', () => {
    expect(src).toContain('const flowchartRoutes = useFlowchartRoutes(store)')
    expect(src).toContain("props.connector.role === ROLE.flowchartEdge ? flowchartRoutes.value[props.connector.id] : null")
  })

  it('takes both endpoints from the route rather than from a stored anchor', () => {
    expect(src).toContain('const start = computed(() => routePoints.value?.[0] || resolve(props.connector.from))')
    expect(src).toContain('routePoints.value?.[routePoints.value.length - 1] || resolve(props.connector.to)')
  })

  it('leaves a non-flowchart connector on its stored anchor', () => {
    // Only flowchart edges are self-correcting: a hand-drawn block connector's
    // anchor is a user choice and must survive a node move untouched.
    //
    // What guards that is the ROLE gate on the route lookup: with flowchartRoute
    // null, both endpoints fall through to resolve() and the stored anchor. Assert
    // the gate and the fallback, not merely that anchorPoint is mentioned — the
    // earlier version of this case passed whether or not the gate was there.
    expect(src).toContain('props.connector.role === ROLE.flowchartEdge ? flowchartRoutes.value[props.connector.id] : null')
    expect(src).toMatch(/const start = computed\(\(\) => routePoints\.value\?\.\[0\] \|\| resolve\(props\.connector\.from\)\)/)
    expect(src).toMatch(/resolve\(endpoint, anchorOverride\)|anchorPoint\(shape, anchorOverride \|\| endpoint\.anchor/)
  })

  // The repro from the issue: Start above Process flows bottom→top, and dragging
  // Process ABOVE Start has to flip it, which is what the stale stored value never did.
  it('flips the sides once the target node moves above its source', () => {
    const start = { x: 0, y: 0, w: 120, h: 60 }
    expect(chooseSides(start, { x: 0, y: 200, w: 120, h: 60 })).toEqual({ from: 'bottom', to: 'top' })
    expect(chooseSides(start, { x: 0, y: -200, w: 120, h: 60 })).toEqual({ from: 'top', to: 'bottom' })
  })
})

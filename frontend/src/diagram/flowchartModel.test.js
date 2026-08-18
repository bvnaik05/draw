import { describe, it, expect } from 'vitest'
import {
  createFlowchart,
  terminatorText,
  defaultNodeText,
  addFlowchartNode,
  addFlowchartEdge,
  removeFlowchartNode,
  swapNodeType,
  addDecisionBranch,
  removeDecisionBranch,
  spliceNodeOnEdge,
  outgoingEdges,
  incomingEdges,
  flowchartNodeById,
  orderedFlowNodes,
} from './flowchartModel.js'

// Build a small linear flow A→B→C for numbering tests.
function linearFlow() {
  const model = createFlowchart()
  const a = addFlowchartNode(model, 'terminator', 'Start', 0, 0)
  const b = addFlowchartNode(model, 'process', 'Work', 0, 120)
  const c = addFlowchartNode(model, 'terminator', 'End', 0, 240)
  addFlowchartEdge(model, a, b)
  addFlowchartEdge(model, b, c)
  return { model, a, b, c }
}

// Edge endpoints that still reference removed nodes ("dangling").
function danglingEdges(model) {
  const ids = new Set(model.nodes.map((node) => node.id))
  return model.edges.filter((edge) => !ids.has(edge.from.nodeId) || !ids.has(edge.to.nodeId))
}

describe('flowchart model', () => {
  it('starts blank — no nodes or edges (the user adds the first node)', () => {
    const model = createFlowchart()
    expect(model.nodes).toHaveLength(0)
    expect(model.edges).toHaveLength(0)
    expect(model.direction).toBe('TB')
  })

  it('decision nodes default to Yes/No branches', () => {
    const model = createFlowchart()
    const id = addFlowchartNode(model, 'decision')
    const node = flowchartNodeById(model, id)
    expect(node.branches.map((b) => b.label)).toEqual(['Yes', 'No'])
  })

  it('removing a node removes its touching edges (no dangling)', () => {
    const model = createFlowchart()
    const a = addFlowchartNode(model, 'terminator')
    const b = addFlowchartNode(model, 'process')
    const c = addFlowchartNode(model, 'process')
    addFlowchartEdge(model, a, b)
    addFlowchartEdge(model, b, c)
    removeFlowchartNode(model, b)
    expect(danglingEdges(model)).toHaveLength(0)
    expect(model.edges).toHaveLength(0)
  })

  it('node-type swap preserves all connected edges', () => {
    const model = createFlowchart()
    const a = addFlowchartNode(model, 'terminator')
    const b = addFlowchartNode(model, 'process')
    const c = addFlowchartNode(model, 'process')
    addFlowchartEdge(model, a, b)
    addFlowchartEdge(model, b, c)
    swapNodeType(model, b, 'decision')
    expect(flowchartNodeById(model, b).nodeType).toBe('decision')
    expect(incomingEdges(model, b)).toHaveLength(1)
    expect(outgoingEdges(model, b)).toHaveLength(1)
    expect(danglingEdges(model)).toHaveLength(0)
  })

  it('swapping a decision to process re-homes branch edges onto the out port', () => {
    const model = createFlowchart()
    const d = addFlowchartNode(model, 'decision')
    const yes = addFlowchartNode(model, 'process')
    const branchPort = flowchartNodeById(model, d).branches[0].port
    addFlowchartEdge(model, d, yes, { fromPort: branchPort })
    swapNodeType(model, d, 'process')
    expect(outgoingEdges(model, d)[0].from.port).toBe('out')
    expect(flowchartNodeById(model, d).branches).toHaveLength(0)
  })

  it('adds and removes decision branches, cleaning branch edges', () => {
    const model = createFlowchart()
    const d = addFlowchartNode(model, 'decision')
    const port = addDecisionBranch(model, d, 'Maybe')
    expect(flowchartNodeById(model, d).branches).toHaveLength(3)
    const child = addFlowchartNode(model, 'process')
    addFlowchartEdge(model, d, child, { fromPort: port })
    removeDecisionBranch(model, d, port)
    expect(flowchartNodeById(model, d).branches).toHaveLength(2)
    expect(outgoingEdges(model, d)).toHaveLength(0) // branch edge removed
  })

  it('splices a node onto an edge, rewiring A->B into A->new->B', () => {
    const model = createFlowchart()
    const a = addFlowchartNode(model, 'terminator')
    const b = addFlowchartNode(model, 'process')
    const edgeId = addFlowchartEdge(model, a, b)
    const inserted = spliceNodeOnEdge(model, edgeId, 'process')
    expect(outgoingEdges(model, a).map((e) => e.to.nodeId)).toEqual([inserted])
    expect(outgoingEdges(model, inserted).map((e) => e.to.nodeId)).toEqual([b])
    expect(incomingEdges(model, b).map((e) => e.from.nodeId)).toEqual([inserted])
    expect(danglingEdges(model)).toHaveLength(0)
  })

  it('orders nodes in flow order from the entry node', () => {
    const { model, a, b, c } = linearFlow()
    expect(orderedFlowNodes(model).map((n) => n.id)).toEqual([a, b, c])
  })
})

// #441 round 2: the first Terminal on a chart starts the flow, the second ends it.
describe('terminatorText', () => {
  it('alternates Start, End, Start, …', () => {
    expect(terminatorText(0)).toBe('Start')
    expect(terminatorText(1)).toBe('End')
    expect(terminatorText(2)).toBe('Start')
    expect(terminatorText(3)).toBe('End')
  })

  it('names the second terminator of a chart "End"', () => {
    const model = createFlowchart()
    addFlowchartNode(model, 'terminator', defaultNodeText('terminator', model), 0, 0)
    expect(model.nodes[0].text).toBe('Start')
    addFlowchartNode(model, 'terminator', defaultNodeText('terminator', model), 0, 200)
    expect(model.nodes[1].text).toBe('End')
  })

  it('leaves every other type on its own default', () => {
    const model = createFlowchart()
    expect(defaultNodeText('process', model)).toBe('Process')
    expect(defaultNodeText('decision', model)).toBe('Decision?')
  })
})

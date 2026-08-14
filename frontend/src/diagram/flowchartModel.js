// Flowchart model — pure data + mutations (spec diagram-types Part B10).
// A flowchart is a set of typed nodes connected by orthogonal edges. Nodes carry
// an explicit x/y (manual placement is allowed, spec B7) plus a
// `manuallyPositioned` flag so auto-place/Tidy only move auto nodes (Part G7).
// IDs are stable (factories nextId), never array index (Part G2). Mutations
// operate in place and return the new/affected id so the store wraps them in
// commit() for undo (Part G6). Edge routing/geometry is derived in
// flowchartLayout.js, never stored here.

import { nextId } from './factories.js'
import { NODE_TYPES, NODE_TYPE_META } from './flowchartTypes.js'
import { flowchartNodeSize } from './flowchartNodeSize.js'

export { NODE_TYPES, NODE_TYPE_META }

// A terminator is the one type whose default label depends on the chart around it
// (#441 round 2): the first one is where the flow starts, the second is where it
// ends. Alternating on the COUNT means a third goes back to "Start", which is what
// a user building two separate flows on one canvas wants — and it stays a plain
// default, so renaming any of them is untouched.
export function defaultNodeText(nodeType, model = null) {
  if (nodeType === 'terminator' && model) {
    return terminatorText(model.nodes.filter((node) => node.nodeType === 'terminator').length)
  }
  return NODE_TYPE_META[nodeType]?.text ?? ''
}

// The label for the nth terminator on a chart: Start, End, Start, End, …
// Exported so the free-drop path, which builds a fresh single-node model and so
// cannot count from it, can count the canvas instead and get the same answer.
export function terminatorText(existingCount) {
  return existingCount % 2 === 1 ? 'End' : 'Start'
}

// Node box, measured through the shared per-shape frame (#441 items 5/14). It used
// to grow height alone against one generic rectangle inset, which is why a node
// born here and a node resized by the text editor were different boxes — the
// layout then spaced the chart against boxes that were not the boxes on screen.
// Both paths now measure in flowchartNodeSize, so they agree by construction.
// An explicit w/h on the node is its floor, so a hand-sized node never shrinks.
export function nodeSize(node) {
  return flowchartNodeSize({
    nodeType: node.nodeType,
    text: node.text,
    fontSize: node.fontSize,
    minW: node.w,
    minH: node.h,
  })
}

export function makeFlowchartNode(nodeType, text, x, y) {
  const meta = NODE_TYPE_META[nodeType] || NODE_TYPE_META.process
  return {
    id: nextId('f'),
    nodeType,
    text,
    x,
    y,
    w: meta.w,
    h: meta.h,
    fill: null,
    border: null,
    manuallyPositioned: false,
    branches: nodeType === 'decision' ? defaultDecisionBranches() : [],
  }
}

// Decision nodes expose labelled outputs (default Yes / No, spec B4).
export function defaultDecisionBranches() {
  return [
    { port: 'yes', label: 'Yes' },
    { port: 'no', label: 'No' },
  ]
}

export function makeFlowchartEdge(fromNodeId, toNodeId, partial = {}) {
  return {
    id: nextId('fe'),
    from: { nodeId: fromNodeId, port: partial.fromPort || 'out' },
    to: { nodeId: toNodeId, port: partial.toPort || 'in' },
    label: partial.label || '',
    arrowheads: { start: false, end: true },
    routing: 'orthogonal',
    kind: partial.kind || 'flow',
  }
}

// Start empty — the user builds from scratch (double-click the canvas to drop
// the first node, then grow it with the + handles).
export function createFlowchart(direction = 'TB') {
  // `origin` is the frame's top-left on the unified canvas (canvas unification):
  // a flowchart is a positioned, self-laying-out region. {0,0} = no offset, which
  // is exactly how a legacy single-type flowchart renders today.
  return { direction, nodes: [], edges: [], origin: { x: 0, y: 0 } }
}

export function flowchartNodeById(model, id) {
  return model.nodes.find((node) => node.id === id)
}

export function flowchartEdgeById(model, id) {
  return model.edges.find((edge) => edge.id === id)
}

// Outgoing / incoming edges of a node.
export function outgoingEdges(model, nodeId) {
  return model.edges.filter((edge) => edge.from.nodeId === nodeId)
}

export function incomingEdges(model, nodeId) {
  return model.edges.filter((edge) => edge.to.nodeId === nodeId)
}

// The first decision branch of `node` with no outgoing edge yet (so repeated adds
// fill Yes, then No, …), falling back to the first branch once all are taken. Null
// for a non-decision node — it extends from the single 'out' port. Shared by the
// sub-model keyboard path and the free-floating add-node op so both agree.
export function pickFreeBranch(node, model) {
  if (node.nodeType !== 'decision' || !node.branches?.length) return null
  const used = new Set(outgoingEdges(model, node.id).map((edge) => edge.from.port))
  return node.branches.find((branch) => !used.has(branch.port)) || node.branches[0]
}

// Add a node; returns its id. Caller supplies position (auto-place lives in the
// layout module + interaction). A blank text means "use the type's default".
export function addFlowchartNode(model, nodeType, text = '', x = 0, y = 0) {
  const node = makeFlowchartNode(nodeType, text || defaultNodeText(nodeType), x, y)
  model.nodes.push(node)
  return node.id
}

// Connect two existing nodes; returns the edge id (or null if either is missing).
export function addFlowchartEdge(model, fromNodeId, toNodeId, partial = {}) {
  if (!flowchartNodeById(model, fromNodeId) || !flowchartNodeById(model, toNodeId)) return null
  const edge = makeFlowchartEdge(fromNodeId, toNodeId, partial)
  model.edges.push(edge)
  return edge.id
}

// Remove a node and any edges touching it (no dangling arrows, spec B11).
export function removeFlowchartNode(model, id) {
  model.nodes = model.nodes.filter((node) => node.id !== id)
  model.edges = model.edges.filter((edge) => edge.from.nodeId !== id && edge.to.nodeId !== id)
}

export function removeFlowchartEdge(model, id) {
  model.edges = model.edges.filter((edge) => edge.id !== id)
}

// Swap a node's type in place, preserving its edges (spec B7/B11). Switching to
// or from a decision adjusts the branch set + re-homes any branch-anchored
// outgoing edges so labels/ports stay valid. The node id never changes, so
// every edge endpoint keeps pointing at it.
export function swapNodeType(model, id, nodeType) {
  const node = flowchartNodeById(model, id)
  if (!node || !NODE_TYPES.includes(nodeType) || node.nodeType === nodeType) return
  const wasDecision = node.nodeType === 'decision'
  node.nodeType = nodeType
  const meta = NODE_TYPE_META[nodeType]
  // Reset to the new type's default box unless the user hand-sized it; keeping
  // it simple, we always adopt the type's box (matches the picker defaults).
  node.w = meta.w
  node.h = meta.h
  if (nodeType === 'decision') {
    if (!wasDecision) node.branches = defaultDecisionBranches()
  } else if (wasDecision) {
    collapseDecisionBranches(model, node)
  }
}

// Leaving the decision type: drop branch ports, re-home outgoing edges onto the
// single 'out' port so they keep their target (labels are cleared as they no
// longer name a branch).
function collapseDecisionBranches(model, node) {
  node.branches = []
  for (const edge of outgoingEdges(model, node.id)) {
    edge.from.port = 'out'
  }
}

// Add a labelled branch output to a decision node; returns the new port name.
export function addDecisionBranch(model, id, label = 'Option') {
  const node = flowchartNodeById(model, id)
  if (!node || node.nodeType !== 'decision') return null
  const port = nextId('b')
  node.branches.push({ port, label })
  return port
}

export function removeDecisionBranch(model, id, port) {
  const node = flowchartNodeById(model, id)
  if (!node || node.nodeType !== 'decision') return
  node.branches = node.branches.filter((branch) => branch.port !== port)
  // Any edge on that branch loses its anchor; remove it (no dangling routes).
  model.edges = model.edges.filter(
    (edge) => !(edge.from.nodeId === id && edge.from.port === port),
  )
}

// ----- auto-numbering (spec 14.4) --------------------------------------------
// A leading "N. " step number on a node's label.
const STEP_PREFIX = /^\s*\d+\.\s+/

export function stripStepNumber(text) {
  return (text || '').replace(STEP_PREFIX, '')
}

// Nodes in flow order: a breadth-first walk from the entry node(s) (no incoming
// edge) following outgoing edges, with position (top→bottom, left→right) as the
// tie-breaker. Any node not reached by the walk (cycles / islands) is appended
// in reading order, so every node is covered exactly once.
export function orderedFlowNodes(model) {
  const byPos = (a, b) => a.y - b.y || a.x - b.x
  const indeg = new Map(model.nodes.map((n) => [n.id, 0]))
  for (const edge of model.edges) {
    if (indeg.has(edge.to.nodeId)) indeg.set(edge.to.nodeId, indeg.get(edge.to.nodeId) + 1)
  }
  const roots = model.nodes.filter((n) => indeg.get(n.id) === 0).sort(byPos)
  const queue = (roots.length ? roots : [...model.nodes].sort(byPos)).slice()
  const visited = new Set()
  const out = []
  while (queue.length) {
    const node = queue.shift()
    if (visited.has(node.id)) continue
    visited.add(node.id)
    out.push(node)
    const next = outgoingEdges(model, node.id)
      .map((e) => flowchartNodeById(model, e.to.nodeId))
      .filter((n) => n && !visited.has(n.id))
      .sort(byPos)
    queue.push(...next)
  }
  for (const node of [...model.nodes].sort(byPos)) {
    if (!visited.has(node.id)) out.push(node)
  }
  return out
}

// Whether the flow is currently auto-numbered. Tracked with an explicit model
// flag rather than sniffing the text for a leading "N. " — a user's own label
// like "3. 14 kg batch" must NOT read as (or be mistaken for) a step number.
export function isFlowNumbered(model) {
  return !!model.numbered
}

// Toggle sequential "1. / 2. / …" prefixes on the flow's nodes (junctions are
// skipped). Re-running strips them, so the palette button reads as a toggle.
// Each numbered node remembers the EXACT prefix we added (`_stepPrefix`); toggling
// off removes only that stored prefix, so content that legitimately begins with a
// number ("3. 14 kg batch") round-trips untouched.
export function autoNumberFlow(model) {
  if (model.numbered) {
    for (const node of model.nodes) {
      const prefix = node._stepPrefix
      if (prefix && (node.text || '').startsWith(prefix)) {
        node.text = node.text.slice(prefix.length)
      }
      delete node._stepPrefix
    }
    model.numbered = false
    return
  }
  let step = 0
  for (const node of orderedFlowNodes(model)) {
    if (node.nodeType === 'connector') continue
    step += 1
    const prefix = `${step}. `
    node._stepPrefix = prefix
    node.text = `${prefix}${node.text || ''}`
  }
  model.numbered = true
}

// Insert a new node in the middle of an edge (spec B7 insert-in-the-middle).
// The original edge A->B is rewired to A->new, and a fresh new->B edge is added,
// preserving the original edge's branch label on the A->new half. Returns the
// new node id. Downstream re-flow is run by the caller (one undoable unit).
export function spliceNodeOnEdge(model, edgeId, nodeType, x = 0, y = 0) {
  const edge = flowchartEdgeById(model, edgeId)
  if (!edge) return null
  const newId = addFlowchartNode(model, nodeType, '', x, y)
  const downstream = edge.to.nodeId
  const downstreamPort = edge.to.port
  edge.to = { nodeId: newId, port: 'in' }
  addFlowchartEdge(model, newId, downstream, { toPort: downstreamPort })
  return newId
}

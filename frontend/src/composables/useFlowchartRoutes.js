// The routed geometry for every flowchart edge on the canvas, as ONE derived value
// (#441 items 8, 9, 19).
//
// Routing cannot be decided connector-by-connector. Avoiding a node means knowing
// where all the other nodes are; spreading branches means knowing which edges share
// a side; drawing a jumper means knowing which OTHER route this one crosses. So the
// whole chart is routed in a single pass here, and each ConnectorView reads its own
// entry out of the result.
//
// It is a computed, so it recomputes when — and only when — the shapes or connectors
// change. That is what keeps connectors glued to their nodes through a drag (#441
// item 17) without any of them storing geometry that could go stale.

import { computed } from 'vue'
import { ROLE } from '@/diagram/freeFloating.js'
import { routeFlowchartEdges } from '@/diagram/flowchartRouting.js'

const cache = new WeakMap()

export function useFlowchartRoutes(store) {
  if (cache.has(store)) return cache.get(store)
  const routes = computed(() => {
    const boxes = {}
    for (const shape of store.state.shapes || []) {
      if (shape.role === ROLE.flowchartNode) {
        // nodeType rides along so a port can be pulled in to the shape's real
        // outline rather than left on the bounding box (#441 round 3).
        boxes[shape.id] = {
          x: shape.x, y: shape.y, w: shape.w, h: shape.h,
          nodeType: shape.flowchart?.nodeType,
        }
      }
    }
    if (!Object.keys(boxes).length) return {}
    const edges = []
    for (const connector of store.state.connectors || []) {
      if (connector.role !== ROLE.flowchartEdge) continue
      const fromId = connector.from?.shapeId
      const toId = connector.to?.shapeId
      // A connector whose endpoints are not both flowchart nodes is left to the
      // generic renderer — it is not part of the chart's routing problem.
      if (!boxes[fromId] || !boxes[toId] || fromId === toId) continue
      edges.push({ id: connector.id, fromId, toId })
    }
    return edges.length ? routeFlowchartEdges(boxes, edges) : {}
  })
  cache.set(store, routes)
  return routes
}

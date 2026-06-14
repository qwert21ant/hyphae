import { c4Backend, layerOfType, type HyphaeModel } from '@hyphae/schema';
import type { Node as FlowNode, Edge as FlowEdge } from '@xyflow/react';

export function toFlowNodes(model: HyphaeModel, layer: string): FlowNode[] {
  const view = model.views.find((v) => v.layer === layer);
  return model.nodes
    .filter((n) => layerOfType(c4Backend, n.type) === layer)
    .map((n, i) => ({
      id: n.id,
      position: view?.nodePositions[n.id] ?? { x: 80 + (i % 5) * 200, y: 80 + Math.floor(i / 5) * 140 },
      data: { label: `${n.name}\n(${n.type})` },
    }));
}

export function toFlowEdges(model: HyphaeModel, layer: string): FlowEdge[] {
  const visible = new Set(
    model.nodes.filter((n) => layerOfType(c4Backend, n.type) === layer).map((n) => n.id),
  );
  return model.connections
    .filter((c) => visible.has(c.from) && visible.has(c.to))
    .map((c) => ({
      id: c.id,
      source: c.from,
      target: c.to,
      label: c.transport && c.transport !== 'None' ? `${c.relationCategory} / ${c.transport}` : c.relationCategory,
    }));
}

import { c4Backend, layerOfType, type HyphaeModel } from '@hyphae/schema';
import type { Node as FlowNode, Edge as FlowEdge } from '@xyflow/react';

const NODE_W = 160;
const NODE_H = 44;
const PAD = 24;
const LABEL_H = 22;

export function toFlowNodes(model: HyphaeModel, layer: string): FlowNode[] {
  const pos = model.views.find((v) => v.layer === layer)?.nodePositions ?? {};
  const nameById = new Map(model.nodes.map((n) => [n.id, n.name]));
  const visible = model.nodes.filter((n) => layerOfType(c4Backend, n.type) === layer);

  // Absolute position per visible node (stored, or a default grid slot).
  const abs = new Map<string, { x: number; y: number }>();
  visible.forEach((n, i) => {
    abs.set(n.id, pos[n.id] ?? { x: 80 + (i % 5) * 200, y: 80 + Math.floor(i / 5) * 140 });
  });

  // One region per referenced parent, computed as the bounding box of its children
  // (+ padding + a label band). Recomputed every render, so it grows in all directions.
  const parentIds: string[] = [];
  for (const n of visible) {
    if (n.parentId && !parentIds.includes(n.parentId)) parentIds.push(n.parentId);
  }
  const regions: FlowNode[] = parentIds.map((pid) => {
    const pts = visible.filter((n) => n.parentId === pid).map((c) => abs.get(c.id)!);
    const minX = Math.min(...pts.map((p) => p.x));
    const minY = Math.min(...pts.map((p) => p.y));
    const maxX = Math.max(...pts.map((p) => p.x + NODE_W));
    const maxY = Math.max(...pts.map((p) => p.y + NODE_H));
    return {
      id: pid,
      type: 'region',
      position: { x: minX - PAD, y: minY - LABEL_H - PAD },
      data: { label: nameById.get(pid) ?? pid },
      style: { width: maxX - minX + 2 * PAD, height: maxY - minY + LABEL_H + 2 * PAD },
      draggable: true,
      selectable: false,
    };
  });

  // All visible nodes are plain, absolutely-positioned nodes (no RF parenting).
  const nodes: FlowNode[] = visible.map((n) => ({
    id: n.id,
    position: abs.get(n.id)!,
    data: { label: `${n.name}\n(${n.type})` },
  }));

  // Regions first so they paint behind their children.
  return [...regions, ...nodes];
}

/** Ids of the visible nodes that belong to a given parent region on a layer. */
export function regionChildIds(model: HyphaeModel, layer: string, parentId: string): Set<string> {
  return new Set(
    model.nodes
      .filter((n) => layerOfType(c4Backend, n.type) === layer && n.parentId === parentId)
      .map((n) => n.id),
  );
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

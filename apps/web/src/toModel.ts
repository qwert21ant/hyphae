import { c4Backend, layerOfType, type HyphaeModel } from '@hyphae/schema';
import type { Node as FlowNode, Edge as FlowEdge } from '@xyflow/react';

const NODE_W = 150;
const NODE_H = 40;
const PAD = 24;
const LABEL_H = 28;

const childDefault = (j: number) => ({
  x: PAD + (j % 3) * (NODE_W + 20),
  y: LABEL_H + PAD + Math.floor(j / 3) * (NODE_H + 30),
});

export function toFlowNodes(model: HyphaeModel, layer: string): FlowNode[] {
  const pos = model.views.find((v) => v.layer === layer)?.nodePositions ?? {};
  const nameById = new Map(model.nodes.map((n) => [n.id, n.name]));
  const visible = model.nodes.filter((n) => layerOfType(c4Backend, n.type) === layer);

  // Distinct parents referenced by the visible nodes, in first-seen order.
  const parentIds: string[] = [];
  for (const n of visible) {
    if (n.parentId && !parentIds.includes(n.parentId)) parentIds.push(n.parentId);
  }

  // One group node per referenced parent, sized to enclose its children.
  const groups: FlowNode[] = parentIds.map((pid, g) => {
    let w = 200;
    let h = 120;
    visible.filter((n) => n.parentId === pid).forEach((c, j) => {
      const p = pos[c.id] ?? childDefault(j);
      w = Math.max(w, p.x + NODE_W + PAD);
      h = Math.max(h, p.y + NODE_H + PAD);
    });
    return {
      id: pid,
      type: 'group',
      position: pos[pid] ?? { x: 40 + g * 360, y: 40 },
      data: { label: nameById.get(pid) ?? pid },
      style: { width: w, height: h },
    };
  });

  // Child (parented) + top-level nodes. Defaults are per-parent / per-top-level index.
  const childSeq = new Map<string, number>();
  let topIdx = 0;
  const nodes: FlowNode[] = visible.map((n) => {
    const label = `${n.name}\n(${n.type})`;
    if (n.parentId) {
      const j = childSeq.get(n.parentId) ?? 0;
      childSeq.set(n.parentId, j + 1);
      return {
        id: n.id,
        parentId: n.parentId,
        extent: 'parent' as const,
        position: pos[n.id] ?? childDefault(j),
        data: { label },
      };
    }
    const i = topIdx++;
    return {
      id: n.id,
      position: pos[n.id] ?? { x: 80 + (i % 5) * 200, y: 80 + Math.floor(i / 5) * 140 },
      data: { label },
    };
  });

  // Groups must precede their children in the array (React Flow v12 requirement).
  return [...groups, ...nodes];
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

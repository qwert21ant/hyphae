import type { Node as FlowNode, Edge as FlowEdge } from '@xyflow/react';
import type { FocusView, FocusEdge } from './focusView';
import { NODE_W, NODE_H, type XY } from './layout';

const PAD = 24;
const LABEL_H = 22;

function realEdge(e: FocusEdge): FlowEdge {
  return { id: e.id, type: 'floating', source: e.from, target: e.to, label: e.kind ?? '' };
}

function derivedEdge(e: FocusEdge): FlowEdge {
  return {
    id: e.id,
    type: 'floating',
    source: e.from,
    target: e.to,
    label: String(e.count),
    data: { derived: true, count: e.count, realizedBy: e.realizedBy },
    selectable: true,
    focusable: true,
    deletable: false,
    style: { stroke: '#7c3aed', strokeDasharray: '6 4', strokeWidth: 2 },
    labelStyle: { color: '#6d28d9', fontWeight: 600 },
    labelBgStyle: { background: '#ede9fe' },
  };
}

export function focusViewToFlow(view: FocusView, pos: Record<string, XY>): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const nodes: FlowNode[] = [];

  if (view.focusNode && view.children.length) {
    const xs = view.children.map((n) => pos[n.id]?.x ?? 0);
    const ys = view.children.map((n) => pos[n.id]?.y ?? 0);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs.map((x) => x + NODE_W));
    const maxY = Math.max(...ys.map((y) => y + NODE_H));
    nodes.push({
      id: view.focusNode.id,
      type: 'region',
      position: { x: minX - PAD, y: minY - LABEL_H - PAD },
      data: { label: view.focusNode.name },
      style: { width: maxX - minX + 2 * PAD, height: maxY - minY + LABEL_H + 2 * PAD, pointerEvents: 'none' as const },
      draggable: false,
      selectable: false,
    });
  } else if (view.focusNode) {
    // No children: render the focus as a plain node so external edges have a valid anchor.
    nodes.push({
      id: view.focusNode.id,
      type: 'node',
      position: pos[view.focusNode.id] ?? { x: 0, y: 0 },
      data: { label: `${view.focusNode.name}\n(${view.focusNode.type})` },
      draggable: false,
    });
  }

  for (const n of view.children) {
    nodes.push({ id: n.id, type: 'node', position: pos[n.id] ?? { x: 0, y: 0 }, data: { label: `${n.name}\n(${n.type})` }, draggable: false });
  }
  for (const n of view.externals) {
    nodes.push({ id: n.id, type: 'ghost', position: pos[n.id] ?? { x: 0, y: 0 }, data: { label: `${n.name}\n(${n.type})` }, draggable: false });
  }

  const edges = view.edges.map((e) => (e.derived ? derivedEdge(e) : realEdge(e)));
  return { nodes, edges };
}

/**
 * Given the current selection, the node/edge ids to highlight:
 * - an edge → the edge and the two nodes it connects;
 * - a region (its child ids passed in `childIds`) → the region, its children, and touching edges;
 * - a plain node → the node, its adjacent edges, and the nodes on the other end.
 */
export function highlightSets(selectedId: string | null, edges: FlowEdge[], childIds: Set<string> = new Set()): { nodes: Set<string>; edges: Set<string> } {
  if (!selectedId) return { nodes: new Set(), edges: new Set() };

  const selectedEdge = edges.find((e) => e.id === selectedId);
  if (selectedEdge) {
    return { nodes: new Set([selectedEdge.source, selectedEdge.target]), edges: new Set([selectedId]) };
  }

  if (childIds.size) {
    const nodes = new Set<string>([selectedId, ...childIds]);
    const within = edges.filter((e) => childIds.has(e.source) || childIds.has(e.target)).map((e) => e.id);
    return { nodes, edges: new Set(within) };
  }

  const adjacent = edges.filter((e) => e.source === selectedId || e.target === selectedId);
  const nodes = new Set<string>([selectedId]);
  for (const e of adjacent) {
    nodes.add(e.source);
    nodes.add(e.target);
  }
  return { nodes, edges: new Set(adjacent.map((e) => e.id)) };
}

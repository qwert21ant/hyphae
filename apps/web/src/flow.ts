import { MarkerType, type Node as FlowNode, type Edge as FlowEdge } from '@xyflow/react';
import { c4Backend, layerOfType, roleOfNode, roleDefOf, type Node as ModelNode } from '@hyphae/schema';
import type { FocusView, FocusEdge } from './focusView';
import { NODE_W, NODE_H, PAD, LABEL_H, type XY } from './layout';

/** Tint each node by its C4 layer so altitude is readable at a glance. Kept in sync with the legend. */
export const LAYER_COLOR: Record<string, { bg: string; border: string }> = {
  Context: { bg: '#eef2ff', border: '#6366f1' },
  Container: { bg: '#ecfeff', border: '#0891b2' },
  Component: { bg: '#f0fdf4', border: '#16a34a' },
  Code: { bg: '#fefce8', border: '#ca8a04' },
};
export function layerColorOf(type: string): { bg: string; border: string } {
  const layer = layerOfType(c4Backend, type);
  return (layer && LAYER_COLOR[layer]) || { bg: '#fff', border: '#b1b1b7' };
}

/** The node data every node renderer reads: name, the on-diagram purpose, tech chip, and shape. */
export function nodeVisual(n: ModelNode) {
  const shape = roleDefOf(c4Backend, roleOfNode(c4Backend, n))?.shape ?? 'rectangle';
  const summary = typeof n.fields.summary === 'string' ? n.fields.summary : '';
  const technology = typeof n.fields.technology === 'string' ? n.fields.technology : '';
  return { name: n.name, summary, technology, shape, color: layerColorOf(n.type) };
}

/** Arrowheads showing direction: at the target; also at the source when bidirectional; none
 *  when 'None' (an aggregated pair whose underlying connections point both ways). */
function markers(direction: string | undefined, color?: string): Pick<FlowEdge, 'markerEnd' | 'markerStart'> {
  if (direction === 'None') return {};
  const arrow = { type: MarkerType.ArrowClosed, ...(color ? { color } : {}) };
  return { markerEnd: arrow, ...(direction === 'Bidirectional' ? { markerStart: arrow } : {}) };
}

function realEdge(e: FocusEdge): FlowEdge {
  return { id: e.id, type: 'floating', source: e.from, target: e.to, label: e.kind ?? '', ...markers(e.direction) };
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
    ...markers(e.direction, '#7c3aed'),
  };
}

export function focusViewToFlow(view: FocusView, pos: Record<string, XY>): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const nodes: FlowNode[] = [];

  // initialWidth/initialHeight are unmeasured-size hints: they don't constrain the real DOM node
  // (React Flow still measures it), but they give the MiniMap node dimensions to draw — otherwise
  // it renders nothing, since we never feed measured sizes back via onNodesChange.
  if (view.focusNode && view.children.length) {
    const xs = view.children.map((n) => pos[n.id]?.x ?? 0);
    const ys = view.children.map((n) => pos[n.id]?.y ?? 0);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs.map((x) => x + NODE_W));
    const maxY = Math.max(...ys.map((y) => y + NODE_H));
    const width = maxX - minX + 2 * PAD;
    const height = maxY - minY + LABEL_H + 2 * PAD;
    nodes.push({
      id: view.focusNode.id,
      type: 'region',
      position: { x: minX - PAD, y: minY - LABEL_H - PAD },
      data: { label: view.focusNode.name },
      style: { width, height, pointerEvents: 'none' as const },
      initialWidth: width,
      initialHeight: height,
      draggable: false,
      selectable: false,
    });
  } else if (view.focusNode) {
    // No children: render the focus as a plain node so external edges have a valid anchor.
    nodes.push({
      id: view.focusNode.id,
      type: 'node',
      position: pos[view.focusNode.id] ?? { x: 0, y: 0 },
      data: nodeVisual(view.focusNode),
      initialWidth: NODE_W,
      initialHeight: NODE_H,
      draggable: false,
    });
  }

  for (const g of view.externalGroups ?? []) {
    const mpos = g.childIds.map((id) => pos[id]).filter(Boolean) as XY[];
    if (!mpos.length) continue;
    const minX = Math.min(...mpos.map((p) => p.x));
    const minY = Math.min(...mpos.map((p) => p.y));
    const maxX = Math.max(...mpos.map((p) => p.x + NODE_W));
    const maxY = Math.max(...mpos.map((p) => p.y + NODE_H));
    const width = maxX - minX + 2 * PAD;
    const height = maxY - minY + LABEL_H + 2 * PAD;
    nodes.push({
      id: g.id,
      type: 'ghostGroup',
      position: { x: minX - PAD, y: minY - LABEL_H - PAD },
      data: { label: g.name },
      style: { width, height, pointerEvents: 'none' as const },
      initialWidth: width,
      initialHeight: height,
      draggable: false,
      selectable: false,
    });
  }

  for (const n of view.children) {
    nodes.push({ id: n.id, type: 'node', position: pos[n.id] ?? { x: 0, y: 0 }, data: nodeVisual(n), initialWidth: NODE_W, initialHeight: NODE_H, draggable: false });
  }
  for (const n of view.externals) {
    nodes.push({ id: n.id, type: 'ghost', position: pos[n.id] ?? { x: 0, y: 0 }, data: { ...nodeVisual(n), expandable: view.expandableExternalIds?.has(n.id) ?? false }, initialWidth: NODE_W, initialHeight: NODE_H, draggable: false });
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

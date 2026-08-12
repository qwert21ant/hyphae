import { MarkerType, type Node as FlowNode, type Edge as FlowEdge } from '@xyflow/react';
import { c4Backend, layerOfType, roleOfNode, roleDefOf, type Node as ModelNode } from '@hyphae/schema';
import type { FocusView, FocusEdge } from '@/core/focusView';
import { NODE_W, NODE_H, PAD, LABEL_H, type XY } from './layout';
import { layerColorOf } from '@/core/verbColors';

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

// A label carries the whole meaning of the edge now, so it gets more room than the old 24-char
// object cap allowed — but still a cap, because an unbounded label wrecks the layout.
const LABEL_CAP = 40;

/** The edge's label, trimmed and clipped to something a diagram can carry. */
export function clipLabel(label: string): string {
  const t = label.trim();
  return t.length > LABEL_CAP ? `${t.slice(0, LABEL_CAP - 1)}…` : t;
}

function realEdge(e: FocusEdge): FlowEdge {
  // Every authored edge takes the one neutral line colour. Hue on an edge used to mean verb class;
  // with the verb vocabulary gone it means nothing, so it is not spent here.
  const color = 'var(--edge-line)';
  return {
    id: e.id,
    type: 'floating',
    source: e.from,
    target: e.to,
    label: clipLabel(e.label ?? ''),
    style: { stroke: color },
    labelStyle: { fill: color, fontWeight: 500 },
    // Conditional, so an unshelved edge's `data` stays absent exactly as it was.
    ...(e.shelved ? { data: { shelved: true } } : {}),
    ...markers(e.direction, color),
  };
}

function derivedEdge(e: FocusEdge): FlowEdge {
  return {
    id: e.id,
    type: 'floating',
    source: e.from,
    target: e.to,
    label: String(e.count),
    data: { derived: true, count: e.count, realizedBy: e.realizedBy, ...(e.shelved ? { shelved: true } : {}) },
    selectable: true,
    focusable: true,
    deletable: false,
    style: { stroke: 'var(--edge-derived)', strokeDasharray: '6 4', strokeWidth: 2 },
    labelStyle: { color: 'var(--edge-derived)', fontWeight: 600 },
    labelBgStyle: { background: 'var(--surface-2)' },
    ...markers(e.direction, 'var(--edge-derived)'),
  };
}

/**
 * The z-index of a containment boundary (the focus region and every expanded external group).
 *
 * React Flow paints its edge layer BEFORE its node layer — GraphView renders EdgeRenderer ahead of
 * NodeRenderer inside the viewport — and both default to z-index 0, so at an equal z every node
 * covers every edge. That was invisible while the boundary was a 6%-opacity wash; the altitude
 * ramp made it an OPAQUE fill spanning the whole cluster, and it swallowed every edge drawn inside
 * it. Dropping the boundary below the edge layer restores the stacking the design assumes: fill,
 * then edges, then the boxes they connect.
 *
 * -1 cannot escape behind the canvas background: `.react-flow__viewport` sets both a transform and
 * a z-index, so it is a stacking context, while `<Background>` is rendered outside it in the pane.
 */
const BOUNDARY_Z = -1;

/** The class React Flow treats as a containment box's drag handle — its title bar. Shared with
 *  GroupNode/GhostGroupNode, which render it, and with canvas.css, which makes it the one part of a
 *  pointer-transparent box that takes pointer events. */
export const GROUP_GRIP = 'region__handle';

/** React Flow node id of the shelf band. Not a model id — the band is chrome, and no node in a
 *  Hyphae model has a `__…__` id. */
export const SHELF_ID = '__shelf__';

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
      // layer drives canvas.css's .region[data-layer=…] altitude tint — the region is otherwise the
      // one altitude-bearing shape on screen that never repainted when drilling changed depth.
      data: { label: view.focusNode.name, layer: layerOfType(c4Backend, view.focusNode.type) },
      style: { width, height, pointerEvents: 'none' as const },
      initialWidth: width,
      initialHeight: height,
      zIndex: BOUNDARY_Z,
      // Grabbable by its title bar only. The box spans the whole cluster and is pointer-transparent
      // (canvas.css `.region`), so a whole-surface drag target would swallow every click meant for
      // the nodes and edges inside it; `.region__handle` is the one strip that takes pointer events.
      dragHandle: `.${GROUP_GRIP}`,
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
      zIndex: BOUNDARY_Z,
      dragHandle: `.${GROUP_GRIP}`,
      selectable: false,
    });
  }

  // The shelf: the foundational nodes whose edges are not drawn, inside an inert band. Emitted before
  // the children so the band paints behind everything, like the other two containment boxes.
  const shelf = view.shelf ?? [];
  const shelfPos = shelf.map((s) => pos[s.node.id]).filter(Boolean) as XY[];
  if (shelfPos.length) {
    const minX = Math.min(...shelfPos.map((p) => p.x));
    const minY = Math.min(...shelfPos.map((p) => p.y));
    const maxX = Math.max(...shelfPos.map((p) => p.x + NODE_W));
    const maxY = Math.max(...shelfPos.map((p) => p.y + NODE_H));
    const width = maxX - minX + 2 * PAD;
    const height = maxY - minY + LABEL_H + 2 * PAD;
    nodes.push({
      id: SHELF_ID,
      type: 'shelf',
      position: { x: minX - PAD, y: minY - LABEL_H - PAD },
      data: { label: 'Foundational' },
      style: { width, height, pointerEvents: 'none' as const },
      initialWidth: width,
      initialHeight: height,
      zIndex: BOUNDARY_Z,
      // No dragHandle, and not draggable: furniture. A hoverable band would dim the whole graph on
      // the way past, and a grab cursor would promise a drag that does not exist.
      selectable: false,
      draggable: false,
    });
  }
  for (const s of shelf) {
    nodes.push({
      id: s.node.id, type: 'ghost', position: pos[s.node.id] ?? { x: 0, y: 0 },
      // No `expandable`: a shelved node is furniture, not a collapsed group.
      data: { ...nodeVisual(s.node), shelfCount: s.count },
      initialWidth: NODE_W, initialHeight: NODE_H,
    });
  }

  for (const n of view.children) {
    nodes.push({
      id: n.id, type: 'node', position: pos[n.id] ?? { x: 0, y: 0 },
      data: nodeVisual(n),
      initialWidth: NODE_W, initialHeight: NODE_H,
    });
  }
  for (const n of view.externals) {
    nodes.push({
      id: n.id, type: 'ghost', position: pos[n.id] ?? { x: 0, y: 0 },
      data: {
        ...nodeVisual(n),
        expandable: view.expandableExternalIds?.has(n.id) ?? false,
      },
      initialWidth: NODE_W, initialHeight: NODE_H,
    });
  }

  // Two connections between the same node pair used to resolve to the identical bezier and stack
  // their labels, which is what the per-pair fanning here existed to undo. routeEdges now gives
  // them different ports, so the case no longer arises.
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

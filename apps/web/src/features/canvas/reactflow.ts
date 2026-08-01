import { MarkerType, type Node as FlowNode, type Edge as FlowEdge } from '@xyflow/react';
import { c4Backend, layerOfType, roleOfNode, roleDefOf, verbClassOf, type Node as ModelNode } from '@hyphae/schema';
import type { FocusView, FocusEdge } from '@/core/focusView';
import { PAD, LABEL_H, DEFAULT_METRICS, type NodeMetrics, type XY } from './layout';
import { layerColorOf, VERB_CLASS_COLOR } from '@/core/verbColors';
import type { HubBadge } from '@/core/hubs';

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

const OBJECT_CAP = 24;

/** "reads camera list" — the verb, plus the object when there is one, capped so a long
 *  object cannot wreck the layout. */
export function edgeLabel(verb: string, object: string): string {
  const obj = object.trim();
  if (!obj) return verb;
  const clipped = obj.length > OBJECT_CAP ? `${obj.slice(0, OBJECT_CAP - 1)}…` : obj;
  return `${verb} ${clipped}`;
}

function realEdge(e: FocusEdge): FlowEdge {
  const verb = e.verb ?? 'uses';
  const color = VERB_CLASS_COLOR[verbClassOf(c4Backend, verb) ?? 'control'];
  return {
    id: e.id,
    type: 'floating',
    source: e.from,
    target: e.to,
    label: edgeLabel(verb, e.object ?? ''),
    style: { stroke: color },
    labelStyle: { fill: color, fontWeight: 500 },
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
    data: { derived: true, count: e.count, realizedBy: e.realizedBy },
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

export type FlowOptions = {
  /** Box size for the `node` / `ghost` types. Grows a badge row when hub quieting is on. */
  metrics?: NodeMetrics;
  /** Quieted edges, re-encoded per neighbour id. */
  badges?: Map<string, HubBadge[]>;
  /** Drawn-edge degree per node, so a quieted hub can show what it is standing in for. */
  hubDegrees?: Map<string, number>;
  /** Which nodes are quieted. Only these get a `hubDegree` in their data, and so a chip. */
  hubIds?: Set<string>;
};

export function focusViewToFlow(view: FocusView, pos: Record<string, XY>, opts: FlowOptions = {}): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const m = opts.metrics ?? DEFAULT_METRICS;
  // A degree is only carried by a node that is actually quieted — it is the chip's label AND the
  // flag that the node is standing in for hidden edges.
  const hubDegree = (id: string) => (opts.hubIds?.has(id) ? opts.hubDegrees?.get(id) : undefined);
  const nodes: FlowNode[] = [];

  // initialWidth/initialHeight are unmeasured-size hints: they don't constrain the real DOM node
  // (React Flow still measures it), but they give the MiniMap node dimensions to draw — otherwise
  // it renders nothing, since we never feed measured sizes back via onNodesChange.
  if (view.focusNode && view.children.length) {
    const xs = view.children.map((n) => pos[n.id]?.x ?? 0);
    const ys = view.children.map((n) => pos[n.id]?.y ?? 0);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs.map((x) => x + m.width));
    const maxY = Math.max(...ys.map((y) => y + m.height));
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
      draggable: false,
      selectable: false,
    });
  } else if (view.focusNode) {
    // No children: render the focus as a plain node so external edges have a valid anchor.
    nodes.push({
      id: view.focusNode.id,
      type: 'node',
      position: pos[view.focusNode.id] ?? { x: 0, y: 0 },
      data: { ...nodeVisual(view.focusNode), width: m.width, height: m.height },
      initialWidth: m.width,
      initialHeight: m.height,
      draggable: false,
    });
  }

  for (const g of view.externalGroups ?? []) {
    const mpos = g.childIds.map((id) => pos[id]).filter(Boolean) as XY[];
    if (!mpos.length) continue;
    const minX = Math.min(...mpos.map((p) => p.x));
    const minY = Math.min(...mpos.map((p) => p.y));
    const maxX = Math.max(...mpos.map((p) => p.x + m.width));
    const maxY = Math.max(...mpos.map((p) => p.y + m.height));
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
      draggable: false,
      selectable: false,
    });
  }

  for (const n of view.children) {
    nodes.push({
      id: n.id, type: 'node', position: pos[n.id] ?? { x: 0, y: 0 },
      data: { ...nodeVisual(n), width: m.width, height: m.height, badges: opts.badges?.get(n.id), hubDegree: hubDegree(n.id) },
      initialWidth: m.width, initialHeight: m.height, draggable: false,
    });
  }
  for (const n of view.externals) {
    nodes.push({
      id: n.id, type: 'ghost', position: pos[n.id] ?? { x: 0, y: 0 },
      data: {
        ...nodeVisual(n), width: m.width, height: m.height, badges: opts.badges?.get(n.id), hubDegree: hubDegree(n.id),
        expandable: view.expandableExternalIds?.has(n.id) ?? false,
      },
      initialWidth: m.width, initialHeight: m.height, draggable: false,
    });
  }

  const edges = view.edges.map((e) => (e.derived ? derivedEdge(e) : realEdge(e)));

  // Two connections between the same node pair resolve to the identical bezier and stack their
  // labels. Tag each with its position within the pair so FloatingEdge can fan them apart. The
  // pair is UNORDERED: A→B and B→A occupy the same curve, so they must share one group.
  const byPair = new Map<string, FlowEdge[]>();
  for (const e of edges) {
    const key = e.source < e.target ? `${e.source}\0${e.target}` : `${e.target}\0${e.source}`;
    const group = byPair.get(key);
    if (group) group.push(e);
    else byPair.set(key, [e]);
  }
  for (const group of byPair.values()) {
    group.forEach((e, i) => { e.data = { ...e.data, offsetIndex: i, offsetCount: group.length }; });
  }

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

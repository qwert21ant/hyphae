import { c4Backend, layerOfType, rollupConnections, type HyphaeModel, type Connection, type RollupConnection } from '@hyphae/schema';
import type { Node as FlowNode, Edge as FlowEdge } from '@xyflow/react';

const NODE_W = 160;
const NODE_H = 44;
const PAD = 24;
const LABEL_H = 22;

export function toFlowNodes(model: HyphaeModel, layer: string, filter?: ConnFilter): FlowNode[] {
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
      // Body is click-through (so edges/nodes inside the box stay selectable);
      // only the title bar (.region__handle) initiates a region drag.
      style: { width: maxX - minX + 2 * PAD, height: maxY - minY + LABEL_H + 2 * PAD, pointerEvents: 'none' as const },
      draggable: true,
      selectable: false,
      dragHandle: '.region__handle',
    };
  });

  // All visible nodes are plain, absolutely-positioned NodeBox nodes (no RF parenting).
  const nodes: FlowNode[] = visible.map((n) => ({
    id: n.id,
    type: 'node',
    position: abs.get(n.id)!,
    data: { label: `${n.name}\n(${n.type})` },
  }));

  // Ghost nodes: higher-layer endpoints (e.g. external systems) of cross-layer edges, dropped in
  // on this layer so their connections are visible. Rendered distinctly (the `ghost` node type).
  const ghosts: FlowNode[] = [];
  if (isRollupLayer(layer)) {
    const byId = new Map(model.nodes.map((n) => [n.id, n]));
    let i = 0;
    for (const id of crossLayerEdges(model, layer, filter).foreign) {
      const n = byId.get(id);
      if (!n) continue;
      ghosts.push({
        id,
        type: 'ghost',
        position: pos[id] ?? { x: 80 + (i % 5) * 200, y: -140 },
        data: { label: `${n.name}\n(${n.type})` },
      });
      i++;
    }
  }

  // Regions first so they paint behind their children; ghosts last so they sit on top.
  return [...regions, ...nodes, ...ghosts];
}

/** Ids of the visible nodes that belong to a given parent region on a layer. */
export function regionChildIds(model: HyphaeModel, layer: string, parentId: string): Set<string> {
  return new Set(
    model.nodes
      .filter((n) => layerOfType(c4Backend, n.type) === layer && n.parentId === parentId)
      .map((n) => n.id),
  );
}

function realEdge(c: Connection): FlowEdge {
  return {
    id: c.id,
    type: 'floating',
    source: c.from,
    target: c.to,
    label: c.transport && c.transport !== 'None' ? `${c.relationCategory} / ${c.transport}` : c.relationCategory,
  };
}

/** A rolled-up higher-level edge: dashed + tinted, non-interactive, labelled with how many
 *  underlying connections it aggregates. Carries `derived` + `realizedBy` in `data`. */
function derivedEdge(e: RollupConnection): FlowEdge {
  return {
    id: `rollup:${e.from}:${e.to}`,
    type: 'floating',
    source: e.from,
    target: e.to,
    label: String(e.realizedBy.length),
    data: { derived: true, realizedBy: e.realizedBy },
    selectable: false,
    deletable: false,
    focusable: false,
    style: { stroke: '#7c3aed', strokeDasharray: '6 4', strokeWidth: 2 },
    labelStyle: { color: '#6d28d9', fontWeight: 600 },
    labelBgStyle: { background: '#ede9fe' },
  };
}

export type ConnFilter = { relationCategories: string[]; transports: string[] };

function matchesFilter(c: Connection, f: ConnFilter): boolean {
  if (f.relationCategories.length && !f.relationCategories.includes(c.relationCategory)) return false;
  if (f.transports.length && !f.transports.includes(c.transport ?? 'None')) return false;
  return true;
}

function nativeIds(model: HyphaeModel, layer: string): Set<string> {
  return new Set(model.nodes.filter((n) => layerOfType(c4Backend, n.type) === layer).map((n) => n.id));
}

const isRollupLayer = (layer: string) => layer === 'Container' || layer === 'Context';

/**
 * Rollup edges for a Container/Context layer, keeping any edge with at least one endpoint native
 * to the layer. Endpoints that live on a higher layer (e.g. an ExternalSystem on the Container
 * layer) are collected in `foreign` so the caller can drop them in as ghost nodes.
 */
export function crossLayerEdges(model: HyphaeModel, layer: string, filter?: ConnFilter): { edges: FlowEdge[]; foreign: Set<string> } {
  const native = nativeIds(model, layer);
  const connections = filter ? model.connections.filter((c) => matchesFilter(c, filter)) : model.connections;
  const connById = new Map(connections.map((c) => [c.id, c]));
  const foreign = new Set<string>();
  const edges = rollupConnections({ ...model, connections }, layer)
    .filter((e) => native.has(e.from) || native.has(e.to))
    .map((e) => {
      if (!native.has(e.from)) foreign.add(e.from);
      if (!native.has(e.to)) foreign.add(e.to);
      // An authored edge that already connects these two nodes directly renders as a normal edge.
      if (e.realizedBy.length === 1) {
        const c = connById.get(e.realizedBy[0]);
        if (c && c.from === e.from && c.to === e.to) return realEdge(c);
      }
      return derivedEdge(e);
    });
  return { edges, foreign };
}

export function toFlowEdges(model: HyphaeModel, layer: string, filter?: ConnFilter): FlowEdge[] {
  if (isRollupLayer(layer)) return crossLayerEdges(model, layer, filter).edges;
  // Component (and any non-aggregated) layer: the raw connections between visible nodes.
  const native = nativeIds(model, layer);
  const connections = filter ? model.connections.filter((c) => matchesFilter(c, filter)) : model.connections;
  return connections.filter((c) => native.has(c.from) && native.has(c.to)).map(realEdge);
}

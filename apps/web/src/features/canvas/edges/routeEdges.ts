import { Position } from '@xyflow/react';
import { NODE_W, NODE_H, type XY } from '@/features/canvas/layout';
import { chooseSides, portCount, portPoint, type Box, type NodeKind } from './ports';
import { assignLanes, laneX, type Span } from './lanes';

export type Route = {
  sourceSide: Position; sourcePort: number; sourcePortCount: number;
  targetSide: Position; targetPort: number; targetPortCount: number;
  /** Absolute x of the gutter lane this edge runs down. Absent when it needs no vertical run. */
  lane?: number;
};

export type RouteInput = { id: string; source: string; target: string };

/**
 * Absolute x, from the layout, of where each gutter BEGINS — the right edge of the left column, and
 * the right edge of the children cluster — plus the cluster's own bounds.
 */
export type Gutters = {
  leftGutterX: number; rightGutterX: number; clusterMinX: number; clusterMaxX: number;
};

const boxAt = (p: XY): Box => ({ x: p.x, y: p.y, width: NODE_W, height: NODE_H });
const centreY = (p: XY) => p.y + NODE_H / 2;
const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
/** Composite map key. `::` rather than a NUL separator: node ids are UUIDs and the other parts are
 *  lowercase words, so `::` is already unambiguous, and a source file containing a raw NUL byte is
 *  silently skipped by ripgrep as binary. */
const key = (...parts: string[]) => parts.join('::');

/**
 * The per-view assignment pass: which face, which port, which lane, for every edge.
 *
 * It deliberately returns no absolute NODE coordinates — only sides, port indices and a gutter x.
 * FloatingEdge resolves those against React Flow's live measured geometry, which is what lets an
 * edge follow a node every frame of a drag while its port and lane stay put until the drag ends.
 *
 * Deterministic for a given input: every sort breaks ties on edge id.
 */
export function routeEdges(
  edges: RouteInput[],
  positions: Record<string, XY>,
  kinds: Record<string, NodeKind>,
  gutters: Gutters,
): Record<string, Route> {
  const drawable = edges
    .filter((e) => positions[e.source] && positions[e.target])
    .slice()
    .sort((a, b) => byId(a.id, b.id));

  // 1. Sides.
  const sides = new Map<string, { sourceSide: Position; targetSide: Position }>();
  for (const e of drawable) {
    sides.set(e.id, chooseSides(
      boxAt(positions[e.source]), boxAt(positions[e.target]),
      kinds[e.source] ?? 'child', kinds[e.target] ?? 'child',
    ));
  }

  // 2. Ports. Group by (node, side), order by the barycentre of the OTHER endpoint, then hand out
  //    indices in that order — the same trick layout.ts uses to order the external columns. It is
  //    what stops two edges inverting their order in the last few pixels and crossing at the box.
  type Slot = { edgeId: string; end: 'source' | 'target'; order: number };
  const bySide = new Map<string, { side: Position; slots: Slot[] }>();
  for (const e of drawable) {
    const s = sides.get(e.id)!;
    const push = (node: string, side: Position, end: 'source' | 'target', other: string) => {
      const k = key(node, side);
      const group = bySide.get(k) ?? { side, slots: [] };
      const horizontal = side === Position.Left || side === Position.Right;
      group.slots.push({
        edgeId: e.id, end,
        order: horizontal ? centreY(positions[other]) : positions[other].x,
      });
      bySide.set(k, group);
    };
    push(e.source, s.sourceSide, 'source', e.target);
    push(e.target, s.targetSide, 'target', e.source);
  }

  const portOf = new Map<string, number>();     // key(edgeId, end) -> port index
  const countOf = new Map<string, number>();    // key(edgeId, end) -> ports on that side
  // The side travels WITH the group rather than being parsed back out of the map key — a key is for
  // lookup, not for storage.
  for (const { side, slots } of bySide.values()) {
    const len = side === Position.Left || side === Position.Right ? NODE_H : NODE_W;
    const n = slots.length;
    // A side of NODE_H carries only 3 ports, and a hub can want twelve. Clamping the overflow to
    // the last port stacked ten edges on ONE point, which fanned them across the gutter and cost
    // more crossings than the free-anchor router it replaced. So the grid is a preference, not a
    // cap: when demand exceeds it the side degrades to a continuum and every edge keeps a distinct
    // landing. One formula covers both regimes —
    //   n <= ports: count is the grid, and the edges spread across the WHOLE side (n=1 lands mid-side)
    //   n >  ports: count is n, so index === i and no two edges share a point
    const count = Math.max(portCount(len), n);
    slots.sort((a, b) => a.order - b.order || byId(a.edgeId, b.edgeId));
    slots.forEach((slot, i) => {
      portOf.set(key(slot.edgeId, slot.end), Math.floor(((i + 0.5) * count) / n));
      countOf.set(key(slot.edgeId, slot.end), count);
    });
  }

  // 3. Lanes, one channel per gutter. Only an edge that both crosses a gutter and actually changes
  //    height needs one; an aligned pair is a straight horizontal and consumes nothing.
  const gutterOf = (e: RouteInput): 'left' | 'right' | null => {
    const extIsSource = (kinds[e.source] ?? 'child') === 'external';
    const extIsTarget = (kinds[e.target] ?? 'child') === 'external';
    if (extIsSource === extIsTarget) return null;   // both children, or both external
    const extX = extIsSource ? positions[e.source].x : positions[e.target].x;
    return extX < gutters.clusterMinX ? 'left' : extX >= gutters.clusterMaxX ? 'right' : null;
  };

  const anchorOf = (e: RouteInput, end: 'source' | 'target') => {
    const nodeId = end === 'source' ? e.source : e.target;
    const s = sides.get(e.id)!;
    return portPoint(
      boxAt(positions[nodeId]),
      end === 'source' ? s.sourceSide : s.targetSide,
      portOf.get(key(e.id, end))!,
      countOf.get(key(e.id, end))!,
    );
  };

  const spans: Record<'left' | 'right', Span[]> = { left: [], right: [] };
  const needsLane = new Map<string, 'left' | 'right'>();
  for (const e of drawable) {
    const g = gutterOf(e);
    if (!g) continue;
    const a = anchorOf(e, 'source');
    const b = anchorOf(e, 'target');
    if (a.y === b.y) continue;   // straight horizontal: no vertical run, no lane
    needsLane.set(e.id, g);
    spans[g].push({ id: e.id, y0: a.y, y1: b.y });
  }
  const laneIdx = { left: assignLanes(spans.left), right: assignLanes(spans.right) };
  const gutterX = { left: gutters.leftGutterX, right: gutters.rightGutterX };

  // 4. Assemble.
  const out: Record<string, Route> = {};
  for (const e of drawable) {
    const s = sides.get(e.id)!;
    const g = needsLane.get(e.id);
    out[e.id] = {
      sourceSide: s.sourceSide,
      sourcePort: portOf.get(key(e.id, 'source'))!,
      sourcePortCount: countOf.get(key(e.id, 'source'))!,
      targetSide: s.targetSide,
      targetPort: portOf.get(key(e.id, 'target'))!,
      targetPortCount: countOf.get(key(e.id, 'target'))!,
      ...(g ? { lane: laneX(gutterX[g], laneIdx[g][e.id]) } : {}),
    };
  }
  return out;
}

/** For an edge the assignment pass never saw — it faces the two boxes at each other, mid-side. */
export function fallbackRoute(source: XY, target: XY): Route {
  const s = chooseSides(boxAt(source), boxAt(target), 'child', 'child');
  return {
    sourceSide: s.sourceSide, sourcePort: 0, sourcePortCount: 1,
    targetSide: s.targetSide, targetPort: 0, targetPortCount: 1,
  };
}

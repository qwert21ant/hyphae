import dagre from '@dagrejs/dagre';
import type { FocusView } from '@/core/focusView';
import { assignLanes, laneSlots, gutterWidth, type Span } from './edges/lanes';

// Node box size. Sized to fit a name line, a TWO-line summary, and the technology chip at the
// font sizes NodeBox uses (12/10/9px at line-height 1.25, 6px vertical padding, 2px gaps):
// 15 + 2*12.5 + 11.25 + 2*2 + 12 ≈ 67, plus slack so a descender or a wider chip never clips.
// dagre, the minimap and region sizing all derive from these constants, so they follow along.
export const NODE_W = 220;
export const NODE_H = 92;
/** Summary lines shown on a node box before ellipsis. NODE_H is sized around this. */
export const SUMMARY_LINES = 2;
export const PAD = 24;
export const LABEL_H = 22;

export type XY = { x: number; y: number };

// The historical fixed gap between the children cluster and an external column. Now only the FLOOR
// that gutterWidth() enforces — the real gap is derived per gutter from how many lanes it needs.
const COL_GAP = 120;
const NODE_SEP = 56;  // dagre's within-rank gap. Was 40 — the grid packing below buys back the width
const RANK_SEP = 104; // dagre's between-rank gap. Was 80

/** Columns in the grid that holds children dagre could not rank. */
export const GRID_COLS = 4;
// Vertical PITCH (not gap) between stacked external boxes, so it must stay larger than NODE_H or
// the boxes overlap — derived from NODE_H rather than hardcoded so growing the box can't break it.
export const ROW_GAP = NODE_H + 12;
export const MEMBER_PITCH = ROW_GAP; // expanded-group members stack at the same pitch as externals

/** The rendered height of an expanded group's box wrapping `n` members. */
export function groupBoxHeight(n: number): number {
  return LABEL_H + 2 * PAD + Math.max(0, n - 1) * MEMBER_PITCH + NODE_H;
}

/**
 * Base structural layout: children placed by dagre from their inner edges; externals placed as
 * single boxes in incoming (left) / outgoing (right) columns beside the cluster. Deterministic.
 *
 * Call this on the full / unfiltered / full-audience / COLLAPSED view to get stable slots for every
 * child and every collapsed external. The actually-rendered view (which may be filtered, in
 * stakeholder mode, or have expanded externals) is mapped onto these slots by resolveViewPositions,
 * so the connection filter, the audience toggle, and expansion never reflow the whole graph.
 */
export function layoutFocusView(view: FocusView): Record<string, XY> {
  const childIds = new Set(view.children.map((n) => n.id));
  const pos: Record<string, XY> = {};
  const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

  // Partition: a child dagre can rank (it has at least one edge to a sibling) versus one it cannot.
  // An unranked child gets no useful position from dagre — they all land together in rank 0, which
  // is what turned a 12-child focus into a single ~3000px row that every external edge crossed.
  const connected = view.children.filter((n) =>
    view.edges.some((e) => (e.from === n.id && childIds.has(e.to)) || (e.to === n.id && childIds.has(e.from))));
  const isolatedKids = view.children.filter((n) => !connected.includes(n));

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: NODE_SEP, ranksep: RANK_SEP, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of connected) g.setNode(n.id, { width: NODE_W, height: NODE_H });
  for (const e of view.edges) if (childIds.has(e.from) && childIds.has(e.to)) g.setEdge(e.from, e.to);
  if (connected.length) dagre.layout(g);
  for (const n of connected) {
    const d = g.node(n.id);
    pos[n.id] = d ? { x: d.x - NODE_W / 2, y: d.y - NODE_H / 2 } : { x: 0, y: 0 };
  }

  // The unranked remainder, packed into a GRID_COLS-wide block below the ranked core and centred
  // on it. Ordered by id so the block is stable across runs.
  if (isolatedKids.length) {
    const rankedXs = connected.map((n) => pos[n.id].x);
    const rankedYs = connected.map((n) => pos[n.id].y);
    const coreLeft = rankedXs.length ? Math.min(...rankedXs) : 0;
    const coreRight = rankedXs.length ? Math.max(...rankedXs) + NODE_W : NODE_W;
    const coreBottom = rankedYs.length ? Math.max(...rankedYs) + NODE_H + RANK_SEP : 0;
    const cols = Math.min(GRID_COLS, isolatedKids.length);
    const pitchX = NODE_W + NODE_SEP;
    const gridW = (cols - 1) * pitchX + NODE_W;
    const left = (coreLeft + coreRight) / 2 - gridW / 2;
    const ids = isolatedKids.map((n) => n.id).sort(byId);
    ids.forEach((id, i) => {
      pos[id] = { x: left + (i % cols) * pitchX, y: coreBottom + Math.floor(i / cols) * ROW_GAP };
    });
  }

  // When the focus node has no children, give it a slot at the origin so edges can anchor on it.
  if (view.focusNode && view.children.length === 0) pos[view.focusNode.id] = { x: 0, y: 0 };

  // Children bounding box (fall back to origin when there are no children).
  const xs = view.children.map((n) => pos[n.id].x);
  const ys = view.children.map((n) => pos[n.id].y);
  const minX = xs.length ? Math.min(...xs) : 0;
  const maxX = xs.length ? Math.max(...xs) + NODE_W : NODE_W;
  const minY = ys.length ? Math.min(...ys) : 0;
  const maxY = ys.length ? Math.max(...ys) + NODE_H : NODE_H;
  const midY = (minY + maxY) / 2;

  const incoming = view.externals.filter((ext) => view.edges.some((e) => e.from === ext.id)).map((n) => n.id);
  const outgoing = view.externals.filter((ext) => !view.edges.some((e) => e.from === ext.id)).map((n) => n.id);
  // Barycentre: the mean y of the already-placed in-view neighbours. Sorting the column this way
  // instead of by id is where most of the crossing reduction comes from — a UUID sort is random
  // with respect to the graph, so an external feeding the topmost child could land at the bottom of
  // its column and drag its edge across everything. An external with no placed neighbour keeps the
  // id order, so the result stays fully deterministic.
  const barycentre = (id: string): number | null => {
    const ys: number[] = [];
    for (const e of view.edges) {
      const other = e.from === id ? e.to : e.to === id ? e.from : null;
      if (other === null || other === id) continue;
      const p = pos[other];
      if (p) ys.push(p.y);
    }
    return ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : null;
  };
  const byBarycentre = (a: string, b: string) => {
    const ba = barycentre(a);
    const bb = barycentre(b);
    if (ba === null || bb === null || ba === bb) return byId(a, b);
    return ba - bb;
  };
  incoming.sort(byBarycentre);
  outgoing.sort(byBarycentre);

  const placeColumn = (ids: string[], x: number) => {
    const totalH = Math.max(0, ids.length - 1) * ROW_GAP;
    ids.forEach((id, i) => { pos[id] = { x, y: midY - totalH / 2 + i * ROW_GAP - NODE_H / 2 }; });
  };
  // Place the columns TWICE. Lane demand depends only on the Y spans of the runs, and a column's y
  // is fixed by midY and ROW_GAP while the gap moves only x — so a provisional placement yields the
  // EXACT lane count, and re-placing the columns at the widened gap cannot invalidate it.
  placeColumn(incoming, minX - COL_GAP - NODE_W);
  placeColumn(outgoing, maxX + COL_GAP);

  const laneDemand = (ids: string[]): number => {
    const set = new Set(ids);
    const spans: Span[] = [];
    for (const e of view.edges) {
      const ext = set.has(e.from) ? e.from : set.has(e.to) ? e.to : null;
      if (ext === null) continue;
      const a = pos[e.from];
      const b = pos[e.to];
      if (!a || !b) continue;
      const y0 = a.y + NODE_H / 2;
      const y1 = b.y + NODE_H / 2;
      if (y0 === y1) continue;   // straight horizontal: consumes no lane
      spans.push({ id: e.id, y0, y1 });
    }
    return laneSlots(assignLanes(spans));
  };

  placeColumn(incoming, minX - gutterWidth(laneDemand(incoming)) - NODE_W);
  placeColumn(outgoing, maxX + gutterWidth(laneDemand(outgoing)));

  return pos;
}

/**
 * Where each gutter BEGINS and where the children cluster sits, in absolute x — the shape
 * routeEdges consumes.
 *
 * The left gutter is the empty band between the right edge of the left column and the cluster; the
 * right gutter is the band between the cluster and the left edge of the right column. So
 * `rightGutterX` is simply `clusterMaxX`: the right gutter starts where the cluster ends. Both are
 * kept as named fields because "left" on its own reads as either "the left gutter" or "the left
 * edge of a gutter", and that ambiguity is worth a redundant field.
 */
export function gutterGeometry(
  view: FocusView, pos: Record<string, XY>,
): { leftGutterX: number; rightGutterX: number; clusterMinX: number; clusterMaxX: number } {
  const xs = view.children.map((n) => pos[n.id]?.x).filter((x): x is number => x !== undefined);
  const clusterMinX = xs.length ? Math.min(...xs) : 0;
  const clusterMaxX = xs.length ? Math.max(...xs) + NODE_W : NODE_W;
  const extXs = view.externals.map((n) => pos[n.id]?.x).filter((x): x is number => x !== undefined);
  const leftCol = extXs.filter((x) => x < clusterMinX);
  return {
    // Right edge of the rightmost left-column box; with no left column, the historical gap.
    leftGutterX: leftCol.length ? Math.max(...leftCol) + NODE_W : clusterMinX - COL_GAP,
    rightGutterX: clusterMaxX,
    clusterMinX,
    clusterMaxX,
  };
}

/**
 * Session-only manual positions layered over the computed ones. Applied LAST, after
 * resolveViewPositions, so a dragged node keeps its place while the connection filter and the
 * audience toggle go on leaving the rest of the graph alone. An override for a node that is not in
 * the view is ignored rather than added, so a stale id from a previous focus cannot create a
 * position for a node that has no slot.
 */
export function applyDragOverrides(base: Record<string, XY>, overrides: Record<string, XY>): Record<string, XY> {
  const ids = Object.keys(overrides).filter((id) => id in base);
  if (!ids.length) return base;
  const out = { ...base };
  for (const id of ids) out[id] = overrides[id];
  return out;
}

/** A drag in progress: what is being moved, from where, and the contents it carries. */
export type DragState = {
  id: string;
  /** 'ghostGroup' and 'region' carry members; anything else moves alone. */
  type: string;
  /** Where the dragged node was rendered when the drag began. */
  start: XY;
  /**
   * A ghost group's BASE SLOT at drag start, which is not the same thing as `start`. The box is
   * drawn wrapping its members, so its position is `min(members) - padding`; that coincides with
   * the slot only while member 0 is still the topmost one. Drag member 0 below its siblings and the
   * box sits a whole MEMBER_PITCH lower than the slot it is anchored to.
   */
  slot?: XY;
  members: { id: string; start: XY }[];
};

/**
 * What dragging a node commits to the session position overrides.
 *
 * - A plain node or ghost commits itself.
 * - A GHOST GROUP commits its own id, because that id IS its collapsed ghost's base slot: every
 *   member still derived from the slot follows through resolveViewPositions, and the move survives
 *   collapsing the group back to a single box. It commits the SLOT moved by the drag delta, not the
 *   box's own position — see `DragState.slot`; committing the box position shifted every derived
 *   member by however far the box had drifted from the slot. A member that was dragged INDIVIDUALLY
 *   is the other exception — it carries its own absolute override and no longer derives from the
 *   slot, so it must be shifted by the same delta or it stays behind while its siblings move.
 * - A REGION has no slot of its own (it is derived from its children), so it commits every child.
 *
 * Everything the drag carries therefore moves by exactly the drag delta, and nothing else moves.
 */
export function dragCommit(d: DragState, to: XY, overrides: Record<string, XY>): Record<string, XY> {
  const dx = to.x - d.start.x;
  const dy = to.y - d.start.y;
  const shifted = (m: { start: XY }) => ({ x: m.start.x + dx, y: m.start.y + dy });
  if (!d.members.length) return { [d.id]: to };
  if (d.type === 'ghostGroup') {
    const patch: Record<string, XY> = { [d.id]: shifted({ start: d.slot ?? d.start }) };
    for (const m of d.members) if (overrides[m.id]) patch[m.id] = shifted(m);
    return patch;
  }
  return Object.fromEntries(d.members.map((m) => [m.id, shifted(m)]));
}

/**
 * Map a rendered view onto stable `base` slots (from layoutFocusView on the collapsed base view):
 * - children and a childless focus node keep their base position (so filtering connections or
 *   switching audience never moves them);
 * - a collapsed external keeps its base slot (a filtered-out sibling just leaves a gap — no
 *   re-centering);
 * - an expanded external's group is anchored at its collapsed ghost's base slot (same base x ⇒ same
 *   column ⇒ same side), its members stacked downward at MEMBER_PITCH; only lower items in that same
 *   column are pushed down to make room (children and the opposite column never move).
 */
export function resolveViewPositions(view: FocusView, base: Record<string, XY>): Record<string, XY> {
  const pos: Record<string, XY> = {};
  for (const n of view.children) if (base[n.id]) pos[n.id] = base[n.id];
  if (view.focusNode && base[view.focusNode.id]) pos[view.focusNode.id] = base[view.focusNode.id];

  const groups = view.externalGroups ?? [];
  const memberIds = new Set(groups.flatMap((g) => g.childIds));
  type Item = { id: string; members?: string[] };
  const items: Item[] = [];
  for (const ext of view.externals) if (!memberIds.has(ext.id)) items.push({ id: ext.id });
  for (const g of groups) items.push({ id: g.id, members: g.childIds });

  // Group items into columns keyed by their collapsed ghost's base x (all collapsed externals in a
  // column share that x; a group's column x is its collapsed ghost's base x).
  const cols = new Map<number, Item[]>();
  for (const it of items) {
    const b = base[it.id];
    if (!b) continue; // no stable slot (base is the superset, so this shouldn't happen) — skip defensively
    const col = cols.get(b.x);
    if (col) col.push(it); else cols.set(b.x, [it]);
  }
  for (const col of cols.values()) {
    col.sort((a, b) => base[a.id].y - base[b.id].y);
    let offset = 0;
    for (const it of col) {
      const b = base[it.id];
      const y = b.y + offset;
      if (it.members) {
        it.members.forEach((mid, i) => { pos[mid] = { x: b.x + PAD, y: y + LABEL_H + PAD + i * MEMBER_PITCH }; });
        offset += groupBoxHeight(it.members.length) - NODE_H; // reserve extra room below the group
      } else {
        pos[it.id] = { x: b.x, y };
      }
    }
  }
  return pos;
}

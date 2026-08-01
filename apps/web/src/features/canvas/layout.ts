import dagre from '@dagrejs/dagre';
import type { FocusView } from '@/core/focusView';

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

const COL_GAP = 120;  // horizontal gap between the children cluster and an external column
// Vertical PITCH (not gap) between stacked external boxes, so it must stay larger than NODE_H or
// the boxes overlap — derived from NODE_H rather than hardcoded so growing the box can't break it.
export const ROW_GAP = NODE_H + 12;
export const MEMBER_PITCH = ROW_GAP; // expanded-group members stack at the same pitch as externals

/**
 * The rendered size of one node box. A parameter rather than a constant because turning hub
 * quieting on adds a badge row to every box, and dagre, the external columns, the group boxes and
 * the region box all have to agree about it — a second constant would let one of them disagree.
 */
export type NodeMetrics = { width: number; height: number };
export const DEFAULT_METRICS: NodeMetrics = { width: NODE_W, height: NODE_H };

/** Height of the hub-badge row NodeBox/GhostNode render when quieting is on. */
export const BADGE_ROW_H = 16;
export const withBadgeRow = (m: NodeMetrics): NodeMetrics => ({ ...m, height: m.height + BADGE_ROW_H });

/** Vertical PITCH (not gap) between stacked boxes — must stay larger than the box height. */
export const rowGap = (m: NodeMetrics = DEFAULT_METRICS): number => m.height + 12;

/** The rendered height of an expanded group's box wrapping `n` members. */
export function groupBoxHeight(n: number, m: NodeMetrics = DEFAULT_METRICS): number {
  return LABEL_H + 2 * PAD + Math.max(0, n - 1) * rowGap(m) + m.height;
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
export function layoutFocusView(view: FocusView, m: NodeMetrics = DEFAULT_METRICS): Record<string, XY> {
  const childIds = new Set(view.children.map((n) => n.id));
  const pos: Record<string, XY> = {};

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 80, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of view.children) g.setNode(n.id, { width: m.width, height: m.height });
  for (const e of view.edges) if (childIds.has(e.from) && childIds.has(e.to)) g.setEdge(e.from, e.to);
  dagre.layout(g);
  for (const n of view.children) {
    const d = g.node(n.id);
    pos[n.id] = d ? { x: d.x - m.width / 2, y: d.y - m.height / 2 } : { x: 0, y: 0 };
  }

  // When the focus node has no children, give it a slot at the origin so edges can anchor on it.
  if (view.focusNode && view.children.length === 0) pos[view.focusNode.id] = { x: 0, y: 0 };

  // Children bounding box (fall back to origin when there are no children).
  const xs = view.children.map((n) => pos[n.id].x);
  const ys = view.children.map((n) => pos[n.id].y);
  const minX = xs.length ? Math.min(...xs) : 0;
  const maxX = xs.length ? Math.max(...xs) + m.width : m.width;
  const minY = ys.length ? Math.min(...ys) : 0;
  const maxY = ys.length ? Math.max(...ys) + m.height : m.height;
  const midY = (minY + maxY) / 2;

  const incoming = view.externals.filter((ext) => view.edges.some((e) => e.from === ext.id)).map((n) => n.id);
  const outgoing = view.externals.filter((ext) => !view.edges.some((e) => e.from === ext.id)).map((n) => n.id);
  const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

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

  const pitch = rowGap(m);
  const placeColumn = (ids: string[], x: number) => {
    const totalH = Math.max(0, ids.length - 1) * pitch;
    ids.forEach((id, i) => { pos[id] = { x, y: midY - totalH / 2 + i * pitch - m.height / 2 }; });
  };
  placeColumn(incoming, minX - COL_GAP - m.width);
  placeColumn(outgoing, maxX + COL_GAP);

  return pos;
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
export function resolveViewPositions(view: FocusView, base: Record<string, XY>, m: NodeMetrics = DEFAULT_METRICS): Record<string, XY> {
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
        it.members.forEach((mid, i) => { pos[mid] = { x: b.x + PAD, y: y + LABEL_H + PAD + i * rowGap(m) }; });
        offset += groupBoxHeight(it.members.length, m) - m.height; // reserve extra room below the group
      } else {
        pos[it.id] = { x: b.x, y };
      }
    }
  }
  return pos;
}

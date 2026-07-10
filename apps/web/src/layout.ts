import dagre from '@dagrejs/dagre';
import type { FocusView } from './focusView';

export const NODE_W = 160;
export const NODE_H = 44;
export const PAD = 24;
export const LABEL_H = 22;

export type XY = { x: number; y: number };

const COL_GAP = 120;  // horizontal gap between the children cluster and an external column
export const ROW_GAP = 70;   // vertical gap between stacked externals

/** Children laid out by their inner edges via dagre; externals placed in incoming (left)
 *  / outgoing (right) columns beside the resulting cluster. Deterministic. */
export function layoutFocusView(view: FocusView): Record<string, XY> {
  const childIds = new Set(view.children.map((n) => n.id));
  const pos: Record<string, XY> = {};

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 80, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of view.children) g.setNode(n.id, { width: NODE_W, height: NODE_H });
  for (const e of view.edges) {
    if (childIds.has(e.from) && childIds.has(e.to)) g.setEdge(e.from, e.to);
  }
  dagre.layout(g);
  for (const n of view.children) {
    const d = g.node(n.id);
    pos[n.id] = d ? { x: d.x - NODE_W / 2, y: d.y - NODE_H / 2 } : { x: 0, y: 0 };
  }

  // When the focus node has no children, give it a slot at the origin so edges can anchor on it.
  if (view.focusNode && view.children.length === 0) {
    pos[view.focusNode.id] = { x: 0, y: 0 };
  }

  // Children bounding box (fall back to origin when there are no children).
  const xs = view.children.map((n) => pos[n.id].x);
  const ys = view.children.map((n) => pos[n.id].y);
  const minX = xs.length ? Math.min(...xs) : 0;
  const maxX = xs.length ? Math.max(...xs) + NODE_W : NODE_W;
  const minY = ys.length ? Math.min(...ys) : 0;
  const maxY = ys.length ? Math.max(...ys) + NODE_H : NODE_H;
  const midY = (minY + maxY) / 2;

  const MEMBER_GAP = 16; // vertical gap between stacked group members
  const ITEM_GAP = ROW_GAP - NODE_H; // gap between column items; preserves the original ROW_GAP pitch for standalone externals

  // A column item is either a standalone external or an expanded group (its members).
  const groups = view.externalGroups ?? [];
  const memberOf = new Map<string, string>();
  for (const g of groups) for (const cid of g.childIds) memberOf.set(cid, g.id);
  type Item = { ids: string[]; group: boolean };
  const items: Item[] = [];
  for (const ext of view.externals) if (!memberOf.has(ext.id)) items.push({ ids: [ext.id], group: false });
  for (const g of groups) items.push({ ids: g.childIds, group: true });

  const itemHeight = (it: Item) =>
    it.group ? it.ids.length * NODE_H + (it.ids.length - 1) * MEMBER_GAP + LABEL_H + 2 * PAD : NODE_H;
  const isIncoming = (it: Item) => view.edges.some((ed) => it.ids.includes(ed.from));

  const incoming = items.filter(isIncoming);
  const outgoing = items.filter((it) => !isIncoming(it));

  const placeColumn = (col: Item[], x: number) => {
    const totalH = col.reduce((h, it) => h + itemHeight(it), 0) + Math.max(0, col.length - 1) * ITEM_GAP;
    let y = midY - totalH / 2;
    for (const it of col) {
      if (it.group) {
        // members stacked below the group's label band, indented by PAD
        it.ids.forEach((id, i) => { pos[id] = { x: x + PAD, y: y + LABEL_H + PAD + i * (NODE_H + MEMBER_GAP) }; });
      } else {
        pos[it.ids[0]] = { x, y };
      }
      y += itemHeight(it) + ITEM_GAP;
    }
  };
  placeColumn(incoming, minX - COL_GAP - NODE_W);
  placeColumn(outgoing, maxX + COL_GAP);

  return pos;
}

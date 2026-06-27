import dagre from '@dagrejs/dagre';
import type { FocusView } from './focusView';

export const NODE_W = 160;
export const NODE_H = 44;

export type XY = { x: number; y: number };

const COL_GAP = 120;  // horizontal gap between the children cluster and an external column
const ROW_GAP = 70;   // vertical gap between stacked externals

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

  // Children bounding box (fall back to origin when there are no children).
  const xs = view.children.map((n) => pos[n.id].x);
  const ys = view.children.map((n) => pos[n.id].y);
  const minX = xs.length ? Math.min(...xs) : 0;
  const maxX = xs.length ? Math.max(...xs) + NODE_W : NODE_W;
  const minY = ys.length ? Math.min(...ys) : 0;
  const maxY = ys.length ? Math.max(...ys) + NODE_H : NODE_H;
  const midY = (minY + maxY) / 2;

  const incoming: string[] = []; // externals that are a source of some edge → left
  const outgoing: string[] = []; // otherwise → right
  for (const ext of view.externals) {
    (view.edges.some((e) => e.from === ext.id) ? incoming : outgoing).push(ext.id);
  }
  incoming.sort();
  outgoing.sort();

  const placeColumn = (ids: string[], x: number) => {
    const totalH = Math.max(0, ids.length - 1) * ROW_GAP;
    ids.forEach((id, i) => { pos[id] = { x, y: midY - totalH / 2 + i * ROW_GAP - NODE_H / 2 }; });
  };
  placeColumn(incoming, minX - COL_GAP - NODE_W);
  placeColumn(outgoing, maxX + COL_GAP);

  return pos;
}

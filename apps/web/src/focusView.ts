import { c4Backend, layerOfType, type HyphaeModel, type Node, type Connection } from '@hyphae/schema';

export type ConnFilter = { kinds: string[]; fields: Record<string, string[]> };

export type FocusEdge = {
  id: string;
  from: string;
  to: string;
  kind: string | null; // connection type for a 1:1 real edge; null when aggregated
  count: number;       // underlying connections represented
  derived: boolean;    // aggregated/collapsed (dashed) edge
};

export type FocusView = {
  focusId: string | null;
  focusNode: Node | null;
  children: Node[];   // direct children, or all roots at the root view
  externals: Node[];  // representative peer-level external boxes
  edges: FocusEdge[];
};

export type Crumb = { id: string | null; name: string };

const indexOfLayer = (layer: string | undefined): number =>
  layer ? c4Backend.layers.indexOf(layer) : -1;

function matchesFilter(c: Connection, f: ConnFilter): boolean {
  if (f.kinds.length && !f.kinds.includes(c.type)) return false;
  for (const [key, vals] of Object.entries(f.fields)) {
    if (vals.length && !vals.includes(String(c.fields[key] ?? ''))) return false;
  }
  return true;
}

/**
 * The node that should represent `endpointId` in a view focused at `focusLayer`:
 * - at or above the focus layer → the endpoint itself (e.g. an ExternalSystem stays itself);
 * - below the focus layer → its ancestor on the focus layer (its peer of the focus node).
 */
export function representative(model: HyphaeModel, endpointId: string, focusLayer: string): string {
  const nodes = new Map(model.nodes.map((n) => [n.id, n]));
  const fi = indexOfLayer(focusLayer);
  let cur = nodes.get(endpointId);
  if (!cur) return endpointId;
  if (indexOfLayer(layerOfType(c4Backend, cur.type)) <= fi) return endpointId;
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    if (layerOfType(c4Backend, cur.type) === focusLayer) return cur.id;
    if (!cur.parentId) return cur.id;
    const p = nodes.get(cur.parentId);
    if (!p) return cur.id;
    cur = p;
  }
  return endpointId;
}

export function buildFocusView(model: HyphaeModel, focusId: string | null, filter?: ConnFilter): FocusView {
  const nodes = new Map(model.nodes.map((n) => [n.id, n]));
  const allIds = new Set(model.nodes.map((n) => n.id));
  const focusNode = focusId ? nodes.get(focusId) ?? null : null;

  const children = focusId
    ? model.nodes.filter((n) => n.parentId === focusId)
    : model.nodes.filter((n) => !n.parentId || !allIds.has(n.parentId));

  // The layer external endpoints are rolled up to: the focus node's own layer
  // (its peers), or the top layer at the root view.
  const focusLayer = focusNode ? layerOfType(c4Backend, focusNode.type) ?? '' : c4Backend.layers[0];

  const inside = new Set<string>(children.map((n) => n.id));
  if (focusId) inside.add(focusId);

  const conns = filter ? model.connections.filter((c) => matchesFilter(c, filter)) : model.connections;

  const innerEdges: FocusEdge[] = [];
  const agg = new Map<string, FocusEdge>(); // key `${from}->${to}`
  const externalIds = new Set<string>();

  for (const c of conns) {
    if (!allIds.has(c.from) || !allIds.has(c.to)) continue; // drop dangling
    const from = inside.has(c.from) ? c.from : representative(model, c.from, focusLayer);
    const to = inside.has(c.to) ? c.to : representative(model, c.to, focusLayer);
    const fIn = inside.has(from);
    const tIn = inside.has(to);
    if (!fIn && !tIn) continue;   // unrelated to this view
    if (from === to) continue;    // collapsed onto itself (e.g. an edge to its own descendant)

    if (fIn && tIn) {
      if (from === c.from && to === c.to) {
        innerEdges.push({ id: c.id, from, to, kind: c.type, count: 1, derived: false });
      } else {
        const key = `${from}->${to}`;
        const ex = agg.get(key);
        if (ex) ex.count++;
        else agg.set(key, { id: `agg:${key}`, from, to, kind: null, count: 1, derived: true });
      }
      continue;
    }

    if (!fIn) externalIds.add(from);
    if (!tIn) externalIds.add(to);
    const key = `${from}->${to}`;
    const ex = agg.get(key);
    if (ex) ex.count++;
    else agg.set(key, { id: `ext:${key}`, from, to, kind: null, count: 1, derived: true });
  }

  const externals = [...externalIds].map((id) => nodes.get(id)).filter((n): n is Node => !!n);
  return { focusId, focusNode, children, externals, edges: [...innerEdges, ...agg.values()] };
}

export function breadcrumbPath(model: HyphaeModel, focusId: string | null): Crumb[] {
  const nodes = new Map(model.nodes.map((n) => [n.id, n]));
  const chain: Crumb[] = [];
  let cur = focusId ? nodes.get(focusId) ?? null : null;
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    chain.unshift({ id: cur.id, name: cur.name });
    cur = cur.parentId ? nodes.get(cur.parentId) ?? null : null;
  }
  return [{ id: null, name: 'Root' }, ...chain];
}

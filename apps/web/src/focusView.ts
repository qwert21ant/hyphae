import { c4Backend, layerOfType, type HyphaeModel, type Node, type Connection } from '@hyphae/schema';

export type ConnFilter = { kinds: string[]; fields: Record<string, string[]> };

export type FocusEdge = {
  id: string;
  from: string;
  to: string;
  kind: string | null; // connection type for a 1:1 real edge; null when aggregated
  count: number;       // underlying connections represented
  derived: boolean;    // aggregated/collapsed (dashed) edge
  realizedBy: string[]; // ids of the model connections this edge represents (length === count)
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
function representativeWith(nodes: Map<string, Node>, endpointId: string, focusLayer: string): string {
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

export function representative(model: HyphaeModel, endpointId: string, focusLayer: string): string {
  const nodes = new Map(model.nodes.map((n) => [n.id, n]));
  return representativeWith(nodes, endpointId, focusLayer);
}

/**
 * The direct child of `focusId` that contains `endpointId` (itself, if it is already a direct child),
 * or null when the endpoint is not inside the focus subtree. This is how connections authored deep
 * below the focus (e.g. Component↔Component connections under a focused System) roll up to the
 * children actually shown (the Containers), instead of collapsing onto the focus.
 */
function childOfFocus(nodes: Map<string, Node>, endpointId: string, focusId: string): string | null {
  let cur = nodes.get(endpointId);
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    if (cur.parentId === focusId) return cur.id;
    if (!cur.parentId) return null;
    cur = nodes.get(cur.parentId);
  }
  return null;
}

/** The top-level ancestor of `endpointId` (the root of its containment tree). */
function rootAncestor(nodes: Map<string, Node>, endpointId: string): string {
  let cur = nodes.get(endpointId);
  let result = endpointId;
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    result = cur.id;
    if (!cur.parentId || !nodes.has(cur.parentId)) break;
    cur = nodes.get(cur.parentId);
  }
  return result;
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

  // Map a connection endpoint to the node that represents it in this view:
  // - root view: its top-level ancestor (a shown root);
  // - the focus itself: the focus;
  // - inside the focus subtree: the direct child of the focus that contains it (the children level);
  // - outside: a peer at the focus's own layer (an aggregated external box), or itself if at/above it.
  const mapEndpoint = (id: string): string => {
    if (!focusId) return rootAncestor(nodes, id);
    if (id === focusId) return focusId;
    const child = childOfFocus(nodes, id, focusId);
    if (child) return child;
    return representativeWith(nodes, id, focusLayer);
  };

  const conns = filter ? model.connections.filter((c) => matchesFilter(c, filter)) : model.connections;

  // Aggregate every kept connection per mapped ordered pair, so an authored edge and the
  // lower-level connections that realize it collapse into a single edge (no duplicates).
  type Pair = { from: string; to: string; count: number; fIn: boolean; tIn: boolean; connIds: string[]; direct?: { id: string; kind: string } };
  const pairs = new Map<string, Pair>(); // key `${from}->${to}`
  const externalIds = new Set<string>();

  for (const c of conns) {
    if (!allIds.has(c.from) || !allIds.has(c.to)) continue; // drop dangling
    const from = mapEndpoint(c.from);
    const to = mapEndpoint(c.to);
    const fIn = inside.has(from);
    const tIn = inside.has(to);
    if (!fIn && !tIn) continue;   // unrelated to this view
    if (from === to) continue;    // collapsed onto itself (e.g. an edge to its own descendant)

    const key = `${from}->${to}`;
    let p = pairs.get(key);
    if (!p) { p = { from, to, count: 0, fIn, tIn, connIds: [] }; pairs.set(key, p); }
    p.count++;
    p.connIds.push(c.id);
    // An authored connection drawn directly between two shown nodes (not rolled up).
    if (from === c.from && to === c.to) p.direct = { id: c.id, kind: c.type };
    if (!fIn) externalIds.add(from);
    if (!tIn) externalIds.add(to);
  }

  // A solid "real" edge only when a single authored connection joins two shown inside nodes;
  // everything else (rolled-up or external) is a dashed derived edge labelled with its count.
  const edges: FocusEdge[] = [];
  for (const p of pairs.values()) {
    if (p.fIn && p.tIn && p.count === 1 && p.direct) {
      edges.push({ id: p.direct.id, from: p.from, to: p.to, kind: p.direct.kind, count: 1, derived: false, realizedBy: p.connIds });
    } else {
      edges.push({ id: `agg:${p.from}->${p.to}`, from: p.from, to: p.to, kind: null, count: p.count, derived: true, realizedBy: p.connIds });
    }
  }

  const externals = [...externalIds].map((id) => nodes.get(id)).filter((n): n is Node => !!n);
  return { focusId, focusNode, children, externals, edges };
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

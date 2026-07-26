import { c4Backend, layerOfType, type HyphaeModel, type Node, type Connection } from '@hyphae/schema';

export type ConnFilter = { kinds: string[]; fields: Record<string, string[]> };
export type Audience = 'stakeholder' | 'full';

export type FocusEdge = {
  id: string;
  from: string;
  to: string;
  kind: string | null; // connection type for a 1:1 real edge; null when aggregated
  count: number;       // underlying connections represented
  derived: boolean;    // aggregated/collapsed (dashed) edge
  realizedBy: string[]; // ids of the model connections this edge represents (length === count)
  direction?: string;  // the connection's direction for a real edge (e.g. 'Bidirectional')
  verb?: string;        // the connection's verb for a 1:1 real edge
  object?: string;      // the connection's object for a 1:1 real edge
};

export type FocusView = {
  focusId: string | null;
  focusNode: Node | null;
  children: Node[];   // direct children, or all roots at the root view
  externals: Node[];  // representative peer-level external boxes
  edges: FocusEdge[];
  externalGroups?: { id: string; name: string; childIds: string[] }[];
  expandableExternalIds?: Set<string>;
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

export function buildFocusView(model: HyphaeModel, focusId: string | null, filter?: ConnFilter, audience: Audience = 'full', expandedExternals: Set<string> = new Set()): FocusView {
  const nodes = new Map(model.nodes.map((n) => [n.id, n]));
  const allIds = new Set(model.nodes.map((n) => n.id));
  const focusNode = focusId ? nodes.get(focusId) ?? null : null;

  let children = focusId
    ? model.nodes.filter((n) => n.parentId === focusId)
    : model.nodes.filter((n) => !n.parentId || !allIds.has(n.parentId));

  const stakeholder = audience === 'stakeholder';

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
  const unexpandedRep = (id: string): string => {
    if (!focusId) return rootAncestor(nodes, id);
    if (id === focusId) return focusId;
    const child = childOfFocus(nodes, id, focusId);
    if (child) return child;
    return representativeWith(nodes, id, focusLayer);
  };
  const mapEndpoint = (id: string): string => {
    const rep = unexpandedRep(id);
    if (expandedExternals.has(rep)) return childOfFocus(nodes, id, rep) ?? rep;
    return rep;
  };

  const conns = filter ? model.connections.filter((c) => matchesFilter(c, filter)) : model.connections;

  // Map each kept connection's endpoints into this view (or skip it: dangling, unrelated, or a
  // self-loop after mapping). `mapped` holds the shown connections and their mapped endpoints.
  const mapped = new Map<string, { from: string; to: string }>();
  for (const c of conns) {
    if (!allIds.has(c.from) || !allIds.has(c.to)) continue;
    const from = mapEndpoint(c.from);
    const to = mapEndpoint(c.to);
    if ((!inside.has(from) && !inside.has(to)) || from === to) continue;
    mapped.set(c.id, { from, to });
  }
  const pairKey = (id: string) => { const mp = mapped.get(id); return mp ? `${mp.from}->${mp.to}` : null; };

  // Reconcile realizedBy by granularity:
  // - a parent is "expanded" (shown via its children, not itself) when a child would appear at a
  //   finer, different pair — e.g. at a Container focus an external→Component connection attaches to
  //   the finer child Component shown inside the focus, not to the focus itself (group node);
  // - a child is "absorbed" (hidden, represented by its parent) when its parent is kept and the child
  //   maps to the same pair — e.g. at a System focus a Component-level connection that rolls up to
  //   the same Container↔Container pair as its authored parent.
  const expanded = new Set<string>();
  for (const c of conns) {
    const pk = pairKey(c.id);
    for (const childId of c.realizedBy) {
      const cpk = pairKey(childId);
      if (cpk != null && cpk !== pk) { expanded.add(c.id); break; }
    }
  }
  const absorbed = new Set<string>();
  for (const c of conns) {
    if (expanded.has(c.id)) continue; // an expanded parent does not hide its finer children
    for (const childId of c.realizedBy) absorbed.add(childId);
  }

  // Group the surviving connections per *unordered* mapped pair. A connection is DIRECT when both
  // of its endpoints map to themselves — nothing about it is being summarised, so it keeps its own
  // solid edge with its own verb and arrow (FloatingEdge fans several apart). Only ROLLED-UP
  // connections, whose endpoints stand in for deeper nodes, aggregate into one dashed count edge:
  // there the count is the whole point, and the underlying verbs differ anyway.
  // `a`/`b` are the canonical (id-sorted) endpoints; `ab`/`ba` record which orientations occur
  // among the rolled-up ones, which is what decides the merged edge's arrow direction.
  type Entry = { id: string; kind: string; from: string; to: string; direction: string; verb: string; object: string; direct: boolean };
  type Pair = { a: string; b: string; entries: Entry[] };
  const pairs = new Map<string, Pair>(); // key `${a}|${b}` with a <= b

  for (const c of conns) {
    const mp = mapped.get(c.id);
    if (!mp || expanded.has(c.id) || absorbed.has(c.id)) continue;
    const { from, to } = mp;
    const [a, b] = from <= to ? [from, to] : [to, from];
    const key = `${a}|${b}`;
    let p = pairs.get(key);
    if (!p) { p = { a, b, entries: [] }; pairs.set(key, p); }
    // Direct = both endpoints map to themselves, so nothing about this connection is summarised.
    p.entries.push({ id: c.id, kind: c.type, from, to, direction: c.direction, verb: c.verb, object: c.object, direct: from === c.from && to === c.to });
  }

  const realEdgeOf = (d: Entry): FocusEdge => ({
    id: d.id, from: d.from, to: d.to, kind: d.kind, count: 1, derived: false,
    realizedBy: [d.id], direction: d.direction, verb: d.verb, object: d.object,
  });
  /** One dashed summary edge over `items`. It keeps an arrow only when every underlying connection
   *  points the same way; conflicting directions render undirected ('None'), any Bidirectional wins. */
  const aggregateEdgeOf = (p: Pair, items: Entry[]): FocusEdge => {
    let ab = false, ba = false, bidir = false;
    for (const it of items) {
      if (it.from === p.a) ab = true; else ba = true;
      if (it.direction === 'Bidirectional') bidir = true;
    }
    let from: string, to: string, direction: string;
    if (bidir || (ab && ba)) { from = p.a; to = p.b; direction = bidir ? 'Bidirectional' : 'None'; }
    else if (ba) { from = p.b; to = p.a; direction = 'Unidirectional'; }
    else { from = p.a; to = p.b; direction = 'Unidirectional'; }
    return { id: `agg:${p.a}->${p.b}`, from, to, kind: null, count: items.length, derived: true, realizedBy: items.map((i) => i.id), direction };
  };

  const edges: FocusEdge[] = [];
  for (const p of pairs.values()) {
    const directs = p.entries.filter((x) => x.direct);
    if (directs.length > 1) {
      // SEVERAL authored connections between two directly-shown nodes. Collapsing them would throw
      // away every verb and both arrowheads to say only "2" — draw each one and let FloatingEdge
      // fan them apart. Anything rolled up onto the same pair still summarises into one dashed edge.
      for (const d of directs) edges.push(realEdgeOf(d));
      const rolled = p.entries.filter((x) => !x.direct);
      if (rolled.length) edges.push(aggregateEdgeOf(p, rolled));
    } else if (p.entries.length === 1 && directs.length === 1) {
      edges.push(realEdgeOf(directs[0]));
    } else {
      edges.push(aggregateEdgeOf(p, p.entries));
    }
  }

  const shownEdges = stakeholder ? edges.filter((ed) => !ed.derived) : edges;

  const shownExternalIds = new Set<string>();
  for (const ed of shownEdges) {
    if (!inside.has(ed.from)) shownExternalIds.add(ed.from);
    if (!inside.has(ed.to)) shownExternalIds.add(ed.to);
  }
  const externals = [...shownExternalIds].map((id) => nodes.get(id)).filter((n): n is Node => !!n);

  // Which shown, collapsed, focus-peer externals would reveal a finer participating child if expanded.
  // Computed from the surviving connections (not the rendered edges), so a finer child that got
  // absorbed into a coarse edge's realizedBy is still detected.
  const expandableExternalIds = new Set<string>();
  for (const c of conns) {
    if (!mapped.has(c.id)) continue;
    for (const origId of [c.from, c.to]) {
      const rep = unexpandedRep(origId);
      if (inside.has(rep) || expandedExternals.has(rep) || expandableExternalIds.has(rep)) continue;
      if (!shownExternalIds.has(rep)) continue;                          // only externals actually rendered
      if (representativeWith(nodes, rep, focusLayer) !== rep) continue;  // focus-peer reps only (not members)
      const child = childOfFocus(nodes, origId, rep);
      if (child !== null) expandableExternalIds.add(rep);
    }
  }

  // For each currently-expanded external, the finer members that surfaced (its direct children now
  // shown as externals). An expanded id that produced no member yields no group.
  const externalGroups: { id: string; name: string; childIds: string[] }[] = [];
  for (const extId of expandedExternals) {
    const childIds = externals.filter((n) => n.parentId === extId).map((n) => n.id);
    const parent = nodes.get(extId);
    if (childIds.length && parent) externalGroups.push({ id: extId, name: parent.name, childIds });
  }

  return { focusId, focusNode, children, externals, edges: shownEdges, externalGroups, expandableExternalIds };
}

/** Connections listed for a node's panel, split by direction relative to the subtree rooted at
 *  `nodeId`: `outgoing` = `from` inside the subtree, `to` outside; `incoming` = `to` inside,
 *  `from` outside. Only boundary-crossing edges appear (exactly one endpoint is the node or a
 *  descendant); excluded are connections internal to the subtree (both endpoints inside) and
 *  connections that are a realized child of another connection (represented by their parent). */
export function partitionConnections(model: HyphaeModel, nodeId: string): { outgoing: Connection[]; incoming: Connection[] } {
  const kids = new Map<string, string[]>();
  for (const n of model.nodes) {
    if (n.parentId) (kids.get(n.parentId) ?? kids.set(n.parentId, []).get(n.parentId)!).push(n.id);
  }
  const inSubtree = new Set<string>();
  const stack = [nodeId];
  while (stack.length) {
    const id = stack.pop()!;
    if (inSubtree.has(id)) continue;
    inSubtree.add(id);
    for (const k of kids.get(id) ?? []) stack.push(k);
  }
  const realizedChildren = new Set<string>(model.connections.flatMap((c) => c.realizedBy));
  const outgoing: Connection[] = [];
  const incoming: Connection[] = [];
  for (const c of model.connections) {
    if (realizedChildren.has(c.id)) continue;
    const fromIn = inSubtree.has(c.from);
    const toIn = inSubtree.has(c.to);
    if (fromIn === toIn) continue; // both in or both out → not a boundary crossing
    if (fromIn) outgoing.push(c); else incoming.push(c);
  }
  return { outgoing, incoming };
}

/** The union of {@link partitionConnections}'s outgoing then incoming — the flat
 *  boundary-crossing list used where direction is not needed. */
export function externalConnections(model: HyphaeModel, nodeId: string): Connection[] {
  const { outgoing, incoming } = partitionConnections(model, nodeId);
  return [...outgoing, ...incoming];
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

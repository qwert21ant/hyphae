import { c4Backend, verbClassOf, type HyphaeModel, type Node, type Connection, type FlowStep } from '@hyphae/schema';
import { NodeTree } from '@/core/NodeTree';

export type ConnFilter = { verbClasses: string[]; fields: Record<string, string[]> };
export type Audience = 'stakeholder' | 'full';

export type FocusEdge = {
  id: string;
  from: string;
  to: string;
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

function matchesFilter(c: Connection, f: ConnFilter): boolean {
  if (f.verbClasses.length && !f.verbClasses.includes(verbClassOf(c4Backend, c.verb) ?? '')) return false;
  for (const [key, vals] of Object.entries(f.fields)) {
    if (vals.length && !vals.includes(String(c.fields[key] ?? ''))) return false;
  }
  return true;
}

/** See {@link NodeTree.representativeWith} — the node that stands in for `endpointId` at `focusLayer`. */
export function representative(model: HyphaeModel, endpointId: string, focusLayer: string): string {
  return new NodeTree(model).representativeWith(endpointId, focusLayer);
}

export function buildFocusView(model: HyphaeModel, focusId: string | null, filter?: ConnFilter, audience: Audience = 'full', expandedExternals: Set<string> = new Set()): FocusView {
  const tree = new NodeTree(model);
  const allIds = new Set(model.nodes.map((n) => n.id));
  const focusNode = focusId ? tree.get(focusId) ?? null : null;

  let children = focusId
    ? model.nodes.filter((n) => n.parentId === focusId)
    : model.nodes.filter((n) => !n.parentId || !allIds.has(n.parentId));

  const stakeholder = audience === 'stakeholder';

  const focusLayer = tree.focusLayerOf(focusId);

  const inside = new Set<string>(children.map((n) => n.id));
  if (focusId) inside.add(focusId);

  const unexpandedRep = (id: string): string => tree.representativeAt(id, focusId, focusLayer);
  const mapEndpoint = (id: string): string => {
    const rep = unexpandedRep(id);
    if (expandedExternals.has(rep)) return tree.childOf(id, rep) ?? rep;
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
  type Entry = { id: string; from: string; to: string; direction: string; verb: string; object: string; direct: boolean };
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
    p.entries.push({ id: c.id, from, to, direction: c.direction, verb: c.verb, object: c.object, direct: from === c.from && to === c.to });
  }

  const realEdgeOf = (d: Entry): FocusEdge => ({
    id: d.id, from: d.from, to: d.to, count: 1, derived: false,
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
    return { id: `agg:${p.a}->${p.b}`, from, to, count: items.length, derived: true, realizedBy: items.map((i) => i.id), direction };
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
  const externals = [...shownExternalIds].map((id) => tree.get(id)).filter((n): n is Node => !!n);

  // Which shown, collapsed, focus-peer externals would reveal a finer participating child if expanded.
  // Computed from the surviving connections (not the rendered edges), so a finer child that got
  // absorbed into a coarse edge's realizedBy is still detected.
  const expandableExternalIds = new Set<string>();
  for (const c of conns) {
    if (!mapped.has(c.id)) continue;
    for (const origId of [c.from, c.to]) {
      const rep = unexpandedRep(origId);
      if (inside.has(rep) || expandedExternals.has(rep) || expandableExternalIds.has(rep)) continue;
      if (!shownExternalIds.has(rep)) continue;                       // only externals actually rendered
      if (tree.representativeWith(rep, focusLayer) !== rep) continue; // focus-peer reps only (not members)
      const child = tree.childOf(origId, rep);
      if (child !== null) expandableExternalIds.add(rep);
    }
  }

  // For each currently-expanded external, the finer members that surfaced (its direct children now
  // shown as externals). An expanded id that produced no member yields no group.
  const externalGroups: { id: string; name: string; childIds: string[] }[] = [];
  for (const extId of expandedExternals) {
    const childIds = externals.filter((n) => n.parentId === extId).map((n) => n.id);
    const parent = tree.get(extId);
    if (childIds.length && parent) externalGroups.push({ id: extId, name: parent.name, childIds });
  }

  return { focusId, focusNode, children, externals, edges: shownEdges, externalGroups, expandableExternalIds };
}

export type StepReveal = {
  focusId: string | null;    // the view to focus
  expand: Set<string>;       // externals to expand so the far endpoint surfaces (see expandedExternals)
  selectedId: string | null; // the step's connection, or its source node
};

/**
 * Where to go to see one flow step. Siblings share a parent, so that parent is the focus (the root
 * view when both are top-level). Otherwise focus the parent of the **deeper** endpoint: that
 * endpoint becomes a child box, and the shallower one is at or above the focus's layer, so it is
 * drawn as itself in an external column. Focusing the *source's* parent instead would aim too high
 * whenever the source is the shallower end — an Actor step would land on the root view with the
 * target still collapsed into its System.
 *
 * The shallower endpoint can still be represented by a coarser box (a sibling container standing in
 * for the component inside it); expanding that representative is what surfaces the endpoint itself,
 * so it is returned with the focus rather than left to the user. Only a node OUTSIDE the focus is
 * ever expanded: `resolveViewPositions` lays expanded groups out in the external columns, so
 * expanding a node that is drawn inside the view stacks a group box on top of the cluster.
 *
 * Returns null when either endpoint is missing from the model (a stale flow), so callers no-op.
 */
export function stepReveal(model: HyphaeModel, step: Pick<FlowStep, 'from' | 'to' | 'via'>): StepReveal | null {
  const tree = new NodeTree(model);
  const from = tree.get(step.from);
  const to = tree.get(step.to);
  if (!from || !to) return null;

  const selectedId = step.via ?? step.from;
  const fromParent = tree.parentOf(from);
  if (fromParent === tree.parentOf(to)) return { focusId: fromParent, expand: new Set<string>(), selectedId };

  const [deeper, other] = tree.depthOf(to) > tree.depthOf(from) ? [to, from] : [from, to];
  const focusId = tree.parentOf(deeper);
  const rep = tree.representativeAt(other.id, focusId, tree.focusLayerOf(focusId));
  const insideView = rep === focusId || (focusId === null ? true : tree.get(rep)?.parentId === focusId);
  return { focusId, expand: rep === other.id || insideView ? new Set<string>() : new Set([rep]), selectedId };
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
  const tree = new NodeTree(model);
  const focusNode = focusId ? tree.get(focusId) ?? null : null;
  if (!focusNode) return [{ id: null, name: 'Root' }];
  // The tree's walk yields the ancestors nearest-first; a breadcrumb reads outermost-first.
  const chain = [...tree.ancestors(focusNode.id)].reverse().concat(focusNode);
  return [{ id: null, name: 'Root' }, ...chain.map((n) => ({ id: n.id, name: n.name }))];
}

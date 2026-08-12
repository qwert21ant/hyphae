import { type HyphaeModel, type Node } from '@hyphae/schema';
import { NodeTree } from '@/core/NodeTree';
import { matchesFilter, realEdgeOf, aggregateEdgeOf, type Entry, type Pair } from './edges';
import type { ConnFilter, Audience, FocusEdge, FocusView } from './types';

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

  const unexpandedRep = (id: string): string => {
    const rep = tree.representativeAt(id, focusId, focusLayer);
    // A FOUNDATIONAL node outside the focus represents ITSELF, at whatever layer it lives on.
    // Without this the mark almost never fires: the marked node is typically a Component and the
    // focus a Container, so it would be summarised into its parent container's ghost — and the fan it
    // was marked to remove stays on screen, merely re-attributed to the parent. The shelf is
    // layer-agnostic furniture, so drawing a Component there beside Container ghosts is fine; an
    // expanded external already puts finer children in the same columns.
    // Only when the representative is OUTSIDE: a marked descendant of the focus must keep rolling up
    // into the child that contains it, or a Component lands inside a Container's cluster.
    if (rep !== id && !inside.has(rep) && tree.get(id)?.foundational) return id;
    return rep;
  };
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
    p.entries.push({ id: c.id, from, to, direction: c.direction, label: c.label, direct: from === c.from && to === c.to });
  }

  const edges: FocusEdge[] = [];
  for (const p of pairs.values()) {
    const directs = p.entries.filter((x: Entry) => x.direct);
    if (directs.length > 1) {
      // SEVERAL authored connections between two directly-shown nodes. Collapsing them would throw
      // away every verb and both arrowheads to say only "2" — draw each one and let FloatingEdge
      // fan them apart. Anything rolled up onto the same pair still summarises into one dashed edge.
      for (const d of directs) edges.push(realEdgeOf(d));
      const rolled = p.entries.filter((x: Entry) => !x.direct);
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
  const shown = [...shownExternalIds].map((id) => tree.get(id)).filter((n): n is Node => !!n);

  // A foundational node is shelved only where it is EXTERNAL to the focus — which is automatic here,
  // since a child of the focus is in `children` and never reaches this list. Inside its own container
  // it stays an ordinary member, and the fan it causes there is an accepted cost: the alternative
  // removes a container's own child from its own cluster, which makes containment lie.
  const shelfNodes = shown.filter((n) => n.foundational);
  const shelfIds = new Set(shelfNodes.map((n) => n.id));
  const externals = shown.filter((n) => !shelfIds.has(n.id));

  // Not drawn at rest, but still BUILT: highlight.ts reveals an edge by changing its opacity, so an
  // edge that was never created could not be revealed on hover. The count is EDGES in this view — one
  // mark saying how many things here lean on this node — not connections, and not its model degree.
  const shelfCount: Record<string, number> = {};
  for (const ed of shownEdges) {
    const ends = new Set([ed.from, ed.to].filter((id) => shelfIds.has(id)));
    if (!ends.size) continue;
    ed.shelved = true;
    for (const id of ends) shelfCount[id] = (shelfCount[id] ?? 0) + 1;
  }
  const shelf = shelfNodes.map((node) => ({ node, count: shelfCount[node.id] ?? 0 }));

  // Which shown, collapsed, focus-peer externals would reveal a finer participating child if expanded.
  // Computed from the surviving connections (not the rendered edges), so a finer child that got
  // absorbed into a coarse edge's realizedBy is still detected.
  const expandableExternalIds = new Set<string>();
  for (const c of conns) {
    if (!mapped.has(c.id)) continue;
    for (const origId of [c.from, c.to]) {
      const rep = unexpandedRep(origId);
      // A shelved node is furniture, not a collapsed group: it gets no expand affordance.
      if (inside.has(rep) || shelfIds.has(rep) || expandedExternals.has(rep) || expandableExternalIds.has(rep)) continue;
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

  return { focusId, focusNode, children, externals, shelf, edges: shownEdges, externalGroups, expandableExternalIds };
}

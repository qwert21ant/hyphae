import { type HyphaeModel, type Connection } from '@hyphae/schema';

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

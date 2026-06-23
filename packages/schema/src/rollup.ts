import type { HyphaeModel } from './model';
import { c4Backend, layerOfType } from './profiles/c4-backend';

/**
 * A derived higher-level edge. Minimal by design: `from`/`to` are node ids at the
 * target layer, `realizedBy` are the ids of the underlying connections that produced it.
 * Categories/transports/direction are NOT stored — derive them from `realizedBy` when needed.
 */
export type RollupConnection = { from: string; to: string; realizedBy: string[] };

/**
 * Derive the connections at `layer` (e.g. "Container" or "Context") by lifting each real
 * connection's endpoints to their ancestor-or-self at that layer, dropping edges that stay
 * inside one node, and grouping the rest by (from, to). Pure — never mutates the model.
 */
export function rollupConnections(model: HyphaeModel, layer: string): RollupConnection[] {
  const byId = new Map(model.nodes.map((n) => [n.id, n]));
  const liftCache = new Map<string, string>();
  const lift = (id: string): string => {
    const cached = liftCache.get(id);
    if (cached !== undefined) return cached;
    let node = byId.get(id);
    const seen = new Set<string>();
    let result = id; // unmatched nodes (already at/above the layer) lift to themselves
    while (node && !seen.has(node.id)) {
      seen.add(node.id);
      if (layerOfType(c4Backend, node.type) === layer) { result = node.id; break; }
      node = node.parentId ? byId.get(node.parentId) : undefined;
    }
    liftCache.set(id, result);
    return result;
  };

  const claimed = new Set<string>();
  for (const c of model.connections) for (const id of c.realizedBy) claimed.add(id);

  const groups = new Map<string, RollupConnection>();
  for (const conn of model.connections) {
    if (claimed.has(conn.id)) continue; // already represented by an authored higher edge
    const from = lift(conn.from);
    const to = lift(conn.to);
    if (from === to) continue; // internal to one node at this layer
    const key = `${from}:${to}`;
    const group = groups.get(key);
    if (group) group.realizedBy.push(conn.id);
    else groups.set(key, { from, to, realizedBy: [conn.id] });
  }
  return [...groups.values()];
}

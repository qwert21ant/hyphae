import { c4Backend, nodeAtOrAboveLayer, rollupConnections, verbClassOf } from '@hyphae/schema';
import type { HyphaeApi } from '../api';
import { runCreate, runVoid } from './shared';

export function buildConnectionTools(api: HyphaeApi) {
  return {
    list_connections: async ({ verb, verbClass, nodeId, containerId, crossingBoundary, involvingExternal, limit, offset, maxLayer = 'Component' }: { verb?: string; verbClass?: string; nodeId?: string; containerId?: string; crossingBoundary?: boolean; involvingExternal?: boolean; limit?: number; offset?: number; maxLayer?: string } = {}) => {
      const model = await api.getModel();
      const byId = new Map(model.nodes.map((n) => [n.id, n]));
      if (nodeId !== undefined && !byId.has(nodeId)) return { error: `node ${nodeId} not found` };
      const containerCache = new Map<string, string | null>();
      const containerOf = (id: string): string | null => {
        const cached = containerCache.get(id);
        if (cached !== undefined) return cached;
        let node = byId.get(id);
        const seen = new Set<string>();
        let result: string | null = null;
        while (node && !seen.has(node.id)) {
          seen.add(node.id);
          if (node.type === 'Container') { result = node.id; break; }
          node = node.parentId ? byId.get(node.parentId) : undefined;
        }
        containerCache.set(id, result);
        return result;
      };
      let subtree: Set<string> | null = null;
      if (containerId !== undefined) {
        const childrenByParent = new Map<string, string[]>();
        for (const n of model.nodes) {
          if (!n.parentId) continue;
          const arr = childrenByParent.get(n.parentId);
          if (arr) arr.push(n.id);
          else childrenByParent.set(n.parentId, [n.id]);
        }
        subtree = new Set([containerId]);
        const stack = [containerId];
        while (stack.length) {
          const cur = stack.pop();
          if (!cur) continue;
          for (const child of childrenByParent.get(cur) ?? []) if (!subtree.has(child)) { subtree.add(child); stack.push(child); }
        }
      }
      let conns = model.connections.filter((c) => {
        const fromNode = byId.get(c.from);
        const toNode = byId.get(c.to);
        if (!fromNode || !toNode) return false;
        if (!nodeAtOrAboveLayer(c4Backend, fromNode.type, maxLayer) || !nodeAtOrAboveLayer(c4Backend, toNode.type, maxLayer)) return false;
        if (verb !== undefined && c.verb !== verb) return false;
        if (verbClass !== undefined && verbClassOf(c4Backend, c.verb) !== verbClass) return false;
        if (nodeId !== undefined && c.from !== nodeId && c.to !== nodeId) return false;
        if (subtree && !(subtree.has(c.from) || subtree.has(c.to))) return false;
        if (involvingExternal !== undefined) {
          const ext = byId.get(c.from)?.type === 'ExternalSystem' || byId.get(c.to)?.type === 'ExternalSystem';
          if (ext !== involvingExternal) return false;
        }
        if (crossingBoundary !== undefined && (containerOf(c.from) !== containerOf(c.to)) !== crossingBoundary) return false;
        return true;
      });
      const start = offset ?? 0;
      conns = limit !== undefined ? conns.slice(start, start + limit) : conns.slice(start);
      const containerName = (id: string) => { const cid = containerOf(id); return cid ? byId.get(cid)?.name ?? null : null; };
      return conns.map((c) => ({
        id: c.id, from: c.from, to: c.to,
        fromName: byId.get(c.from)?.name ?? c.from, toName: byId.get(c.to)?.name ?? c.to,
        fromContainer: containerName(c.from), toContainer: containerName(c.to),
        verb: c.verb, object: c.object,
        direction: c.direction, description: c.description,
      }));
    },
    rollup_connections: async ({ layer, limit, offset }: { layer: 'Container' | 'Context'; limit?: number; offset?: number }) => {
      const model = await api.getModel();
      const byId = new Map(model.nodes.map((n) => [n.id, n]));
      const connById = new Map(model.connections.map((c) => [c.id, c]));
      let rolled = rollupConnections(model, layer);
      const start = offset ?? 0;
      rolled = limit !== undefined ? rolled.slice(start, start + limit) : rolled.slice(start);
      return rolled.map((e) => ({
        from: e.from, to: e.to,
        fromName: byId.get(e.from)?.name ?? e.from, toName: byId.get(e.to)?.name ?? e.to,
        realizedBy: e.realizedBy.map((id) => {
          const c = connById.get(id);
          if (!c) return { id };
          return { id: c.id, fromName: byId.get(c.from)?.name ?? c.from, toName: byId.get(c.to)?.name ?? c.to, verb: c.verb, object: c.object, description: c.description };
        }),
      }));
    },
    create_connections: async ({ connections }: { connections: Record<string, unknown>[] }) => runCreate(connections, api.createConnection, 'connection'),
    update_connections: async ({ updates }: { updates: Array<{ id: string } & Record<string, unknown>> }) =>
      runVoid(updates.map((u) => () => { const { id, ...patch } = u; return api.updateConnection(id, patch); })),
    delete_connections: async ({ ids }: { ids: string[] }) => runVoid(ids.map((id) => () => api.deleteConnection(id))),
  };
}

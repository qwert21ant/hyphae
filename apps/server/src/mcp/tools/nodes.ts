import { c4Backend, nodeAtOrAboveLayer } from '@hyphae/schema';
import type { HyphaeApi } from '../api';
import { runCreate, runVoid } from './shared';

/** Pure tool handlers over an injected API client (re-reads the model per call). */
export function buildNodeTools(api: HyphaeApi) {
  return {
    get_node: async ({ id }: { id: string }) =>
      (await api.getModel()).nodes.find((n) => n.id === id) ?? { error: `node ${id} not found` },
    list_nodes: async ({ parentId, type, query, fields, limit, offset, maxLayer = 'Component' }: { parentId?: string; type?: string; query?: string; fields?: string[]; limit?: number; offset?: number; maxLayer?: string } = {}) => {
      const model = await api.getModel();
      let nodes = model.nodes;
      nodes = nodes.filter((n) => nodeAtOrAboveLayer(c4Backend, n.type, maxLayer));
      if (parentId !== undefined) nodes = nodes.filter((n) => n.parentId === parentId);
      if (type !== undefined) nodes = nodes.filter((n) => n.type === type);
      if (query !== undefined) {
        const q = query.toLowerCase();
        const searchFields = fields?.length ? fields : ['name', 'description', 'technology', 'responsibilities', 'rules'];
        const hit = (n: typeof model.nodes[number]) =>
          searchFields.some((f) => {
            const v = f === 'name' ? n.name : f === 'description' ? n.description : n.fields[f];
            if (typeof v === 'string') return v.toLowerCase().includes(q);
            if (Array.isArray(v)) return v.some((x) => typeof x === 'string' && x.toLowerCase().includes(q));
            return false;
          });
        nodes = nodes.filter(hit);
      }
      const start = offset ?? 0;
      // A text query defaults to a 25-row cap (as the former search_nodes did) so a broad match
      // does not dump the whole model as the heavier enriched rows; plain enumeration is uncapped.
      const effLimit = limit ?? (query !== undefined ? 25 : undefined);
      nodes = effLimit !== undefined ? nodes.slice(start, start + effLimit) : nodes.slice(start);
      // With a text query, enrich rows with the parent name + description for disambiguation
      // (component names repeat across containers); plain enumeration stays lean.
      if (query !== undefined) {
        const nameById = new Map(model.nodes.map((n) => [n.id, n.name]));
        return nodes.map((n) => ({ id: n.id, name: n.name, type: n.type, parentId: n.parentId, parent: n.parentId ? nameById.get(n.parentId) ?? null : null, description: n.description }));
      }
      return nodes.map((n) => ({ id: n.id, name: n.name, type: n.type, parentId: n.parentId }));
    },
    create_nodes: async ({ nodes }: { nodes: Record<string, unknown>[] }) => runCreate(nodes, api.createNode, 'node'),
    update_nodes: async ({ updates }: { updates: Array<{ id: string } & Record<string, unknown>> }) =>
      runVoid(updates.map((u) => () => { const { id, ...patch } = u; return api.updateNode(id, patch); })),
    delete_nodes: async ({ ids }: { ids: string[] }) => runVoid(ids.map((id) => () => api.deleteNode(id))),
  };
}

import { c4Backend, modelOverview, nodeAtOrAboveLayer, refOwners, resolveRef, resolveRoot, verbClassOf } from '@hyphae/schema';
import type { HyphaeApi } from '../api';

export function buildQueryTools(api: HyphaeApi) {
  return {
    model_overview: async (_: Record<string, never>) => modelOverview(await api.getModel()),
    get_subgraph: async ({ nodeId, depth, direction, verbClass, containment, maxLayer = 'Component' }: { nodeId: string; depth?: number; direction?: 'in' | 'out' | 'both'; verbClass?: string; containment?: 'down' | 'up' | 'both' | 'none'; maxLayer?: string }) => {
      const model = await api.getModel();
      if (!model.nodes.some((n) => n.id === nodeId)) return { error: `node ${nodeId} not found` };
      const maxDepth = depth ?? 1;
      const dir = direction ?? 'both';
      const cont = containment ?? 'down';
      const edges = verbClass ? model.connections.filter((c) => verbClassOf(c4Backend, c.verb) === verbClass) : model.connections;
      const byId = new Map(model.nodes.map((n) => [n.id, n]));
      const childrenByParent = new Map<string, string[]>();
      const parentOf = new Map<string, string | null>();
      for (const n of model.nodes) {
        parentOf.set(n.id, n.parentId);
        if (!n.parentId) continue;
        const arr = childrenByParent.get(n.parentId);
        if (arr) arr.push(n.id);
        else childrenByParent.set(n.parentId, [n.id]);
      }
      const reached = new Set<string>([nodeId]);
      let frontier = [nodeId];
      const withinLayer = (id: string): boolean =>
        id === nodeId || nodeAtOrAboveLayer(c4Backend, byId.get(id)?.type ?? '', maxLayer);
      const visit = (id: string, next: string[]) => { if (!reached.has(id) && withinLayer(id)) { reached.add(id); next.push(id); } };
      for (let d = 0; d < maxDepth && frontier.length; d++) {
        const next: string[] = [];
        for (const id of frontier) {
          for (const c of edges) {
            if ((dir === 'out' || dir === 'both') && c.from === id) visit(c.to, next);
            if ((dir === 'in' || dir === 'both') && c.to === id) visit(c.from, next);
          }
          if (cont === 'down' || cont === 'both') for (const child of childrenByParent.get(id) ?? []) visit(child, next);
          if (cont === 'up' || cont === 'both') { const p = parentOf.get(id); if (p) visit(p, next); }
        }
        frontier = next;
      }
      return {
        root: nodeId,
        depth: maxDepth,
        direction: dir,
        containment: cont,
        nodes: model.nodes.filter((n) => reached.has(n.id)).map((n) => ({ id: n.id, name: n.name, type: n.type, parentId: n.parentId })),
        connections: edges.filter((c) => reached.has(c.from) && reached.has(c.to)),
      };
    },
    resolve_refs: async ({ nodeId, path }: { nodeId?: string; path?: string }) => {
      const model = await api.getModel();
      if (path) return { path, owners: refOwners(model.nodes, path) };
      if (!nodeId) return { error: 'Pass either nodeId or path.' };
      const node = model.nodes.find((n) => n.id === nodeId);
      if (!node) return { error: `node ${nodeId} not found` };
      return {
        nodeId,
        root: resolveRoot(model.nodes, nodeId),
        refs: node.codeRefs.map((ref) => ({ ref, resolved: resolveRef(model.nodes, nodeId, ref) })),
      };
    },
  };
}

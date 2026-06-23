import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  getContext, rollupConnections, HyphaeModelSchema, c4Backend, effectiveFields, connectionKindIds,
  type HyphaeModel, type FieldDef,
} from '@hyphae/schema';

export interface HyphaeApi {
  getModel(): Promise<HyphaeModel>;
  createNode(input: unknown): Promise<unknown>;
  updateNode(id: string, patch: unknown): Promise<unknown>;
  deleteNode(id: string): Promise<unknown>;
  createConnection(input: unknown): Promise<unknown>;
  updateConnection(id: string, patch: unknown): Promise<unknown>;
  deleteConnection(id: string): Promise<unknown>;
}

/** Pure tool handlers over an injected API client (re-reads the model per call). */
export function buildTools(api: HyphaeApi) {
  return {
    get_text_context: async (scope: { mode?: 'summary' | 'full'; layer?: string; root?: string; fields?: string[] } = {}) =>
      getContext(await api.getModel(), scope),
    get_node: async ({ id }: { id: string }) =>
      (await api.getModel()).nodes.find((n) => n.id === id) ?? null,
    list_nodes: async ({ parentId, type, limit, offset }: { parentId?: string; type?: string; limit?: number; offset?: number } = {}) => {
      let nodes = (await api.getModel()).nodes;
      if (parentId !== undefined) nodes = nodes.filter((n) => n.parentId === parentId);
      if (type !== undefined) nodes = nodes.filter((n) => n.type === type);
      const start = offset ?? 0;
      nodes = limit !== undefined ? nodes.slice(start, start + limit) : nodes.slice(start);
      return nodes.map((n) => ({ id: n.id, name: n.name, type: n.type, parentId: n.parentId }));
    },
    search_nodes: async ({ query, type, parentId, fields, limit }: { query: string; type?: string; parentId?: string; fields?: string[]; limit?: number }) => {
      const q = query.toLowerCase();
      const searchFields = fields?.length ? fields : ['name', 'description', 'technology', 'responsibilities', 'invariants'];
      const model = await api.getModel();
      const nameById = new Map(model.nodes.map((n) => [n.id, n.name]));
      const hit = (n: typeof model.nodes[number]) =>
        searchFields.some((f) => {
          const v = f === 'name' ? n.name : f === 'description' ? n.description : n.fields[f];
          if (typeof v === 'string') return v.toLowerCase().includes(q);
          if (Array.isArray(v)) return v.some((x) => typeof x === 'string' && x.toLowerCase().includes(q));
          return false;
        });
      return model.nodes
        .filter((n) => (type === undefined || n.type === type) && (parentId === undefined || n.parentId === parentId) && hit(n))
        .slice(0, limit ?? 25)
        .map((n) => ({ id: n.id, name: n.name, type: n.type, parentId: n.parentId, parent: n.parentId ? nameById.get(n.parentId) ?? null : null, description: n.description }));
    },
    find_connections: async ({ nodeId }: { nodeId: string }) =>
      (await api.getModel()).connections.filter((c) => c.from === nodeId || c.to === nodeId),
    list_connections: async ({ type, transport, containerId, crossingBoundary, involvingExternal, rollup, limit, offset }: { type?: string; transport?: string; containerId?: string; crossingBoundary?: boolean; involvingExternal?: boolean; rollup?: 'Container' | 'Context'; limit?: number; offset?: number } = {}) => {
      const model = await api.getModel();
      const byId = new Map(model.nodes.map((n) => [n.id, n]));
      if (rollup) {
        const connById = new Map(model.connections.map((c) => [c.id, c]));
        let rolled = rollupConnections(model, rollup);
        const start = offset ?? 0;
        rolled = limit !== undefined ? rolled.slice(start, start + limit) : rolled.slice(start);
        return rolled.map((e) => ({
          from: e.from, to: e.to,
          fromName: byId.get(e.from)?.name ?? e.from, toName: byId.get(e.to)?.name ?? e.to,
          realizedBy: e.realizedBy.map((id) => {
            const c = connById.get(id);
            if (!c) return { id };
            return { id: c.id, fromName: byId.get(c.from)?.name ?? c.from, toName: byId.get(c.to)?.name ?? c.to, type: c.type, transport: c.fields.transport, intent: c.fields.intent, description: c.description };
          }),
        }));
      }
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
        if (type !== undefined && c.type !== type) return false;
        if (transport !== undefined && c.fields.transport !== transport) return false;
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
        type: c.type, transport: c.fields.transport, intent: c.fields.intent,
        direction: c.direction, description: c.description,
      }));
    },
    get_subgraph: async ({ nodeId, depth, direction, type, containment }: { nodeId: string; depth?: number; direction?: 'in' | 'out' | 'both'; type?: string; containment?: 'down' | 'up' | 'both' | 'none' }) => {
      const model = await api.getModel();
      if (!model.nodes.some((n) => n.id === nodeId)) return { error: `node ${nodeId} not found` };
      const maxDepth = depth ?? 1;
      const dir = direction ?? 'both';
      const cont = containment ?? 'down';
      const edges = type ? model.connections.filter((c) => c.type === type) : model.connections;
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
      const visit = (id: string, next: string[]) => { if (!reached.has(id)) { reached.add(id); next.push(id); } };
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
    create_node: async (input: Record<string, unknown>) => api.createNode(input),
    update_node: async ({ id, ...patch }: { id: string } & Record<string, unknown>) => api.updateNode(id, patch),
    delete_node: async ({ id }: { id: string }) => api.deleteNode(id),
    create_connection: async (input: Record<string, unknown>) => api.createConnection(input),
    update_connection: async ({ id, ...patch }: { id: string } & Record<string, unknown>) => api.updateConnection(id, patch),
    delete_connection: async ({ id }: { id: string }) => api.deleteConnection(id),
    describe_profile: async (_: Record<string, never>) => c4Backend,
  };
}

/** HTTP client of the running Hyphae server (the single source of truth). */
function httpApi(base: string): HyphaeApi {
  async function mutate(method: string, path: string, body?: unknown): Promise<unknown> {
    try {
      const res = await fetch(`${base}${path}`, {
        method,
        headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const txt = await res.text();
      return txt ? JSON.parse(txt) : { version: null };
    } catch (e) {
      return { error: `Hyphae server not reachable at ${base} — start it with \`pnpm --filter @hyphae/server dev\`. (${String(e)})` };
    }
  }
  return {
    getModel: async () => {
      const res = await fetch(`${base}/model`);
      if (!res.ok) throw new Error(`GET /model failed: ${res.status}`);
      return HyphaeModelSchema.parse(await res.json());
    },
    createNode: (input) => mutate('POST', '/nodes', input),
    updateNode: (id, patch) => mutate('PATCH', `/nodes/${id}`, patch),
    deleteNode: (id) => mutate('DELETE', `/nodes/${id}`),
    createConnection: (input) => mutate('POST', '/connections', input),
    updateConnection: (id, patch) => mutate('PATCH', `/connections/${id}`, patch),
    deleteConnection: (id) => mutate('DELETE', `/connections/${id}`),
  };
}

function text(value: unknown) {
  return { content: [{ type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] };
}

function fieldDesc(d: FieldDef): string {
  const vals = d.values?.length ? ` Allowed: ${d.values.map((v) => `${v.value} (${v.description})`).join('; ')}.` : '';
  return `${d.description}${vals}${d.required ? ' (required)' : ''}`;
}
function fieldToZod(d: FieldDef) {
  const base =
    d.type === 'number' ? z.number()
    : d.type === 'boolean' ? z.boolean()
    : d.type === 'list' ? z.array(z.string())
    : d.type === 'enum' ? z.enum((d.values ?? []).map((v) => v.value) as [string, ...string[]])
    : z.string();
  return base.optional().describe(fieldDesc(d));
}
function fieldsShape(scope: 'node' | 'connection'): Record<string, z.ZodTypeAny> {
  const kinds = scope === 'node' ? c4Backend.nodeKinds.map((k) => k.id) : connectionKindIds(c4Backend);
  const byKey = new Map<string, FieldDef>();
  for (const id of kinds) for (const f of effectiveFields(c4Backend, id, scope)) if (!byKey.has(f.key)) byKey.set(f.key, f);
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [key, def] of byKey) shape[key] = fieldToZod(def);
  return shape;
}

async function main() {
  const base = process.env.HYPHAE_SERVER ?? 'http://localhost:5173';
  const tools = buildTools(httpApi(base));
  const server = new McpServer({ name: 'hyphae', version: '0.1.0' });

  server.registerTool(
    'get_text_context',
    {
      description: 'Plain-text view of the architecture model — call this FIRST to orient. By default returns a COMPACT SUMMARY of the whole model (one line per node) so it stays small even on large models. Use mode:"full" or a narrower scope when you need detail. Recommended flow on a big model: call with no args for the summary, then drill in with a root-scoped full call, get_node, get_subgraph, or search_nodes.',
      inputSchema: {
        mode: z.enum(['summary', 'full']).optional()
          .describe('summary = headline + one-line description + parent per node; full = description plus every documented `fields` entry for that node\'s kind (see describe_profile). Default: summary, unless `root` is set (then full).'),
        layer: z.string().optional()
          .describe('Restrict to one layer: Context, Container, Component, or Code.'),
        root: z.string().optional()
          .describe('A node id; render only that node and its descendants — e.g. one container plus its components.'),
        fields: z.array(z.string()).optional()
          .describe('Explicit node fields to include, e.g. ["responsibilities","invariants"]; overrides mode.'),
      },
    },
    async (a) => text(await tools.get_text_context(a)),
  );
  server.registerTool('get_node', { description: 'Get one node by id.', inputSchema: { id: z.string() } }, async (a) => text(await tools.get_node(a)));
  server.registerTool(
    'list_nodes',
    {
      description: 'List node summaries (id, name, type, parentId). Optional filters: `parentId` (e.g. the components of one container), `type`; plus `offset`/`limit` for pagination. Prefer this (or search_nodes / get_subgraph) over get_text_context on a large model.',
      inputSchema: { parentId: z.string().optional(), type: z.string().optional(), limit: z.number().optional(), offset: z.number().optional() },
    },
    async (a) => text(await tools.list_nodes(a)),
  );
  server.registerTool(
    'search_nodes',
    {
      description: 'Find nodes by case-insensitive substring across text fields (name, description, technology, responsibilities, invariants by default). Optional: `type`/`parentId` filters, `fields` to restrict which fields are searched (core fields or any documented `fields` key — see describe_profile), `limit` (default 25). Returns compact summaries with the parent name for disambiguation (component names can repeat across containers).',
      inputSchema: { query: z.string(), type: z.string().optional(), parentId: z.string().optional(), fields: z.array(z.string()).optional(), limit: z.number().optional() },
    },
    async (a) => text(await tools.search_nodes(a)),
  );
  server.registerTool('find_connections', { description: 'List the connections touching a node id.', inputSchema: { nodeId: z.string() } }, async (a) => text(await tools.find_connections(a)));
  server.registerTool(
    'list_connections',
    {
      description: 'Query connections across the model. Filters (all optional, AND-combined): type, transport, containerId (edges touching that container or any of its descendants), crossingBoundary (true = endpoints in different owning containers — i.e. inter-container / external edges; false = intra-container only), involvingExternal (an endpoint is an ExternalSystem). Supports offset/limit. Each raw result is enriched with fromName/toName and fromContainer/toContainer. Pass `rollup` to instead get DERIVED higher-level edges: connections lifted to that layer (component edges aggregated into Container↔Container or Context-level edges), with each rollup edge expanding its underlying connections inline as `realizedBy` (the other filters do not apply in rollup mode).',
      inputSchema: {
        type: z.enum(connectionKindIds(c4Backend) as [string, ...string[]]).optional().describe('Only connections of this type (active profile connection kind).'),
        transport: z.string().optional().describe('Only connections with this `fields.transport` value.'),
        containerId: z.string().optional().describe('A container node id; keep only edges touching it or one of its descendants.'),
        crossingBoundary: z.boolean().optional().describe('true = only edges whose endpoints belong to different containers (inter-container/external); false = only intra-container edges.'),
        involvingExternal: z.boolean().optional().describe('true = only edges with an ExternalSystem endpoint; false = only edges between in-system nodes.'),
        rollup: z.enum(['Container', 'Context']).optional().describe('Return DERIVED higher-level edges at this layer instead of raw connections: component edges are lifted and aggregated (intra-node edges dropped), and each result lists its underlying edges as realizedBy. Other filters are ignored in this mode.'),
        limit: z.number().optional(),
        offset: z.number().optional(),
      },
    },
    async (a) => text(await tools.list_connections(a)),
  );
  server.registerTool(
    'get_subgraph',
    {
      description: 'Local subgraph around a node: BFS to `depth` hops (default 1). Traverses BOTH connection edges (`direction` out/in/both, default both; optional `type` filter) AND containment (`containment` down/up/both/none, default down). So get_subgraph on a Container returns its child Components (depth 1) and their wiring (depth 2). Returns the reached node summaries and every connection among them. Use this to explore around a node instead of dumping the whole model.',
      inputSchema: {
        nodeId: z.string(),
        depth: z.number().optional().describe('Max hops from the root, default 1. Containment and connection steps both count.'),
        direction: z.enum(['in', 'out', 'both']).optional().describe('Which connection edges to follow: out (from→to), in (to→from), or both (default).'),
        type: z.enum(connectionKindIds(c4Backend) as [string, ...string[]]).optional().describe('Only traverse connections of this type (active profile connection kind).'),
        containment: z.enum(['down', 'up', 'both', 'none']).optional().describe('Follow parentId links: down = into children (default), up = to parents, both, or none. Default down means a Container returns its Components.'),
      },
    },
    async (a) => text(await tools.get_subgraph(a)),
  );

  const coreNodeFields = {
    parentId: z.string().nullable().optional(),
    description: z.string().optional(),
    codeRefs: z.array(z.string()).optional(),
    docRefs: z.array(z.string()).optional(),
    fields: z.object(fieldsShape('node')).partial().optional(),
  };
  server.registerTool('create_node', {
    description: "Add a node. Call describe_profile (or get_text_context) first. `type` is one of the active profile's node kinds. Containment: a Component's parent is a Container, a Container's parent a System, and a Code node's (Class/Interface/Function/Module/UIComponent) parent is a Component. Domain values go in `fields` (see describe_profile for each kind's fields). Returns the created node or {issues}.",
    inputSchema: { name: z.string(), type: z.enum(c4Backend.nodeKinds.map((k) => k.id) as [string, ...string[]]), ...coreNodeFields },
  }, async (a) => text(await tools.create_node(a)));
  server.registerTool('update_node', {
    description: 'Update fields of a node by id. Only provided fields change. Domain values go in `fields`. Returns the updated node or {issues}.',
    inputSchema: { id: z.string(), name: z.string().optional(), type: z.string().optional(), ...coreNodeFields },
  }, async (a) => text(await tools.update_node(a)));
  server.registerTool('delete_node', { description: 'Delete a node by id. Its connections are removed too.', inputSchema: { id: z.string() } }, async (a) => text(await tools.delete_node(a)));

  const coreConnFields = {
    description: z.string().optional(),
    direction: z.enum(['Unidirectional', 'Bidirectional']).optional(),
    realizedBy: z.array(z.string()).optional()
      .describe('Ids of lower-layer connections this edge aggregates/describes (e.g. a Component↔Component edge realizedBy the Code↔Code edges that explain it). Bound edges are excluded from rollup.'),
    fields: z.object(fieldsShape('connection')).partial().optional(),
  };
  server.registerTool('create_connection', {
    description: 'Connect two existing nodes by id. `type` is one of the active profile connection kinds (see describe_profile). Domain values (transport, intent, …) go in `fields`. Returns the created connection or {issues}. Use realizedBy to bind the lower-layer edges this connection aggregates.',
    inputSchema: { from: z.string(), to: z.string(), type: z.enum(connectionKindIds(c4Backend) as [string, ...string[]]), ...coreConnFields },
  }, async (a) => text(await tools.create_connection(a)));
  server.registerTool('update_connection', {
    description: 'Update fields of a connection by id. Only provided fields change. Domain values go in `fields`. Returns the updated connection or {issues}.',
    inputSchema: { id: z.string(), from: z.string().optional(), to: z.string().optional(), type: z.string().optional(), ...coreConnFields },
  }, async (a) => text(await tools.update_connection(a)));
  server.registerTool('delete_connection', { description: 'Delete a connection by id.', inputSchema: { id: z.string() } }, async (a) => text(await tools.delete_connection(a)));

  server.registerTool('describe_profile', {
    description: 'The active profile: its layers, node kinds, connection kinds, and the documented custom fields (with enum values and descriptions) valid for each. Call this to learn what `type` values and `fields` are available before creating nodes/connections.',
    inputSchema: {},
  }, async () => text(await tools.describe_profile({})));

  await server.connect(new StdioServerTransport());
}

// Only start the transport when run directly, not when imported by tests.
if (process.argv[1] && process.argv[1].endsWith('mcp.ts')) {
  void main();
}

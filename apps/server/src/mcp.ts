import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { getContext, HyphaeModelSchema, type HyphaeModel } from '@hyphae/schema';

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
      const searchFields = fields?.length
        ? fields
        : ['name', 'description', 'purpose', 'technology', 'responsibilities', 'invariants', 'assumptions', 'failureModes', 'tags'];
      const model = await api.getModel();
      const nameById = new Map(model.nodes.map((n) => [n.id, n.name]));
      const hit = (n: Record<string, unknown>) =>
        searchFields.some((f) => {
          const v = n[f];
          if (typeof v === 'string') return v.toLowerCase().includes(q);
          if (Array.isArray(v)) return v.some((x) => typeof x === 'string' && x.toLowerCase().includes(q));
          return false;
        });
      return model.nodes
        .filter((n) => (type === undefined || n.type === type) && (parentId === undefined || n.parentId === parentId) && hit(n as unknown as Record<string, unknown>))
        .slice(0, limit ?? 25)
        .map((n) => ({ id: n.id, name: n.name, type: n.type, parentId: n.parentId, parent: n.parentId ? nameById.get(n.parentId) ?? null : null, purpose: n.purpose }));
    },
    find_connections: async ({ nodeId }: { nodeId: string }) =>
      (await api.getModel()).connections.filter((c) => c.from === nodeId || c.to === nodeId),
    get_subgraph: async ({ nodeId, depth, direction, relationCategory, containment }: { nodeId: string; depth?: number; direction?: 'in' | 'out' | 'both'; relationCategory?: string; containment?: 'down' | 'up' | 'both' | 'none' }) => {
      const model = await api.getModel();
      if (!model.nodes.some((n) => n.id === nodeId)) return { error: `node ${nodeId} not found` };
      const maxDepth = depth ?? 1;
      const dir = direction ?? 'both';
      const cont = containment ?? 'down';
      const edges = relationCategory ? model.connections.filter((c) => c.relationCategory === relationCategory) : model.connections;
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

const nodeFields = {
  description: z.string().optional(),
  purpose: z.string().optional(),
  technology: z.string().optional(),
  responsibilities: z.array(z.string()).optional(),
  invariants: z.array(z.string()).optional(),
  assumptions: z.array(z.string()).optional(),
  failureModes: z.array(z.string()).optional(),
  parentId: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  owner: z.string().optional(),
  status: z.enum(['Planned', 'Active', 'Deprecated']).optional(),
};

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
          .describe('summary = headline + one-line purpose + parent per node; full = all semantic fields (description, technology, responsibilities, invariants, assumptions, failureModes). Default: summary, unless `root` is set (then full).'),
        layer: z.string().optional()
          .describe('Restrict to one layer: Context, Container, or Component.'),
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
      description: 'Find nodes by case-insensitive substring across text fields (name, description, purpose, technology, responsibilities, invariants, assumptions, failureModes, tags). Optional: `type`/`parentId` filters, `fields` to restrict which fields are searched, `limit` (default 25). Returns compact summaries with the parent name for disambiguation (component names can repeat across containers).',
      inputSchema: { query: z.string(), type: z.string().optional(), parentId: z.string().optional(), fields: z.array(z.string()).optional(), limit: z.number().optional() },
    },
    async (a) => text(await tools.search_nodes(a)),
  );
  server.registerTool('find_connections', { description: 'List the connections touching a node id.', inputSchema: { nodeId: z.string() } }, async (a) => text(await tools.find_connections(a)));
  server.registerTool(
    'get_subgraph',
    {
      description: 'Local subgraph around a node: BFS to `depth` hops (default 1). Traverses BOTH connection edges (`direction` out/in/both, default both; optional `relationCategory` filter) AND containment (`containment` down/up/both/none, default down). So get_subgraph on a Container returns its child Components (depth 1) and their wiring (depth 2). Returns the reached node summaries and every connection among them. Use this to explore around a node instead of dumping the whole model.',
      inputSchema: {
        nodeId: z.string(),
        depth: z.number().optional().describe('Max hops from the root, default 1. Containment and connection steps both count.'),
        direction: z.enum(['in', 'out', 'both']).optional().describe('Which connection edges to follow: out (from→to), in (to→from), or both (default).'),
        relationCategory: z.enum(['Dependency', 'DataFlow', 'Realization', 'Trace']).optional().describe('Only traverse connections of this category.'),
        containment: z.enum(['down', 'up', 'both', 'none']).optional().describe('Follow parentId links: down = into children (default), up = to parents, both, or none. Default down means a Container returns its Components.'),
      },
    },
    async (a) => text(await tools.get_subgraph(a)),
  );

  server.registerTool(
    'create_node',
    {
      description: "Add a node to the model. Call after get_text_context. `type` must be one of the active profile kinds: System, Container, Component, Actor, ExternalSystem. Containment: a Component's parentId must reference a Container, and a Container's parentId a System. Fill responsibilities/invariants/assumptions — these are the value this model gives other agents. Returns the created node, or {issues} if the write is rejected.",
      inputSchema: { name: z.string(), type: z.string(), ...nodeFields },
    },
    async (a) => text(await tools.create_node(a)),
  );
  server.registerTool(
    'update_node',
    {
      description: 'Update fields of an existing node by id. Only provided fields change. Returns the updated node, or {issues} if rejected.',
      inputSchema: { id: z.string(), name: z.string().optional(), type: z.string().optional(), ...nodeFields },
    },
    async (a) => text(await tools.update_node(a)),
  );
  server.registerTool('delete_node', { description: 'Delete a node by id. Its connections are removed too.', inputSchema: { id: z.string() } }, async (a) => text(await tools.delete_node(a)));

  server.registerTool(
    'create_connection',
    {
      description: 'Connect two existing nodes by id. relationCategory is required: Dependency, DataFlow, Realization, or Trace. transport: Sync, Async, InProcess, None. direction: Unidirectional or Bidirectional. Returns the created connection, or {issues} if rejected.',
      inputSchema: {
        from: z.string(), to: z.string(),
        relationCategory: z.enum(['Dependency', 'DataFlow', 'Realization', 'Trace']),
        transport: z.enum(['Sync', 'Async', 'InProcess', 'None']).optional(),
        intent: z.enum(['Read', 'Write', 'Trigger', 'Notify', 'Use']).optional(),
        description: z.string().optional(),
        direction: z.enum(['Unidirectional', 'Bidirectional']).optional(),
      },
    },
    async (a) => text(await tools.create_connection(a)),
  );
  server.registerTool(
    'update_connection',
    {
      description: 'Update fields of an existing connection by id. Only provided fields change (relationCategory, transport, intent, description, direction, from, to). Returns the updated connection, or {issues} if rejected.',
      inputSchema: {
        id: z.string(),
        from: z.string().optional(), to: z.string().optional(),
        relationCategory: z.enum(['Dependency', 'DataFlow', 'Realization', 'Trace']).optional(),
        transport: z.enum(['Sync', 'Async', 'InProcess', 'None']).optional(),
        intent: z.enum(['Read', 'Write', 'Trigger', 'Notify', 'Use']).optional(),
        description: z.string().optional(),
        direction: z.enum(['Unidirectional', 'Bidirectional']).optional(),
      },
    },
    async (a) => text(await tools.update_connection(a)),
  );
  server.registerTool('delete_connection', { description: 'Delete a connection by id.', inputSchema: { id: z.string() } }, async (a) => text(await tools.delete_connection(a)));

  await server.connect(new StdioServerTransport());
}

// Only start the transport when run directly, not when imported by tests.
if (process.argv[1] && process.argv[1].endsWith('mcp.ts')) {
  void main();
}

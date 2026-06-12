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
  deleteConnection(id: string): Promise<unknown>;
}

/** Pure tool handlers over an injected API client (re-reads the model per call). */
export function buildTools(api: HyphaeApi) {
  return {
    get_text_context: async ({ layer }: { layer?: string }) =>
      getContext(await api.getModel(), layer ? { layer } : {}),
    get_node: async ({ id }: { id: string }) =>
      (await api.getModel()).nodes.find((n) => n.id === id) ?? null,
    list_nodes: async (_: Record<string, never>) =>
      (await api.getModel()).nodes.map((n) => ({ id: n.id, name: n.name, type: n.type })),
    find_connections: async ({ nodeId }: { nodeId: string }) =>
      (await api.getModel()).connections.filter((c) => c.from === nodeId || c.to === nodeId),
    create_node: async (input: Record<string, unknown>) => api.createNode(input),
    update_node: async ({ id, ...patch }: { id: string } & Record<string, unknown>) => api.updateNode(id, patch),
    delete_node: async ({ id }: { id: string }) => api.deleteNode(id),
    create_connection: async (input: Record<string, unknown>) => api.createConnection(input),
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

  server.tool('get_text_context', 'Compact plain-text view of the architecture model. Call this FIRST to see what already exists before creating or editing.', { layer: z.string().optional() }, async (a) => text(await tools.get_text_context(a)));
  server.tool('get_node', 'Get one node by id.', { id: z.string() }, async (a) => text(await tools.get_node(a)));
  server.tool('list_nodes', 'List node summaries (id, name, type).', {}, async () => text(await tools.list_nodes({})));
  server.tool('find_connections', 'List the connections touching a node id.', { nodeId: z.string() }, async (a) => text(await tools.find_connections(a)));

  server.tool(
    'create_node',
    "Add a node to the model. Call after get_text_context. `type` must be one of the active profile kinds: System, Container, Component, Actor, ExternalSystem. Containment: a Component's parentId must reference a Container, and a Container's parentId a System. Fill responsibilities/invariants/assumptions — these are the value this model gives other agents. Returns the created node, or {issues} if the write is rejected.",
    { name: z.string(), type: z.string(), ...nodeFields },
    async (a) => text(await tools.create_node(a)),
  );
  server.tool(
    'update_node',
    'Update fields of an existing node by id. Only provided fields change. Returns the updated node, or {issues} if rejected.',
    { id: z.string(), name: z.string().optional(), type: z.string().optional(), ...nodeFields },
    async (a) => text(await tools.update_node(a)),
  );
  server.tool('delete_node', 'Delete a node by id. Its connections are removed too.', { id: z.string() }, async (a) => text(await tools.delete_node(a)));

  server.tool(
    'create_connection',
    'Connect two existing nodes by id. relationCategory is required: Dependency, DataFlow, Realization, or Trace. transport: Sync, Async, InProcess, None. direction: Unidirectional or Bidirectional. Returns the created connection, or {issues} if rejected.',
    {
      from: z.string(), to: z.string(),
      relationCategory: z.enum(['Dependency', 'DataFlow', 'Realization', 'Trace']),
      transport: z.enum(['Sync', 'Async', 'InProcess', 'None']).optional(),
      intent: z.enum(['Read', 'Write', 'Trigger', 'Notify', 'Use']).optional(),
      description: z.string().optional(),
      direction: z.enum(['Unidirectional', 'Bidirectional']).optional(),
    },
    async (a) => text(await tools.create_connection(a)),
  );
  server.tool('delete_connection', 'Delete a connection by id.', { id: z.string() }, async (a) => text(await tools.delete_connection(a)));

  await server.connect(new StdioServerTransport());
}

// Only start the transport when run directly, not when imported by tests.
if (process.argv[1] && process.argv[1].endsWith('mcp.ts')) {
  void main();
}

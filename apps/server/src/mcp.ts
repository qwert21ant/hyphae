import { join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { getContext, type HyphaeModel } from '@hyphae/schema';
import { ModelStore } from './store';

/** Pure tool handlers, parameterised by a model getter (re-read per call). */
export function buildTools(getModel: () => HyphaeModel) {
  return {
    get_text_context: ({ layer }: { layer?: string }) =>
      getContext(getModel(), layer ? { layer } : {}),
    get_node: ({ id }: { id: string }) =>
      getModel().nodes.find((n) => n.id === id) ?? null,
    list_nodes: (_: Record<string, never>) =>
      getModel().nodes.map((n) => ({ id: n.id, name: n.name, type: n.type })),
    find_connections: ({ nodeId }: { nodeId: string }) =>
      getModel().connections.filter((c) => c.from === nodeId || c.to === nodeId),
  };
}

function text(value: unknown) {
  return { content: [{ type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] };
}

async function main() {
  const file = process.env.HYPHAE_FILE ?? join(process.cwd(), 'hyphae.json');
  // Re-create the store per call so external edits to the file are picked up.
  const tools = buildTools(() => new ModelStore(file).get());
  const server = new McpServer({ name: 'hyphae', version: '0.1.0' });

  server.tool('get_text_context', 'Compact plain-text view of the architecture model', { layer: z.string().optional() }, async (a) => text(tools.get_text_context(a)));
  server.tool('get_node', 'Get one node by id', { id: z.string() }, async (a) => text(tools.get_node(a)));
  server.tool('list_nodes', 'List node summaries', {}, async () => text(tools.list_nodes({})));
  server.tool('find_connections', 'Connections touching a node', { nodeId: z.string() }, async (a) => text(tools.find_connections(a)));

  await server.connect(new StdioServerTransport());
}

// Only start the transport when run directly, not when imported by tests.
if (process.argv[1] && process.argv[1].endsWith('mcp.ts')) {
  void main();
}

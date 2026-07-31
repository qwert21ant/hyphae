import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { httpApi } from './api';
import { buildTools } from './tools/index';
import { registerAll } from './register';

export { buildTools } from './tools/index';
export type { HyphaeApi } from './api';
export { flowStepSchema, flowItemSchema, patternMemberSchema, patternTransitionSchema, patternItemSchema } from './params';

async function main() {
  const base = process.env.HYPHAE_SERVER ?? 'http://localhost:5173';
  const tools = buildTools(httpApi(base));
  const server = new McpServer({ name: 'hyphae', version: '0.1.0' });

  registerAll(server, tools);

  await server.connect(new StdioServerTransport());
}

// Only start the transport when run directly, not when imported by tests.
// (argv[1] is the invoked script's path; normalize \ to / so this also matches on Windows.)
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('mcp/index.ts')) {
  void main();
}

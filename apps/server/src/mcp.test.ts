import { describe, it, expect } from 'vitest';
import { buildTools } from './mcp';
import { emptyModel } from '@hyphae/schema';

function model() {
  const m = emptyModel();
  m.nodes.push({
    id: 'api', name: 'API', type: 'Container', description: 'edge', responsibilities: [],
    invariants: [], assumptions: [], failureModes: [], tags: [], status: 'Active',
    parentId: null, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't',
  });
  m.connections.push({
    id: 'c1', from: 'api', to: 'api', relationCategory: 'Dependency', transport: 'Sync',
    description: 'self', direction: 'Unidirectional', realizes: [], codeRefs: [],
  });
  return m;
}

describe('MCP tool handlers', () => {
  const tools = buildTools(() => model());

  it('get_text_context returns plain text', () => {
    expect(tools.get_text_context({})).toContain('API (Container)');
  });

  it('get_node returns one node by id', () => {
    expect(tools.get_node({ id: 'api' })).toMatchObject({ name: 'API' });
  });

  it('list_nodes lists summaries', () => {
    expect(tools.list_nodes({})).toEqual([{ id: 'api', name: 'API', type: 'Container' }]);
  });

  it('find_connections filters by node id', () => {
    expect(tools.find_connections({ nodeId: 'api' })).toHaveLength(1);
  });
});

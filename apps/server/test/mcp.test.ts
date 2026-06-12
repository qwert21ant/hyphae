import { describe, it, expect } from 'vitest';
import { buildTools, type HyphaeApi } from '../src/mcp';
import { emptyModel, type HyphaeModel } from '@hyphae/schema';

function model(): HyphaeModel {
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

function fakeApi(over: Partial<HyphaeApi> = {}): HyphaeApi {
  return {
    getModel: async () => model(),
    createNode: async (input) => ({ node: { id: 'new', ...(input as object) }, version: 1 }),
    updateNode: async (id, patch) => ({ node: { id, ...(patch as object) }, version: 1 }),
    deleteNode: async () => ({ version: 1 }),
    createConnection: async (input) => ({ connection: { id: 'c2', ...(input as object) }, version: 1 }),
    deleteConnection: async () => ({ version: 1 }),
    ...over,
  };
}

describe('MCP tool handlers', () => {
  it('get_text_context returns plain text', async () => {
    expect(await buildTools(fakeApi()).get_text_context({})).toContain('API (Container)');
  });
  it('get_node returns one node by id', async () => {
    expect(await buildTools(fakeApi()).get_node({ id: 'api' })).toMatchObject({ name: 'API' });
  });
  it('list_nodes lists summaries', async () => {
    expect(await buildTools(fakeApi()).list_nodes({})).toEqual([{ id: 'api', name: 'API', type: 'Container' }]);
  });
  it('find_connections filters by node id', async () => {
    expect(await buildTools(fakeApi()).find_connections({ nodeId: 'api' })).toHaveLength(1);
  });
  it('create_node forwards input and returns the created node', async () => {
    const r = await buildTools(fakeApi()).create_node({ name: 'X', type: 'Component' });
    expect(r).toMatchObject({ node: { name: 'X', type: 'Component' } });
  });
  it('create_node surfaces issues when the server rejects the write', async () => {
    const api = fakeApi({ createNode: async () => ({ issues: [{ kind: 'bad-parent', ref: 'x', message: 'no' }] }) });
    const r = await buildTools(api).create_node({ name: 'X', type: 'Component', parentId: 'y' });
    expect(r).toMatchObject({ issues: [{ kind: 'bad-parent' }] });
  });
  it('update_node splits id from the patch', async () => {
    const r = await buildTools(fakeApi()).update_node({ id: 'api', name: 'Renamed' });
    expect(r).toMatchObject({ node: { id: 'api', name: 'Renamed' } });
  });
});

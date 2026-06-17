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
    updateConnection: async (id, patch) => ({ connection: { id, ...(patch as object) }, version: 1 }),
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
    expect(await buildTools(fakeApi()).list_nodes({})).toEqual([{ id: 'api', name: 'API', type: 'Container', parentId: null }]);
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
  it('update_connection splits id from the patch', async () => {
    const r = await buildTools(fakeApi()).update_connection({ id: 'c1', relationCategory: 'Realization' });
    expect(r).toMatchObject({ connection: { id: 'c1', relationCategory: 'Realization' } });
  });
});

function graphModel(): HyphaeModel {
  const m = emptyModel();
  const base = {
    responsibilities: [], invariants: [], assumptions: [], failureModes: [], tags: [],
    status: 'Active' as const, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't',
  };
  m.nodes.push(
    { id: 'sys', name: 'Sys', type: 'System', description: '', parentId: null, ...base },
    { id: 'ca', name: 'Alpha', type: 'Container', description: '', parentId: 'sys', ...base },
    { id: 'cb', name: 'Beta', type: 'Container', description: '', parentId: 'sys', ...base },
    { id: 'n1', name: 'Widget', type: 'Component', description: 'handles widgets', parentId: 'ca', ...base },
    { id: 'n2', name: 'Gadget', type: 'Component', description: 'gadget logic', parentId: 'ca', ...base },
    { id: 'n3', name: 'Widget', type: 'Component', description: 'beta widget', parentId: 'cb', ...base },
    { id: 'n4', name: 'Sink', type: 'Component', description: '', parentId: 'cb', ...base },
  );
  const e = { description: '', direction: 'Unidirectional' as const, realizes: [], codeRefs: [] };
  m.connections.push(
    { id: 'e1', from: 'n1', to: 'n2', relationCategory: 'Dependency', transport: 'InProcess', ...e },
    { id: 'e2', from: 'n1', to: 'n3', relationCategory: 'Dependency', transport: 'Sync', ...e },
    { id: 'e3', from: 'n2', to: 'n1', relationCategory: 'Realization', transport: 'InProcess', ...e },
    { id: 'e4', from: 'n4', to: 'n1', relationCategory: 'Dependency', transport: 'Sync', ...e },
    { id: 'e5', from: 'n3', to: 'n4', relationCategory: 'Dependency', transport: 'Sync', ...e },
  );
  return m;
}

describe('MCP query tools', () => {
  const api = () => fakeApi({ getModel: async () => graphModel() });

  it('search_nodes matches name and description, with parentId for disambiguation', async () => {
    const r = (await buildTools(api()).search_nodes({ query: 'widget' })) as Array<{ id: string; parentId: string | null }>;
    expect(r.map((n) => n.id).sort()).toEqual(['n1', 'n3']);
    expect(r.every((n) => 'parentId' in n)).toBe(true);
  });

  it('search_nodes respects type + parentId filters', async () => {
    const r = (await buildTools(api()).search_nodes({ query: 'widget', type: 'Component', parentId: 'ca' })) as Array<{ id: string }>;
    expect(r.map((n) => n.id)).toEqual(['n1']);
  });

  it('list_nodes filters by parentId', async () => {
    const r = (await buildTools(api()).list_nodes({ parentId: 'ca' })) as Array<{ id: string }>;
    expect(r.map((n) => n.id).sort()).toEqual(['n1', 'n2']);
  });

  it('list_nodes filters by type', async () => {
    const r = (await buildTools(api()).list_nodes({ type: 'Container' })) as Array<{ id: string }>;
    expect(r.map((n) => n.id).sort()).toEqual(['ca', 'cb']);
  });

  it('list_nodes paginates with offset/limit', async () => {
    const r = (await buildTools(api()).list_nodes({ limit: 2 })) as unknown[];
    expect(r).toHaveLength(2);
  });

  it('get_subgraph returns the directional neighborhood', async () => {
    const out = (await buildTools(api()).get_subgraph({ nodeId: 'n1', depth: 1, direction: 'out' })) as { nodes: Array<{ id: string }>; connections: unknown[] };
    expect(out.nodes.map((n) => n.id).sort()).toEqual(['n1', 'n2', 'n3']);
    const both = (await buildTools(api()).get_subgraph({ nodeId: 'n1', depth: 1, direction: 'both' })) as { nodes: Array<{ id: string }> };
    expect(both.nodes.map((n) => n.id).sort()).toEqual(['n1', 'n2', 'n3', 'n4']);
  });

  it('get_subgraph filters by relationCategory', async () => {
    const r = (await buildTools(api()).get_subgraph({ nodeId: 'n1', depth: 1, relationCategory: 'Realization' })) as { nodes: Array<{ id: string }>; connections: unknown[] };
    expect(r.nodes.map((n) => n.id).sort()).toEqual(['n1', 'n2']);
    expect(r.connections).toHaveLength(1);
  });

  it('get_subgraph honors depth', async () => {
    const r = (await buildTools(api()).get_subgraph({ nodeId: 'n1', depth: 2, direction: 'out' })) as { nodes: Array<{ id: string }> };
    expect(r.nodes.map((n) => n.id).sort()).toEqual(['n1', 'n2', 'n3', 'n4']);
  });

  it('get_subgraph reports a missing root', async () => {
    const r = (await buildTools(api()).get_subgraph({ nodeId: 'nope' })) as { error?: string };
    expect(r).toMatchObject({ error: expect.stringContaining('not found') });
  });

  it('get_subgraph descends into child nodes by default', async () => {
    const r = (await buildTools(api()).get_subgraph({ nodeId: 'ca', depth: 1 })) as { nodes: Array<{ id: string }> };
    expect(r.nodes.map((n) => n.id).sort()).toEqual(['ca', 'n1', 'n2']);
  });

  it('get_subgraph respects depth while descending containment', async () => {
    const d1 = (await buildTools(api()).get_subgraph({ nodeId: 'sys', depth: 1 })) as { nodes: Array<{ id: string }> };
    expect(d1.nodes.map((n) => n.id).sort()).toEqual(['ca', 'cb', 'sys']);
    const d2 = (await buildTools(api()).get_subgraph({ nodeId: 'sys', depth: 2 })) as { nodes: Array<{ id: string }> };
    expect(d2.nodes.map((n) => n.id).sort()).toEqual(['ca', 'cb', 'n1', 'n2', 'n3', 'n4', 'sys']);
  });

  it('get_subgraph containment:none ignores parent/child links', async () => {
    const r = (await buildTools(api()).get_subgraph({ nodeId: 'ca', containment: 'none' })) as { nodes: Array<{ id: string }> };
    expect(r.nodes.map((n) => n.id)).toEqual(['ca']);
  });

  it('get_subgraph containment:up reaches the parent', async () => {
    const r = (await buildTools(api()).get_subgraph({ nodeId: 'n1', depth: 1, containment: 'up' })) as { nodes: Array<{ id: string }> };
    expect(r.nodes.map((n) => n.id)).toContain('ca');
  });
});

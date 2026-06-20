import { describe, it, expect } from 'vitest';
import { buildTools, type HyphaeApi } from '../src/mcp';
import { emptyModel, type HyphaeModel } from '@hyphae/schema';

function model(): HyphaeModel {
  const m = emptyModel();
  m.nodes.push({
    id: 'api', name: 'API', type: 'Container', description: 'edge', fields: {},
    parentId: null, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't',
  });
  m.connections.push({
    id: 'c1', from: 'api', to: 'api', type: 'Dependency', fields: { transport: 'Sync' },
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
    createConnection: async (input) => ({ connection: { id: 'c2', type: 'Dependency', ...(input as object) }, version: 1 }),
    updateConnection: async (id, patch) => ({ connection: { id, type: 'Dependency', ...(patch as object) }, version: 1 }),
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
    const r = await buildTools(fakeApi()).update_connection({ id: 'c1', type: 'Realization' });
    expect(r).toMatchObject({ connection: { id: 'c1', type: 'Realization' } });
  });

  it('describe_profile returns kinds and documented fields', async () => {
    const r = (await buildTools(fakeApi()).describe_profile({})) as {
      nodeKinds: Array<{ id: string }>; connectionKinds: Array<{ id: string }>;
      commonNodeFields: Array<{ key: string }>;
    };
    expect(r.nodeKinds.map((k) => k.id)).toContain('Container');
    expect(r.connectionKinds.map((k) => k.id)).toContain('Dependency');
    expect(r.commonNodeFields.map((f) => f.key)).toContain('responsibilities');
  });

  it('create_node forwards a fields bag', async () => {
    const r = await buildTools(fakeApi()).create_node({ name: 'X', type: 'Component', fields: { technology: 'Go' } });
    expect(r).toMatchObject({ node: { name: 'X', fields: { technology: 'Go' } } });
  });
});

function graphModel(): HyphaeModel {
  const m = emptyModel();
  const base = { fields: {}, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't' };
  m.nodes.push(
    { id: 'sys', name: 'Sys', type: 'System', description: '', parentId: null, ...base },
    { id: 'ca', name: 'Alpha', type: 'Container', description: '', parentId: 'sys', ...base },
    { id: 'cb', name: 'Beta', type: 'Container', description: '', parentId: 'sys', ...base },
    { id: 'n1', name: 'Widget', type: 'Component', description: 'handles widgets', parentId: 'ca', ...base },
    { id: 'n2', name: 'Gadget', type: 'Component', description: 'gadget logic', parentId: 'ca', ...base },
    { id: 'n3', name: 'Widget', type: 'Component', description: 'beta widget', parentId: 'cb', ...base },
    { id: 'n4', name: 'Sink', type: 'Component', description: '', parentId: 'cb', ...base },
  );
  const e = { description: '', direction: 'Unidirectional' as const, realizes: [], codeRefs: [], fields: {} };
  m.connections.push(
    { id: 'e1', from: 'n1', to: 'n2', type: 'Dependency', ...e },
    { id: 'e2', from: 'n1', to: 'n3', type: 'Dependency', ...e },
    { id: 'e3', from: 'n2', to: 'n1', type: 'Realization', ...e },
    { id: 'e4', from: 'n4', to: 'n1', type: 'Dependency', ...e },
    { id: 'e5', from: 'n3', to: 'n4', type: 'Dependency', ...e },
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

  it('get_subgraph filters by connection type', async () => {
    const r = (await buildTools(api()).get_subgraph({ nodeId: 'n1', depth: 1, type: 'Realization' })) as { nodes: Array<{ id: string }>; connections: unknown[] };
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

function connModel(): HyphaeModel {
  const m = emptyModel();
  const base = { description: '', fields: {}, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't' };
  m.nodes.push(
    { id: 'sys', name: 'Sys', type: 'System', parentId: null, ...base },
    { id: 'ca', name: 'Alpha', type: 'Container', parentId: 'sys', ...base },
    { id: 'cb', name: 'Beta', type: 'Container', parentId: 'sys', ...base },
    { id: 'a1', name: 'A1', type: 'Component', parentId: 'ca', ...base },
    { id: 'a2', name: 'A2', type: 'Component', parentId: 'ca', ...base },
    { id: 'b1', name: 'B1', type: 'Component', parentId: 'cb', ...base },
    { id: 'ext', name: 'Ext', type: 'ExternalSystem', parentId: null, ...base },
  );
  const e = { description: '', direction: 'Unidirectional' as const, realizes: [], codeRefs: [] };
  m.connections.push(
    { id: 'x1', from: 'a1', to: 'b1', type: 'Dependency', fields: { transport: 'Sync' }, ...e },
    { id: 'x2', from: 'a1', to: 'ext', type: 'DataFlow', fields: { transport: 'Async' }, ...e },
    { id: 'x3', from: 'b1', to: 'ext', type: 'Dependency', fields: { transport: 'Sync' }, ...e },
    { id: 'x4', from: 'a1', to: 'a2', type: 'Dependency', fields: { transport: 'InProcess' }, ...e },
  );
  return m;
}

describe('list_connections', () => {
  const api = () => fakeApi({ getModel: async () => connModel() });
  const ids = (r: unknown) => (r as Array<{ id: string }>).map((c) => c.id).sort();

  it('lists all connections by default', async () => {
    expect(ids(await buildTools(api()).list_connections({}))).toEqual(['x1', 'x2', 'x3', 'x4']);
  });

  it('filters by type and transport', async () => {
    expect(ids(await buildTools(api()).list_connections({ type: 'Dependency' }))).toEqual(['x1', 'x3', 'x4']);
    expect(ids(await buildTools(api()).list_connections({ transport: 'Sync' }))).toEqual(['x1', 'x3']);
  });

  it('filters by involvingExternal', async () => {
    expect(ids(await buildTools(api()).list_connections({ involvingExternal: true }))).toEqual(['x2', 'x3']);
    expect(ids(await buildTools(api()).list_connections({ involvingExternal: false }))).toEqual(['x1', 'x4']);
  });

  it('filters by crossingBoundary (different owning containers)', async () => {
    expect(ids(await buildTools(api()).list_connections({ crossingBoundary: true }))).toEqual(['x1', 'x2', 'x3']);
    expect(ids(await buildTools(api()).list_connections({ crossingBoundary: false }))).toEqual(['x4']);
  });

  it('filters by containerId (subtree touch)', async () => {
    expect(ids(await buildTools(api()).list_connections({ containerId: 'cb' }))).toEqual(['x1', 'x3']);
    expect(ids(await buildTools(api()).list_connections({ containerId: 'ca' }))).toEqual(['x1', 'x2', 'x4']);
  });

  it('enriches results with endpoint names and owning containers', async () => {
    const r = (await buildTools(api()).list_connections({ crossingBoundary: true })) as Array<Record<string, unknown>>;
    const x1 = r.find((c) => c.id === 'x1')!;
    expect(x1).toMatchObject({ fromName: 'A1', toName: 'B1', fromContainer: 'Alpha', toContainer: 'Beta' });
  });

  it('rollup:Container returns derived container edges with realizedBy expanded', async () => {
    const r = (await buildTools(api()).list_connections({ rollup: 'Container' })) as Array<{ from: string; to: string; realizedBy: Array<{ id: string; type: string }> }>;
    expect(r.map((e) => `${e.from}->${e.to}`).sort()).toEqual(['ca->cb', 'ca->ext', 'cb->ext']);
    const caCb = r.find((e) => e.from === 'ca' && e.to === 'cb')!;
    expect(caCb.realizedBy).toEqual([{ id: 'x1', fromName: 'A1', toName: 'B1', type: 'Dependency', transport: 'Sync', intent: undefined, description: '' }]);
  });

  it('rollup:Context collapses internal edges to the System, keeping external edges', async () => {
    const r = (await buildTools(api()).list_connections({ rollup: 'Context' })) as Array<{ from: string; to: string; realizedBy: Array<{ id: string }> }>;
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ from: 'sys', to: 'ext' });
    expect(r[0].realizedBy.map((u) => u.id).sort()).toEqual(['x2', 'x3']);
  });
});

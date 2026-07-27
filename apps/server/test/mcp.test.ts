import { describe, it, expect } from 'vitest';
import { buildTools, type HyphaeApi } from '../src/mcp';
import { emptyModel, type HyphaeModel } from '@hyphae/schema';

function model(): HyphaeModel {
  const m = emptyModel();
  m.nodes.push({
    id: 'api', name: 'API', type: 'Container', description: 'edge', fields: { summary: 'Edge API' },
    parentId: null, root: null, role: null, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't',
  });
  m.connections.push({
    id: 'c1', from: 'api', to: 'api', fields: {}, verb: 'uses', object: '',
    description: 'self', direction: 'Unidirectional', realizedBy: [], codeRefs: [],
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
    createFlow: async (input) => ({ flow: { id: 'f2', ...(input as object) }, version: 1 }),
    updateFlow: async (id, patch) => ({ flow: { id, ...(patch as object) }, version: 1 }),
    deleteFlow: async () => ({ version: 1 }),
    createPattern: async (input) => ({ pattern: { id: 'p2', ...(input as object) }, version: 1 }),
    updatePattern: async (id, patch) => ({ pattern: { id, ...(patch as object) }, version: 1 }),
    deletePattern: async () => ({ version: 1 }),
    ...over,
  };
}

describe('MCP tool handlers', () => {
  it('model_overview returns counts and the container map', async () => {
    const out = await buildTools(fakeApi()).model_overview({});
    expect(out).toContain('API [Container]'); // the container is listed with its name
    expect(out).toContain('Connections:');    // counts header present
  });
  it('get_node returns one node by id', async () => {
    expect(await buildTools(fakeApi()).get_node({ id: 'api' })).toMatchObject({ name: 'API' });
  });
  it('get_node returns an error for a missing id', async () => {
    expect(await buildTools(fakeApi()).get_node({ id: 'nope' })).toMatchObject({ error: expect.stringContaining('not found') });
  });
  it('list_nodes lists summaries', async () => {
    expect(await buildTools(fakeApi()).list_nodes({})).toEqual([{ id: 'api', name: 'API', type: 'Container', parentId: null }]);
  });
  it('validate_model returns issues against the active profile', async () => {
    // a well-formed System→Container model has no structural issues
    const clean = fakeApi({ getModel: async () => {
      const m = emptyModel();
      m.nodes.push(
        { id: 'sys', name: 'Sys', type: 'System', description: '', fields: { summary: 'x' }, parentId: null, root: null, role: null, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't' },
        { id: 'api', name: 'API', type: 'Container', description: 'edge', fields: { summary: 'Edge API' }, parentId: 'sys', root: null, role: null, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't' },
      );
      return m;
    } });
    expect(await buildTools(clean).validate_model({})).toEqual([]);
    // a dangling connection endpoint surfaces an issue
    const api = fakeApi({ getModel: async () => {
      const m = model();
      m.connections.push({ id: 'c2', from: 'api', to: 'ghost', fields: {}, verb: 'uses', object: '', description: '', direction: 'Unidirectional', realizedBy: [], codeRefs: [] });
      return m;
    } });
    const issues = (await buildTools(api).validate_model({})) as Array<{ kind: string; ref: string }>;
    expect(issues).toContainEqual(expect.objectContaining({ kind: 'dangling-endpoint', ref: 'c2' }));
  });
  it('model_gaps flags orphans and thin descriptions', async () => {
    const api = fakeApi({ getModel: async () => {
      const m = model();
      // add two lone (orphan) components under the existing container — neither has a connection
      m.nodes.push(
        { id: 'comp', name: 'Comp', type: 'Component', parentId: 'api', description: 'does work', fields: {}, root: null, role: null, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't' },
        { id: 'orph', name: 'Orph', type: 'Component', parentId: 'api', description: '', fields: {}, root: null, role: null, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't' },
      );
      return m;
    } });
    const g = (await buildTools(api).model_gaps({})) as {
      orphanNodes: Array<{ id: string }>;
      thinDescriptions: Array<{ id: string; reason: string }>;
    };
    expect(g.orphanNodes.map((n) => n.id)).toEqual(['comp', 'orph']); // both components have no edges
    expect(g.thinDescriptions.some((t) => t.id === 'orph' && t.reason === 'empty')).toBe(true);
  });
  it('create_nodes echoes id + name on full success', async () => {
    const r = await buildTools(fakeApi()).create_nodes({ nodes: [{ name: 'X', type: 'Component' }] });
    expect(r).toEqual({ created: [{ id: 'new', name: 'X' }] });
  });

  it('create_nodes is best-effort: returns per-item results when one fails', async () => {
    let call = 0;
    const api = fakeApi({ createNode: async (input) => (call++ === 0
      ? { node: { id: 'a', ...(input as object) }, version: 1 }
      : { issues: [{ kind: 'bad-parent', ref: 'b', message: 'no' }] }) });
    const r = await buildTools(api).create_nodes({ nodes: [{ name: 'A', type: 'Component' }, { name: 'B', type: 'Component', parentId: 'z' }] });
    expect(r).toEqual({ results: [{ id: 'a', name: 'A' }, { issues: [{ kind: 'bad-parent', ref: 'b', message: 'no' }] }] });
  });

  it('create_connections echoes id + from/to on full success', async () => {
    const r = await buildTools(fakeApi()).create_connections({ connections: [{ from: 'a', to: 'b' }] });
    expect(r).toEqual({ created: [{ id: 'c2', from: 'a', to: 'b' }] });
  });

  it('update_nodes returns ok on full success and splits id from patch', async () => {
    const seen: Array<[string, unknown]> = [];
    const api = fakeApi({ updateNode: async (id, patch) => { seen.push([id, patch]); return { node: { id }, version: 1 }; } });
    const r = await buildTools(api).update_nodes({ updates: [{ id: 'n1', name: 'Renamed' }] });
    expect(r).toEqual({ ok: true });
    expect(seen).toEqual([['n1', { name: 'Renamed' }]]);
  });

  it('update_connections reports per-item issues on partial failure', async () => {
    const api = fakeApi({ updateConnection: async () => ({ issues: [{ kind: 'dangling-endpoint', ref: 'c', message: 'no' }] }) });
    const r = await buildTools(api).update_connections({ updates: [{ id: 'c1', verb: 'reads' }] });
    expect(r).toEqual({ results: [{ issues: [{ kind: 'dangling-endpoint', ref: 'c', message: 'no' }] }] });
  });

  it('delete_nodes returns ok and forwards ids', async () => {
    const seen: string[] = [];
    const api = fakeApi({ deleteNode: async (id) => { seen.push(id); return { version: 1 }; } });
    const r = await buildTools(api).delete_nodes({ ids: ['a', 'b'] });
    expect(r).toEqual({ ok: true });
    expect(seen).toEqual(['a', 'b']);
  });

  it('delete_connections surfaces not-found error per item', async () => {
    const api = fakeApi({ deleteConnection: async () => ({ error: 'connection x not found' }) });
    const r = await buildTools(api).delete_connections({ ids: ['x'] });
    expect(r).toEqual({ results: [{ error: 'connection x not found' }] });
  });

  it('create_connections forwards realizedBy', async () => {
    let seen: Record<string, unknown> | undefined;
    const api = fakeApi({ createConnection: async (input) => { seen = input as Record<string, unknown>; return { connection: { id: 'c2', ...(input as object) }, version: 1 }; } });
    const r = await buildTools(api).create_connections({ connections: [{ from: 'a', to: 'b', realizedBy: ['c1'] }] });
    expect(r).toEqual({ created: [{ id: 'c2', from: 'a', to: 'b' }] });
    expect(seen).toMatchObject({ realizedBy: ['c1'] });
  });

  it('resolve_refs resolves a node\'s codeRefs through its inherited root', async () => {
    const api = fakeApi({ getModel: async () => {
      const m = model();
      m.nodes[0].root = 'endpoints/api/';
      m.nodes[0].codeRefs = ['src/main.ts'];
      return m;
    } });
    const r = await buildTools(api).resolve_refs({ nodeId: 'api' });
    expect(r).toEqual({
      nodeId: 'api',
      root: 'endpoints/api/',
      refs: [{ ref: 'src/main.ts', resolved: 'endpoints/api/src/main.ts' }],
    });
  });

  it('resolve_refs reverse-looks-up owners by path', async () => {
    const api = fakeApi({ getModel: async () => {
      const m = model();
      m.nodes[0].root = 'endpoints/api/';
      m.nodes[0].codeRefs = ['src/main.ts'];
      return m;
    } });
    const r = await buildTools(api).resolve_refs({ path: 'endpoints/api/src/main.ts' });
    expect(r).toEqual({ path: 'endpoints/api/src/main.ts', owners: ['api'] });
  });

  it('resolve_refs errors when neither nodeId nor path is given', async () => {
    expect(await buildTools(fakeApi()).resolve_refs({})).toEqual({ error: 'Pass either nodeId or path.' });
  });

  it('resolve_refs errors for an unknown nodeId', async () => {
    expect(await buildTools(fakeApi()).resolve_refs({ nodeId: 'nope' })).toEqual({ error: 'node nope not found' });
  });

  it('describe_profile returns kinds and documented fields', async () => {
    const r = (await buildTools(fakeApi()).describe_profile({})) as {
      nodeKinds: Array<{ id: string }>; verbs: Array<{ id: string }>;
      commonNodeFields: Array<{ key: string }>; patternKinds: Array<{ id: string }>;
    };
    expect(r.nodeKinds.map((k) => k.id)).toContain('Container');
    expect('connectionKinds' in r).toBe(false);
    expect(r.verbs.map((v) => v.id)).toContain('reads');
    expect(r.commonNodeFields.map((f) => f.key)).toContain('responsibilities');
    expect(Array.isArray((r as { patternKinds?: unknown[] }).patternKinds)).toBe(true);
  });

});

function graphModel(): HyphaeModel {
  const m = emptyModel();
  const base = { fields: {}, root: null, role: null, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't' };
  m.nodes.push(
    { id: 'sys', name: 'Sys', type: 'System', description: '', parentId: null, ...base },
    { id: 'ca', name: 'Alpha', type: 'Container', description: '', parentId: 'sys', ...base },
    { id: 'cb', name: 'Beta', type: 'Container', description: '', parentId: 'sys', ...base },
    { id: 'n1', name: 'Widget', type: 'Component', description: 'handles widgets', parentId: 'ca', ...base },
    { id: 'n2', name: 'Gadget', type: 'Component', description: 'gadget logic', parentId: 'ca', ...base },
    { id: 'n3', name: 'Widget', type: 'Component', description: 'beta widget', parentId: 'cb', ...base },
    { id: 'n4', name: 'Sink', type: 'Component', description: '', parentId: 'cb', ...base },
  );
  const e = { verb: 'uses', object: '', description: '', direction: 'Unidirectional' as const, realizedBy: [], codeRefs: [], fields: {} };
  m.connections.push(
    { id: 'e1', from: 'n1', to: 'n2', ...e },
    { id: 'e2', from: 'n1', to: 'n3', ...e },
    { id: 'e3', from: 'n2', to: 'n1', ...e, verb: 'publishes' },
    { id: 'e4', from: 'n4', to: 'n1', ...e },
    { id: 'e5', from: 'n3', to: 'n4', ...e },
  );
  return m;
}

describe('MCP query tools', () => {
  const api = () => fakeApi({ getModel: async () => graphModel() });

  it('list_nodes with query matches name and description, enriching rows with parent name', async () => {
    const r = (await buildTools(api()).list_nodes({ query: 'widget' })) as unknown as Array<{ id: string; parentId: string | null; parent: string | null; description: string }>;
    expect(r.map((n) => n.id).sort()).toEqual(['n1', 'n3']);
    expect(r.find((n) => n.id === 'n1')).toMatchObject({ parent: 'Alpha', description: 'handles widgets' });
  });

  it('list_nodes query respects type + parentId filters', async () => {
    const r = (await buildTools(api()).list_nodes({ query: 'widget', type: 'Component', parentId: 'ca' })) as Array<{ id: string }>;
    expect(r.map((n) => n.id)).toEqual(['n1']);
  });

  it('list_nodes query caps at 25 rows by default; explicit limit overrides and plain enumeration is uncapped', async () => {
    const big = () => {
      const m = emptyModel();
      for (let i = 0; i < 30; i++) m.nodes.push({ id: `w${i}`, name: `Widget ${i}`, type: 'Component', description: '', parentId: null, fields: {}, root: null, role: null, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't' });
      return m;
    };
    const a = fakeApi({ getModel: async () => big() });
    expect((await buildTools(a).list_nodes({ query: 'widget' })) as unknown[]).toHaveLength(25);
    expect((await buildTools(a).list_nodes({ query: 'widget', limit: 30 })) as unknown[]).toHaveLength(30);
    expect((await buildTools(a).list_nodes({})) as unknown[]).toHaveLength(30); // no query = uncapped
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

  it('list_nodes includes Components by default and caps to a shallower layer via maxLayer', async () => {
    const a = fakeApi({ getModel: async () => graphModel() });
    const def = (await buildTools(a).list_nodes({ parentId: 'ca' })) as Array<{ id: string }>;
    expect(def.map((n) => n.id).sort()).toEqual(['n1', 'n2']);          // Components included by default
    const capped = (await buildTools(a).list_nodes({ parentId: 'ca', maxLayer: 'Container' })) as Array<{ id: string }>;
    expect(capped.map((n) => n.id)).toEqual([]);                        // capped above Component
  });

  it('get_subgraph returns the directional neighborhood', async () => {
    const out = (await buildTools(api()).get_subgraph({ nodeId: 'n1', depth: 1, direction: 'out' })) as { nodes: Array<{ id: string }>; connections: unknown[] };
    expect(out.nodes.map((n) => n.id).sort()).toEqual(['n1', 'n2', 'n3']);
    const both = (await buildTools(api()).get_subgraph({ nodeId: 'n1', depth: 1, direction: 'both' })) as { nodes: Array<{ id: string }> };
    expect(both.nodes.map((n) => n.id).sort()).toEqual(['n1', 'n2', 'n3', 'n4']);
  });

  it('get_subgraph filters by verb class', async () => {
    const r = (await buildTools(api()).get_subgraph({ nodeId: 'n1', depth: 1, verbClass: 'messaging' })) as { nodes: Array<{ id: string }>; connections: unknown[] };
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

  it('get_subgraph includes Components by default and caps to a shallower layer via maxLayer', async () => {
    const a = fakeApi({ getModel: async () => graphModel() });
    const def = (await buildTools(a).get_subgraph({ nodeId: 'ca', depth: 1 })) as { nodes: Array<{ id: string }> };
    expect(def.nodes.map((n) => n.id)).toContain('n1');                 // Component reached by default
    const capped = (await buildTools(a).get_subgraph({ nodeId: 'ca', depth: 1, maxLayer: 'Container' })) as { nodes: Array<{ id: string }> };
    expect(capped.nodes.map((n) => n.id)).not.toContain('n1');          // capped above Component
  });
});

function connModel(): HyphaeModel {
  const m = emptyModel();
  const base = { description: '', fields: {}, root: null, role: null, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't' };
  m.nodes.push(
    { id: 'sys', name: 'Sys', type: 'System', parentId: null, ...base },
    { id: 'ca', name: 'Alpha', type: 'Container', parentId: 'sys', ...base },
    { id: 'cb', name: 'Beta', type: 'Container', parentId: 'sys', ...base },
    { id: 'a1', name: 'A1', type: 'Component', parentId: 'ca', ...base },
    { id: 'a2', name: 'A2', type: 'Component', parentId: 'ca', ...base },
    { id: 'b1', name: 'B1', type: 'Component', parentId: 'cb', ...base },
    { id: 'ext', name: 'Ext', type: 'ExternalSystem', parentId: null, ...base },
  );
  const e = { verb: 'uses', object: '', description: '', direction: 'Unidirectional' as const, realizedBy: [], codeRefs: [], fields: {} };
  m.connections.push(
    { id: 'x1', from: 'a1', to: 'b1', ...e, verb: 'reads' },       // dataAccess
    { id: 'x2', from: 'a1', to: 'ext', ...e, verb: 'publishes' },  // messaging
    { id: 'x3', from: 'b1', to: 'ext', ...e, verb: 'invokes' },    // control
    { id: 'x4', from: 'a1', to: 'a2', ...e, verb: 'reads' },       // dataAccess
  );
  return m;
}

describe('list_connections', () => {
  const api = () => fakeApi({ getModel: async () => connModel() });
  const ids = (r: unknown) => (r as Array<{ id: string }>).map((c) => c.id).sort();

  it('lists all connections by default', async () => {
    expect(ids(await buildTools(api()).list_connections({}))).toEqual(['x1', 'x2', 'x3', 'x4']);
  });

  it('filters by verb and verbClass', async () => {
    expect(ids(await buildTools(api()).list_connections({ verbClass: 'dataAccess' }))).toEqual(['x1', 'x4']);
    expect(ids(await buildTools(api()).list_connections({ verb: 'invokes' }))).toEqual(['x3']);
  });

  it('never returns the retired type/transport fields', async () => {
    const [first] = (await buildTools(api()).list_connections({})) as Array<Record<string, unknown>>;
    expect('type' in first).toBe(false);
    expect('transport' in first).toBe(false);
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

  it('filters by nodeId (edges touching one node)', async () => {
    expect(ids(await buildTools(api()).list_connections({ nodeId: 'a1' }))).toEqual(['x1', 'x2', 'x4']);
    expect(ids(await buildTools(api()).list_connections({ nodeId: 'b1' }))).toEqual(['x1', 'x3']);
  });

  it('returns an error for a missing nodeId', async () => {
    expect(await buildTools(api()).list_connections({ nodeId: 'nope' })).toMatchObject({ error: expect.stringContaining('not found') });
  });

  it('enriches results with endpoint names and owning containers', async () => {
    const r = (await buildTools(api()).list_connections({ crossingBoundary: true })) as Array<Record<string, unknown>>;
    const x1 = r.find((c) => c.id === 'x1')!;
    expect(x1).toMatchObject({ fromName: 'A1', toName: 'B1', fromContainer: 'Alpha', toContainer: 'Beta' });
  });

  it('caps edges to the max layer: a Component edge is dropped, a Container edge kept', async () => {
    const withContainerEdge = () => {
      const m = connModel();
      m.connections.push({ id: 'cc', from: 'ca', to: 'cb', fields: {}, verb: 'uses', object: '', description: '', direction: 'Unidirectional', realizedBy: [], codeRefs: [] });
      return m;
    };
    const a = fakeApi({ getModel: async () => withContainerEdge() });
    const def = (await buildTools(a).list_connections({})) as Array<{ id: string }>;
    expect(def.map((c) => c.id).sort()).toEqual(['cc', 'x1', 'x2', 'x3', 'x4']);   // all included by default
    const capped = (await buildTools(a).list_connections({ maxLayer: 'Container' })) as Array<{ id: string }>;
    expect(capped.map((c) => c.id).sort()).toEqual(['cc']);                        // only the Container↔Container edge survives
  });

});

describe('rollup_connections', () => {
  const api = () => fakeApi({ getModel: async () => connModel() });

  it('layer:Container returns derived container edges with realizedBy expanded', async () => {
    const r = (await buildTools(api()).rollup_connections({ layer: 'Container' })) as Array<{ from: string; to: string; realizedBy: Array<{ id: string; verb: string }> }>;
    expect(r.map((e) => `${e.from}->${e.to}`).sort()).toEqual(['ca->cb', 'ca->ext', 'cb->ext']);
    const caCb = r.find((e) => e.from === 'ca' && e.to === 'cb')!;
    expect(caCb.realizedBy).toEqual([{ id: 'x1', fromName: 'A1', toName: 'B1', verb: 'reads', object: '', description: '' }]);
  });

  it('layer:Context collapses internal edges to the System, keeping external edges', async () => {
    const r = (await buildTools(api()).rollup_connections({ layer: 'Context' })) as Array<{ from: string; to: string; realizedBy: Array<{ id: string }> }>;
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ from: 'sys', to: 'ext' });
    expect(r[0].realizedBy.map((u) => u.id).sort()).toEqual(['x2', 'x3']);
  });
});

describe('role/verb/object reach the API', () => {
  it('forwards a node role through create_nodes', async () => {
    const seen: Record<string, unknown>[] = [];
    const tools = buildTools(fakeApi({
      createNode: async (input) => { seen.push(input as Record<string, unknown>); return { node: { id: 'n1', ...(input as object) }, version: 1 }; },
    }));
    await tools.create_nodes({ nodes: [
      { name: 'Clips', type: 'Component', parentId: null, role: 'datastore', fields: { summary: 'Stores clips' } },
    ] });
    expect(seen[0]).toMatchObject({ role: 'datastore', fields: { summary: 'Stores clips' } });
  });

  it('forwards verb and object through create_connections', async () => {
    const seen: Record<string, unknown>[] = [];
    const tools = buildTools(fakeApi({
      createConnection: async (input) => { seen.push(input as Record<string, unknown>); return { connection: { id: 'c1', ...(input as object) }, version: 1 }; },
    }));
    await tools.create_connections({ connections: [
      { from: 'api', to: 'api', verb: 'reads', object: 'camera list' },
    ] });
    expect(seen[0]).toMatchObject({ verb: 'reads', object: 'camera list' });
  });

  it('forwards a role change through update_nodes', async () => {
    const seen: Record<string, unknown>[] = [];
    const tools = buildTools(fakeApi({
      updateNode: async (id, patch) => { seen.push(patch as Record<string, unknown>); return { node: { id, ...(patch as object) }, version: 1 }; },
    }));
    await tools.update_nodes({ updates: [{ id: 'api', role: 'queue' }] });
    expect(seen[0]).toMatchObject({ role: 'queue' });
  });
});

import { flowItemSchema } from '../src/mcp';

describe('MCP flow tools', () => {
  const flowModel = (): HyphaeModel => {
    const m = model();   // 'api' container + self-connection 'c1'
    m.flows.push({ id: 'f1', name: 'Views feed', description: '', scope: 'Container', steps: [
      { order: 1, from: 'api', to: 'api', via: 'c1', message: 'go', kind: 'Sync' },
    ] });
    return m;
  };
  const api = () => fakeApi({ getModel: async () => flowModel() });

  it('list_flows returns summaries with validity', async () => {
    const r = await buildTools(api()).list_flows({});
    expect(r).toEqual([{ id: 'f1', name: 'Views feed', scope: 'Container', steps: 1, valid: true }]);
  });

  it('list_flows marks a flow invalid when a step endpoint is missing', async () => {
    const bad = fakeApi({ getModel: async () => { const m = flowModel(); m.flows[0].steps[0].to = 'ghost'; return m; } });
    const r = (await buildTools(bad).list_flows({})) as Array<{ valid: boolean }>;
    expect(r[0].valid).toBe(false);
  });

  it('get_flow returns the full flow, errors on a missing id', async () => {
    expect(await buildTools(api()).get_flow({ id: 'f1' })).toMatchObject({ name: 'Views feed', steps: [{ message: 'go' }] });
    expect(await buildTools(api()).get_flow({ id: 'nope' })).toMatchObject({ error: expect.stringContaining('not found') });
  });

  it('create_flows echoes id + name and forwards the step shape', async () => {
    const seen: Record<string, unknown>[] = [];
    const tools = buildTools(fakeApi({ createFlow: async (input) => { seen.push(input as Record<string, unknown>); return { flow: { id: 'f9', ...(input as object) }, version: 1 }; } }));
    const r = await tools.create_flows({ flows: [{ name: 'F', steps: [{ order: 1, from: 'a', to: 'b', via: 'c1', message: 'go', kind: 'Sync' }] }] });
    expect(r).toEqual({ created: [{ id: 'f9', name: 'F' }] });
    expect(seen[0]).toMatchObject({ name: 'F', steps: [{ from: 'a', to: 'b', via: 'c1' }] });
  });

  it('update_flows splits id from patch; delete_flows forwards ids', async () => {
    const seenU: Array<[string, unknown]> = [];
    const seenD: string[] = [];
    const tools = buildTools(fakeApi({
      updateFlow: async (id, patch) => { seenU.push([id, patch]); return { flow: { id }, version: 1 }; },
      deleteFlow: async (id) => { seenD.push(id); return { version: 1 }; },
    }));
    expect(await tools.update_flows({ updates: [{ id: 'f1', name: 'R' }] })).toEqual({ ok: true });
    expect(seenU).toEqual([['f1', { name: 'R' }]]);
    expect(await tools.delete_flows({ ids: ['f1'] })).toEqual({ ok: true });
    expect(seenD).toEqual(['f1']);
  });
});

describe('MCP flow write shape', () => {
  it('accepts a full flow item and rejects a bad step kind', () => {
    expect(() => flowItemSchema.parse({ name: 'F', steps: [{ order: 1, from: 'a', to: 'b', kind: 'Sync' }] })).not.toThrow();
    expect(() => flowItemSchema.parse({ name: 'F', steps: [{ order: 1, from: 'a', to: 'b', kind: 'Bad' }] })).toThrow();
  });
});

import { patternItemSchema } from '../src/mcp';

describe('MCP pattern tools', () => {
  const patternModel = (): HyphaeModel => {
    const m = emptyModel();
    m.patterns.push({ id: 'p1', name: 'Recorder', kind: 'state-machine', description: '', anchor: null,
      members: [{ name: 'Idle', description: '' }], transitions: [] });
    return m;
  };
  const api = () => fakeApi({ getModel: async () => patternModel() });

  it('list_patterns returns summaries with validity', async () => {
    const r = await buildTools(api()).list_patterns({});
    expect(r).toEqual([{ id: 'p1', name: 'Recorder', kind: 'state-machine', members: 1, anchor: null, valid: true }]);
  });

  it('list_patterns marks a pattern invalid on an unknown kind', async () => {
    const bad = fakeApi({ getModel: async () => { const m = patternModel(); m.patterns[0].kind = 'octopus'; return m; } });
    const r = (await buildTools(bad).list_patterns({})) as Array<{ valid: boolean }>;
    expect(r[0].valid).toBe(false);
  });

  it('get_pattern returns one pattern, or an error', async () => {
    expect(await buildTools(api()).get_pattern({ id: 'p1' })).toMatchObject({ name: 'Recorder' });
    expect(await buildTools(api()).get_pattern({ id: 'nope' })).toMatchObject({ error: expect.stringContaining('not found') });
  });

  it('create_patterns echoes id + name and forwards the member shape', async () => {
    const seen: Record<string, unknown>[] = [];
    const tools = buildTools(fakeApi({ createPattern: async (input) => { seen.push(input as Record<string, unknown>); return { pattern: { id: 'p9', ...(input as object) }, version: 1 }; } }));
    const r = await tools.create_patterns({ patterns: [{ name: 'P', kind: 'pipeline', members: [{ name: 'Decode', ref: 'd.ts' }] }] });
    expect(r).toEqual({ created: [{ id: 'p9', name: 'P' }] });
    expect(seen[0]).toMatchObject({ name: 'P', kind: 'pipeline', members: [{ name: 'Decode', ref: 'd.ts' }] });
  });
});

describe('MCP pattern write shape', () => {
  it('accepts a full pattern item and rejects a missing name', () => {
    expect(() => patternItemSchema.parse({ name: 'P', kind: 'pipeline', members: [{ name: 'M', ref: 'x.ts' }], transitions: [{ from: 'M', to: 'M' }] })).not.toThrow();
    expect(() => patternItemSchema.parse({ kind: 'pipeline' })).toThrow();
  });
});

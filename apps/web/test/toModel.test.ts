import { describe, it, expect } from 'vitest';
import { toFlowNodes, toFlowEdges, regionChildIds, highlightSets, drillTarget } from '../src/toModel';
import type { Edge as FlowEdge } from '@xyflow/react';
import { emptyModel, layerOfType, c4Backend } from '@hyphae/schema';

describe('drillTarget', () => {
  function model() {
    const m = emptyModel();
    const base = { description: '', codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {} };
    m.nodes.push(
      { id: 'sys', name: 'Sys', type: 'System', parentId: null, ...base },
      { id: 'ca', name: 'Alpha', type: 'Container', parentId: 'sys', ...base },
      { id: 'a1', name: 'A1', type: 'Component', parentId: 'ca', ...base },
    );
    return m;
  }
  it('returns the child layer for a node that has children', () => {
    expect(drillTarget(model(), 'sys')).toBe('Container');
    expect(drillTarget(model(), 'ca')).toBe('Component');
  });
  it('returns null for a leaf node', () => {
    expect(drillTarget(model(), 'a1')).toBeNull();
  });
});

describe('highlightSets', () => {
  const edges: FlowEdge[] = [
    { id: 'e1', source: 'a', target: 'b' },
    { id: 'e2', source: 'b', target: 'c' },
    { id: 'e3', source: 'a', target: 'c' },
  ];

  it('returns empty sets when nothing is selected', () => {
    const h = highlightSets(null, edges);
    expect(h.nodes.size).toBe(0);
    expect(h.edges.size).toBe(0);
  });

  it('selecting a node highlights it, its adjacent edges, and the connected nodes', () => {
    const h = highlightSets('a', edges);
    expect([...h.nodes].sort()).toEqual(['a', 'b', 'c']); // a + neighbors b, c
    expect([...h.edges].sort()).toEqual(['e1', 'e3']);
  });

  it('selecting an edge highlights it and the two connected nodes', () => {
    const h = highlightSets('e2', edges);
    expect([...h.edges]).toEqual(['e2']);
    expect([...h.nodes].sort()).toEqual(['b', 'c']);
  });

  it('selecting a region highlights it, its children, and edges touching them', () => {
    const h = highlightSets('ca', edges, new Set(['a', 'b']));
    expect([...h.nodes].sort()).toEqual(['a', 'b', 'ca']);
    expect([...h.edges].sort()).toEqual(['e1', 'e2', 'e3']); // all edges touch a or b
  });
});

describe('toModel mapping', () => {
  it('keeps only nodes whose type belongs to the active layer', () => {
    const m = emptyModel();
    m.nodes.push({
      id: 'sys', name: 'Shop', type: 'System', description: '',
      parentId: null, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {},
    });
    m.nodes.push({
      id: 'c', name: 'Comp', type: 'Component', description: '',
      parentId: null, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {},
    });
    const flow = toFlowNodes(m, 'Component');
    expect(flow.map((n) => n.id)).toEqual(['c']);
    expect(layerOfType(c4Backend, 'Component')).toBe('Component');
  });

  it('keeps only edges whose both endpoints are visible', () => {
    const m = emptyModel();
    m.nodes.push({
      id: 'a', name: 'A', type: 'Component', description: '',
      parentId: null, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {},
    });
    m.connections.push({
      id: 'c1', from: 'a', to: 'ghost', type: 'Dependency',
      description: '', direction: 'Unidirectional', realizedBy: [], codeRefs: [], fields: {},
    });
    expect(toFlowEdges(m, 'Component')).toHaveLength(0);
  });

  it('labels edges with their relation info', () => {
    const m = emptyModel();
    m.nodes.push({
      id: 'a', name: 'A', type: 'Component', description: '',
      parentId: null, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {},
    });
    m.nodes.push({
      id: 'b', name: 'B', type: 'Component', description: '',
      parentId: null, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {},
    });
    m.connections.push({
      id: 'c1', from: 'a', to: 'b', type: 'Dependency',
      description: '', direction: 'Unidirectional', realizedBy: [], codeRefs: [], fields: { transport: 'Sync' },
    });
    expect(toFlowEdges(m, 'Component')[0].label).toBe('Dependency');
  });

  it('wraps children in a computed region sized to contain them', () => {
    const m = emptyModel();
    m.nodes.push({
      id: 'cont', name: 'API', type: 'Container', description: '',
      parentId: null, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {},
    });
    m.nodes.push({
      id: 'a', name: 'A', type: 'Component', description: '',
      parentId: 'cont', codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {},
    });
    m.nodes.push({
      id: 'b', name: 'B', type: 'Component', description: '',
      parentId: 'cont', codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {},
    });
    const flow = toFlowNodes(m, 'Component');
    const region = flow.find((n) => n.id === 'cont');
    expect(region?.type).toBe('region');
    expect((region?.data as { label?: string }).label).toBe('API');
    const a = flow.find((n) => n.id === 'a');
    // children are plain absolute nodes — no React Flow parenting/extent
    expect(a?.parentId).toBeUndefined();
    expect(a?.extent).toBeUndefined();
    // region paints before its children, and wraps up-and-left of them
    expect(flow.findIndex((n) => n.id === 'cont')).toBeLessThan(flow.findIndex((n) => n.id === 'a'));
    expect(region!.position.x).toBeLessThan(a!.position.x);
    expect(region!.position.y).toBeLessThan(a!.position.y);
    expect(region?.draggable).toBe(true);
    expect(region?.dragHandle).toBe('.region__handle');
    expect(regionChildIds(m, 'Component', 'cont')).toEqual(new Set(['a', 'b']));
  });

  it('filters connections by kind and by transport field', () => {
    const m = emptyModel();
    const base = { description: '', codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {} };
    m.nodes.push(
      { id: 'a', name: 'A', type: 'Component', parentId: null, ...base },
      { id: 'b', name: 'B', type: 'Component', parentId: null, ...base },
      { id: 'c', name: 'C', type: 'Component', parentId: null, ...base },
    );
    const e = { description: '', direction: 'Unidirectional' as const, realizedBy: [], codeRefs: [] };
    m.connections.push(
      { id: 'e1', from: 'a', to: 'b', type: 'Dependency', ...e, fields: { transport: 'Sync' } },
      { id: 'e2', from: 'a', to: 'c', type: 'DataFlow', ...e, fields: { transport: 'Async' } },
      { id: 'e3', from: 'b', to: 'c', type: 'Dependency', ...e, fields: { transport: 'InProcess' } },
    );
    const ids = (f: { kinds: string[]; fields: Record<string, string[]> }) => toFlowEdges(m, 'Component', f).map((x) => x.id).sort();
    expect(ids({ kinds: [], fields: {} })).toEqual(['e1', 'e2', 'e3']);
    expect(ids({ kinds: ['Dependency'], fields: {} })).toEqual(['e1', 'e3']);
    expect(ids({ kinds: [], fields: { transport: ['Sync'] } })).toEqual(['e1']);
    expect(ids({ kinds: ['Dependency'], fields: { transport: ['Async'] } })).toEqual([]);
  });

  it('applies the connection filter through the rollup at the Container layer', () => {
    const m = emptyModel();
    const base = { description: '', codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {} };
    m.nodes.push(
      { id: 'sys', name: 'Sys', type: 'System', parentId: null, ...base },
      { id: 'ca', name: 'Alpha', type: 'Container', parentId: 'sys', ...base },
      { id: 'cb', name: 'Beta', type: 'Container', parentId: 'sys', ...base },
      { id: 'a1', name: 'A1', type: 'Component', parentId: 'ca', ...base },
      { id: 'b1', name: 'B1', type: 'Component', parentId: 'cb', ...base },
    );
    const e = { description: '', direction: 'Unidirectional' as const, realizedBy: [], codeRefs: [] };
    m.connections.push(
      { id: 'x1', from: 'a1', to: 'b1', type: 'Dependency', ...e, fields: { transport: 'Sync' } },
      { id: 'x2', from: 'a1', to: 'b1', type: 'DataFlow', ...e, fields: { transport: 'Async' } },
    );
    // Filtering to DataFlow leaves only x2 behind the ca->cb rollup edge.
    const edges = toFlowEdges(m, 'Container', { kinds: ['DataFlow'], fields: {} });
    expect(edges).toHaveLength(1);
    expect((edges[0].data as { realizedBy: string[] }).realizedBy).toEqual(['x2']);
  });

  it('shows a derived rollup edge between containers, visually distinct', () => {
    const m = emptyModel();
    const base = { description: '', codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {} };
    m.nodes.push(
      { id: 'sys', name: 'Sys', type: 'System', parentId: null, ...base },
      { id: 'ca', name: 'Alpha', type: 'Container', parentId: 'sys', ...base },
      { id: 'cb', name: 'Beta', type: 'Container', parentId: 'sys', ...base },
      { id: 'a1', name: 'A1', type: 'Component', parentId: 'ca', ...base },
      { id: 'a2', name: 'A2', type: 'Component', parentId: 'ca', ...base },
      { id: 'b1', name: 'B1', type: 'Component', parentId: 'cb', ...base },
    );
    const e = { description: '', direction: 'Unidirectional' as const, realizedBy: [], codeRefs: [] };
    m.connections.push(
      { id: 'x1', from: 'a1', to: 'b1', type: 'Dependency', ...e, fields: { transport: 'Sync' } },
      { id: 'x2', from: 'a2', to: 'b1', type: 'DataFlow', ...e, fields: { transport: 'Async' } },
      { id: 'x3', from: 'a1', to: 'a2', type: 'Dependency', ...e, fields: { transport: 'InProcess' } }, // intra ca
    );
    const edges = toFlowEdges(m, 'Container');
    expect(edges).toHaveLength(1); // intra-container x3 dropped
    const edge = edges[0];
    expect(edge.source).toBe('ca');
    expect(edge.target).toBe('cb');
    expect(edge.id.startsWith('rollup:')).toBe(true);
    expect((edge.data as { derived?: boolean }).derived).toBe(true);
    expect(((edge.data as { realizedBy: string[] }).realizedBy).sort()).toEqual(['x1', 'x2']);
    expect(edge.label).toBe('2');
    expect(edge.style?.strokeDasharray).toBeTruthy();
    expect(edge.selectable).toBe(false);
  });

  it('renders an authored same-layer edge as a normal (non-derived) edge', () => {
    const m = emptyModel();
    const base = { description: '', codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {} };
    m.nodes.push(
      { id: 'sys', name: 'Sys', type: 'System', parentId: null, ...base },
      { id: 'ca', name: 'Alpha', type: 'Container', parentId: 'sys', ...base },
      { id: 'cb', name: 'Beta', type: 'Container', parentId: 'sys', ...base },
    );
    m.connections.push({
      id: 'auth', from: 'ca', to: 'cb', type: 'Dependency',
      description: '', direction: 'Unidirectional', realizedBy: [], codeRefs: [], fields: { transport: 'Sync' },
    });
    const edges = toFlowEdges(m, 'Container');
    expect(edges).toHaveLength(1);
    expect(edges[0].id).toBe('auth');
    expect((edges[0].data as { derived?: boolean } | undefined)?.derived).toBeFalsy();
    expect(edges[0].label).toBe('Dependency');
  });

  it('drops an external system in as a ghost node on the Component layer too', () => {
    const m = emptyModel();
    const base = { description: '', codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {} };
    m.nodes.push(
      { id: 'ca', name: 'Alpha', type: 'Container', parentId: null, ...base },
      { id: 'a1', name: 'A1', type: 'Component', parentId: 'ca', ...base },
      { id: 'ext', name: 'Ext', type: 'ExternalSystem', parentId: null, ...base },
    );
    m.connections.push({
      id: 'x', from: 'a1', to: 'ext', type: 'Dependency',
      description: '', direction: 'Unidirectional', realizedBy: [], codeRefs: [], fields: { transport: 'Sync' },
    });

    // Raw component→external edge is kept (normal edge, not derived) and the external is a ghost.
    const edges = toFlowEdges(m, 'Component');
    expect(edges).toHaveLength(1);
    expect(edges[0].source).toBe('a1');
    expect(edges[0].target).toBe('ext');
    expect((edges[0].data as { derived?: boolean } | undefined)?.derived).toBeFalsy();

    const nodes = toFlowNodes(m, 'Component');
    expect(nodes.find((n) => n.id === 'ext')?.type).toBe('ghost');
    expect(nodes.find((n) => n.id === 'a1')?.type).toBe('node');
  });

  it('drops an external system in as a ghost node on the Container layer and shows the edge', () => {
    const m = emptyModel();
    const base = { description: '', codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {} };
    m.nodes.push(
      { id: 'sys', name: 'Sys', type: 'System', parentId: null, ...base },
      { id: 'ca', name: 'Alpha', type: 'Container', parentId: 'sys', ...base },
      { id: 'a1', name: 'A1', type: 'Component', parentId: 'ca', ...base },
      { id: 'ext', name: 'Ext', type: 'ExternalSystem', parentId: null, ...base },
    );
    m.connections.push({
      id: 'x', from: 'a1', to: 'ext', type: 'Dependency',
      description: '', direction: 'Unidirectional', realizedBy: [], codeRefs: [], fields: { transport: 'Sync' },
    });

    // Edge ca->ext is kept (one native endpoint) even though ext isn't a Container.
    const edges = toFlowEdges(m, 'Container');
    expect(edges).toHaveLength(1);
    expect(edges[0].source).toBe('ca');
    expect(edges[0].target).toBe('ext');

    // ext is dropped in as a ghost node; the container ca is a normal node.
    const nodes = toFlowNodes(m, 'Container');
    const ghost = nodes.find((n) => n.id === 'ext');
    expect(ghost?.type).toBe('ghost');
    expect(nodes.find((n) => n.id === 'ca')?.type).toBe('node');
  });

  it('does not drop in a ghost when the connecting edge is filtered out', () => {
    const m = emptyModel();
    const base = { description: '', codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {} };
    m.nodes.push(
      { id: 'sys', name: 'Sys', type: 'System', parentId: null, ...base },
      { id: 'ca', name: 'Alpha', type: 'Container', parentId: 'sys', ...base },
      { id: 'a1', name: 'A1', type: 'Component', parentId: 'ca', ...base },
      { id: 'ext', name: 'Ext', type: 'ExternalSystem', parentId: null, ...base },
    );
    m.connections.push({
      id: 'x', from: 'a1', to: 'ext', type: 'Dependency',
      description: '', direction: 'Unidirectional', realizedBy: [], codeRefs: [], fields: { transport: 'Sync' },
    });
    const filter = { kinds: ['DataFlow'], fields: {} }; // excludes the only edge
    expect(toFlowEdges(m, 'Container', filter)).toHaveLength(0);
    expect(toFlowNodes(m, 'Container', filter).find((n) => n.id === 'ext')).toBeUndefined();
  });

  it('rolls component→external up to System→External at the Context layer', () => {
    const m = emptyModel();
    const base = { description: '', codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {} };
    m.nodes.push(
      { id: 'sys', name: 'Sys', type: 'System', parentId: null, ...base },
      { id: 'ca', name: 'Alpha', type: 'Container', parentId: 'sys', ...base },
      { id: 'a1', name: 'A1', type: 'Component', parentId: 'ca', ...base },
      { id: 'ext', name: 'Ext', type: 'ExternalSystem', parentId: null, ...base },
    );
    m.connections.push({
      id: 'x', from: 'a1', to: 'ext', type: 'Dependency',
      description: '', direction: 'Unidirectional', realizedBy: [], codeRefs: [], fields: { transport: 'Sync' },
    });
    const edges = toFlowEdges(m, 'Context');
    expect(edges).toHaveLength(1);
    expect(edges[0].source).toBe('sys');
    expect(edges[0].target).toBe('ext');
    expect((edges[0].data as { derived?: boolean }).derived).toBe(true);
  });

  it('keeps unparented nodes at the top level', () => {
    const m = emptyModel();
    m.nodes.push({
      id: 'c', name: 'C', type: 'Component', description: '',
      parentId: null, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {},
    });
    const c = toFlowNodes(m, 'Component').find((n) => n.id === 'c');
    expect(c?.parentId).toBeUndefined();
    expect(c?.type).toBe('node');
  });
});

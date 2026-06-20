import { describe, it, expect } from 'vitest';
import { toFlowNodes, toFlowEdges, regionChildIds } from '../src/toModel';
import { emptyModel, layerOfType, c4Backend } from '@hyphae/schema';

describe('toModel mapping', () => {
  it('keeps only nodes whose type belongs to the active layer', () => {
    const m = emptyModel();
    m.nodes.push({
      id: 'sys', name: 'Shop', type: 'System', description: '', responsibilities: [],
      invariants: [], assumptions: [], failureModes: [], tags: [], status: 'Active',
      parentId: null, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't',
    });
    m.nodes.push({
      id: 'c', name: 'Comp', type: 'Component', description: '', responsibilities: [],
      invariants: [], assumptions: [], failureModes: [], tags: [], status: 'Active',
      parentId: null, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't',
    });
    const flow = toFlowNodes(m, 'Component');
    expect(flow.map((n) => n.id)).toEqual(['c']);
    expect(layerOfType(c4Backend, 'Component')).toBe('Component');
  });

  it('keeps only edges whose both endpoints are visible', () => {
    const m = emptyModel();
    m.nodes.push({
      id: 'a', name: 'A', type: 'Component', description: '', responsibilities: [],
      invariants: [], assumptions: [], failureModes: [], tags: [], status: 'Active',
      parentId: null, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't',
    });
    m.connections.push({
      id: 'c1', from: 'a', to: 'ghost', relationCategory: 'Dependency', transport: 'None',
      description: '', direction: 'Unidirectional', realizes: [], codeRefs: [],
    });
    expect(toFlowEdges(m, 'Component')).toHaveLength(0);
  });

  it('labels edges with their relation info', () => {
    const m = emptyModel();
    m.nodes.push({
      id: 'a', name: 'A', type: 'Component', description: '', responsibilities: [],
      invariants: [], assumptions: [], failureModes: [], tags: [], status: 'Active',
      parentId: null, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't',
    });
    m.nodes.push({
      id: 'b', name: 'B', type: 'Component', description: '', responsibilities: [],
      invariants: [], assumptions: [], failureModes: [], tags: [], status: 'Active',
      parentId: null, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't',
    });
    m.connections.push({
      id: 'c1', from: 'a', to: 'b', relationCategory: 'Dependency', transport: 'Sync',
      description: '', direction: 'Unidirectional', realizes: [], codeRefs: [],
    });
    expect(toFlowEdges(m, 'Component')[0].label).toBe('Dependency / Sync');
  });

  it('wraps children in a computed region sized to contain them', () => {
    const m = emptyModel();
    m.nodes.push({
      id: 'cont', name: 'API', type: 'Container', description: '', responsibilities: [],
      invariants: [], assumptions: [], failureModes: [], tags: [], status: 'Active',
      parentId: null, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't',
    });
    m.nodes.push({
      id: 'a', name: 'A', type: 'Component', description: '', responsibilities: [],
      invariants: [], assumptions: [], failureModes: [], tags: [], status: 'Active',
      parentId: 'cont', codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't',
    });
    m.nodes.push({
      id: 'b', name: 'B', type: 'Component', description: '', responsibilities: [],
      invariants: [], assumptions: [], failureModes: [], tags: [], status: 'Active',
      parentId: 'cont', codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't',
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

  it('filters connections by relationCategory and transport', () => {
    const m = emptyModel();
    const base = {
      description: '', responsibilities: [], invariants: [], assumptions: [], failureModes: [],
      tags: [], status: 'Active' as const, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't',
    };
    m.nodes.push(
      { id: 'a', name: 'A', type: 'Component', parentId: null, ...base },
      { id: 'b', name: 'B', type: 'Component', parentId: null, ...base },
      { id: 'c', name: 'C', type: 'Component', parentId: null, ...base },
    );
    const e = { description: '', direction: 'Unidirectional' as const, realizes: [], codeRefs: [] };
    m.connections.push(
      { id: 'e1', from: 'a', to: 'b', relationCategory: 'Dependency', transport: 'Sync', ...e },
      { id: 'e2', from: 'a', to: 'c', relationCategory: 'DataFlow', transport: 'Async', ...e },
      { id: 'e3', from: 'b', to: 'c', relationCategory: 'Dependency', transport: 'InProcess', ...e },
    );
    const ids = (f: { relationCategories: string[]; transports: string[] }) =>
      toFlowEdges(m, 'Component', f).map((x) => x.id).sort();

    expect(ids({ relationCategories: [], transports: [] })).toEqual(['e1', 'e2', 'e3']); // no filter
    expect(ids({ relationCategories: ['Dependency'], transports: [] })).toEqual(['e1', 'e3']);
    expect(ids({ relationCategories: [], transports: ['Sync'] })).toEqual(['e1']);
    expect(ids({ relationCategories: ['Dependency'], transports: ['Async'] })).toEqual([]); // AND
  });

  it('applies the connection filter through the rollup at the Container layer', () => {
    const m = emptyModel();
    const base = {
      description: '', responsibilities: [], invariants: [], assumptions: [], failureModes: [],
      tags: [], status: 'Active' as const, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't',
    };
    m.nodes.push(
      { id: 'sys', name: 'Sys', type: 'System', parentId: null, ...base },
      { id: 'ca', name: 'Alpha', type: 'Container', parentId: 'sys', ...base },
      { id: 'cb', name: 'Beta', type: 'Container', parentId: 'sys', ...base },
      { id: 'a1', name: 'A1', type: 'Component', parentId: 'ca', ...base },
      { id: 'b1', name: 'B1', type: 'Component', parentId: 'cb', ...base },
    );
    const e = { description: '', direction: 'Unidirectional' as const, realizes: [], codeRefs: [] };
    m.connections.push(
      { id: 'x1', from: 'a1', to: 'b1', relationCategory: 'Dependency', transport: 'Sync', ...e },
      { id: 'x2', from: 'a1', to: 'b1', relationCategory: 'DataFlow', transport: 'Async', ...e },
    );
    // Filtering to DataFlow leaves only x2 behind the ca->cb rollup edge.
    const edges = toFlowEdges(m, 'Container', { relationCategories: ['DataFlow'], transports: [] });
    expect(edges).toHaveLength(1);
    expect((edges[0].data as { realizedBy: string[] }).realizedBy).toEqual(['x2']);
  });

  it('shows a derived rollup edge between containers, visually distinct', () => {
    const m = emptyModel();
    const base = {
      description: '', responsibilities: [], invariants: [], assumptions: [], failureModes: [],
      tags: [], status: 'Active' as const, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't',
    };
    m.nodes.push(
      { id: 'sys', name: 'Sys', type: 'System', parentId: null, ...base },
      { id: 'ca', name: 'Alpha', type: 'Container', parentId: 'sys', ...base },
      { id: 'cb', name: 'Beta', type: 'Container', parentId: 'sys', ...base },
      { id: 'a1', name: 'A1', type: 'Component', parentId: 'ca', ...base },
      { id: 'a2', name: 'A2', type: 'Component', parentId: 'ca', ...base },
      { id: 'b1', name: 'B1', type: 'Component', parentId: 'cb', ...base },
    );
    const e = { description: '', direction: 'Unidirectional' as const, realizes: [], codeRefs: [] };
    m.connections.push(
      { id: 'x1', from: 'a1', to: 'b1', relationCategory: 'Dependency', transport: 'Sync', ...e },
      { id: 'x2', from: 'a2', to: 'b1', relationCategory: 'DataFlow', transport: 'Async', ...e },
      { id: 'x3', from: 'a1', to: 'a2', relationCategory: 'Dependency', transport: 'InProcess', ...e }, // intra ca
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
    const base = {
      description: '', responsibilities: [], invariants: [], assumptions: [], failureModes: [],
      tags: [], status: 'Active' as const, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't',
    };
    m.nodes.push(
      { id: 'sys', name: 'Sys', type: 'System', parentId: null, ...base },
      { id: 'ca', name: 'Alpha', type: 'Container', parentId: 'sys', ...base },
      { id: 'cb', name: 'Beta', type: 'Container', parentId: 'sys', ...base },
    );
    m.connections.push({
      id: 'auth', from: 'ca', to: 'cb', relationCategory: 'Dependency', transport: 'Sync',
      description: '', direction: 'Unidirectional', realizes: [], codeRefs: [],
    });
    const edges = toFlowEdges(m, 'Container');
    expect(edges).toHaveLength(1);
    expect(edges[0].id).toBe('auth');
    expect((edges[0].data as { derived?: boolean } | undefined)?.derived).toBeFalsy();
    expect(edges[0].label).toBe('Dependency / Sync');
  });

  it('rolls component→external up to System→External at the Context layer', () => {
    const m = emptyModel();
    const base = {
      description: '', responsibilities: [], invariants: [], assumptions: [], failureModes: [],
      tags: [], status: 'Active' as const, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't',
    };
    m.nodes.push(
      { id: 'sys', name: 'Sys', type: 'System', parentId: null, ...base },
      { id: 'ca', name: 'Alpha', type: 'Container', parentId: 'sys', ...base },
      { id: 'a1', name: 'A1', type: 'Component', parentId: 'ca', ...base },
      { id: 'ext', name: 'Ext', type: 'ExternalSystem', parentId: null, ...base },
    );
    m.connections.push({
      id: 'x', from: 'a1', to: 'ext', relationCategory: 'Dependency', transport: 'Sync',
      description: '', direction: 'Unidirectional', realizes: [], codeRefs: [],
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
      id: 'c', name: 'C', type: 'Component', description: '', responsibilities: [],
      invariants: [], assumptions: [], failureModes: [], tags: [], status: 'Active',
      parentId: null, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't',
    });
    const c = toFlowNodes(m, 'Component').find((n) => n.id === 'c');
    expect(c?.parentId).toBeUndefined();
    expect(c?.type).toBe('node');
  });
});

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
    expect(regionChildIds(m, 'Component', 'cont')).toEqual(new Set(['a', 'b']));
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
    expect(c?.type).toBeUndefined();
  });
});

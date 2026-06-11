import { describe, it, expect } from 'vitest';
import { toFlowNodes, toFlowEdges } from './toModel';
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
});

import { describe, it, expect } from 'vitest';
import { getContext } from '../src/context';
import { emptyModel } from '../src/model';

describe('getContext', () => {
  it('renders nodes with semantics and connections as plain text', () => {
    const m = emptyModel();
    m.metadata.name = 'Shop';
    m.nodes.push({
      id: 'api', name: 'API', type: 'Container', description: 'HTTP edge',
      purpose: 'entry', technology: 'Hono', responsibilities: ['routing'],
      invariants: ['always authenticates'], assumptions: ['db reachable'],
      failureModes: ['timeout'], tags: [], status: 'Active', parentId: 'sys',
      codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't',
    });
    m.nodes.push({
      id: 'sys', name: 'Shop', type: 'System', description: '', responsibilities: [],
      invariants: [], assumptions: [], failureModes: [], tags: [], status: 'Active',
      parentId: null, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't',
    });
    m.connections.push({
      id: 'c1', from: 'api', to: 'sys', relationCategory: 'Dependency',
      transport: 'Sync', description: 'calls', direction: 'Unidirectional',
      realizes: [], codeRefs: [],
    });

    const text = getContext(m);
    expect(text).toContain('# Shop');
    expect(text).toContain('API (Container)');
    expect(text).toContain('always authenticates');
    expect(text).toContain('API -> Shop');
    expect(text).toContain('parent: Shop');
  });

  it('scopes to a single layer when scope given', () => {
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
    const text = getContext(m, { layer: 'Component' });
    expect(text).toContain('Comp (Component)');
    expect(text).not.toContain('Shop (System)');
  });
});

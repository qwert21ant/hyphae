import { describe, it, expect } from 'vitest';
import { getContext } from '../src/context';
import { emptyModel } from '../src/model';
import type { HyphaeModel } from '../src/model';

function shop(): HyphaeModel {
  const m = emptyModel();
  m.metadata.name = 'Shop';
  m.nodes.push({
    id: 'sys', name: 'Shop', type: 'System', description: '', responsibilities: [],
    invariants: [], assumptions: [], failureModes: [], tags: [], status: 'Active',
    parentId: null, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't',
  });
  m.nodes.push({
    id: 'api', name: 'API', type: 'Container', description: 'HTTP edge',
    purpose: 'entry', technology: 'Hono', responsibilities: ['routing'],
    invariants: ['always authenticates'], assumptions: ['db reachable'],
    failureModes: ['timeout'], tags: [], status: 'Active', parentId: 'sys',
    codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't',
  });
  m.connections.push({
    id: 'c1', from: 'api', to: 'sys', relationCategory: 'Dependency',
    transport: 'Sync', description: 'calls', direction: 'Unidirectional',
    realizes: [], codeRefs: [],
  });
  return m;
}

describe('getContext', () => {
  it('defaults to a compact summary: headline + one-line purpose + parent, no deep fields', () => {
    const t = getContext(shop());
    expect(t).toContain('# Shop');
    expect(t).toContain('API (Container)');
    expect(t).toContain('entry'); // purpose used as the one-liner
    expect(t).toContain('parent: Shop');
    expect(t).toContain('API -> Shop'); // connections still rendered
    expect(t).not.toContain('always authenticates'); // invariants dropped in summary
  });

  it('mode:full includes all semantic fields', () => {
    const t = getContext(shop(), { mode: 'full' });
    expect(t).toContain('always authenticates');
    expect(t).toContain('routing');
  });

  it('scopes to a single layer', () => {
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
    const t = getContext(m, { layer: 'Component' });
    expect(t).toContain('Comp (Component)');
    expect(t).not.toContain('Shop (System)');
  });

  it('root scopes to a node and its descendants, full by default', () => {
    const t = getContext(shop(), { root: 'sys' });
    expect(t).toContain('Shop (System)');
    expect(t).toContain('API (Container)'); // descendant of sys
    expect(t).toContain('always authenticates'); // root defaults to full detail
  });

  it('root excludes nodes outside the subtree', () => {
    const t = getContext(shop(), { root: 'api' });
    expect(t).toContain('API (Container)');
    expect(t).not.toContain('Shop (System)'); // parent is not a descendant
  });

  it('fields overrides mode to include only the listed fields', () => {
    const t = getContext(shop(), { fields: ['responsibilities'] });
    expect(t).toContain('responsibilities: - routing');
    expect(t).not.toContain('always authenticates');
  });
});

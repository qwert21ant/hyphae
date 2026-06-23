import { describe, it, expect } from 'vitest';
import { getContext } from '../src/context';
import { emptyModel, type HyphaeModel } from '../src/model';

function shop(): HyphaeModel {
  const m = emptyModel();
  m.metadata.name = 'Shop';
  m.nodes.push(
    { id: 'sys', name: 'Shop', type: 'System', parentId: null, description: '', codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {} },
    { id: 'api', name: 'API', type: 'Container', parentId: 'sys', description: 'HTTP edge', codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: { technology: 'Hono', responsibilities: ['routing'], invariants: ['always authenticates'] } },
  );
  m.connections.push({ id: 'c1', from: 'api', to: 'sys', type: 'Dependency', description: 'calls', direction: 'Unidirectional', realizedBy: [], codeRefs: [], fields: { transport: 'Sync' } });
  return m;
}

describe('getContext', () => {
  it('summary mode (default): headline + first line of description + parent, no deep fields', () => {
    const t = getContext(shop());
    expect(t).toContain('# Shop');
    expect(t).toContain('API (Container)');
    expect(t).toContain('HTTP edge');
    expect(t).toContain('parent: Shop');
    expect(t).toContain('API -> Shop');
    expect(t).not.toContain('always authenticates');
  });

  it('full mode renders profile fields generically', () => {
    const t = getContext(shop(), { mode: 'full' });
    expect(t).toContain('always authenticates');
    expect(t).toContain('routing');
    expect(t).toContain('Hono');
  });

  it('connection line shows the connection type and description', () => {
    const t = getContext(shop(), { mode: 'full' });
    expect(t).toContain('API -> Shop [Dependency]');
    expect(t).toContain('calls');
  });
});

import { describe, it, expect } from 'vitest';
import { modelOverview } from '../src/overview';
import { emptyModel } from '../src/model';
import type { HyphaeModel } from '../src/model';

function model(): HyphaeModel {
  const m = emptyModel();
  m.metadata.name = 'Demo';
  const base = { description: '', codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {} };
  m.nodes.push(
    { id: 'sys', name: 'Sys', type: 'System', parentId: null, ...base, description: 'the system' },
    { id: 'ca', name: 'Api', type: 'Container', parentId: 'sys', ...base, description: 'edge service' },
    { id: 'cmp', name: 'Auth', type: 'Component', parentId: 'ca', ...base },
    { id: 'code', name: 'AuthService', type: 'Class', parentId: 'cmp', ...base },
  );
  m.connections.push({ id: 'x1', from: 'cmp', to: 'cmp', type: 'Dependency', description: '', direction: 'Unidirectional', realizedBy: [], codeRefs: [], fields: {} });
  return m;
}

describe('modelOverview', () => {
  it('shows per-layer and per-kind counts and totals', () => {
    const out = modelOverview(model());
    expect(out).toContain('# Demo');
    expect(out).toContain('Nodes: 4');
    expect(out).toContain('Connections: 1');
    expect(out).toMatch(/Context=1/);
    expect(out).toMatch(/Container=1/);
    expect(out).toMatch(/Component=1/);
    expect(out).toMatch(/Code=1/);
    expect(out).toMatch(/Class=1/);
  });

  it('lists only System and Container nodes (not Components or Code)', () => {
    const out = modelOverview(model());
    expect(out).toContain('Sys [System]');
    expect(out).toContain('Api [Container]');
    expect(out).not.toContain('AuthService');
    expect(out).not.toContain('[Component]');
  });
});

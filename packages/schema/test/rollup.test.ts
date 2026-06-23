import { describe, it, expect } from 'vitest';
import { rollupConnections } from '../src/rollup';
import { emptyModel } from '../src/model';
import type { HyphaeModel } from '../src/model';

function model(): HyphaeModel {
  const m = emptyModel();
  const base = {
    description: '', codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {},
  };
  m.nodes.push(
    { id: 'sys', name: 'Sys', type: 'System', parentId: null, ...base },
    { id: 'ca', name: 'Alpha', type: 'Container', parentId: 'sys', ...base },
    { id: 'cb', name: 'Beta', type: 'Container', parentId: 'sys', ...base },
    { id: 'a1', name: 'A1', type: 'Component', parentId: 'ca', ...base },
    { id: 'a2', name: 'A2', type: 'Component', parentId: 'ca', ...base },
    { id: 'b1', name: 'B1', type: 'Component', parentId: 'cb', ...base },
    { id: 'ext', name: 'Ext', type: 'ExternalSystem', parentId: null, ...base },
  );
  const e = { description: '', direction: 'Unidirectional' as const, realizedBy: [], codeRefs: [], fields: {} };
  m.connections.push(
    { id: 'x1', from: 'a1', to: 'b1', type: 'Dependency', ...e }, // ca->cb
    { id: 'x2', from: 'a2', to: 'b1', type: 'DataFlow', ...e }, // ca->cb (same pair)
    { id: 'x3', from: 'a1', to: 'ext', type: 'Dependency', ...e }, // ca->ext
    { id: 'x4', from: 'a1', to: 'a2', type: 'Dependency', ...e }, // intra ca
  );
  return m;
}

describe('rollupConnections', () => {
  it('rolls component edges up to container level, dropping intra-container edges', () => {
    const r = rollupConnections(model(), 'Container');
    // x4 (a1->a2, both in ca) is internal -> dropped. ca->cb and ca->ext remain.
    const pairs = r.map((e) => `${e.from}->${e.to}`).sort();
    expect(pairs).toEqual(['ca->cb', 'ca->ext']);
  });

  it('groups multiple underlying edges between the same pair into one rollup edge', () => {
    const r = rollupConnections(model(), 'Container');
    const caCb = r.find((e) => e.from === 'ca' && e.to === 'cb')!;
    expect(caCb.realizedBy.sort()).toEqual(['x1', 'x2']);
  });

  it('keeps the external endpoint as itself at container level', () => {
    const r = rollupConnections(model(), 'Container');
    const caExt = r.find((e) => e.to === 'ext')!;
    expect(caExt).toMatchObject({ from: 'ca', to: 'ext', realizedBy: ['x3'] });
  });

  it('at context level, everything internal collapses to the System; only external edges survive', () => {
    const r = rollupConnections(model(), 'Context');
    // x1,x2,x4 are all within sys -> self-loops dropped. Only sys->ext (from x3) remains.
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ from: 'sys', to: 'ext', realizedBy: ['x3'] });
  });
});

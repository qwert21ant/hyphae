import { describe, it, expect } from 'vitest';
import { modelGaps } from '../src/gaps';
import { emptyModel } from '../src/model';
import { c4Backend } from '../src/profiles/c4-backend';
import type { HyphaeModel } from '../src/model';

const nodeBase = { root: null, role: null, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {} };
const edgeBase = { label: '', verb: 'uses', object: '', description: '', direction: 'Unidirectional' as const, realizedBy: [], codeRefs: [], fields: {} };

/** sys > (ca > a1[desc], a2[echoes], a3[orphan]) , (cb > b1[empty]) */
function model(): HyphaeModel {
  const m = emptyModel();
  m.nodes.push(
    { id: 'sys', name: 'Sys', type: 'System', parentId: null, description: 'The system', ...nodeBase },
    { id: 'ca', name: 'Alpha', type: 'Container', parentId: 'sys', description: 'Alpha container', ...nodeBase },
    { id: 'cb', name: 'Beta', type: 'Container', parentId: 'sys', description: 'Beta container', ...nodeBase },
    { id: 'a1', name: 'A1', type: 'Component', parentId: 'ca', description: 'Handles alpha ingest', ...nodeBase },
    { id: 'a2', name: 'A2', type: 'Component', parentId: 'ca', description: 'a2', ...nodeBase }, // echoes-name
    { id: 'b1', name: 'B1', type: 'Component', parentId: 'cb', description: '', ...nodeBase }, // empty
    { id: 'a3', name: 'A3', type: 'Component', parentId: 'ca', description: 'Standalone', ...nodeBase }, // orphan
  );
  m.connections.push(
    { id: 'e1', from: 'a1', to: 'b1', ...edgeBase }, // component edge a1->b1
    { id: 'e2', from: 'a1', to: 'a2', ...edgeBase }, // component edge a1->a2 (keeps a2 non-orphan)
  );
  return m;
}

describe('modelGaps', () => {
  it('flags Component-layer nodes with zero connections as orphans', () => {
    const g = modelGaps(model(), c4Backend);
    expect(g.orphanNodes.map((n) => n.id)).toEqual(['a3']);
  });

  it('classifies thin descriptions as empty or echoes-name with degree counts', () => {
    const g = modelGaps(model(), c4Backend);
    const byId = Object.fromEntries(g.thinDescriptions.map((t) => [t.id, t]));
    expect(byId['b1']).toMatchObject({ reason: 'empty' });
    expect(byId['a2']).toMatchObject({ reason: 'echoes-name' });
    // a1 has a real description -> not thin
    expect(byId['a1']).toBeUndefined();
    // b1 degree: inbound e1 (a1->b1) = 1, outbound 0
    expect(byId['b1']).toMatchObject({ inbound: 1, outbound: 0 });
  });

  it('returns empty gap lists for an empty model', () => {
    expect(modelGaps(emptyModel(), c4Backend)).toEqual({ orphanNodes: [], thinDescriptions: [], missingRefs: [] });
  });
});

describe('missingRefs', () => {
  function refModel(): HyphaeModel {
    const m = emptyModel();
    m.nodes.push(
      { id: 'sys', name: 'Sys', type: 'System', parentId: null, description: 'The system', ...nodeBase, root: 'app/' },
      { id: 'ca', name: 'Alpha', type: 'Container', parentId: 'sys', description: 'Alpha container', ...nodeBase },
      { id: 'a1', name: 'A1', type: 'Component', parentId: 'ca', description: 'Handles alpha ingest',
        ...nodeBase, codeRefs: ['src/present.ts', 'src/gone.ts'] },
    );
    return m;
  }

  it('is empty when no disk check is requested', () => {
    expect(modelGaps(refModel(), c4Backend).missingRefs).toEqual([]);
  });

  it('reports a ref whose resolved path is absent from disk', () => {
    const present = new Set(['app/src/present.ts']);
    const gaps = modelGaps(refModel(), c4Backend, {
      checkDisk: { cwd: '.', exists: (p) => present.has(p) },
    });
    expect(gaps.missingRefs).toEqual([
      { nodeId: 'a1', ref: 'src/gone.ts', resolved: 'app/src/gone.ts' },
    ]);
  });

  it('does not check globs, which need a matcher rather than an existence test', () => {
    const m = refModel();
    m.nodes[2].codeRefs = ['src/**/*.ts'];
    const gaps = modelGaps(m, c4Backend, { checkDisk: { cwd: '.', exists: () => false } });
    expect(gaps.missingRefs).toEqual([]);
  });

  it('skips unanchored refs, which validateModel already reports', () => {
    const m = refModel();
    m.nodes[0].root = null;
    const gaps = modelGaps(m, c4Backend, { checkDisk: { cwd: '.', exists: () => false } });
    expect(gaps.missingRefs).toEqual([]);
  });
});

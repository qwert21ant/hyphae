import { describe, it, expect } from 'vitest';
import { modelGaps } from '../src/gaps';
import { emptyModel } from '../src/model';
import { c4Backend } from '../src/profiles/c4-backend';
import type { HyphaeModel } from '../src/model';

const nodeBase = { root: null, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {} };
const edgeBase = { description: '', direction: 'Unidirectional' as const, realizedBy: [], codeRefs: [], fields: {} };

/** sys > (ca > a1[code: ka1], a2[code: ka2]) , (cb > b1[code: kb1]) , orphan component a3 */
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
    { id: 'ka1', name: 'KA1', type: 'Class', parentId: 'a1', description: 'k', ...nodeBase },
    { id: 'ka2', name: 'KA2', type: 'Class', parentId: 'a2', description: 'k', ...nodeBase },
    { id: 'kb1', name: 'KB1', type: 'Class', parentId: 'b1', description: 'k', ...nodeBase },
  );
  m.connections.push(
    { id: 'e1', from: 'a1', to: 'b1', type: 'Dependency', ...edgeBase }, // component edge a1->b1
    { id: 'e2', from: 'a1', to: 'a2', type: 'Dependency', ...edgeBase }, // component edge a1->a2 (keeps a2 non-orphan)
    { id: 'ce1', from: 'ka1', to: 'kb1', type: 'Dependency', ...edgeBase }, // cross-component code edge, UNBOUND
    { id: 'ce2', from: 'ka1', to: 'ka2', type: 'Dependency', ...edgeBase }, // cross-component code edge (a1->a2)
    { id: 'ci', from: 'ka1', to: 'ka1', type: 'Dependency', ...edgeBase }, // intra-component (self) code edge
  );
  return m;
}

describe('modelGaps', () => {
  it('flags Component-layer nodes with zero connections as orphans', () => {
    const g = modelGaps(model(), c4Backend);
    expect(g.orphanNodes.map((n) => n.id)).toEqual(['a3']);
  });

  it('flags cross-component code edges not bound via realizedBy, excluding intra-component edges', () => {
    const g = modelGaps(model(), c4Backend);
    const ids = g.unboundCodeEdges.map((e) => e.id).sort();
    expect(ids).toEqual(['ce1', 'ce2']); // ci (self, intra-component) excluded
    const ce1 = g.unboundCodeEdges.find((e) => e.id === 'ce1')!;
    expect(ce1).toMatchObject({ fromComponent: 'A1', toComponent: 'B1' });
  });

  it('excludes a code edge already bound via some connection realizedBy', () => {
    const m = model();
    m.connections.find((c) => c.id === 'e1')!.realizedBy = ['ce1'];
    const g = modelGaps(m, c4Backend);
    expect(g.unboundCodeEdges.map((e) => e.id)).toEqual(['ce2']); // ce1 now claimed
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

  it('does not flag Code-layer nodes for thin descriptions (floor is Component-and-above)', () => {
    const g = modelGaps(model(), c4Backend);
    expect(g.thinDescriptions.some((t) => t.type === 'Class')).toBe(false);
  });

  it('returns empty gap lists for an empty model', () => {
    expect(modelGaps(emptyModel(), c4Backend)).toEqual({ orphanNodes: [], unboundCodeEdges: [], thinDescriptions: [] });
  });
});

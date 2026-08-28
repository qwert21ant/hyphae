import { describe, it, expect } from 'vitest';
import { modelGaps, identifierDensity, wordCoverage } from '../src/gaps';
import { emptyModel } from '../src/model';
import { c4Backend } from '../src/profiles/c4-backend';
import type { HyphaeModel } from '../src/model';

const nodeBase = { root: null, role: null, foundational: false, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {} };
const edgeBase = { label: '', description: '', direction: 'Unidirectional' as const, realizedBy: [], codeRefs: [], fields: {} };

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
    expect(modelGaps(emptyModel(), c4Backend)).toEqual({
      orphanNodes: [], thinDescriptions: [], missingRefs: [], bloatedProse: [],
    });
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

describe('identifierDensity', () => {
  it('is zero for prose with no code shapes', () => {
    expect(identifierDensity('Keeps exactly one path being walked at a time')).toBe(0);
  });

  it('counts camelCase, call syntax and source file names', () => {
    // 8 words, 4 hits (onTick counts twice — see identifierDensity) -> 50 per 100
    expect(identifierDensity('it calls onTick() and reads pathPlanLock from Main.java')).toBeGreaterThan(15);
  });

  it('scores a CamelCase product name below the threshold in ordinary prose', () => {
    // One proper noun in a long clean sentence must not trip the 15/100 flag.
    const prose = 'Stores the recorded clip and its metadata durably, so that a viewer can replay '
      + 'any camera from the last thirty days without the capture service being reachable. '
      + 'Runs on PostgreSQL.';
    expect(identifierDensity(prose)).toBeLessThan(15);
  });

  it('is zero for empty text', () => {
    expect(identifierDensity('')).toBe(0);
  });
});

describe('wordCoverage', () => {
  it('is 1 when every content word of the item appears in the description', () => {
    expect(wordCoverage('Owns the active goal', 'This component owns the active goal and more')).toBe(1);
  });

  it('ignores stopwords and very short words', () => {
    // "of the a" are stopwords; only "cache" and "chunk" count, both present.
    expect(wordCoverage('a cache of the chunk', 'the chunk cache')).toBe(1);
  });

  it('is low when the item says something the description does not', () => {
    expect(wordCoverage('Rejects negative movement costs', 'Handles alpha ingest')).toBeLessThan(0.5);
  });

  it('is zero for an item with no content words', () => {
    expect(wordCoverage('of the', 'anything at all')).toBe(0);
  });
});

/** One node per bloat reason, plus one clean node and one bloated connection. */
function proseModel(): HyphaeModel {
  const m = emptyModel();
  const long = 'x'.repeat(400);
  m.nodes.push(
    { id: 'sys', name: 'Sys', type: 'System', parentId: null, description: 'The system', ...nodeBase },
    { id: 'ca', name: 'Alpha', type: 'Container', parentId: 'sys', description: 'Alpha container', ...nodeBase },
    // over-budget: >600 chars, but clean prose and no list to restate
    { id: 'big', name: 'Big', type: 'Component', parentId: 'ca',
      description: `It stores the recorded clip and serves it back to a viewer later. ${long} ${long}`, ...nodeBase },
    // code-shaped: short, but pure identifiers
    { id: 'codey', name: 'Codey', type: 'Component', parentId: 'ca',
      description: 'Calls onTick() then reads pathPlanLock and writes CachedRegion from Main.java',
      ...nodeBase },
    // restates-description: the responsibility adds nothing the description has not said
    { id: 'dup', name: 'Dup', type: 'Component', parentId: 'ca',
      description: 'Owns the current path executor and the active goal for the session',
      ...nodeBase, fields: { responsibilities: ['Owns the current path executor and the active goal'] } },
    // clean: nothing should flag
    { id: 'ok', name: 'Ok', type: 'Component', parentId: 'ca',
      description: 'Keeps exactly one path being walked at a time, and replaces it before it runs out',
      ...nodeBase, fields: { responsibilities: ['Rejects a movement cost below zero'] } },
  );
  m.connections.push(
    { id: 'e1', from: 'big', to: 'codey', ...edgeBase,
      description: 'Hands PathExecutor to AbstractNodeCostSearch via secretInternalSetGoal() in Main.java' },
  );
  return m;
}

describe('modelGaps bloatedProse', () => {
  const flags = () => modelGaps(proseModel(), c4Backend).bloatedProse;
  const reasonsFor = (id: string) => flags().filter((b) => b.id === id).map((b) => b.reason);

  it('flags a description over the 600-char budget', () => {
    expect(reasonsFor('big')).toContain('over-budget');
  });

  it('flags short-but-code-shaped prose the length check misses', () => {
    expect(reasonsFor('codey')).toContain('code-shaped');
    expect(reasonsFor('codey')).not.toContain('over-budget');
  });

  it('flags a responsibility its own description already states', () => {
    const dup = flags().find((b) => b.id === 'dup' && b.reason === 'restates-description');
    expect(dup).toBeTruthy();
    expect(dup!.coverage).toBeGreaterThanOrEqual(0.8);
    expect(dup!.item).toMatch(/Owns the current path executor/);
  });

  it('leaves clean prose alone', () => {
    expect(flags().some((b) => b.id === 'ok')).toBe(false);
  });

  it('covers connections, which measured worst of anything on the real model', () => {
    const e = flags().find((b) => b.kind === 'connection');
    expect(e).toMatchObject({ id: 'e1', reason: 'code-shaped' });
    expect(e!.name).toBe('Big → Codey');
  });

  it('does not flag rules for restating — that slot measured zero duplication', () => {
    const m = proseModel();
    m.nodes.find((n) => n.id === 'ok')!.fields = {
      rules: ['Keeps exactly one path being walked at a time, and replaces it before it runs out'],
    };
    expect(modelGaps(m, c4Backend).bloatedProse.some(
      (b) => b.id === 'ok' && b.reason === 'restates-description')).toBe(false);
  });

  it('carries degree, so a bloated hub stands out', () => {
    const codey = flags().find((b) => b.id === 'codey')!;
    expect(codey).toMatchObject({ inbound: 1, outbound: 0 });
  });
});

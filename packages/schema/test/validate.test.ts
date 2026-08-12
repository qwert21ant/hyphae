import { describe, it, expect } from 'vitest';
import { validateModel } from '../src/validate';
import { c4Backend } from '../src/profiles/c4-backend';
import { emptyModel, type HyphaeModel } from '../src/model';
import type { Node } from '../src/node';
import type { Connection } from '../src/connection';

const node = (over: Record<string, unknown>): Node => ({
  id: 'x', name: 'X', type: 'Component', parentId: null, description: '', root: null, role: null, foundational: false,
  codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {}, ...over,
} as Node);
const conn = (over: Record<string, unknown>): Connection => ({
  id: 'e', from: 'a', to: 'b', label: '', description: '',
  direction: 'Unidirectional', realizedBy: [], codeRefs: [], fields: {}, ...over,
} as Connection);
function model(over: Partial<HyphaeModel> = {}): HyphaeModel {
  return { ...emptyModel(), ...over };
}

describe('validateModel', () => {
  it('flags an unknown node type', () => {
    const m = model({ nodes: [node({ id: 'a', type: 'Nope' })] });
    expect(validateModel(m, c4Backend).map((i) => i.kind)).toContain('unknown-type');
  });

  it('flags a bad parent', () => {
    const m = model({ nodes: [node({ id: 's', type: 'System' }), node({ id: 'c', type: 'Component', parentId: 's' })] });
    expect(validateModel(m, c4Backend).map((i) => i.kind)).toContain('bad-parent');
  });

  it('flags an unknown field key', () => {
    const m = model({ nodes: [node({ id: 'a', type: 'Component', fields: { nope: 1 } })] });
    expect(validateModel(m, c4Backend).map((i) => i.kind)).toContain('unknown-field');
  });

  it('flags a bad field type', () => {
    const m = model({ nodes: [node({ id: 'a', type: 'Component', fields: { technology: 5 } })] });
    expect(validateModel(m, c4Backend).map((i) => i.kind)).toContain('bad-field-type');
  });

  it('flags a bad enum value on a connection field', () => {
    const profile = {
      ...c4Backend,
      commonConnectionFields: [{
        key: 'channel', type: 'enum' as const, description: 'test-only enum field',
        values: [{ value: 'Radio', description: 'over the air' }],
      }],
    };
    const m = model({
      nodes: [node({ id: 'a', type: 'System' }), node({ id: 'b', type: 'System' })],
      connections: [conn({ from: 'a', to: 'b', fields: { channel: 'Telepathy' } })],
    });
    expect(validateModel(m, profile).map((i) => i.kind)).toContain('bad-enum-value');
  });

  it('accepts a valid model with fields', () => {
    const m = model({
      nodes: [
        node({ id: 's', type: 'System', fields: { summary: 'Serves requests' } }),
        node({ id: 'co', type: 'Container', parentId: 's', fields: { technology: 'Hono', responsibilities: ['serve'], summary: 'HTTP server' } }),
      ],
      connections: [],
    });
    expect(validateModel(m, c4Backend)).toEqual([]);
  });
});

describe('containment', () => {
  const base = { description: '', root: null, role: null, foundational: false, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {} };
  function withParent(parentType: string) {
    const m = emptyModel();
    m.nodes.push(
      { id: 'sys', name: 'S', type: 'System', parentId: null, ...base, fields: { summary: 'x' } },
      { id: 'ct', name: 'C', type: 'Container', parentId: 'sys', ...base, fields: { summary: 'x' } },
    );
    const parentId = parentType === 'System' ? 'sys' : 'ct';
    m.nodes.push({ id: 'cmp', name: 'Cmp', type: 'Component', parentId, ...base, fields: { summary: 'x' } });
    return m;
  }

  it('allows a Component under a Container', () => {
    expect(validateModel(withParent('Container'), c4Backend)).toEqual([]);
  });

  it('rejects a Component under a System', () => {
    const issues = validateModel(withParent('System'), c4Backend);
    expect(issues).toEqual([expect.objectContaining({ kind: 'bad-parent', ref: 'cmp' })]);
  });

  it('flags a Container with no parent (orphan)', () => {
    const m = model({ nodes: [node({ id: 'ct', type: 'Container', parentId: null, fields: { summary: 'x' } })] });
    const issues = validateModel(m, c4Backend).filter((i) => i.kind === 'missing-parent');
    expect(issues).toHaveLength(1);
    expect(issues[0].ref).toBe('ct');
    expect(issues[0].message).toMatch(/must be a child of System/i);
  });

  it('flags a Component with no parent (orphan)', () => {
    const m = model({ nodes: [node({ id: 'cmp', type: 'Component', parentId: null, fields: { summary: 'x' } })] });
    expect(validateModel(m, c4Backend).filter((i) => i.kind === 'missing-parent').map((i) => i.ref)).toEqual(['cmp']);
  });

  it('does not flag a top-level System, Actor, or ExternalSystem (no parent required)', () => {
    const m = model({ nodes: [
      node({ id: 's', type: 'System', fields: { summary: 'x' } }),
      node({ id: 'a', type: 'Actor', fields: { summary: 'x' } }),
      node({ id: 'e', type: 'ExternalSystem', fields: { summary: 'x' } }),
    ] });
    expect(validateModel(m, c4Backend).filter((i) => i.kind === 'missing-parent')).toEqual([]);
  });
});

import { isDirectoryRef } from '../src/ref';

describe('ref anchoring', () => {
  const base = { codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {}, root: null, role: null, foundational: false };

  function anchoredModel(): HyphaeModel {
    const m = emptyModel();
    m.nodes.push(
      { id: 'sys', name: 'Sys', type: 'System', parentId: null, description: 'd', ...base, root: 'endpoints/', fields: { summary: 'x' } },
      { id: 'mg', name: 'MG', type: 'Container', parentId: 'sys', description: 'd', ...base, root: 'media_gateway/', fields: { summary: 'x' } },
      { id: 'comp', name: 'C', type: 'Component', parentId: 'mg', description: 'd', ...base, codeRefs: ['src/main.ts'], fields: { summary: 'x' } },
    );
    return m;
  }

  it('accepts a ref anchored by an ancestor root', () => {
    expect(validateModel(anchoredModel(), c4Backend)).toEqual([]);
  });

  it('flags a node whose refs have no anchoring root', () => {
    const m = anchoredModel();
    m.nodes[0].root = null;
    m.nodes[1].root = null;
    const issues = validateModel(m, c4Backend).filter((i) => i.kind === 'unanchored-ref');
    expect(issues).toHaveLength(1);
    expect(issues[0].ref).toBe('comp');
    expect(issues[0].message).toMatch(/no ancestor declares a root/i);
  });

  it('reports one issue per node, not one per ref', () => {
    const m = anchoredModel();
    m.nodes[0].root = null;
    m.nodes[1].root = null;
    m.nodes[2].codeRefs = ['src/a.ts', 'src/b.ts', 'src/c.ts'];
    expect(validateModel(m, c4Backend).filter((i) => i.kind === 'unanchored-ref')).toHaveLength(1);
  });

  it('exempts an absolute ref from anchoring', () => {
    const m = anchoredModel();
    m.nodes[0].root = null;
    m.nodes[1].root = null;
    m.nodes[2].codeRefs = ['/opt/vendor/lib.ts'];
    expect(validateModel(m, c4Backend).filter((i) => i.kind === 'unanchored-ref')).toEqual([]);
  });

  it('ignores docRefs, which may be URLs', () => {
    const m = anchoredModel();
    m.nodes[0].root = null;
    m.nodes[1].root = null;
    m.nodes[2].codeRefs = [];
    m.nodes[2].docRefs = ['https://example.test/adr-1'];
    expect(validateModel(m, c4Backend).filter((i) => i.kind === 'unanchored-ref')).toEqual([]);
  });

  it('flags a root that is not a directory Ref', () => {
    const m = anchoredModel();
    m.nodes[1].root = 'media_gateway';   // missing trailing slash
    const issues = validateModel(m, c4Backend).filter((i) => i.kind === 'bad-root');
    expect(issues).toHaveLength(1);
    expect(issues[0].ref).toBe('mg');
    expect(issues[0].message).toMatch(/directory ref/i);
    expect(isDirectoryRef('media_gateway')).toBe(false);
  });

  it('flags a glob used as a root', () => {
    const m = anchoredModel();
    m.nodes[1].root = 'endpoints/*/';
    expect(validateModel(m, c4Backend).filter((i) => i.kind === 'bad-root')).toHaveLength(1);
  });
});

describe('role validation', () => {
  const base = { root: null, role: null, foundational: false, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: { summary: 's' } };
  const edge = { label: '', description: '', direction: 'Unidirectional' as const, realizedBy: [], codeRefs: [], fields: {} };

  function model(): HyphaeModel {
    const m = emptyModel();
    m.nodes.push(
      { ...base, id: 'sys', name: 'Sys', type: 'System', parentId: null, description: 'd' },
      { ...base, id: 'c', name: 'C', type: 'Container', parentId: 'sys', description: 'd' },
      { ...base, id: 'k1', name: 'K1', type: 'Component', parentId: 'c', description: 'd' },
      { ...base, id: 'k2', name: 'K2', type: 'Component', parentId: 'c', description: 'd' },
    );
    m.connections.push({ ...edge, id: 'e1', from: 'k1', to: 'k2' });
    return m;
  }

  it('accepts a null role', () => {
    expect(validateModel(model(), c4Backend)).toEqual([]);
  });

  it('accepts a declared role override', () => {
    const m = model();
    m.nodes[2].role = 'datastore';
    expect(validateModel(m, c4Backend)).toEqual([]);
  });

  it('flags an undeclared role', () => {
    const m = model();
    m.nodes[2].role = 'wormhole';
    const issues = validateModel(m, c4Backend).filter((i) => i.kind === 'unknown-role');
    expect(issues).toHaveLength(1);
    expect(issues[0].ref).toBe('k1');
    expect(issues[0].message).toMatch(/wormhole/);
  });

  // Verbs are gone: a connection's meaning is free text now, so there is no vocabulary left to
  // validate it against.
  it('reports nothing about a legacy verb, declared or not', () => {
    const m = model();
    (m.connections[0] as unknown as Record<string, unknown>).verb = 'yeets';
    expect(validateModel(m, c4Backend).map((i) => i.kind)).not.toContain('unknown-verb');
  });

  it('reports a missing summary on a Component', () => {
    const m = model();
    m.nodes[2].fields = {};
    const issues = validateModel(m, c4Backend).filter((i) => i.kind === 'missing-required-field');
    expect(issues).toHaveLength(1);
    expect(issues[0].ref).toBe('k1');
  });
});

describe('realizedBy validation', () => {
  const base = { root: null, role: null, foundational: false, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: { summary: 's' } };
  const edge = { label: '', description: '', direction: 'Unidirectional' as const, realizedBy: [], codeRefs: [], fields: {} };

  /** Two containers wired at the Component layer by e1, plus an authored Container edge `up`
   *  that claims e1 — the shape Phase 3 of the modeling skill produces. */
  function model(): HyphaeModel {
    const m = emptyModel();
    m.nodes.push(
      { ...base, id: 'sys', name: 'Sys', type: 'System', parentId: null, description: 'd' },
      { ...base, id: 'ca', name: 'A', type: 'Container', parentId: 'sys', description: 'd' },
      { ...base, id: 'cb', name: 'B', type: 'Container', parentId: 'sys', description: 'd' },
      { ...base, id: 'k1', name: 'K1', type: 'Component', parentId: 'ca', description: 'd' },
      { ...base, id: 'k2', name: 'K2', type: 'Component', parentId: 'cb', description: 'd' },
    );
    m.connections.push(
      { ...edge, id: 'e1', from: 'k1', to: 'k2' },
      { ...edge, id: 'up', from: 'ca', to: 'cb', realizedBy: ['e1'] },
    );
    return m;
  }

  it('accepts a container edge realizedBy an existing component edge', () => {
    expect(validateModel(model(), c4Backend)).toEqual([]);
  });

  it('flags a realizedBy id that is not a connection', () => {
    const m = model();
    m.connections[1].realizedBy = ['ghost'];
    const issues = validateModel(m, c4Backend).filter((i) => i.kind === 'dangling-realizedBy');
    expect(issues).toHaveLength(1);
    expect(issues[0].ref).toBe('up');
    expect(issues[0].message).toMatch(/ghost/);
  });

  it('flags a realizedBy id that names a node rather than a connection', () => {
    const m = model();
    m.connections[1].realizedBy = ['k1'];
    expect(validateModel(m, c4Backend).map((i) => i.kind)).toContain('dangling-realizedBy');
  });

  it('reports one issue per stale id, keeping the good ones silent', () => {
    const m = model();
    m.connections[1].realizedBy = ['e1', 'gone-1', 'gone-2'];
    const issues = validateModel(m, c4Backend).filter((i) => i.kind === 'dangling-realizedBy');
    expect(issues.map((i) => i.message.match(/"(.+)"/)?.[1])).toEqual(['gone-1', 'gone-2']);
  });
});

describe('flow validation', () => {
  const nbase = { root: null, role: null, foundational: false, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: { summary: 's' } };
  const edge = { label: '', description: '', direction: 'Unidirectional' as const, realizedBy: [], codeRefs: [], fields: {} };

  function flowModel(): HyphaeModel {
    const m = emptyModel();
    m.nodes.push(
      { ...nbase, id: 'sys', name: 'S', type: 'System', parentId: null, description: 'd' },
      { ...nbase, id: 'ct', name: 'C', type: 'Container', parentId: 'sys', description: 'd' },
      { ...nbase, id: 'a', name: 'A', type: 'Component', parentId: 'ct', description: 'd' },
      { ...nbase, id: 'b', name: 'B', type: 'Component', parentId: 'ct', description: 'd' },
    );
    m.connections.push({ ...edge, id: 'c1', from: 'a', to: 'b' });
    m.flows.push({ id: 'f1', name: 'F', description: '', scope: null, steps: [
      { order: 1, from: 'a', to: 'b', via: 'c1', message: 'go', kind: 'Sync' },
    ] });
    return m;
  }

  it('accepts a flow whose steps reference existing nodes and connection', () => {
    expect(validateModel(flowModel(), c4Backend)).toEqual([]);
  });

  it('flags a step endpoint that is not a node', () => {
    const m = flowModel();
    m.flows[0].steps[0].to = 'ghost';
    const issues = validateModel(m, c4Backend).filter((i) => i.kind === 'bad-flow-endpoint');
    expect(issues).toHaveLength(1);
    expect(issues[0].ref).toBe('f1');
  });

  it('flags a via that is not a connection', () => {
    const m = flowModel();
    m.flows[0].steps[0].via = 'nope';
    const issues = validateModel(m, c4Backend).filter((i) => i.kind === 'bad-flow-via');
    expect(issues).toHaveLength(1);
    expect(issues[0].ref).toBe('f1');
  });

  it('flags a scope that is not a profile layer, accepts one that is', () => {
    const bad = flowModel(); bad.flows[0].scope = 'Stratosphere';
    expect(validateModel(bad, c4Backend).filter((i) => i.kind === 'bad-flow-scope')).toHaveLength(1);
    const ok = flowModel(); ok.flows[0].scope = 'Container';
    expect(validateModel(ok, c4Backend)).toEqual([]);
  });

  it('accepts a step with no via', () => {
    const m = flowModel();
    m.flows[0].steps[0].via = undefined;
    expect(validateModel(m, c4Backend)).toEqual([]);
  });

  it('marks a flow invalid when a referenced node is deleted (the delete invariant)', () => {
    const m = flowModel();
    m.nodes = m.nodes.filter((n) => n.id !== 'b');
    m.connections = [];
    expect(validateModel(m, c4Backend).map((i) => i.kind)).toContain('bad-flow-endpoint');
  });

  it('a realistic 2-step request/return flow validates clean', () => {
    const m = flowModel();
    m.flows[0].steps = [
      { order: 1, from: 'a', to: 'b', via: 'c1', message: 'request stream', kind: 'Sync' },
      { order: 2, from: 'b', to: 'a', message: 'stream frames', kind: 'Return' },
    ];
    expect(validateModel(m, c4Backend)).toEqual([]);
  });
});

describe('pattern validation', () => {
  const base = { description: '', root: null, role: null, foundational: false, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: { summary: 's' } };
  const patternModel = () => {
    const m = emptyModel();
    m.nodes.push(
      { id: 'sys', name: 'Sys', type: 'System', parentId: null, ...base } as never,
      { id: 'cont', name: 'Gateway', type: 'Container', parentId: 'sys', ...base, root: 'media_gateway/' } as never,
      { id: 'comp', name: 'Ingest', type: 'Component', parentId: 'cont', ...base } as never,
    );
    return m;
  };

  it('accepts a realistic ref-member pipeline anchored to a component', () => {
    const m = patternModel();
    m.patterns.push({ id: 'p1', name: 'Ingest', kind: 'pipeline', description: '', anchor: 'comp',
      members: [{ name: 'Decode', ref: 'decode.ts', description: '' }, { name: 'Persist', nodeId: 'comp', description: '' }],
      transitions: [] });
    expect(validateModel(m, c4Backend)).toEqual([]);
  });

  it('accepts a pure-name state machine with transitions', () => {
    const m = patternModel();
    m.patterns.push({ id: 'p2', name: 'Recorder', kind: 'state-machine', description: '', anchor: null,
      members: [{ name: 'Idle', description: '' }, { name: 'Recording', description: '' }],
      transitions: [{ from: 'Idle', to: 'Recording', trigger: 'start', description: '' }] });
    expect(validateModel(m, c4Backend)).toEqual([]);
  });

  it('flags an unknown kind', () => {
    const m = patternModel();
    m.patterns.push({ id: 'p', name: 'X', kind: 'octopus', description: '', anchor: null, members: [], transitions: [] });
    expect(validateModel(m, c4Backend).filter((i) => i.kind === 'pattern-unknown-kind')).toHaveLength(1);
  });

  it('flags a member bound to both a node and a ref', () => {
    const m = patternModel();
    m.patterns.push({ id: 'p', name: 'X', kind: 'pipeline', description: '', anchor: 'comp',
      members: [{ name: 'M', nodeId: 'comp', ref: 'decode.ts', description: '' }], transitions: [] });
    const issues = validateModel(m, c4Backend).filter((i) => i.kind === 'pattern-member-double-bind');
    expect(issues).toHaveLength(1);
    expect(issues[0].ref).toBe('p');
  });

  it('flags a member nodeId that is not a node', () => {
    const m = patternModel();
    m.patterns.push({ id: 'p', name: 'X', kind: 'pipeline', description: '', anchor: null,
      members: [{ name: 'M', nodeId: 'ghost', description: '' }], transitions: [] });
    expect(validateModel(m, c4Backend).filter((i) => i.kind === 'pattern-member-bad-node')).toHaveLength(1);
  });

  it('flags an anchor that is not a node', () => {
    const m = patternModel();
    m.patterns.push({ id: 'p', name: 'X', kind: 'pipeline', description: '', anchor: 'ghost', members: [], transitions: [] });
    expect(validateModel(m, c4Backend).filter((i) => i.kind === 'pattern-bad-anchor')).toHaveLength(1);
  });

  it('flags a relative ref member with no anchoring root', () => {
    const m = patternModel();
    // comp has no root and its ancestor "cont" DOES declare one — so anchor:'comp' resolves.
    // Anchor null => the ref cannot resolve.
    m.patterns.push({ id: 'p', name: 'X', kind: 'pipeline', description: '', anchor: null,
      members: [{ name: 'M', ref: 'decode.ts', description: '' }], transitions: [] });
    expect(validateModel(m, c4Backend).filter((i) => i.kind === 'pattern-unanchored-ref')).toHaveLength(1);
  });

  it('flags a transition endpoint that is not a member name', () => {
    const m = patternModel();
    m.patterns.push({ id: 'p', name: 'X', kind: 'state-machine', description: '', anchor: null,
      members: [{ name: 'Idle', description: '' }],
      transitions: [{ from: 'Idle', to: 'Ghost', trigger: '', description: '' }] });
    expect(validateModel(m, c4Backend).filter((i) => i.kind === 'pattern-bad-transition')).toHaveLength(1);
  });

  it('flags duplicate member names', () => {
    const m = patternModel();
    m.patterns.push({ id: 'p', name: 'X', kind: 'pipeline', description: '', anchor: null,
      members: [{ name: 'M', description: '' }, { name: 'M', description: '' }], transitions: [] });
    expect(validateModel(m, c4Backend).filter((i) => i.kind === 'pattern-duplicate-member-name')).toHaveLength(1);
  });
});

import { describe, it, expect } from 'vitest';
import { validateModel } from '../src/validate';
import { c4Backend } from '../src/profiles/c4-backend';
import { emptyModel, type HyphaeModel } from '../src/model';
import type { Node } from '../src/node';
import type { Connection } from '../src/connection';

const node = (over: Record<string, unknown>): Node => ({
  id: 'x', name: 'X', type: 'Component', parentId: null, description: '', root: null, role: null,
  codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {}, ...over,
} as Node);
const conn = (over: Record<string, unknown>): Connection => ({
  id: 'e', from: 'a', to: 'b', type: 'Dependency', verb: 'uses', object: '', description: '',
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

  it('flags an unknown connection kind', () => {
    const m = model({
      nodes: [node({ id: 'a', type: 'System' }), node({ id: 'b', type: 'System' })],
      connections: [conn({ from: 'a', to: 'b', type: 'Bogus' })],
    });
    expect(validateModel(m, c4Backend).map((i) => i.kind)).toContain('unknown-connection-kind');
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
    const m = model({
      nodes: [node({ id: 'a', type: 'System' }), node({ id: 'b', type: 'System' })],
      connections: [conn({ from: 'a', to: 'b', fields: { transport: 'Telepathy' } })],
    });
    expect(validateModel(m, c4Backend).map((i) => i.kind)).toContain('bad-enum-value');
  });

  it('accepts a valid model with fields', () => {
    const m = model({
      nodes: [
        node({ id: 's', type: 'System' }),
        node({ id: 'co', type: 'Container', parentId: 's', fields: { technology: 'Hono', responsibilities: ['serve'] } }),
      ],
      connections: [],
    });
    expect(validateModel(m, c4Backend)).toEqual([]);
  });
});

describe('Code layer containment', () => {
  const base = { description: '', root: null, role: null, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {} };
  function withParent(parentType: string) {
    const m = emptyModel();
    m.nodes.push(
      { id: 'sys', name: 'S', type: 'System', parentId: null, ...base },
      { id: 'ct', name: 'C', type: 'Container', parentId: 'sys', ...base },
      { id: 'cmp', name: 'Cmp', type: 'Component', parentId: 'ct', ...base },
    );
    const parentId = parentType === 'System' ? 'sys' : parentType === 'Container' ? 'ct' : 'cmp';
    m.nodes.push({ id: 'code', name: 'Svc', type: 'Class', parentId, ...base });
    return m;
  }

  it('allows a Class under a Component', () => {
    expect(validateModel(withParent('Component'), c4Backend)).toEqual([]);
  });

  it('rejects a Class under a Container', () => {
    const issues = validateModel(withParent('Container'), c4Backend);
    expect(issues).toEqual([expect.objectContaining({ kind: 'bad-parent', ref: 'code' })]);
  });
});

import { isDirectoryRef } from '../src/ref';

describe('ref anchoring', () => {
  const base = { codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {}, root: null, role: null };

  function anchoredModel(): HyphaeModel {
    const m = emptyModel();
    m.nodes.push(
      { id: 'sys', name: 'Sys', type: 'System', parentId: null, description: 'd', ...base, root: 'endpoints/' },
      { id: 'mg', name: 'MG', type: 'Container', parentId: 'sys', description: 'd', ...base, root: 'media_gateway/' },
      { id: 'comp', name: 'C', type: 'Component', parentId: 'mg', description: 'd', ...base, codeRefs: ['src/main.ts'] },
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

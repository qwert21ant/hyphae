import { describe, it, expect } from 'vitest';
import { validateModel } from '../src/validate';
import { c4Backend } from '../src/profiles/c4-backend';
import { emptyModel, type HyphaeModel } from '../src/model';
import type { Node } from '../src/node';
import type { Connection } from '../src/connection';

const node = (over: Record<string, unknown>): Node => ({
  id: 'x', name: 'X', type: 'Component', parentId: null, description: '', root: null,
  codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {}, ...over,
} as Node);
const conn = (over: Record<string, unknown>): Connection => ({
  id: 'e', from: 'a', to: 'b', type: 'Dependency', description: '',
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
  const base = { description: '', root: null, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {} };
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

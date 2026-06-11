import { describe, it, expect } from 'vitest';
import { validateModel } from './validate';
import { emptyModel } from './model';
import { c4Backend } from './profiles/c4-backend';
import type { Node } from './node';

const node = (over: Partial<Node>): Node => ({
  id: 'x', name: 'X', type: 'Component', description: '', responsibilities: [],
  invariants: [], assumptions: [], failureModes: [], tags: [], status: 'Active',
  parentId: null, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', ...over,
});

describe('validateModel', () => {
  it('passes for an empty model', () => {
    expect(validateModel(emptyModel(), c4Backend)).toEqual([]);
  });

  it('flags unknown node type', () => {
    const m = emptyModel();
    m.nodes.push(node({ id: 'a', type: 'Bogus' }));
    expect(validateModel(m, c4Backend)).toContainEqual(
      expect.objectContaining({ kind: 'unknown-type', ref: 'a' }),
    );
  });

  it('flags parentId that violates containment', () => {
    const m = emptyModel();
    m.nodes.push(node({ id: 'comp', type: 'Component', parentId: 'sys' }));
    m.nodes.push(node({ id: 'sys', type: 'System' }));
    expect(validateModel(m, c4Backend)).toContainEqual(
      expect.objectContaining({ kind: 'bad-parent', ref: 'comp' }),
    );
  });

  it('flags connection endpoint that does not exist', () => {
    const m = emptyModel();
    m.nodes.push(node({ id: 'a', type: 'Component' }));
    m.connections.push({
      id: 'c1', from: 'a', to: 'ghost', relationCategory: 'Dependency',
      transport: 'None', description: '', direction: 'Unidirectional',
      realizes: [], codeRefs: [],
    });
    expect(validateModel(m, c4Backend)).toContainEqual(
      expect.objectContaining({ kind: 'dangling-endpoint', ref: 'c1' }),
    );
  });
});

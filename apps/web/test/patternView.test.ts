import { describe, it, expect } from 'vitest';
import { c4Backend, type Pattern } from '@hyphae/schema';
import { patternViewToFlow } from '../src/patternView';

const nodes = [
  { id: 'comp', name: 'Ingest', type: 'Component', parentId: null, root: null, role: null, description: '', codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {} },
] as never[];

const pattern = (over: Partial<Pattern>): Pattern => ({
  id: 'p', name: 'P', kind: 'pipeline', description: '', anchor: null, members: [], transitions: [], ...over,
});

describe('patternViewToFlow', () => {
  it('pipeline: members become boxes in array order with sequential edges', () => {
    const p = pattern({ kind: 'pipeline', members: [
      { name: 'Decode', ref: 'd.ts', description: '' },
      { name: 'Persist', nodeId: 'comp', description: '' },
    ] });
    const { nodes: fn, edges } = patternViewToFlow(p, c4Backend, nodes);
    expect(fn.map((n) => n.id)).toEqual(['Decode', 'Persist']);
    // ordered left->right
    expect(fn[0].position.x).toBeLessThan(fn[1].position.x);
    // one sequential edge Decode -> Persist
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ source: 'Decode', target: 'Persist' });
  });

  it('resolves a nodeId member to the node name and marks bindings', () => {
    const p = pattern({ members: [
      { name: 'Persist', nodeId: 'comp', description: '' },
      { name: 'Decode', ref: 'd.ts', description: '' },
      { name: 'Idle', description: '' },
    ] });
    const { nodes: fn } = patternViewToFlow(p, c4Backend, nodes);
    const byId = Object.fromEntries(fn.map((n) => [n.id, n.data as { binding: string; detail: string }]));
    expect(byId['Persist']).toMatchObject({ binding: 'node', detail: 'Ingest' });
    expect(byId['Decode']).toMatchObject({ binding: 'ref', detail: 'd.ts' });
    expect(byId['Idle']).toMatchObject({ binding: 'none', detail: '' });
  });

  it('state-machine: one edge per transition, labeled by trigger', () => {
    const p = pattern({ kind: 'state-machine',
      members: [{ name: 'Idle', description: '' }, { name: 'Recording', description: '' }],
      transitions: [{ from: 'Idle', to: 'Recording', trigger: 'start', description: '' }] });
    const { nodes: fn, edges } = patternViewToFlow(p, c4Backend, nodes);
    expect(fn.map((n) => n.id).sort()).toEqual(['Idle', 'Recording']);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ source: 'Idle', target: 'Recording', label: 'start' });
  });

  it('an unrendered kind (layered) stacks members with no edges', () => {
    const p = pattern({ kind: 'layered', members: [{ name: 'UI', description: '' }, { name: 'Data', description: '' }] });
    const { nodes: fn, edges } = patternViewToFlow(p, c4Backend, nodes);
    expect(fn).toHaveLength(2);
    expect(edges).toEqual([]);
    // stacked vertically
    expect(fn[0].position.y).toBeLessThan(fn[1].position.y);
  });
});

import { describe, it, expect } from 'vitest';
import { focusViewToFlow, highlightSets } from '../src/flow';
import type { FocusView } from '../src/focusView';
import type { Edge as FlowEdge } from '@xyflow/react';

const node = (id: string, type = 'Component') =>
  ({ id, name: id, type, parentId: null, description: '', codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {} }) as any;

const view: FocusView = {
  focusId: 'ca',
  focusNode: node('ca', 'Container'),
  children: [node('a1'), node('a2')],
  externals: [node('cb', 'Container')],
  edges: [
    { id: 'i', from: 'a1', to: 'a2', kind: 'Dependency', count: 1, derived: false },
    { id: 'ext:a1->cb', from: 'a1', to: 'cb', kind: null, count: 3, derived: true },
  ],
};
const pos = { a1: { x: 0, y: 0 }, a2: { x: 0, y: 100 }, cb: { x: 300, y: 50 } };

describe('focusViewToFlow', () => {
  it('renders the focus as a region, children as nodes, externals as ghosts', () => {
    const { nodes } = focusViewToFlow(view, pos);
    expect(nodes.find((n) => n.id === 'ca')?.type).toBe('region');
    expect(nodes.find((n) => n.id === 'a1')?.type).toBe('node');
    expect(nodes.find((n) => n.id === 'cb')?.type).toBe('ghost');
    // region paints before its children and wraps up-and-left of them
    expect(nodes.findIndex((n) => n.id === 'ca')).toBeLessThan(nodes.findIndex((n) => n.id === 'a1'));
    const region = nodes.find((n) => n.id === 'ca')!;
    expect(region.position.x).toBeLessThan(pos.a1.x);
    expect(region.draggable).toBe(false);
  });

  it('renders a real edge with its kind label and a derived edge with a count label', () => {
    const { edges } = focusViewToFlow(view, pos);
    const real = edges.find((e) => e.id === 'i')!;
    expect(real.label).toBe('Dependency');
    expect((real.data as { derived?: boolean } | undefined)?.derived).toBeFalsy();
    const derived = edges.find((e) => e.id === 'ext:a1->cb')!;
    expect(derived.label).toBe('3');
    expect((derived.data as { derived?: boolean }).derived).toBe(true);
    expect(derived.style?.strokeDasharray).toBeTruthy();
    expect(derived.selectable).toBe(false);
  });

  it('omits the region at the root view (no focus node)', () => {
    const root: FocusView = { focusId: null, focusNode: null, children: [node('sys', 'System')], externals: [], edges: [] };
    const { nodes } = focusViewToFlow(root, { sys: { x: 0, y: 0 } });
    expect(nodes.every((n) => n.type !== 'region')).toBe(true);
  });
});

describe('highlightSets', () => {
  const edges: FlowEdge[] = [
    { id: 'e1', source: 'a', target: 'b' },
    { id: 'e2', source: 'b', target: 'c' },
  ];
  it('highlights a node, its edges, and neighbors', () => {
    const h = highlightSets('a', edges);
    expect([...h.nodes].sort()).toEqual(['a', 'b']);
    expect([...h.edges]).toEqual(['e1']);
  });
  it('highlights a region via its children', () => {
    const h = highlightSets('ca', edges, new Set(['a', 'b']));
    expect([...h.nodes].sort()).toEqual(['a', 'b', 'ca']);
    expect([...h.edges].sort()).toEqual(['e1', 'e2']);
  });
});

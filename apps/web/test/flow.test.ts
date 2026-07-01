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
    { id: 'i', from: 'a1', to: 'a2', kind: 'Dependency', count: 1, derived: false, realizedBy: ['i'] },
    { id: 'ext:a1->cb', from: 'a1', to: 'cb', kind: null, count: 3, derived: true, realizedBy: ['e1', 'e2', 'e3'] },
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
    expect(derived.selectable).toBe(true);
    expect(derived.deletable).toBe(false);
    expect((derived.data as { realizedBy: string[] }).realizedBy).toEqual(['e1', 'e2', 'e3']);
  });

  it('adds a target arrow to every edge and a source arrow only for bidirectional', () => {
    const v: FocusView = {
      focusId: 'ca', focusNode: node('ca', 'Container'),
      children: [node('a1'), node('a2'), node('a3')], externals: [],
      edges: [
        { id: 'u', from: 'a1', to: 'a2', kind: 'Dependency', count: 1, derived: false, realizedBy: ['u'], direction: 'Unidirectional' },
        { id: 'b', from: 'a1', to: 'a3', kind: 'Dependency', count: 1, derived: false, realizedBy: ['b'], direction: 'Bidirectional' },
      ],
    };
    const { edges } = focusViewToFlow(v, { a1: { x: 0, y: 0 }, a2: { x: 0, y: 100 }, a3: { x: 0, y: 200 } });
    const u = edges.find((e) => e.id === 'u')!;
    const b = edges.find((e) => e.id === 'b')!;
    expect(u.markerEnd).toBeTruthy();
    expect(u.markerStart).toBeFalsy();
    expect(b.markerEnd).toBeTruthy();
    expect(b.markerStart).toBeTruthy();
  });

  it('gives derived (rollup) edges a target arrow too', () => {
    const { edges } = focusViewToFlow(view, pos);
    expect(edges.find((e) => e.id === 'ext:a1->cb')!.markerEnd).toBeTruthy();
  });

  it('renders no arrowheads for an undirected (direction "None") edge', () => {
    const v: FocusView = {
      focusId: 'ca', focusNode: node('ca', 'Container'),
      children: [node('a1'), node('a2')], externals: [],
      edges: [{ id: 'agg:a1->a2', from: 'a1', to: 'a2', kind: null, count: 2, derived: true, realizedBy: ['x', 'y'], direction: 'None' }],
    };
    const { edges } = focusViewToFlow(v, { a1: { x: 0, y: 0 }, a2: { x: 0, y: 100 } });
    const edge = edges[0];
    expect(edge.markerEnd).toBeFalsy();
    expect(edge.markerStart).toBeFalsy();
  });

  it('omits the region at the root view (no focus node)', () => {
    const root: FocusView = { focusId: null, focusNode: null, children: [node('sys', 'System')], externals: [], edges: [] };
    const { nodes } = focusViewToFlow(root, { sys: { x: 0, y: 0 } });
    expect(nodes.every((n) => n.type !== 'region')).toBe(true);
  });

  it('renders focus node as plain node (not region) when it has no children, anchoring external edges', () => {
    const childless: FocusView = {
      focusId: 'ext',
      focusNode: node('ext', 'ExternalSystem'),
      children: [],
      externals: [node('cb', 'Container')],
      edges: [{ id: 'ext:ext->cb', from: 'ext', to: 'cb', kind: null, count: 1, derived: true, realizedBy: ['z'] }],
    };
    const childlessPos = { ext: { x: 0, y: 0 }, cb: { x: 300, y: 50 } };
    const { nodes, edges } = focusViewToFlow(childless, childlessPos);

    // Focus node must be rendered as a plain 'node', not a 'region'
    const focusNode = nodes.find((n) => n.id === 'ext');
    expect(focusNode).toBeDefined();
    expect(focusNode?.type).toBe('node');

    // External neighbor rendered as ghost
    expect(nodes.find((n) => n.id === 'cb')?.type).toBe('ghost');

    // No dangling edges: both endpoints exist in the rendered nodes
    const nodeIds = new Set(nodes.map((n) => n.id));
    for (const e of edges) {
      expect(nodeIds.has(e.source)).toBe(true);
      expect(nodeIds.has(e.target)).toBe(true);
    }
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

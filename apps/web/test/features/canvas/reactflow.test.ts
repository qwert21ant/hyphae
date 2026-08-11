import { describe, it, expect } from 'vitest';
import { focusViewToFlow, highlightSets, GROUP_GRIP } from '@/features/canvas/reactflow';
import { layerColorOf, LAYER_COLOR } from '@/core/verbColors';
import type { FocusView } from '@/core/focusView';
import type { Edge as FlowEdge } from '@xyflow/react';

const node = (id: string, type = 'Component') =>
  ({ id, name: id, type, parentId: null, description: '', codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {} }) as any;

const view: FocusView = {
  focusId: 'ca',
  focusNode: node('ca', 'Container'),
  children: [node('a1'), node('a2')],
  externals: [node('cb', 'Container')],
  edges: [
    { id: 'i', from: 'a1', to: 'a2', count: 1, derived: false, realizedBy: ['i'], label: 'reads settings' },
    { id: 'ext:a1->cb', from: 'a1', to: 'cb', count: 3, derived: true, realizedBy: ['e1', 'e2', 'e3'] },
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
    // The region is draggable, but only by its title bar: it spans the whole cluster and is
    // pointer-transparent, so a whole-surface drag target would swallow every click meant for the
    // nodes and edges inside it.
    expect(region.draggable).toBeUndefined();
    expect(region.dragHandle).toBe(`.${GROUP_GRIP}`);
  });

  it('renders a real edge with its own label and a derived edge with a count label', () => {
    const { edges } = focusViewToFlow(view, pos);
    const real = edges.find((e) => e.id === 'i')!;
    expect(real.label).toBe('reads settings');
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
        { id: 'u', from: 'a1', to: 'a2', count: 1, derived: false, realizedBy: ['u'], direction: 'Unidirectional' },
        { id: 'b', from: 'a1', to: 'a3', count: 1, derived: false, realizedBy: ['b'], direction: 'Bidirectional' },
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
      edges: [{ id: 'agg:a1->a2', from: 'a1', to: 'a2', count: 2, derived: true, realizedBy: ['x', 'y'], direction: 'None' }],
    };
    const { edges } = focusViewToFlow(v, { a1: { x: 0, y: 0 }, a2: { x: 0, y: 100 } });
    const edge = edges[0];
    expect(edge.markerEnd).toBeFalsy();
    expect(edge.markerStart).toBeFalsy();
  });

  // Separating two edges that share a node pair is routeEdges' job now — it gives them different
  // ports — so focusViewToFlow no longer tags them with a fan index. Covered by
  // routeEdges.test.ts, "gives two edges into the same side of a node different ports".
  it('keeps derived-edge data intact', () => {
    const { edges } = focusViewToFlow(view, pos);
    const derived = edges.find((e) => e.id === 'ext:a1->cb')!;
    expect(derived.data).toMatchObject({ derived: true, count: 3 });
  });

  it('omits the region at the root view (no focus node)', () => {
    const root: FocusView = { focusId: null, focusNode: null, children: [node('sys', 'System')], externals: [], edges: [] };
    const { nodes } = focusViewToFlow(root, { sys: { x: 0, y: 0 } });
    expect(nodes.every((n) => n.type !== 'region')).toBe(true);
  });

  it('renders an expanded external as a ghostGroup box wrapping its member ghosts', () => {
    const v: FocusView = {
      focusId: 'ca', focusNode: node('ca', 'Container'),
      children: [node('a1')],
      externals: [node('b1'), node('solo', 'Container')],
      edges: [
        { id: 'g1', from: 'a1', to: 'b1', count: 1, derived: true, realizedBy: ['x1'] },
        { id: 's', from: 'a1', to: 'solo', count: 1, derived: true, realizedBy: ['x2'] },
      ],
      externalGroups: [{ id: 'cb', name: 'Beta', childIds: ['b1'] }],
      expandableExternalIds: new Set(['solo']),
    };
    const pos = { a1: { x: 0, y: 0 }, b1: { x: 300, y: 40 }, solo: { x: 300, y: 200 } };
    const { nodes } = focusViewToFlow(v, pos);
    const group = nodes.find((n) => n.id === 'cb');
    expect(group?.type).toBe('ghostGroup');                        // group box emitted
    expect(nodes.find((n) => n.id === 'b1')?.type).toBe('ghost');  // member is a ghost
    // group box paints before its member
    expect(nodes.findIndex((n) => n.id === 'cb')).toBeLessThan(nodes.findIndex((n) => n.id === 'b1'));
    // group box wraps up-and-left of the member
    expect(group!.position.x).toBeLessThan(pos.b1.x);
    // the collapsed 'solo' ghost is flagged expandable, the member 'b1' is not
    expect((nodes.find((n) => n.id === 'solo')!.data as { expandable?: boolean }).expandable).toBe(true);
    expect((nodes.find((n) => n.id === 'b1')!.data as { expandable?: boolean }).expandable).toBeFalsy();
  });

  // React Flow paints the edge layer BEFORE the node layer (GraphView renders EdgeRenderer ahead of
  // NodeRenderer inside the viewport), and both default to z-index 0 — so at an equal z every node
  // covers every edge. A boundary box is a full-size OPAQUE fill over the whole cluster, so at z 0 it
  // hid every edge drawn inside it. Both boundary boxes must sit below the edge layer's own z of 0,
  // and the boxes drawn INSIDE them must not.
  it('paints the boundary boxes below the edge layer, so the edges inside them stay visible', () => {
    const v: FocusView = {
      focusId: 'ca', focusNode: node('ca', 'Container'),
      children: [node('a1')],
      externals: [node('b1')],
      edges: [{ id: 'g1', from: 'a1', to: 'b1', count: 1, derived: true, realizedBy: ['x1'] }],
      externalGroups: [{ id: 'cb', name: 'Beta', childIds: ['b1'] }],
    };
    const { nodes } = focusViewToFlow(v, { a1: { x: 0, y: 0 }, b1: { x: 300, y: 40 } });
    expect(nodes.find((n) => n.id === 'ca')!.zIndex).toBeLessThan(0);
    expect(nodes.find((n) => n.id === 'cb')!.zIndex).toBeLessThan(0);
    for (const box of nodes.filter((n) => n.type === 'node' || n.type === 'ghost')) {
      expect(box.zIndex ?? 0, `${box.id} must stay above the edge layer`).toBeGreaterThanOrEqual(0);
    }
  });

  it('renders focus node as plain node (not region) when it has no children, anchoring external edges', () => {
    const childless: FocusView = {
      focusId: 'ext',
      focusNode: node('ext', 'ExternalSystem'),
      children: [],
      externals: [node('cb', 'Container')],
      edges: [{ id: 'ext:ext->cb', from: 'ext', to: 'cb', count: 1, derived: true, realizedBy: ['z'] }],
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

describe('layerColorOf', () => {
  it('maps a node type to its C4 layer colour', () => {
    expect(layerColorOf('Component')).toEqual(LAYER_COLOR.Component);
    expect(layerColorOf('Container')).toEqual(LAYER_COLOR.Container);
    expect(layerColorOf('System')).toEqual(LAYER_COLOR.Context);
  });
  it('falls back to a neutral colour for an unknown type', () => {
    // A type outside the profile's layers gets the mid step rather than a bare white box.
    expect(layerColorOf('Nonsense')).toEqual({ bg: 'var(--alt-2-bg)', border: 'var(--alt-2-bd)' });
  });
  it('tints child nodes by layer in the flow output', () => {
    const { nodes } = focusViewToFlow(view, pos);
    expect((nodes.find((n) => n.id === 'a1')!.data as { color?: unknown }).color).toEqual(LAYER_COLOR.Component);
  });
  it('tints external (ghost) nodes by their own layer too', () => {
    const { nodes } = focusViewToFlow(view, pos); // cb is an external Container
    const ghost = nodes.find((n) => n.id === 'cb')!;
    expect(ghost.type).toBe('ghost');
    expect((ghost.data as { color?: unknown }).color).toEqual(LAYER_COLOR.Container);
  });

  it('gives every node dimension hints so the minimap can size its rects', () => {
    // The MiniMap renders nothing for nodes without dimensions; we never feed measured sizes back,
    // so the nodes must carry initialWidth/initialHeight.
    const { nodes } = focusViewToFlow(view, pos);
    for (const n of nodes) {
      expect(n.initialWidth).toBeGreaterThan(0);
      expect(n.initialHeight).toBeGreaterThan(0);
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

it('draws every authored edge in the one neutral line colour, never the derived violet', () => {
  const { edges } = focusViewToFlow(view, pos);
  const real = edges.find((e) => e.id === 'i')!;
  expect(real.style?.stroke).toBe('var(--edge-line)');
  // Violet means "derived rollup edge" and nothing else; one colour, one meaning.
  expect(real.style?.stroke).not.toBe('var(--edge-derived)');
});

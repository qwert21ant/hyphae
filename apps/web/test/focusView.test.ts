import { describe, it, expect } from 'vitest';
import { buildFocusView, breadcrumbPath, representative, subtreeConnections } from '../src/focusView';
import { emptyModel } from '@hyphae/schema';

const base = { description: '', codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {} };
const e = { description: '', direction: 'Unidirectional' as const, realizedBy: [], codeRefs: [], fields: {} };

/** sys › (ca, cb containers); ca has comps a1,a2; cb has comp b1; a1 has Code k1; ext is external. */
function model() {
  const m = emptyModel();
  m.nodes.push(
    { id: 'sys', name: 'Sys', type: 'System', parentId: null, ...base },
    { id: 'ca', name: 'Alpha', type: 'Container', parentId: 'sys', ...base },
    { id: 'cb', name: 'Beta', type: 'Container', parentId: 'sys', ...base },
    { id: 'a1', name: 'A1', type: 'Component', parentId: 'ca', ...base },
    { id: 'a2', name: 'A2', type: 'Component', parentId: 'ca', ...base },
    { id: 'b1', name: 'B1', type: 'Component', parentId: 'cb', ...base },
    { id: 'k1', name: 'K1', type: 'Class', parentId: 'a1', ...base },
    { id: 'ext', name: 'Ext', type: 'ExternalSystem', parentId: null, ...base },
  );
  return m;
}

describe('buildFocusView', () => {
  it('root view shows top-level nodes', () => {
    const v = buildFocusView(model(), null);
    expect(v.focusNode).toBeNull();
    expect(v.children.map((n) => n.id).sort()).toEqual(['ext', 'sys']);
    expect(v.externals).toHaveLength(0);
  });

  it('focused view shows the focus node + its direct children only', () => {
    const v = buildFocusView(model(), 'ca');
    expect(v.focusNode?.id).toBe('ca');
    expect(v.children.map((n) => n.id).sort()).toEqual(['a1', 'a2']);
  });

  it('keeps an inner edge between two children as a real edge', () => {
    const m = model();
    m.connections.push({ id: 'i', from: 'a1', to: 'a2', type: 'Dependency', ...e });
    const v = buildFocusView(m, 'ca');
    const inner = v.edges.find((x) => x.id === 'i');
    expect(inner).toMatchObject({ from: 'a1', to: 'a2', kind: 'Dependency', derived: false, count: 1 });
  });

  it('aggregates external endpoints to a peer-level box and collapses edges with a count', () => {
    const m = model();
    // two components inside cb both depended on by a1 (focus ca): collapse cb-side to one box "cb"
    m.connections.push(
      { id: 'x1', from: 'a1', to: 'b1', type: 'Dependency', ...e },
      { id: 'x2', from: 'a2', to: 'b1', type: 'Dependency', ...e },
    );
    const v = buildFocusView(m, 'ca');
    // external box is cb (the Container peer of focus ca), not b1
    expect(v.externals.map((n) => n.id)).toEqual(['cb']);
    const a1cb = v.edges.find((x) => x.from === 'a1' && x.to === 'cb');
    const a2cb = v.edges.find((x) => x.from === 'a2' && x.to === 'cb');
    expect(a1cb).toMatchObject({ kind: null, derived: true, count: 1 });
    expect(a2cb).toMatchObject({ derived: true, count: 1 });
  });

  it('shows a higher-layer neighbor (external system) as itself', () => {
    const m = model();
    m.connections.push({ id: 'x', from: 'a1', to: 'ext', type: 'Dependency', ...e });
    const v = buildFocusView(m, 'ca');
    expect(v.externals.map((n) => n.id)).toEqual(['ext']);
    expect(v.edges.find((x) => x.to === 'ext')).toMatchObject({ from: 'a1', to: 'ext' });
  });

  it('renders a single direct connection to an external node as a real (solid) edge', () => {
    // a1 (a shown child) → ext (a shown external box) is one authored connection between two nodes
    // visible in this view — it must be a real edge, not a dashed rollup.
    const m = model();
    m.connections.push({ id: 'x', from: 'a1', to: 'ext', type: 'Dependency', ...e });
    const v = buildFocusView(m, 'ca');
    const edge = v.edges.find((x) => x.to === 'ext')!;
    expect(edge).toMatchObject({ id: 'x', from: 'a1', to: 'ext', kind: 'Dependency', derived: false, count: 1 });
  });

  it('rolls cross-subtree edges up to root↔root at the root view', () => {
    const m = model();
    m.connections.push({ id: 'x', from: 'a1', to: 'ext', type: 'Dependency', ...e });
    const v = buildFocusView(m, null);
    // a1 lives under sys → maps to sys; ext is a root → sys→ext edge
    const edge = v.edges.find((x) => x.from === 'sys' && x.to === 'ext');
    expect(edge).toMatchObject({ derived: true });
  });

  it('drops dangling connections', () => {
    const m = model();
    m.connections.push({ id: 'd', from: 'a1', to: 'nope', type: 'Dependency', ...e });
    const v = buildFocusView(m, 'ca');
    expect(v.edges.find((x) => x.id === 'd')).toBeUndefined();
  });

  it('honors the connection filter', () => {
    const m = model();
    m.connections.push(
      { id: 'i1', from: 'a1', to: 'a2', type: 'Dependency', ...e },
      { id: 'i2', from: 'a2', to: 'a1', type: 'DataFlow', ...e },
    );
    const v = buildFocusView(m, 'ca', { kinds: ['Dependency'], fields: {} });
    expect(v.edges.map((x) => x.id)).toEqual(['i1']);
  });
});

describe('buildFocusView — rolling connections up to the children level', () => {
  it('rolls a connection authored below the children up to the shown children (System focus)', () => {
    // a1 (in ca) → b1 (in cb): Component-level connection under a focused System whose children
    // are Containers. It must surface as a ca → cb edge, not collapse onto the System.
    const m = model();
    m.connections.push({ id: 'x', from: 'a1', to: 'b1', type: 'Dependency', ...e });
    const v = buildFocusView(m, 'sys');
    expect(v.edges).toHaveLength(1);
    expect(v.edges[0]).toMatchObject({ from: 'ca', to: 'cb', derived: true, count: 1 });
  });

  it('rolls a connection several levels below the children up to the children (System focus)', () => {
    // k1 (Class under a1 under ca) → b1 (Component in cb) still rolls up to ca → cb.
    const m = model();
    m.connections.push({ id: 'x', from: 'k1', to: 'b1', type: 'Dependency', ...e });
    const v = buildFocusView(m, 'sys');
    expect(v.edges).toHaveLength(1);
    expect(v.edges[0]).toMatchObject({ from: 'ca', to: 'cb', derived: true, count: 1 });
  });

  it('merges an authored edge and its lower-level realizations into one counted edge', () => {
    // An authored Container→Container edge plus a Component→Component edge that realizes it must
    // collapse to a single ca → cb edge (count 2), not two parallel edges.
    const m = model();
    m.connections.push(
      { id: 'authored', from: 'ca', to: 'cb', type: 'Dependency', ...e },
      { id: 'realize', from: 'a1', to: 'b1', type: 'Dependency', ...e },
    );
    const v = buildFocusView(m, 'sys');
    const caCb = v.edges.filter((x) => x.from === 'ca' && x.to === 'cb');
    expect(caCb).toHaveLength(1);
    expect(caCb[0]).toMatchObject({ derived: true, count: 2 });
  });

  it('does not double-count realizedBy children: a direct edge with realized children stays one real edge', () => {
    // Parent a1→a2 (Component level, both shown children) is realized by child k1→k2 (Class level),
    // which rolls up to the same a1→a2 pair. The child must not inflate the pair to a [d2] rollup —
    // it is represented by its parent (reachable via the parent's realizedBy in the panel).
    const m = emptyModel();
    m.nodes.push(
      { id: 'ca', name: 'Alpha', type: 'Container', parentId: null, ...base },
      { id: 'a1', name: 'A1', type: 'Component', parentId: 'ca', ...base },
      { id: 'a2', name: 'A2', type: 'Component', parentId: 'ca', ...base },
      { id: 'k1', name: 'K1', type: 'Class', parentId: 'a1', ...base },
      { id: 'k2', name: 'K2', type: 'Class', parentId: 'a2', ...base },
    );
    m.connections.push(
      { id: 'parent', from: 'a1', to: 'a2', type: 'Dependency', ...e, realizedBy: ['child'] },
      { id: 'child', from: 'k1', to: 'k2', type: 'DataFlow', ...e },
    );
    const v = buildFocusView(m, 'ca');
    const a1a2 = v.edges.filter((x) => x.from === 'a1' && x.to === 'a2');
    expect(a1a2).toHaveLength(1);
    expect(a1a2[0]).toMatchObject({ id: 'parent', kind: 'Dependency', derived: false, count: 1 });
  });

  it('at a Component focus shows code-child↔external edges, not the rolled-up group-node edge', () => {
    // Parent y→x (Component level) is realized by m1→k1 (Class level), where k1 is a code child of the
    // focus x. Focusing x, the child must surface as an edge to the code child (y → k1), and the
    // coarse parent must NOT also appear as a group-node edge (y → x). A connection authored directly
    // on the focus (x → ext, no realizedBy) is preserved as a group-node edge.
    const m = emptyModel();
    m.nodes.push(
      { id: 'cont', name: 'Cont', type: 'Container', parentId: null, ...base },
      { id: 'x', name: 'X', type: 'Component', parentId: 'cont', ...base },
      { id: 'k1', name: 'K1', type: 'Class', parentId: 'x', ...base },
      { id: 'y', name: 'Y', type: 'Component', parentId: 'cont', ...base },
      { id: 'm1', name: 'M1', type: 'Class', parentId: 'y', ...base },
      { id: 'ext', name: 'Ext', type: 'ExternalSystem', parentId: null, ...base },
    );
    m.connections.push(
      { id: 'pc', from: 'y', to: 'x', type: 'Dependency', ...e, realizedBy: ['cc'] },
      { id: 'cc', from: 'm1', to: 'k1', type: 'Dependency', ...e },
      { id: 'q', from: 'x', to: 'ext', type: 'DataFlow', ...e },
    );
    const v = buildFocusView(m, 'x');
    expect(v.edges.find((edge) => edge.from === 'y' && edge.to === 'k1')).toBeTruthy(); // child-anchored
    expect(v.edges.find((edge) => edge.to === 'x')).toBeUndefined();                     // no group-node rollup edge
    expect(v.edges.find((edge) => edge.from === 'x' && edge.to === 'ext')).toMatchObject({ kind: 'DataFlow', derived: false });
    expect(v.externals.map((n) => n.id).sort()).toEqual(['ext', 'y']);
  });

  it('a real edge carries realizedBy with its single connection id', () => {
    const m = model();
    m.connections.push({ id: 'r', from: 'a1', to: 'a2', type: 'Dependency', ...e });
    const v = buildFocusView(m, 'ca');
    const edge = v.edges.find((x) => x.id === 'r')!;
    expect(edge.derived).toBe(false);
    expect(edge.realizedBy).toEqual(['r']);
    expect(edge.count).toBe(edge.realizedBy.length);
  });

  it('a derived edge carries realizedBy with every aggregated connection id', () => {
    const m = model();
    m.connections.push(
      { id: 'authored', from: 'ca', to: 'cb', type: 'Dependency', ...e },
      { id: 'realize', from: 'a1', to: 'b1', type: 'Dependency', ...e },
    );
    const v = buildFocusView(m, 'sys');
    const caCb = v.edges.find((x) => x.from === 'ca' && x.to === 'cb')!;
    expect(caCb.derived).toBe(true);
    expect([...caCb.realizedBy].sort()).toEqual(['authored', 'realize']);
    expect(caCb.count).toBe(caCb.realizedBy.length);
  });
});

describe('representative', () => {
  it('returns the endpoint itself when it is already on the focus layer', () => {
    expect(representative(model(), 'cb', 'Container')).toBe('cb');
  });

  it('returns the endpoint itself when it is above the focus layer', () => {
    expect(representative(model(), 'ext', 'Component')).toBe('ext'); // ExternalSystem is Context
    expect(representative(model(), 'sys', 'Component')).toBe('sys'); // System is Context
  });

  it('climbs to the ancestor on the focus layer when the endpoint is below it', () => {
    expect(representative(model(), 'k1', 'Container')).toBe('ca'); // k1 (Class) under a1 under ca
    expect(representative(model(), 'k1', 'Component')).toBe('a1'); // k1 (Class) under a1
  });
});

describe('subtreeConnections', () => {
  it('returns connections touching the node or any descendant', () => {
    const m = model(); // sys › ca › (a1, a2); a1 › k1; cb › b1; ext
    m.connections.push(
      { id: 'c1', from: 'a1', to: 'b1', type: 'Dependency', ...e },  // a1 is in ca's subtree
      { id: 'c2', from: 'k1', to: 'ext', type: 'Dependency', ...e },  // k1 (under a1) is in ca's subtree
      { id: 'c3', from: 'b1', to: 'ext', type: 'Dependency', ...e },  // neither endpoint under ca
    );
    expect(subtreeConnections(m, 'ca').map((c) => c.id).sort()).toEqual(['c1', 'c2']);
  });
});

describe('breadcrumbPath', () => {
  it('builds Root + ancestor chain', () => {
    expect(breadcrumbPath(model(), 'a1').map((c) => c.id)).toEqual([null, 'sys', 'ca', 'a1']);
    expect(breadcrumbPath(model(), null).map((c) => c.id)).toEqual([null]);
  });
});

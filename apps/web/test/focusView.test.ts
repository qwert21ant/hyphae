import { describe, it, expect } from 'vitest';
import { buildFocusView, breadcrumbPath, representative, externalConnections, partitionConnections } from '../src/focusView';
import { emptyModel } from '@hyphae/schema';

const base = { description: '', root: null, role: null, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {} };
const e = { verb: 'uses', object: '', description: '', direction: 'Unidirectional' as const, realizedBy: [], codeRefs: [], fields: {} };

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

  it('merges opposite-direction rollups between the same pair into one undirected edge', () => {
    // k1 (Class under a1) ↔ b1 (Component under cb) in both directions: both roll up to a1↔cb.
    // They must collapse to a single edge (count 2) with no direction, not two overlapping arrows.
    const m = model();
    m.connections.push(
      { id: 'f', from: 'k1', to: 'b1', type: 'Dependency', ...e },
      { id: 'b', from: 'b1', to: 'k1', type: 'Dependency', ...e },
    );
    const v = buildFocusView(m, 'ca');
    const between = v.edges.filter(
      (x) => (x.from === 'a1' && x.to === 'cb') || (x.from === 'cb' && x.to === 'a1'),
    );
    expect(between).toHaveLength(1);
    expect(between[0]).toMatchObject({ derived: true, count: 2, direction: 'None' });
    expect([...between[0].realizedBy].sort()).toEqual(['b', 'f']);
  });

  it('keeps the arrow direction when all rollups between a pair point the same way', () => {
    const m = model();
    m.connections.push(
      { id: 'f1', from: 'k1', to: 'b1', type: 'Dependency', ...e },
      { id: 'f2', from: 'a1', to: 'b1', type: 'Dependency', ...e },
    );
    const v = buildFocusView(m, 'ca');
    const edge = v.edges.find((x) => x.from === 'a1' && x.to === 'cb')!;
    expect(edge).toMatchObject({ derived: true, count: 2, direction: 'Unidirectional' });
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

describe('buildFocusView — stakeholder audience', () => {
  it('hides Code-layer children at a Component focus', () => {
    const full = buildFocusView(model(), 'a1', undefined, 'full');
    expect(full.children.map((n) => n.id)).toEqual(['k1']);           // Class child shown in full
    const stake = buildFocusView(model(), 'a1', undefined, 'stakeholder');
    expect(stake.children).toHaveLength(0);                            // Code hidden
  });

  it('drops derived edges and their orphan externals', () => {
    const m = model();
    m.connections.push({ id: 'x', from: 'a1', to: 'b1', type: 'Dependency', ...e }); // rolls up to ca->cb (derived) at sys focus
    const full = buildFocusView(m, 'sys', undefined, 'full');
    expect(full.edges.some((x) => x.derived)).toBe(true);
    const stake = buildFocusView(m, 'sys', undefined, 'stakeholder');
    expect(stake.edges).toHaveLength(0);                              // derived edge removed
  });

  it('keeps a solid authored edge in stakeholder mode', () => {
    const m = model();
    m.connections.push({ id: 'r', from: 'a1', to: 'a2', type: 'Dependency', ...e });
    const stake = buildFocusView(m, 'ca', undefined, 'stakeholder');
    expect(stake.edges.map((x) => x.id)).toEqual(['r']);
    expect(stake.edges[0].derived).toBe(false);
  });

  it('keeps a solid external edge but drops a derived one', () => {
    const m = model();
    m.connections.push({ id: 's', from: 'a1', to: 'ext', type: 'Dependency', ...e }); // solid a1->ext
    const stake = buildFocusView(m, 'ca', undefined, 'stakeholder');
    expect(stake.externals.map((n) => n.id)).toEqual(['ext']);
    expect(stake.edges.map((x) => x.id)).toEqual(['s']);
  });
});

describe('buildFocusView — expandable externals', () => {
  it('collapsed: a peer container external that aggregates a participating child is flagged expandable', () => {
    const m = model();
    m.connections.push({ id: 'x', from: 'a1', to: 'b1', type: 'Dependency', ...e }); // a1(in ca) -> b1(in cb)
    const v = buildFocusView(m, 'ca'); // focus ca; cb is the external peer
    expect(v.externals.map((n) => n.id)).toEqual(['cb']);
    expect([...(v.expandableExternalIds ?? [])]).toEqual(['cb']); // cb aggregates b1
    expect(v.externalGroups ?? []).toEqual([]);                    // nothing expanded yet
  });

  it('expanding a peer container remaps its edge to the specific participating child and emits a group', () => {
    const m = model();
    m.connections.push({ id: 'x', from: 'a1', to: 'b1', type: 'Dependency', ...e });
    const v = buildFocusView(m, 'ca', undefined, 'full', new Set(['cb']));
    // edge now lands on b1 (the participating child of cb), not on cb
    expect(v.edges.find((ed) => ed.to === 'b1')).toBeTruthy();
    expect(v.edges.find((ed) => ed.to === 'cb')).toBeUndefined();
    expect(v.externals.map((n) => n.id)).toEqual(['b1']);          // finer member is the shown external
    expect(v.externalGroups).toEqual([{ id: 'cb', name: 'Beta', childIds: ['b1'] }]);
    expect([...(v.expandableExternalIds ?? [])]).toEqual([]);       // cb is expanded, no caret
  });

  it('a leaf ExternalSystem (no children) is never flagged expandable', () => {
    const m = model();
    m.connections.push({ id: 'x', from: 'a1', to: 'ext', type: 'Dependency', ...e });
    const v = buildFocusView(m, 'ca');
    expect(v.externals.map((n) => n.id)).toEqual(['ext']);
    expect([...(v.expandableExternalIds ?? [])]).toEqual([]);
  });

  it('flags a peer external as expandable even when the finer child is absorbed into a coarse edge realizedBy', () => {
    const m = model(); // sys > ca(a1,a2), cb(b1); a1 > k1; ext
    m.connections.push(
      { id: 'P', from: 'a1', to: 'cb', type: 'Dependency', ...e, realizedBy: ['C'] },
      { id: 'C', from: 'a1', to: 'b1', type: 'Dependency', ...e },
    );
    const v = buildFocusView(m, 'ca');
    expect(v.externals.map((n) => n.id)).toEqual(['cb']);
    expect([...(v.expandableExternalIds ?? [])]).toEqual(['cb']); // flagged despite absorption
    // and expanding it genuinely surfaces b1
    const x = buildFocusView(m, 'ca', undefined, 'full', new Set(['cb']));
    expect(x.externals.map((n) => n.id)).toEqual(['b1']);
  });

  it('does not flag a peer external as expandable via a connection unrelated to the focus', () => {
    const m = model();
    // a second peer container cc with child c1
    m.nodes.push(
      { id: 'cc', name: 'Gamma', type: 'Container', parentId: 'sys', ...base },
      { id: 'c1', name: 'C1', type: 'Component', parentId: 'cc', ...base },
    );
    m.connections.push(
      { id: 'Q', from: 'a1', to: 'cb', type: 'Dependency', ...e }, // direct edge → cb is shown
      { id: 'R', from: 'c1', to: 'b1', type: 'Dependency', ...e }, // unrelated to focus ca
    );
    const v = buildFocusView(m, 'ca');
    expect(v.externals.map((n) => n.id)).toContain('cb');
    expect([...(v.expandableExternalIds ?? [])]).toEqual([]); // cb NOT expandable via unrelated R
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

describe('externalConnections', () => {
  it('returns only connections that cross the subtree boundary (exactly one endpoint inside)', () => {
    const m = model(); // sys › ca › (a1, a2); a1 › k1; cb › b1; ext
    m.connections.push(
      { id: 'c1', from: 'a1', to: 'b1', type: 'Dependency', ...e },   // a1 in, b1 out → crosses
      { id: 'c2', from: 'k1', to: 'ext', type: 'Dependency', ...e },  // k1 (under a1) in, ext out → crosses
      { id: 'c3', from: 'b1', to: 'ext', type: 'Dependency', ...e },  // both outside ca
    );
    expect(externalConnections(m, 'ca').map((c) => c.id).sort()).toEqual(['c1', 'c2']);
  });

  it('excludes inner connections (both endpoints inside the subtree)', () => {
    const m = model();
    m.connections.push(
      { id: 'kid', from: 'a1', to: 'a2', type: 'Dependency', ...e },  // child ↔ child
      { id: 'desc', from: 'a1', to: 'k1', type: 'Dependency', ...e }, // node ↔ descendant
      { id: 'out', from: 'a1', to: 'ext', type: 'Dependency', ...e }, // crosses → kept
    );
    expect(externalConnections(m, 'ca').map((c) => c.id)).toEqual(['out']);
  });

  it('excludes connections that are realized children of another connection', () => {
    const m = model();
    m.connections.push(
      { id: 'p', from: 'a1', to: 'ext', type: 'Dependency', ...e, realizedBy: ['x'] },
      { id: 'x', from: 'k1', to: 'ext', type: 'Dependency', ...e },  // realized under p → hidden
    );
    expect(externalConnections(m, 'ca').map((c) => c.id)).toEqual(['p']);
  });
});

describe('partitionConnections', () => {
  it('splits boundary connections into outgoing (from inside) and incoming (to inside)', () => {
    const m = model(); // sys › ca › (a1,a2); a1 › k1; cb › b1; ext
    m.connections.push(
      { id: 'out1', from: 'a1', to: 'ext', type: 'Dependency', ...e },  // from inside ca → outgoing
      { id: 'out2', from: 'k1', to: 'b1', type: 'Dependency', ...e },   // k1 under a1, inside → outgoing
      { id: 'in1', from: 'ext', to: 'a1', type: 'Dependency', ...e },   // to inside ca → incoming
    );
    const { outgoing, incoming } = partitionConnections(m, 'ca');
    expect(outgoing.map((c) => c.id).sort()).toEqual(['out1', 'out2']);
    expect(incoming.map((c) => c.id)).toEqual(['in1']);
  });

  it('excludes inner and realizedBy-child connections, and externalConnections is the union', () => {
    const m = model();
    m.connections.push(
      { id: 'kid', from: 'a1', to: 'a2', type: 'Dependency', ...e },    // both inside → excluded
      { id: 'p', from: 'a1', to: 'ext', type: 'Dependency', ...e, realizedBy: ['x'] },
      { id: 'x', from: 'k1', to: 'ext', type: 'Dependency', ...e },     // realized child → excluded
      { id: 'in', from: 'ext', to: 'b1', type: 'Dependency', ...e },    // b1 not under ca → excluded
    );
    const { outgoing, incoming } = partitionConnections(m, 'ca');
    expect(outgoing.map((c) => c.id)).toEqual(['p']);
    expect(incoming).toEqual([]);
    expect(externalConnections(m, 'ca').map((c) => c.id)).toEqual(['p']);
  });
});

describe('breadcrumbPath', () => {
  it('builds Root + ancestor chain', () => {
    expect(breadcrumbPath(model(), 'a1').map((c) => c.id)).toEqual([null, 'sys', 'ca', 'a1']);
    expect(breadcrumbPath(model(), null).map((c) => c.id)).toEqual([null]);
  });
});

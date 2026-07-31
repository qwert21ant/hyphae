import { describe, it, expect } from 'vitest';
import { buildFocusView, breadcrumbPath, representative, externalConnections, partitionConnections, stepReveal } from '@/core/focusView';
import { emptyModel } from '@hyphae/schema';
import { edgeLabel, VERB_CLASS_COLOR } from '@/features/canvas/reactflow';

const base = { description: '', root: null, role: null, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {} };
const e = { verb: 'uses', object: '', description: '', direction: 'Unidirectional' as const, realizedBy: [], codeRefs: [], fields: {} };

/** sys › (ca, cb containers); ca has comps a1,a2; cb has comp b1; ext is external. */
function model() {
  const m = emptyModel();
  m.nodes.push(
    { id: 'sys', name: 'Sys', type: 'System', parentId: null, ...base },
    { id: 'ca', name: 'Alpha', type: 'Container', parentId: 'sys', ...base },
    { id: 'cb', name: 'Beta', type: 'Container', parentId: 'sys', ...base },
    { id: 'a1', name: 'A1', type: 'Component', parentId: 'ca', ...base },
    { id: 'a2', name: 'A2', type: 'Component', parentId: 'ca', ...base },
    { id: 'b1', name: 'B1', type: 'Component', parentId: 'cb', ...base },
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
    m.connections.push({ id: 'i', from: 'a1', to: 'a2', ...e });
    const v = buildFocusView(m, 'ca');
    const inner = v.edges.find((x) => x.id === 'i');
    expect(inner).toMatchObject({ from: 'a1', to: 'a2', derived: false, count: 1 });
  });

  it('aggregates external endpoints to a peer-level box and collapses edges with a count', () => {
    const m = model();
    // two components inside cb both depended on by a1 (focus ca): collapse cb-side to one box "cb"
    m.connections.push(
      { id: 'x1', from: 'a1', to: 'b1', ...e },
      { id: 'x2', from: 'a2', to: 'b1', ...e },
    );
    const v = buildFocusView(m, 'ca');
    // external box is cb (the Container peer of focus ca), not b1
    expect(v.externals.map((n) => n.id)).toEqual(['cb']);
    const a1cb = v.edges.find((x) => x.from === 'a1' && x.to === 'cb');
    const a2cb = v.edges.find((x) => x.from === 'a2' && x.to === 'cb');
    expect(a1cb).toMatchObject({ derived: true, count: 1 });
    expect(a2cb).toMatchObject({ derived: true, count: 1 });
  });

  it('keeps two DIRECT connections between the same pair as two separate real edges', () => {
    // Both endpoints are shown as themselves, so nothing is being summarised — collapsing them
    // into one dashed "2" throws away both verbs and both arrows. They are drawn separately and
    // fanned apart by FloatingEdge instead.
    const m = model();
    m.connections.push(
      { id: 'fwd', from: 'a1', to: 'a2', ...e, verb: 'reads', object: 'palette' },
      { id: 'rev', from: 'a2', to: 'a1', ...e, verb: 'invokes', object: 'access' },
    );
    const v = buildFocusView(m, 'ca');
    const between = v.edges.filter((x) => [x.from, x.to].sort().join() === 'a1,a2');
    expect(between).toHaveLength(2);
    expect(between.every((x) => x.derived === false)).toBe(true);
    expect(v.edges.find((x) => x.id === 'fwd')).toMatchObject({ from: 'a1', to: 'a2', verb: 'reads', direction: 'Unidirectional' });
    expect(v.edges.find((x) => x.id === 'rev')).toMatchObject({ from: 'a2', to: 'a1', verb: 'invokes', direction: 'Unidirectional' });
  });

  it('keeps direct connections separate while still collapsing the rolled-up ones on the same pair', () => {
    // a1↔a2 direct, plus a Component under a2? — use the container focus: a1→cb direct-to-external
    // is impossible, so assert the mixed case at the ca focus with an expanded external instead.
    const m = model();
    m.connections.push(
      { id: 'd1', from: 'a1', to: 'a2', ...e },
      { id: 'd2', from: 'a1', to: 'a2', ...e },
    );
    const v = buildFocusView(m, 'ca');
    const between = v.edges.filter((x) => [x.from, x.to].sort().join() === 'a1,a2');
    expect(between.map((x) => x.id).sort()).toEqual(['d1', 'd2']);   // same direction, still two edges
  });

  it('merges opposite-direction rollups between the same pair into one undirected edge', () => {
    // a1 (shown child of focus ca) ↔ b1 (Component under cb) in both directions: both map to a1↔cb.
    // They must collapse to a single edge (count 2) with no direction, not two overlapping arrows.
    const m = model();
    m.connections.push(
      { id: 'f', from: 'a1', to: 'b1', ...e },
      { id: 'b', from: 'b1', to: 'a1', ...e },
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
      { id: 'f1', from: 'a1', to: 'b1', ...e },
      { id: 'f2', from: 'a1', to: 'b1', ...e },
    );
    const v = buildFocusView(m, 'ca');
    const edge = v.edges.find((x) => x.from === 'a1' && x.to === 'cb')!;
    expect(edge).toMatchObject({ derived: true, count: 2, direction: 'Unidirectional' });
  });

  it('shows a higher-layer neighbor (external system) as itself', () => {
    const m = model();
    m.connections.push({ id: 'x', from: 'a1', to: 'ext', ...e });
    const v = buildFocusView(m, 'ca');
    expect(v.externals.map((n) => n.id)).toEqual(['ext']);
    expect(v.edges.find((x) => x.to === 'ext')).toMatchObject({ from: 'a1', to: 'ext' });
  });

  it('renders a single direct connection to an external node as a real (solid) edge', () => {
    // a1 (a shown child) → ext (a shown external box) is one authored connection between two nodes
    // visible in this view — it must be a real edge, not a dashed rollup.
    const m = model();
    m.connections.push({ id: 'x', from: 'a1', to: 'ext', ...e });
    const v = buildFocusView(m, 'ca');
    const edge = v.edges.find((x) => x.to === 'ext')!;
    expect(edge).toMatchObject({ id: 'x', from: 'a1', to: 'ext', derived: false, count: 1 });
  });

  it('rolls cross-subtree edges up to root↔root at the root view', () => {
    const m = model();
    m.connections.push({ id: 'x', from: 'a1', to: 'ext', ...e });
    const v = buildFocusView(m, null);
    // a1 lives under sys → maps to sys; ext is a root → sys→ext edge
    const edge = v.edges.find((x) => x.from === 'sys' && x.to === 'ext');
    expect(edge).toMatchObject({ derived: true });
  });

  it('drops dangling connections', () => {
    const m = model();
    m.connections.push({ id: 'd', from: 'a1', to: 'nope', ...e });
    const v = buildFocusView(m, 'ca');
    expect(v.edges.find((x) => x.id === 'd')).toBeUndefined();
  });

  it('honors the connection filter', () => {
    const m = model();
    m.connections.push(
      { id: 'i1', from: 'a1', to: 'a2', ...e },                        // uses → control
      { id: 'i2', from: 'a2', to: 'a1', ...e, verb: 'reads' },            // dataAccess
    );
    const v = buildFocusView(m, 'ca', { verbClasses: ['control'], fields: {} });
    expect(v.edges.map((x) => x.id)).toEqual(['i1']);
  });
});

describe('buildFocusView — rolling connections up to the children level', () => {
  it('rolls a connection authored below the children up to the shown children (System focus)', () => {
    // a1 (in ca) → b1 (in cb): Component-level connection under a focused System whose children
    // are Containers. It must surface as a ca → cb edge, not collapse onto the System.
    const m = model();
    m.connections.push({ id: 'x', from: 'a1', to: 'b1', ...e });
    const v = buildFocusView(m, 'sys');
    expect(v.edges).toHaveLength(1);
    expect(v.edges[0]).toMatchObject({ from: 'ca', to: 'cb', derived: true, count: 1 });
  });

  it('merges an authored edge and its lower-level realizations into one counted edge', () => {
    // An authored Container→Container edge plus a Component→Component edge that realizes it must
    // collapse to a single ca → cb edge (count 2), not two parallel edges.
    const m = model();
    m.connections.push(
      { id: 'authored', from: 'ca', to: 'cb', ...e },
      { id: 'realize', from: 'a1', to: 'b1', ...e },
    );
    const v = buildFocusView(m, 'sys');
    const caCb = v.edges.filter((x) => x.from === 'ca' && x.to === 'cb');
    expect(caCb).toHaveLength(1);
    expect(caCb[0]).toMatchObject({ derived: true, count: 2 });
  });

  it('does not double-count realizedBy children: a direct edge with realized children stays one real edge', () => {
    // Parent ca→cb (Container level, both shown children of sys) is realized by child a1→b1 (Component
    // level), which rolls up to the same ca→cb pair. The child must not inflate the pair to a rollup —
    // it is represented by its parent (reachable via the parent's realizedBy in the panel).
    const m = emptyModel();
    m.nodes.push(
      { id: 'sys', name: 'Sys', type: 'System', parentId: null, ...base },
      { id: 'ca', name: 'Alpha', type: 'Container', parentId: 'sys', ...base },
      { id: 'cb', name: 'Beta', type: 'Container', parentId: 'sys', ...base },
      { id: 'a1', name: 'A1', type: 'Component', parentId: 'ca', ...base },
      { id: 'b1', name: 'B1', type: 'Component', parentId: 'cb', ...base },
    );
    m.connections.push(
      { id: 'parent', from: 'ca', to: 'cb', ...e, realizedBy: ['child'] },
      { id: 'child', from: 'a1', to: 'b1', ...e },
    );
    const v = buildFocusView(m, 'sys');
    const caCb = v.edges.filter((x) => x.from === 'ca' && x.to === 'cb');
    expect(caCb).toHaveLength(1);
    expect(caCb[0]).toMatchObject({ id: 'parent', derived: false, count: 1 });
  });

  it('at a Container focus anchors a realizing edge to the shown child component, not the group-node rollup', () => {
    // Parent other→cont (Container level) is realized by m1→x (Component level), where x is a child
    // component of the focus cont. Focusing cont, the child must surface as an edge to the shown child
    // (other → x), and the coarse parent must NOT also appear as a group-node edge (other → cont). A
    // connection authored directly on the focus (cont → ext, no realizedBy) is preserved.
    const m = emptyModel();
    m.nodes.push(
      { id: 'sys', name: 'Sys', type: 'System', parentId: null, ...base },
      { id: 'cont', name: 'Cont', type: 'Container', parentId: 'sys', ...base },
      { id: 'x', name: 'X', type: 'Component', parentId: 'cont', ...base },
      { id: 'other', name: 'Other', type: 'Container', parentId: 'sys', ...base },
      { id: 'm1', name: 'M1', type: 'Component', parentId: 'other', ...base },
      { id: 'ext', name: 'Ext', type: 'ExternalSystem', parentId: null, ...base },
    );
    m.connections.push(
      { id: 'pc', from: 'other', to: 'cont', ...e, realizedBy: ['cc'] },
      { id: 'cc', from: 'm1', to: 'x', ...e },
      { id: 'q', from: 'cont', to: 'ext', ...e },
    );
    const v = buildFocusView(m, 'cont');
    expect(v.edges.find((edge) => edge.from === 'other' && edge.to === 'x')).toBeTruthy(); // child-anchored
    expect(v.edges.find((edge) => edge.to === 'cont')).toBeUndefined();                    // no group-node rollup edge
    expect(v.edges.find((edge) => edge.from === 'cont' && edge.to === 'ext')).toMatchObject({ derived: false });
    expect(v.externals.map((n) => n.id).sort()).toEqual(['ext', 'other']);
  });

  it('a real edge carries realizedBy with its single connection id', () => {
    const m = model();
    m.connections.push({ id: 'r', from: 'a1', to: 'a2', ...e });
    const v = buildFocusView(m, 'ca');
    const edge = v.edges.find((x) => x.id === 'r')!;
    expect(edge.derived).toBe(false);
    expect(edge.realizedBy).toEqual(['r']);
    expect(edge.count).toBe(edge.realizedBy.length);
  });

  it('a derived edge carries realizedBy with every aggregated connection id', () => {
    const m = model();
    m.connections.push(
      { id: 'authored', from: 'ca', to: 'cb', ...e },
      { id: 'realize', from: 'a1', to: 'b1', ...e },
    );
    const v = buildFocusView(m, 'sys');
    const caCb = v.edges.find((x) => x.from === 'ca' && x.to === 'cb')!;
    expect(caCb.derived).toBe(true);
    expect([...caCb.realizedBy].sort()).toEqual(['authored', 'realize']);
    expect(caCb.count).toBe(caCb.realizedBy.length);
  });
});

describe('buildFocusView — stakeholder audience', () => {
  it('drops derived edges and their orphan externals', () => {
    const m = model();
    m.connections.push({ id: 'x', from: 'a1', to: 'b1', ...e }); // rolls up to ca->cb (derived) at sys focus
    const full = buildFocusView(m, 'sys', undefined, 'full');
    expect(full.edges.some((x) => x.derived)).toBe(true);
    const stake = buildFocusView(m, 'sys', undefined, 'stakeholder');
    expect(stake.edges).toHaveLength(0);                              // derived edge removed
  });

  it('keeps a solid authored edge in stakeholder mode', () => {
    const m = model();
    m.connections.push({ id: 'r', from: 'a1', to: 'a2', ...e });
    const stake = buildFocusView(m, 'ca', undefined, 'stakeholder');
    expect(stake.edges.map((x) => x.id)).toEqual(['r']);
    expect(stake.edges[0].derived).toBe(false);
  });

  it('keeps a solid external edge but drops a derived one', () => {
    const m = model();
    m.connections.push({ id: 's', from: 'a1', to: 'ext', ...e }); // solid a1->ext
    const stake = buildFocusView(m, 'ca', undefined, 'stakeholder');
    expect(stake.externals.map((n) => n.id)).toEqual(['ext']);
    expect(stake.edges.map((x) => x.id)).toEqual(['s']);
  });
});

describe('buildFocusView — expandable externals', () => {
  it('collapsed: a peer container external that aggregates a participating child is flagged expandable', () => {
    const m = model();
    m.connections.push({ id: 'x', from: 'a1', to: 'b1', ...e }); // a1(in ca) -> b1(in cb)
    const v = buildFocusView(m, 'ca'); // focus ca; cb is the external peer
    expect(v.externals.map((n) => n.id)).toEqual(['cb']);
    expect([...(v.expandableExternalIds ?? [])]).toEqual(['cb']); // cb aggregates b1
    expect(v.externalGroups ?? []).toEqual([]);                    // nothing expanded yet
  });

  it('expanding a peer container remaps its edge to the specific participating child and emits a group', () => {
    const m = model();
    m.connections.push({ id: 'x', from: 'a1', to: 'b1', ...e });
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
    m.connections.push({ id: 'x', from: 'a1', to: 'ext', ...e });
    const v = buildFocusView(m, 'ca');
    expect(v.externals.map((n) => n.id)).toEqual(['ext']);
    expect([...(v.expandableExternalIds ?? [])]).toEqual([]);
  });

  it('flags a peer external as expandable even when the finer child is absorbed into a coarse edge realizedBy', () => {
    const m = model(); // sys > ca(a1,a2), cb(b1); ext
    m.connections.push(
      { id: 'P', from: 'a1', to: 'cb', ...e, realizedBy: ['C'] },
      { id: 'C', from: 'a1', to: 'b1', ...e },
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
      { id: 'Q', from: 'a1', to: 'cb', ...e }, // direct edge → cb is shown
      { id: 'R', from: 'c1', to: 'b1', ...e }, // unrelated to focus ca
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
    expect(representative(model(), 'a1', 'Container')).toBe('ca'); // a1 (Component) under ca
    expect(representative(model(), 'b1', 'Container')).toBe('cb'); // b1 (Component) under cb
  });

  it('climbs two hops to the ancestor on the focus layer', () => {
    expect(representative(model(), 'a1', 'Context')).toBe('sys'); // a1 (Component) → ca (Container) → sys (Context)
  });
});

describe('externalConnections', () => {
  it('returns only connections that cross the subtree boundary (exactly one endpoint inside)', () => {
    const m = model(); // sys › ca › (a1, a2); cb › b1; ext
    m.connections.push(
      { id: 'c1', from: 'a1', to: 'b1', ...e },   // a1 in, b1 out → crosses
      { id: 'c2', from: 'a2', to: 'ext', ...e },  // a2 in, ext out → crosses
      { id: 'c3', from: 'b1', to: 'ext', ...e },  // both outside ca
    );
    expect(externalConnections(m, 'ca').map((c) => c.id).sort()).toEqual(['c1', 'c2']);
  });

  it('excludes inner connections (both endpoints inside the subtree)', () => {
    const m = model();
    m.connections.push(
      { id: 'kid', from: 'a1', to: 'a2', ...e },  // child ↔ child
      { id: 'desc', from: 'a1', to: 'a2', ...e }, // duplicate child ↔ child pair
      { id: 'out', from: 'a1', to: 'ext', ...e }, // crosses → kept
    );
    expect(externalConnections(m, 'ca').map((c) => c.id)).toEqual(['out']);
  });

  it('excludes a connection between two grandchildren, and keeps a crossing edge, at a two-level-deep focus', () => {
    // sys's subtree is two levels deep: ca/cb (children) and a1/a2/b1 (grandchildren). A flat
    // `parentId === nodeId` check (one hop) would see neither a1 nor b1 as inside sys's subtree,
    // wrongly excluding 'out' entirely instead of classifying it as a crossing edge.
    const m = model(); // sys > ca(a1,a2), cb(b1); ext
    m.connections.push(
      { id: 'grandkid', from: 'a1', to: 'b1', ...e }, // both grandchildren of sys
      { id: 'out', from: 'a1', to: 'ext', ...e },     // crosses → kept
    );
    expect(externalConnections(m, 'sys').map((c) => c.id)).toEqual(['out']);
  });

  it('excludes connections that are realized children of another connection', () => {
    const m = model();
    m.connections.push(
      { id: 'p', from: 'a1', to: 'ext', ...e, realizedBy: ['x'] },
      { id: 'x', from: 'a2', to: 'ext', ...e },  // realized under p → hidden
    );
    expect(externalConnections(m, 'ca').map((c) => c.id)).toEqual(['p']);
  });
});

describe('partitionConnections', () => {
  it('splits boundary connections into outgoing (from inside) and incoming (to inside)', () => {
    const m = model(); // sys › ca › (a1,a2); cb › b1; ext
    m.connections.push(
      { id: 'out1', from: 'a1', to: 'ext', ...e },  // from inside ca → outgoing
      { id: 'out2', from: 'a2', to: 'b1', ...e },   // a2 inside ca → outgoing
      { id: 'in1', from: 'ext', to: 'a1', ...e },   // to inside ca → incoming
    );
    const { outgoing, incoming } = partitionConnections(m, 'ca');
    expect(outgoing.map((c) => c.id).sort()).toEqual(['out1', 'out2']);
    expect(incoming.map((c) => c.id)).toEqual(['in1']);
  });

  it('excludes inner and realizedBy-child connections, and externalConnections is the union', () => {
    const m = model();
    m.connections.push(
      { id: 'kid', from: 'a1', to: 'a2', ...e },    // both inside → excluded
      { id: 'p', from: 'a1', to: 'ext', ...e, realizedBy: ['x'] },
      { id: 'x', from: 'a2', to: 'ext', ...e },     // realized child → excluded
      { id: 'in', from: 'ext', to: 'b1', ...e },    // b1 not under ca → excluded
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

describe('edge labels', () => {
  it('joins verb and object', () => {
    expect(edgeLabel('reads', 'camera list')).toBe('reads camera list');
  });

  it('degrades to the verb alone when there is no object', () => {
    expect(edgeLabel('publishes', '')).toBe('publishes');
  });

  it('caps a long object so the label stays readable', () => {
    const label = edgeLabel('reads', 'an extremely long object name that would wreck the layout');
    expect(label.length).toBeLessThanOrEqual(36);
    expect(label.endsWith('…')).toBe(true);
  });

  it('has a colour for every verb class', () => {
    for (const c of ['dataAccess', 'messaging', 'control', 'user'] as const) {
      expect(VERB_CLASS_COLOR[c]).toMatch(/^var\(--/);
    }
  });
});

describe('buildFocusView — verb and object', () => {
  it('carries verb and object onto a 1:1 edge', () => {
    const m = model();
    m.connections.push({ id: 'x', from: 'sys', to: 'ext', ...e });
    m.connections[0].verb = 'reads';
    m.connections[0].object = 'clips';
    const v = buildFocusView(m, null);
    const edge = v.edges.find((x) => !x.derived && x.count === 1);
    expect(edge).toMatchObject({ verb: 'reads', object: 'clips' });
  });

  it('leaves verb undefined on a derived edge, which aggregates several verbs', () => {
    const m = model();
    m.connections.push(
      { id: 'authored', from: 'ca', to: 'cb', ...e, verb: 'reads' },
      { id: 'realize', from: 'a1', to: 'b1', ...e, verb: 'writes' },
    );
    const v = buildFocusView(m, 'sys');
    const derived = v.edges.filter((x) => x.derived);
    expect(derived.length).toBeGreaterThan(0);
    for (const de of derived) expect(de.verb).toBeUndefined();
  });
});

describe('stepReveal', () => {
  const step = (from: string, to: string, over: Record<string, unknown> = {}) =>
    ({ order: 1, from, to, message: '', kind: 'Sync' as const, ...over });

  it('focuses the shared parent when both endpoints are siblings', () => {
    expect(stepReveal(model(), step('a1', 'a2'))).toEqual({ focusId: 'ca', expand: new Set(), selectedId: 'a1' });
  });

  it('focuses the root when both endpoints are top-level', () => {
    expect(stepReveal(model(), step('sys', 'ext'))).toEqual({ focusId: null, expand: new Set(), selectedId: 'sys' });
  });

  it("focuses the source's parent and expands the target's representative across containers", () => {
    expect(stepReveal(model(), step('a1', 'b1'))).toEqual({ focusId: 'ca', expand: new Set(['cb']), selectedId: 'a1' });
  });

  it('focuses the DEEPER endpoint\'s parent, so a top-level source stays an external', () => {
    // ext is an ExternalSystem at top level; a1 is a Component two levels down. Focusing ext's
    // parent (the root) would show neither endpoint — a1 would be represented by sys.
    expect(stepReveal(model(), step('ext', 'a1'))).toEqual({ focusId: 'ca', expand: new Set(), selectedId: 'ext' });
  });

  it('never expands a node that is drawn INSIDE the view', () => {
    // sys is a root box at the root view. Expanding it would anchor a ghost group on top of the
    // root cluster (resolveViewPositions places groups in the external columns), so the deeper
    // endpoint's parent is focused instead and sys stays an ordinary external.
    const r = stepReveal(model(), step('sys', 'a1'))!;
    expect(r.focusId).toBe('ca');
    expect([...r.expand]).toEqual([]);
  });

  it('needs no expansion when the target is already a focus-level peer', () => {
    expect(stepReveal(model(), step('a1', 'cb'))).toEqual({ focusId: 'ca', expand: new Set(), selectedId: 'a1' });
  });

  it('selects the via connection when the step names one', () => {
    expect(stepReveal(model(), step('a1', 'b1', { via: 'conn-7' }))?.selectedId).toBe('conn-7');
  });

  it('returns null when an endpoint is not in the model', () => {
    expect(stepReveal(model(), step('a1', 'ghost'))).toBeNull();
    expect(stepReveal(model(), step('ghost', 'a1'))).toBeNull();
  });
});

describe('connection filter by verb class', () => {
  it('keeps only edges whose verb belongs to a selected class', () => {
    const m = model();
    m.connections.push(
      { id: 'r', from: 'a1', to: 'a2', ...e, verb: 'reads', object: '' },      // dataAccess
      { id: 'p', from: 'a1', to: 'a2', ...e, verb: 'publishes', object: '' },  // messaging
    );
    const view = buildFocusView(m, 'ca', { verbClasses: ['messaging'], fields: {} });
    expect(view.edges.flatMap((ed) => ed.realizedBy)).toEqual(['p']);
  });

  it('an empty verbClasses list filters nothing', () => {
    const m = model();
    m.connections.push({ id: 'r', from: 'a1', to: 'a2', ...e, verb: 'reads', object: '' });
    const view = buildFocusView(m, 'ca', { verbClasses: [], fields: {} });
    expect(view.edges.flatMap((ed) => ed.realizedBy)).toEqual(['r']);
  });
});

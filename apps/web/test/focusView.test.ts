import { describe, it, expect } from 'vitest';
import { buildFocusView, breadcrumbPath, representative } from '../src/focusView';
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
    expect(v.edges.find((x) => x.to === 'ext')).toMatchObject({ from: 'a1', to: 'ext', derived: true });
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

describe('breadcrumbPath', () => {
  it('builds Root + ancestor chain', () => {
    expect(breadcrumbPath(model(), 'a1').map((c) => c.id)).toEqual([null, 'sys', 'ca', 'a1']);
    expect(breadcrumbPath(model(), null).map((c) => c.id)).toEqual([null]);
  });
});

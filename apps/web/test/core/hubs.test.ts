import { describe, it, expect } from 'vitest';
import { hubDegrees, detectHubs, quietHubs } from '@/core/hubs';
import type { FocusView, FocusEdge } from '@/core/focusView';

const node = (id: string, type = 'Component') =>
  ({ id, name: id, type, parentId: null, description: '', codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {} }) as any;

const edge = (from: string, to: string, verb?: string): FocusEdge =>
  ({ id: `${from}->${to}`, from, to, count: 1, derived: !verb, realizedBy: ['r'], verb });

/** focus `f` with children c1..c4 plus hub `h`, and one external `x` reachable only through `h`. */
const view = (): FocusView => ({
  focusId: 'f',
  focusNode: node('f', 'Container'),
  children: [node('c1'), node('c2'), node('c3'), node('c4'), node('h')],
  externals: [node('x', 'Container')],
  edges: [
    edge('c1', 'h', 'reads'), edge('c2', 'h', 'reads'), edge('c3', 'h', 'reads'),
    edge('c4', 'h', 'writes'), edge('h', 'x'), edge('c1', 'c2', 'uses'),
  ],
});

describe('hubDegrees', () => {
  it('counts drawn edges per endpoint', () => {
    const d = hubDegrees(view());
    expect(d.get('h')).toBe(5);
    expect(d.get('c1')).toBe(2);
    expect(d.get('x')).toBe(1);
  });
});

describe('detectHubs', () => {
  it('selects nodes at or above the threshold', () => {
    expect([...detectHubs(view(), 5)]).toEqual(['h']);
    expect([...detectHubs(view(), 6)]).toEqual([]);
  });

  it('lets an override un-quiet a node over the threshold', () => {
    expect([...detectHubs(view(), 5, { h: false })]).toEqual([]);
  });

  it('lets an override quiet a node under the threshold', () => {
    expect([...detectHubs(view(), 5, { c1: true })].sort()).toEqual(['c1', 'h']);
  });
});

describe('quietHubs', () => {
  it('removes every edge touching a hub', () => {
    const { view: v } = quietHubs(view(), new Set(['h']));
    expect(v.edges.map((e) => e.id)).toEqual(['c1->c2']);
  });

  it('keeps the hub itself as a child but drops an external orphaned by the removal', () => {
    const { view: v } = quietHubs(view(), new Set(['h']));
    expect(v.children.map((n) => n.id)).toContain('h');
    expect(v.externals.map((n) => n.id)).toEqual([]);
  });

  it('badges each neighbour with the hub, its verb and its verb class', () => {
    const { badges } = quietHubs(view(), new Set(['h']));
    expect(badges.get('c1')).toEqual([{ hubId: 'h', hubName: 'h', verb: 'reads', verbClass: 'dataAccess' }]);
    expect(badges.get('c4')).toEqual([{ hubId: 'h', hubName: 'h', verb: 'writes', verbClass: 'dataAccess' }]);
    expect(badges.has('h')).toBe(false);
  });

  it('falls back to "uses" for a derived edge with no verb', () => {
    const v: FocusView = { ...view(), edges: [edge('c1', 'h')] };
    const { badges } = quietHubs(v, new Set(['h']));
    expect(badges.get('c1')?.[0].verb).toBe('uses');
  });

  it('emits no badge for an edge between two hubs', () => {
    // c1->h joins two hubs, so it produces nothing at all — c1 gets no badge for h.
    const { badges } = quietHubs(view(), new Set(['h', 'c1']));
    expect(badges.get('c1')).toBeUndefined();
    // c2 is not a hub and touches both of them separately, so it badges both, sorted by hub name.
    expect(badges.get('c2')?.map((b) => b.hubId)).toEqual(['c1', 'h']);
  });

  it('deduplicates identical badges from a fanned pair', () => {
    const v: FocusView = { ...view(), edges: [edge('c1', 'h', 'reads'), { ...edge('c1', 'h', 'reads'), id: 'dup' }] };
    const { badges } = quietHubs(v, new Set(['h']));
    expect(badges.get('c1')).toHaveLength(1);
  });

  it('returns the view unchanged when there are no hubs', () => {
    const v = view();
    const out = quietHubs(v, new Set());
    expect(out.view.edges).toHaveLength(6);
    expect(out.badges.size).toBe(0);
  });
});

import { describe, it, expect } from 'vitest';
import { layoutFocusView, NODE_W, NODE_H, ROW_GAP } from '../src/layout';
import type { FocusView } from '../src/focusView';

const node = (id: string, type = 'Component') =>
  ({ id, name: id, type, parentId: null, description: '', codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {} }) as any;

const view: FocusView = {
  focusId: 'ca',
  focusNode: node('ca', 'Container'),
  children: [node('a1'), node('a2')],
  externals: [node('cb', 'Container')],
  edges: [
    { id: 'i', from: 'a1', to: 'a2', kind: 'Dependency', count: 1, derived: false, realizedBy: ['i'] },
    { id: 'ext:a1->cb', from: 'a1', to: 'cb', kind: null, count: 1, derived: true, realizedBy: ['x'] },
  ],
};

describe('layoutFocusView', () => {
  it('assigns a position to every child and external', () => {
    const pos = layoutFocusView(view);
    for (const id of ['a1', 'a2', 'cb']) {
      expect(pos[id]).toBeDefined();
      expect(typeof pos[id].x).toBe('number');
      expect(typeof pos[id].y).toBe('number');
    }
  });

  it('is deterministic for the same input', () => {
    expect(layoutFocusView(view)).toEqual(layoutFocusView(view));
  });

  it('places externals beside the children cluster, not on top of it', () => {
    const pos = layoutFocusView(view);
    const childMaxX = Math.max(pos.a1.x, pos.a2.x) + NODE_W;
    const childMinX = Math.min(pos.a1.x, pos.a2.x);
    // cb is an outgoing target → to the right of the cluster (or clearly left if incoming)
    expect(pos.cb.x >= childMaxX || pos.cb.x + NODE_W <= childMinX).toBe(true);
  });

  it('assigns a position to the focus node when it has no children, and still places externals', () => {
    const childless: FocusView = {
      focusId: 'ext',
      focusNode: node('ext', 'ExternalSystem'),
      children: [],
      externals: [node('cb', 'Container')],
      edges: [{ id: 'ext:ext->cb', from: 'ext', to: 'cb', kind: null, count: 1, derived: true, realizedBy: ['z'] }],
    };
    const pos = layoutFocusView(childless);
    expect(pos['ext']).toBeDefined();
    expect(typeof pos['ext'].x).toBe('number');
    expect(typeof pos['ext'].y).toBe('number');
    expect(pos['cb']).toBeDefined();
    expect(typeof pos['cb'].x).toBe('number');
    expect(typeof pos['cb'].y).toBe('number');
  });

  it('stacks an expanded group\'s members at one column x, reserving space above a sibling', () => {
    const grouped: FocusView = {
      focusId: 'ca', focusNode: node('ca', 'Container'),
      children: [node('a1'), node('a2')],
      externals: [node('b1'), node('b2'), node('solo', 'Container')],
      edges: [
        { id: 'g1', from: 'a1', to: 'b1', kind: null, count: 1, derived: true, realizedBy: ['x1'] },
        { id: 'g2', from: 'a1', to: 'b2', kind: null, count: 1, derived: true, realizedBy: ['x2'] },
        { id: 's', from: 'a1', to: 'solo', kind: null, count: 1, derived: true, realizedBy: ['x3'] },
      ],
      externalGroups: [{ id: 'cb', name: 'Beta', childIds: ['b1', 'b2'] }],
    };
    const pos = layoutFocusView(grouped);
    // members share a column x and are vertically separated
    expect(pos.b1.x).toBe(pos.b2.x);
    expect(pos.b1.y).not.toBe(pos.b2.y);
    // the solo external sits in the same (outgoing) column but does not overlap the group members
    const groupMinY = Math.min(pos.b1.y, pos.b2.y);
    const groupMaxY = Math.max(pos.b1.y, pos.b2.y) + NODE_H;
    expect(pos.solo.y >= groupMaxY || pos.solo.y + NODE_H <= groupMinY).toBe(true);
    // group members are indented relative to a standalone external in the same column
    // (old ungrouped layout placed b1/b2/solo all at the same x, so this distinguishes the feature)
    expect(pos.b1.x).not.toBe(pos.solo.x);
  });

  it('keeps two ungrouped externals in a column at the original ROW_GAP pitch (no inflation)', () => {
    const v: FocusView = {
      focusId: 'ca', focusNode: node('ca', 'Container'),
      children: [node('a1')],
      externals: [node('x1', 'Container'), node('x2', 'Container')],
      edges: [
        { id: 'o1', from: 'a1', to: 'x1', kind: null, count: 1, derived: true, realizedBy: ['p1'] },
        { id: 'o2', from: 'a1', to: 'x2', kind: null, count: 1, derived: true, realizedBy: ['p2'] },
      ],
    };
    const pos = layoutFocusView(v);
    expect(pos.x1.x).toBe(pos.x2.x);                          // same column
    expect(Math.abs(pos.x1.y - pos.x2.y)).toBe(ROW_GAP);      // original pitch, not NODE_H+ROW_GAP
  });

  it('stacks ungrouped externals in a stable id order (no reordering vs pre-feature)', () => {
    const v: FocusView = {
      focusId: 'ca', focusNode: node('ca', 'Container'),
      children: [node('a1')],
      externals: [node('zed', 'Container'), node('abe', 'Container')], // deliberately out of id order
      edges: [
        { id: 'o1', from: 'a1', to: 'zed', kind: null, count: 1, derived: true, realizedBy: ['p1'] },
        { id: 'o2', from: 'a1', to: 'abe', kind: null, count: 1, derived: true, realizedBy: ['p2'] },
      ],
    };
    const pos = layoutFocusView(v);
    expect(pos.abe.y).toBeLessThan(pos.zed.y); // 'abe' sorts before 'zed' → placed above
  });
});

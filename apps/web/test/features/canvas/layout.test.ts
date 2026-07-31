import { describe, it, expect } from 'vitest';
import { layoutFocusView, resolveViewPositions, groupBoxHeight, NODE_W, NODE_H, PAD, LABEL_H, ROW_GAP, MEMBER_PITCH } from '@/features/canvas/layout';
import type { FocusView } from '@/core/focusView';

const node = (id: string, type = 'Component') =>
  ({ id, name: id, type, parentId: null, description: '', codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {} }) as any;

const view: FocusView = {
  focusId: 'ca',
  focusNode: node('ca', 'Container'),
  children: [node('a1'), node('a2')],
  externals: [node('cb', 'Container')],
  edges: [
    { id: 'i', from: 'a1', to: 'a2', count: 1, derived: false, realizedBy: ['i'] },
    { id: 'ext:a1->cb', from: 'a1', to: 'cb', count: 1, derived: true, realizedBy: ['x'] },
  ],
};

describe('layoutFocusView (base structural layout)', () => {
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
    expect(pos.cb.x >= childMaxX || pos.cb.x + NODE_W <= childMinX).toBe(true);
  });

  it('assigns a position to the focus node when it has no children, and still places externals', () => {
    const childless: FocusView = {
      focusId: 'ext',
      focusNode: node('ext', 'ExternalSystem'),
      children: [],
      externals: [node('cb', 'Container')],
      edges: [{ id: 'ext:ext->cb', from: 'ext', to: 'cb', count: 1, derived: true, realizedBy: ['z'] }],
    };
    const pos = layoutFocusView(childless);
    expect(pos['ext']).toBeDefined();
    expect(pos['cb']).toBeDefined();
    expect(typeof pos['cb'].x).toBe('number');
  });

  it('keeps two externals in a column at the ROW_GAP pitch', () => {
    const v: FocusView = {
      focusId: 'ca', focusNode: node('ca', 'Container'),
      children: [node('a1')],
      externals: [node('x1', 'Container'), node('x2', 'Container')],
      edges: [
        { id: 'o1', from: 'a1', to: 'x1', count: 1, derived: true, realizedBy: ['p1'] },
        { id: 'o2', from: 'a1', to: 'x2', count: 1, derived: true, realizedBy: ['p2'] },
      ],
    };
    const pos = layoutFocusView(v);
    expect(pos.x1.x).toBe(pos.x2.x);
    expect(Math.abs(pos.x1.y - pos.x2.y)).toBe(ROW_GAP);
  });

  it('stacks externals in a stable id order', () => {
    const v: FocusView = {
      focusId: 'ca', focusNode: node('ca', 'Container'),
      children: [node('a1')],
      externals: [node('zed', 'Container'), node('abe', 'Container')],
      edges: [
        { id: 'o1', from: 'a1', to: 'zed', count: 1, derived: true, realizedBy: ['p1'] },
        { id: 'o2', from: 'a1', to: 'abe', count: 1, derived: true, realizedBy: ['p2'] },
      ],
    };
    const pos = layoutFocusView(v);
    expect(pos.abe.y).toBeLessThan(pos.zed.y);
  });
});

describe('resolveViewPositions', () => {
  it('reuses base positions for children and collapsed externals (filter/audience stability)', () => {
    const base = { a1: { x: 0, y: 0 }, a2: { x: 0, y: 100 }, cb: { x: 500, y: 50 } };
    const v: FocusView = {
      focusId: 'ca', focusNode: node('ca', 'Container'),
      children: [node('a1'), node('a2')],
      externals: [node('cb', 'Container')],
      edges: [{ id: 'x', from: 'a1', to: 'cb', count: 1, derived: true, realizedBy: ['e'] }],
    };
    const pos = resolveViewPositions(v, base);
    expect(pos.a1).toEqual({ x: 0, y: 0 });
    expect(pos.a2).toEqual({ x: 0, y: 100 });
    expect(pos.cb).toEqual({ x: 500, y: 50 });
  });

  it('leaves a still-shown external at its base slot when a sibling is filtered out (no re-centering)', () => {
    // base has cb + cc in one column; the current view only shows cb — it must stay put, not recenter.
    const base = { a1: { x: 0, y: 0 }, cb: { x: 500, y: 20 }, cc: { x: 500, y: 90 } };
    const v: FocusView = {
      focusId: 'ca', focusNode: node('ca', 'Container'),
      children: [node('a1')],
      externals: [node('cb', 'Container')],
      edges: [{ id: 'x', from: 'a1', to: 'cb', count: 1, derived: true, realizedBy: ['e'] }],
    };
    const pos = resolveViewPositions(v, base);
    expect(pos.cb).toEqual({ x: 500, y: 20 });
    expect(pos.cc).toBeUndefined();
  });

  it('anchors an expanded group at the collapsed ghost base slot with members at MEMBER_PITCH', () => {
    const base = { a1: { x: 0, y: 0 }, cb: { x: 500, y: 100 } };
    const v: FocusView = {
      focusId: 'ca', focusNode: node('ca', 'Container'),
      children: [node('a1')],
      externals: [node('b1'), node('b2')],
      edges: [
        { id: 'g1', from: 'a1', to: 'b1', count: 1, derived: true, realizedBy: ['x1'] },
        { id: 'g2', from: 'a1', to: 'b2', count: 1, derived: true, realizedBy: ['x2'] },
      ],
      externalGroups: [{ id: 'cb', name: 'Beta', childIds: ['b1', 'b2'] }],
    };
    const pos = resolveViewPositions(v, base);
    // members indented from the group's base x (same column/side as the collapsed ghost)
    expect(pos.b1.x).toBe(base.cb.x + PAD);
    expect(pos.b2.x).toBe(pos.b1.x);
    // stacked at MEMBER_PITCH — no overlap
    expect(pos.b2.y - pos.b1.y).toBe(MEMBER_PITCH);
    // the group box top aligns with the collapsed ghost's base y (first member below the label band)
    expect(pos.b1.y).toBe(base.cb.y + LABEL_H + PAD);
  });

  it('an expanded group pushes only lower same-column items down; other column and children stay', () => {
    const base = {
      a1: { x: 0, y: 0 },
      top: { x: 500, y: 0 }, cb: { x: 500, y: 100 }, low: { x: 500, y: 200 },
      left: { x: -300, y: 50 },
    };
    const v: FocusView = {
      focusId: 'ca', focusNode: node('ca', 'Container'),
      children: [node('a1')],
      externals: [node('top', 'Container'), node('b1'), node('b2'), node('low', 'Container'), node('left', 'Container')],
      edges: [],
      externalGroups: [{ id: 'cb', name: 'Beta', childIds: ['b1', 'b2'] }],
    };
    const pos = resolveViewPositions(v, base);
    const extra = groupBoxHeight(2) - NODE_H;
    expect(pos.top).toEqual({ x: 500, y: 0 });               // above the group — unchanged
    expect(pos.low).toEqual({ x: 500, y: 200 + extra });     // below the group — pushed down
    expect(pos.left).toEqual({ x: -300, y: 50 });            // other column — unchanged
    expect(pos.a1).toEqual({ x: 0, y: 0 });                  // child — unchanged
  });
});

describe('node box vs stacking pitch (overlap guards)', () => {
  it('stacks externals at a pitch greater than the node height', () => {
    // ROW_GAP is the vertical PITCH between stacked external boxes. If it is not larger than
    // NODE_H the boxes overlap — which is exactly what happened when NODE_H grew and ROW_GAP
    // stayed a hardcoded 70.
    expect(ROW_GAP).toBeGreaterThan(NODE_H);
    expect(MEMBER_PITCH).toBeGreaterThan(NODE_H);
  });

  it('leaves a real vertical gap between two stacked externals', () => {
    const v = {
      focusId: 'ca', focusNode: { id: 'ca' } as never,
      children: [{ id: 'a1' } as never],
      externals: [{ id: 'x1' } as never, { id: 'x2' } as never],
      edges: [],
    };
    const pos = layoutFocusView(v as never);
    expect(Math.abs(pos.x1.y - pos.x2.y)).toBeGreaterThanOrEqual(NODE_H);
  });

  it('leaves a real vertical gap between two expanded-group members', () => {
    const base = { g: { x: 0, y: 0 }, b1: { x: 0, y: 0 }, b2: { x: 0, y: 0 } };
    const v = {
      focusId: 'ca', focusNode: { id: 'ca' } as never,
      children: [], externals: [{ id: 'b1', parentId: 'g' } as never, { id: 'b2', parentId: 'g' } as never],
      edges: [], externalGroups: [{ id: 'g', name: 'G', childIds: ['b1', 'b2'] }],
    };
    const pos = resolveViewPositions(v as never, base);
    expect(pos.b2.y - pos.b1.y).toBeGreaterThanOrEqual(NODE_H);
  });
});

import { describe, it, expect } from 'vitest';
import {
  layoutFocusView, resolveViewPositions, groupBoxHeight, NODE_W, NODE_H, PAD, LABEL_H, ROW_GAP, MEMBER_PITCH,
  GRID_COLS, SHELF_GAP, applyDragOverrides, dragCommit, gutterGeometry, type DragState, type XY,
} from '@/features/canvas/layout';
import { gutterWidth } from '@/features/canvas/edges/lanes';
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


describe('external column ordering', () => {
  // Three children stacked by dagre (a chain gives them distinct ranks, hence distinct y), and
  // three incoming externals deliberately id-sorted into the WRONG vertical order.
  const chain: FocusView = {
    focusId: 'f', focusNode: node('f', 'Container'),
    children: [node('k1'), node('k2'), node('k3')],
    externals: [node('xa', 'Container'), node('xb', 'Container'), node('xc', 'Container')],
    edges: [
      { id: 'c1', from: 'k1', to: 'k2', count: 1, derived: false, realizedBy: ['a'] },
      { id: 'c2', from: 'k2', to: 'k3', count: 1, derived: false, realizedBy: ['b'] },
      // xa→k3 (bottom), xb→k2 (middle), xc→k1 (top): id order is the exact reverse of graph order
      { id: 'e1', from: 'xa', to: 'k3', count: 1, derived: true, realizedBy: ['p'] },
      { id: 'e2', from: 'xb', to: 'k2', count: 1, derived: true, realizedBy: ['q'] },
      { id: 'e3', from: 'xc', to: 'k1', count: 1, derived: true, realizedBy: ['r'] },
    ],
  };

  it('orders a column by its neighbours vertical position, not by id', () => {
    const pos = layoutFocusView(chain);
    // k1 is above k3, so xc (which feeds k1) must sit above xa (which feeds k3).
    expect(pos.k1.y).toBeLessThan(pos.k3.y);
    expect(pos.xc.y).toBeLessThan(pos.xb.y);
    expect(pos.xb.y).toBeLessThan(pos.xa.y);
  });

  it('falls back to the id order for externals with no placed neighbour', () => {
    const orphaned: FocusView = {
      ...chain,
      edges: [
        { id: 'o1', from: 'xb', to: 'f', count: 1, derived: true, realizedBy: ['p'] },
        { id: 'o2', from: 'xa', to: 'f', count: 1, derived: true, realizedBy: ['q'] },
      ],
    };
    const pos = layoutFocusView(orphaned);
    expect(pos.xa.y).toBeLessThan(pos.xb.y);
  });

  it('is still deterministic', () => {
    expect(layoutFocusView(chain)).toEqual(layoutFocusView(chain));
  });
});

describe('isolated children', () => {
  const isolated = (n: number): FocusView => ({
    focusId: 'f', focusNode: node('f', 'Container'),
    children: Array.from({ length: n }, (_, i) => node(`i${i}`)),
    externals: [],
    edges: [],
  });

  it('packs children with no intra-cluster edge into a grid, not one row', () => {
    const pos = layoutFocusView(isolated(12));
    const rows = new Set(Object.values(pos).map((p) => Math.round(p.y)));
    const cols = new Set(Object.values(pos).map((p) => Math.round(p.x)));
    expect(cols.size).toBe(GRID_COLS);
    expect(rows.size).toBe(3);
  });

  it('keeps the grid narrower than the equivalent row', () => {
    const pos = layoutFocusView(isolated(12));
    const xs = Object.values(pos).map((p) => p.x);
    const width = Math.max(...xs) + NODE_W - Math.min(...xs);
    expect(width).toBeLessThan(12 * NODE_W);
  });

  it('leaves dagre-ranked children alone and puts the grid below them', () => {
    const mixed: FocusView = {
      focusId: 'f', focusNode: node('f', 'Container'),
      children: [node('c1'), node('c2'), node('lone')],
      externals: [],
      edges: [{ id: 'e', from: 'c1', to: 'c2', count: 1, derived: false, realizedBy: ['a'] }],
    };
    const pos = layoutFocusView(mixed);
    expect(pos.c1.y).toBeLessThan(pos.c2.y);       // dagre's TB rank order survives
    expect(pos.lone.y).toBeGreaterThan(pos.c2.y);  // the grid sits below the ranked core
  });

  it('is deterministic', () => {
    expect(layoutFocusView(isolated(7))).toEqual(layoutFocusView(isolated(7)));
  });
});

describe('applyDragOverrides', () => {
  it('overrides a laid-out position with the dragged one', () => {
    const out = applyDragOverrides({ a: { x: 0, y: 0 }, b: { x: 10, y: 10 } }, { a: { x: 99, y: 98 } });
    expect(out).toEqual({ a: { x: 99, y: 98 }, b: { x: 10, y: 10 } });
  });

  it('ignores an override for a node not in the view', () => {
    const out = applyDragOverrides({ a: { x: 0, y: 0 } }, { gone: { x: 5, y: 5 } });
    expect(out).toEqual({ a: { x: 0, y: 0 } });
  });

  it('returns the base object untouched when there is nothing to override', () => {
    const base = { a: { x: 1, y: 2 } };
    expect(applyDragOverrides(base, {})).toBe(base);
  });
});

describe('dragCommit', () => {
  const grp = (members: { id: string; start: XY }[] = []): DragState =>
    ({ id: 'cb', type: 'ghostGroup', start: { x: 100, y: 100 }, members });

  it('commits a lone node as itself', () => {
    const d: DragState = { id: 'a1', type: 'node', start: { x: 0, y: 0 }, members: [] };
    expect(dragCommit(d, { x: 5, y: 6 }, {})).toEqual({ a1: { x: 5, y: 6 } });
  });

  it('commits a ghost group as its own slot, letting derived members follow', () => {
    const d = grp([{ id: 'b1', start: { x: 124, y: 146 } }]);
    // b1 has no override of its own, so it still derives from the slot — nothing to commit for it.
    expect(dragCommit(d, { x: 300, y: 100 }, {})).toEqual({ cb: { x: 300, y: 100 } });
  });

  it('carries an individually-dragged member along with its group', () => {
    // THE BUG: b1 was dragged on its own, so it holds an absolute override and no longer derives
    // from the group's slot. Moving the group left it behind at its stale absolute position while
    // b2 followed the slot, which tore the group apart on release.
    const d = grp([{ id: 'b1', start: { x: 500, y: 500 } }, { id: 'b2', start: { x: 124, y: 250 } }]);
    const patch = dragCommit(d, { x: 300, y: 100 }, { b1: { x: 500, y: 500 } });
    expect(patch).toEqual({ cb: { x: 300, y: 100 }, b1: { x: 700, y: 500 } });
    expect(patch.b2).toBeUndefined(); // still derived — must NOT be pinned
  });

  it('moves the SLOT by the delta, not the box position it has drifted from', () => {
    // Member 0 was dragged below its sibling, so the box — drawn wrapping its members — now sits a
    // whole MEMBER_PITCH below the slot it is anchored to. Committing the box position would place
    // every still-derived member from a slot that had silently moved down by that difference.
    const d: DragState = {
      id: 'cb', type: 'ghostGroup',
      start: { x: 100, y: 100 + MEMBER_PITCH },   // where the box is drawn
      slot: { x: 100, y: 100 },                   // where it is anchored
      members: [{ id: 'b1', start: { x: 124, y: 100 + MEMBER_PITCH } }],
    };
    const to = { x: d.start.x + 30, y: d.start.y + 7 };
    expect(dragCommit(d, to, {})).toEqual({ cb: { x: 130, y: 107 } });
  });

  it('commits every child of a region, which has no slot of its own', () => {
    const d: DragState = {
      id: 'ca', type: 'region', start: { x: 0, y: 0 },
      members: [{ id: 'a1', start: { x: 10, y: 10 } }, { id: 'a2', start: { x: 10, y: 120 } }],
    };
    expect(dragCommit(d, { x: 40, y: -10 }, {})).toEqual({
      a1: { x: 50, y: 0 }, a2: { x: 50, y: 110 },
    });
  });
});

const edge = (id: string, from: string, to: string) =>
  ({ id, from, to, count: 1, derived: false, realizedBy: [id] });

const viewOf = (externals: string[], edges: ReturnType<typeof edge>[]): FocusView => ({
  focusId: 'ca',
  focusNode: node('ca', 'Container'),
  children: [node('c1'), node('c2')],
  externals: externals.map((id) => node(id, 'Container')),
  edges,
});

describe('gutters sized from lane demand', () => {
  it('keeps the 120px gap when a single external needs one lane', () => {
    const view = viewOf(['e1'], [edge('a', 'e1', 'c1')]);
    const pos = layoutFocusView(view);
    const g = gutterGeometry(view, pos);
    expect(g.clusterMinX - g.leftGutterX).toBe(120);
  });

  it('widens the gutter when many runs overlap in y', () => {
    // Twelve incoming externals all reaching the SAME child: every span overlaps, so density is 12.
    const ids = Array.from({ length: 12 }, (_, i) => `e${i}`);
    const view = viewOf(ids, ids.map((id, i) => edge(`a${i}`, id, 'c1')));
    const pos = layoutFocusView(view);
    const g = gutterGeometry(view, pos);
    expect(g.clusterMinX - g.leftGutterX).toBeGreaterThan(120);
    expect(g.clusterMinX - g.leftGutterX).toBeLessThanOrEqual(gutterWidth(12));
  });

  it('sizes the two gutters independently', () => {
    // layoutFocusView calls an external INCOMING when it is the `from` of any edge, OUTGOING
    // otherwise — so 'out0' lands in the right-hand column.
    const ids = Array.from({ length: 10 }, (_, i) => `in${i}`);
    const view = viewOf(
      [...ids, 'out0'],
      [...ids.map((id, i) => edge(`i${i}`, id, 'c1')), edge('o', 'c1', 'out0')],
    );
    const pos = layoutFocusView(view);
    const g = gutterGeometry(view, pos);
    const left = g.clusterMinX - g.leftGutterX;
    const right = pos.out0.x - g.rightGutterX;
    expect(left).toBeGreaterThan(right);
  });
});

describe('layoutFocusView — the shelf', () => {
  const shelfView = (): FocusView => ({
    ...view,
    shelf: [{ node: node('found', 'Container'), count: 3 }],
    edges: [
      ...view.edges,
      { id: 's1', from: 'found', to: 'a1', count: 1, derived: false, realizedBy: ['s1'], shelved: true },
    ],
  });

  it('gives every shelf node a slot', () => {
    const pos = layoutFocusView(shelfView());
    expect(pos['found']).toBeDefined();
  });

  it('puts the shelf below every other placed node', () => {
    const pos = layoutFocusView(shelfView());
    const others = Object.entries(pos).filter(([id]) => id !== 'found').map(([, p]) => p.y + NODE_H);
    expect(pos['found'].y).toBeGreaterThanOrEqual(Math.max(...others) + SHELF_GAP);
  });

  it('does not put a shelf node in an external column', () => {
    const pos = layoutFocusView(shelfView());
    expect(pos['found'].x).not.toBe(pos['cb'].x);
  });

  it('spaces a row of shelf nodes so the boxes cannot overlap', () => {
    const v = shelfView();
    v.shelf = [
      { node: node('f1', 'Container'), count: 1 },
      { node: node('f2', 'Container'), count: 2 },
    ];
    const pos = layoutFocusView(v);
    expect(Math.abs(pos['f1'].x - pos['f2'].x)).toBeGreaterThanOrEqual(NODE_W);
    expect(pos['f1'].y).toBe(pos['f2'].y);
  });

  it('keeps a shelf slot through resolveViewPositions', () => {
    const v = shelfView();
    const pos = resolveViewPositions(v, layoutFocusView(v));
    expect(pos['found']).toBeDefined();
  });

  it('changes nothing when the shelf is empty', () => {
    expect(layoutFocusView({ ...view, shelf: [] })).toEqual(layoutFocusView(view));
  });
});

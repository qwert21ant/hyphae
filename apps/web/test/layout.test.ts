import { describe, it, expect } from 'vitest';
import { layoutFocusView, NODE_W } from '../src/layout';
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
});

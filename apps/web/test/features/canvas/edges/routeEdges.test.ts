import { describe, it, expect } from 'vitest';
import { Position } from '@xyflow/react';
import { routeEdges, fallbackRoute } from '@/features/canvas/edges/routeEdges';
import { NODE_H, type XY } from '@/features/canvas/layout';
import type { NodeKind } from '@/features/canvas/edges/ports';

// A cluster of two children at x=500, an external column on each side.
const positions: Record<string, XY> = {
  c1: { x: 500, y: 0 },
  c2: { x: 500, y: 300 },
  extL: { x: 100, y: 0 },
  extL2: { x: 100, y: 400 },
  extR: { x: 900, y: 0 },
};
const kinds: Record<string, NodeKind> = {
  c1: 'child', c2: 'child', extL: 'external', extL2: 'external', extR: 'external',
};
// Left gutter runs from the right edge of the left column (100 + 220) to the cluster (500).
// Right gutter runs from the right edge of the cluster (720) to the right column (900).
const gutters = { leftGutterX: 320, rightGutterX: 720, clusterMinX: 500, clusterMaxX: 720 };

describe('routeEdges', () => {
  it('gives every edge a route', () => {
    const r = routeEdges(
      [{ id: 'e1', source: 'extL', target: 'c1' }, { id: 'e2', source: 'c1', target: 'c2' }],
      positions, kinds, gutters,
    );
    expect(Object.keys(r).sort()).toEqual(['e1', 'e2']);
  });

  it('anchors a left external on its right face and the child on its left', () => {
    const r = routeEdges([{ id: 'e1', source: 'extL', target: 'c1' }], positions, kinds, gutters);
    expect(r.e1.sourceSide).toBe(Position.Right);
    expect(r.e1.targetSide).toBe(Position.Left);
  });

  it('puts an external run in the gutter on the external side', () => {
    const r = routeEdges([{ id: 'e1', source: 'extL2', target: 'c1' }], positions, kinds, gutters);
    expect(r.e1.lane).toBeGreaterThanOrEqual(gutters.leftGutterX);
    expect(r.e1.lane).toBeLessThan(gutters.clusterMinX);
  });

  it('puts a right-hand external run in the right gutter', () => {
    const r = routeEdges([{ id: 'e3', source: 'c2', target: 'extR' }], positions, kinds, gutters);
    expect(r.e3.lane).toBeGreaterThanOrEqual(gutters.rightGutterX);
    expect(r.e3.lane).toBeLessThan(900);
  });

  it('gives a child-to-child edge no lane', () => {
    const r = routeEdges([{ id: 'e2', source: 'c1', target: 'c2' }], positions, kinds, gutters);
    expect(r.e2.lane).toBeUndefined();
  });

  it('gives two edges into the same side of a node different ports', () => {
    const r = routeEdges(
      [{ id: 'a', source: 'extL', target: 'c1' }, { id: 'b', source: 'extL2', target: 'c1' }],
      positions, kinds, gutters,
    );
    expect(r.a.targetPort).not.toBe(r.b.targetPort);
  });

  it('reports the port count that was used, so resolution cannot disagree', () => {
    const r = routeEdges([{ id: 'e1', source: 'extL', target: 'c1' }], positions, kinds, gutters);
    expect(r.e1.targetPortCount).toBe(Math.max(1, Math.floor(NODE_H / 24)));
  });

  it('orders ports on a side by the other endpoint, so arrivals do not invert', () => {
    // extL is above extL2; their ports on c1's left side must keep that order.
    const r = routeEdges(
      [{ id: 'lo', source: 'extL2', target: 'c1' }, { id: 'hi', source: 'extL', target: 'c1' }],
      positions, kinds, gutters,
    );
    expect(r.hi.targetPort).toBeLessThan(r.lo.targetPort);
  });

  it('is deterministic regardless of edge order', () => {
    const edges = [
      { id: 'a', source: 'extL', target: 'c1' },
      { id: 'b', source: 'extL2', target: 'c1' },
      { id: 'c', source: 'c1', target: 'c2' },
    ];
    expect(routeEdges([...edges].reverse(), positions, kinds, gutters))
      .toEqual(routeEdges(edges, positions, kinds, gutters));
  });

  it('skips an edge whose endpoint has no position rather than placing it at the origin', () => {
    const r = routeEdges([{ id: 'x', source: 'ghost', target: 'c1' }], positions, kinds, gutters);
    expect(r.x).toBeUndefined();
  });
});

describe('fallbackRoute', () => {
  it('faces the two boxes at each other on port 0 of 1', () => {
    const r = fallbackRoute({ x: 0, y: 0 }, { x: 500, y: 0 });
    expect(r).toEqual({
      sourceSide: Position.Right, sourcePort: 0, sourcePortCount: 1,
      targetSide: Position.Left, targetPort: 0, targetPortCount: 1,
    });
  });
});

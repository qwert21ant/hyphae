import { describe, it, expect } from 'vitest';
import { Position } from '@xyflow/react';
import { getEdgeParams, fanEdgeParams } from '@/features/canvas/edges/floating';

describe('getEdgeParams (floating edge geometry)', () => {
  it('attaches to the right of the source and left of the target when target is to the right', () => {
    const r = getEdgeParams({ x: 0, y: 0, width: 100, height: 100 }, { x: 200, y: 0, width: 100, height: 100 });
    expect(r.sourcePos).toBe(Position.Right);
    expect(r.targetPos).toBe(Position.Left);
    expect(r.sx).toBeCloseTo(100);
    expect(r.sy).toBeCloseTo(50);
    expect(r.tx).toBeCloseTo(200);
    expect(r.ty).toBeCloseTo(50);
  });

  it('attaches bottom-to-top when target is below', () => {
    const r = getEdgeParams({ x: 0, y: 0, width: 100, height: 100 }, { x: 0, y: 200, width: 100, height: 100 });
    expect(r.sourcePos).toBe(Position.Bottom);
    expect(r.targetPos).toBe(Position.Top);
    expect(r.sx).toBeCloseTo(50);
    expect(r.sy).toBeCloseTo(100);
    expect(r.tx).toBeCloseTo(50);
    expect(r.ty).toBeCloseTo(200);
  });
});

describe('fanEdgeParams (parallel edge separation)', () => {
  // Horizontal source→target line: a perpendicular shift moves y only.
  const straight = getEdgeParams({ x: 0, y: 0, width: 100, height: 100 }, { x: 200, y: 0, width: 100, height: 100 });

  it('leaves a lone edge untouched', () => {
    expect(fanEdgeParams(straight, 0, 1)).toEqual(straight);
  });

  it('splits two edges between the same pair to opposite sides, centered on the original line', () => {
    const a = fanEdgeParams(straight, 0, 2, 20);
    const b = fanEdgeParams(straight, 1, 2, 20);
    expect(a.sy).toBeCloseTo(straight.sy - 10);
    expect(b.sy).toBeCloseTo(straight.sy + 10);
    expect((a.sy + b.sy) / 2).toBeCloseTo(straight.sy);   // still centered on the true line
    expect(a.sx).toBeCloseTo(straight.sx);                // shift is perpendicular, so x is unchanged
    expect(b.tx).toBeCloseTo(straight.tx);
  });

  it('keeps the middle edge of three on the original line', () => {
    expect(fanEdgeParams(straight, 1, 3, 20).sy).toBeCloseTo(straight.sy);
    expect(fanEdgeParams(straight, 0, 3, 20).sy).toBeCloseTo(straight.sy - 20);
    expect(fanEdgeParams(straight, 2, 3, 20).sy).toBeCloseTo(straight.sy + 20);
  });

  it('shifts perpendicular to a diagonal line, not along an axis', () => {
    const diag = getEdgeParams({ x: 0, y: 0, width: 100, height: 100 }, { x: 200, y: 200, width: 100, height: 100 });
    const p = fanEdgeParams(diag, 0, 2, 20);
    // The displacement must be orthogonal to the source→target direction.
    const dx = diag.tx - diag.sx, dy = diag.ty - diag.sy;
    expect((p.sx - diag.sx) * dx + (p.sy - diag.sy) * dy).toBeCloseTo(0);
    // ...and both endpoints move by the same vector, so the edge stays parallel to the original.
    expect(p.tx - diag.tx).toBeCloseTo(p.sx - diag.sx);
    expect(p.ty - diag.ty).toBeCloseTo(p.sy - diag.sy);
  });

  it('is a no-op for a degenerate zero-length edge', () => {
    const same = { sx: 5, sy: 5, tx: 5, ty: 5, sourcePos: Position.Top, targetPos: Position.Top };
    expect(fanEdgeParams(same, 0, 2, 20)).toEqual(same);
  });
});

describe('fanEdgeParams on an ANTIPARALLEL pair', () => {
  // A→B and B→A are one visual pair, but each edge computes its own source→target vector — which
  // point in opposite directions. The perpendicular therefore flips too, so a naive centered offset
  // sends both edges to the SAME side and they overlap perfectly.
  const boxA = { x: 0, y: 0, width: 100, height: 100 };
  const boxB = { x: 300, y: 0, width: 100, height: 100 };
  const forward = getEdgeParams(boxA, boxB);   // A → B
  const backward = getEdgeParams(boxB, boxA);  // B → A (same geometry, reversed)

  it('puts the two directions on opposite sides of the line', () => {
    // 'backward' is the reversed traversal of the same pair, so it is fanned with reversed=true.
    const f = fanEdgeParams(forward, 0, 2, 20, false);
    const b = fanEdgeParams(backward, 1, 2, 20, true);
    // The A-side endpoint is `s` on the forward edge and `t` on the backward one: the same point
    // before fanning, so after fanning it must have moved to two DIFFERENT places.
    expect(f.sy).not.toBeCloseTo(b.ty);
    expect(f.sy).toBeCloseTo(forward.sy - 10);
    expect(b.ty).toBeCloseTo(forward.sy + 10);
  });
});

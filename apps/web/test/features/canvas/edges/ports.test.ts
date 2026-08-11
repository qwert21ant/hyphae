import { describe, it, expect } from 'vitest';
import { Position } from '@xyflow/react';
import { PORT_PITCH, portCount, portPoint, chooseSides, fanEdgeParams } from '@/features/canvas/edges/ports';

const box = (x: number, y: number, width = 220, height = 92) => ({ x, y, width, height });

describe('portCount', () => {
  it('fits as many whole PORT_PITCH steps as the side allows', () => {
    expect(portCount(220)).toBe(9);   // 220 / 24 = 9.16
    expect(portCount(92)).toBe(3);    //  92 / 24 = 3.83
  });

  it('never returns zero, however short the side', () => {
    expect(portCount(4)).toBe(1);
    expect(portCount(0)).toBe(1);
  });

  it('uses PORT_PITCH as a MINIMUM pitch — real pitch fills the side', () => {
    const n = portCount(220);
    expect(220 / n).toBeGreaterThanOrEqual(PORT_PITCH);
  });
});

describe('portPoint', () => {
  it('spaces ports evenly down a left side, centred, first at half a pitch', () => {
    const b = box(100, 200);
    expect(portPoint(b, Position.Left, 0, 3)).toEqual({ x: 100, y: 200 + 92 / 6 });
    expect(portPoint(b, Position.Left, 1, 3)).toEqual({ x: 100, y: 200 + 92 / 2 });
    expect(portPoint(b, Position.Left, 2, 3)).toEqual({ x: 100, y: 200 + (5 * 92) / 6 });
  });

  it('puts a right-side port on the far edge at the same heights', () => {
    const b = box(100, 200);
    expect(portPoint(b, Position.Right, 1, 3)).toEqual({ x: 320, y: 246 });
  });

  it('spaces ports across the top and bottom by x', () => {
    const b = box(0, 0);
    expect(portPoint(b, Position.Top, 0, 2)).toEqual({ x: 55, y: 0 });
    expect(portPoint(b, Position.Bottom, 1, 2)).toEqual({ x: 165, y: 92 });
  });

  it('clamps an out-of-range index rather than leaving the box', () => {
    const b = box(0, 0);
    expect(portPoint(b, Position.Left, 9, 3)).toEqual(portPoint(b, Position.Left, 2, 3));
    expect(portPoint(b, Position.Left, -4, 3)).toEqual(portPoint(b, Position.Left, 0, 3));
  });
});

describe('chooseSides', () => {
  it('sends an external on the left in through its right face', () => {
    const s = chooseSides(box(0, 100), box(400, 100), 'external', 'child');
    expect(s).toEqual({ sourceSide: Position.Right, targetSide: Position.Left });
  });

  it('sends an external on the right in through its left face', () => {
    const s = chooseSides(box(400, 100), box(0, 100), 'external', 'child');
    expect(s).toEqual({ sourceSide: Position.Left, targetSide: Position.Right });
  });

  it('uses top and bottom between two children, matching dagre TB ranks', () => {
    const s = chooseSides(box(0, 0), box(0, 300), 'child', 'child');
    expect(s).toEqual({ sourceSide: Position.Bottom, targetSide: Position.Top });
  });

  it('uses left and right between two children on the same rank', () => {
    const s = chooseSides(box(0, 0), box(500, 0), 'child', 'child');
    expect(s).toEqual({ sourceSide: Position.Right, targetSide: Position.Left });
  });
});

describe('fanEdgeParams (shared-port separation)', () => {
  // Horizontal source→target line: a perpendicular shift moves y only.
  const straight = { sx: 100, sy: 50, tx: 200, ty: 50, sourcePos: Position.Right, targetPos: Position.Left };

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
    const diag = { sx: 100, sy: 100, tx: 200, ty: 200, sourcePos: Position.Right, targetPos: Position.Left };
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
  const forward = { sx: 100, sy: 50, tx: 300, ty: 50, sourcePos: Position.Right, targetPos: Position.Left };
  const backward = { sx: 300, sy: 50, tx: 100, ty: 50, sourcePos: Position.Left, targetPos: Position.Right };

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

import { describe, it, expect } from 'vitest';
import { Position } from '@xyflow/react';
import { getEdgeParams } from '../src/floating';

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

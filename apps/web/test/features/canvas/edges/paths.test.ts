import { describe, it, expect } from 'vitest';
import { Position } from '@xyflow/react';
import { squaredPath, curvedPath } from '@/features/canvas/edges/paths';

const right = (x: number, y: number) => ({ x, y, side: Position.Right });
const left = (x: number, y: number) => ({ x, y, side: Position.Left });

describe('squaredPath', () => {
  it('draws a straight horizontal when both ends share a y and there is no lane', () => {
    const p = squaredPath(right(0, 50), left(200, 50));
    expect(p.points).toEqual([{ x: 0, y: 50 }, { x: 200, y: 50 }]);
    expect(p.labelAngle).toBe(0);
  });

  it('runs out, down the lane, and in again when a lane is given', () => {
    const p = squaredPath(right(0, 20), left(200, 180), 100);
    expect(p.points).toEqual([
      { x: 0, y: 20 }, { x: 100, y: 20 }, { x: 100, y: 180 }, { x: 200, y: 180 },
    ]);
  });

  it('rides the lane with a rotated label centred on the vertical run', () => {
    const p = squaredPath(right(0, 20), left(200, 180), 100);
    expect(p.labelAngle).toBe(-90);
    expect(p.labelX).toBe(100);
    expect(p.labelY).toBe(100);
  });

  it('labels a lane-less path horizontally at the midpoint of its longest segment', () => {
    const p = squaredPath(right(0, 50), left(300, 50));
    expect(p.labelAngle).toBe(0);
    expect(p.labelX).toBe(150);
    expect(p.labelY).toBe(50);
  });

  it('emits a path string that starts at the source and contains rounded corners', () => {
    const p = squaredPath(right(0, 20), left(200, 180), 100);
    expect(p.d.startsWith('M 0,20')).toBe(true);
    expect(p.d).toContain('Q');
  });

  it('leaves top/bottom anchors vertical-first', () => {
    const p = squaredPath({ x: 50, y: 0, side: Position.Bottom }, { x: 150, y: 200, side: Position.Top });
    expect(p.points).toEqual([
      { x: 50, y: 0 }, { x: 50, y: 100 }, { x: 150, y: 100 }, { x: 150, y: 200 },
    ]);
  });
});

describe('curvedPath', () => {
  it('emits a cubic bezier between the two anchors', () => {
    const p = curvedPath(right(0, 20), left(200, 180));
    expect(p.d.startsWith('M 0,20')).toBe(true);
    expect(p.d).toContain('C');
  });

  it('never rotates its label, since it has no lane to ride', () => {
    expect(curvedPath(right(0, 20), left(200, 180)).labelAngle).toBe(0);
  });

  it('reports the chord as its polyline, for the crossing metric', () => {
    expect(curvedPath(right(0, 20), left(200, 180)).points)
      .toEqual([{ x: 0, y: 20 }, { x: 200, y: 180 }]);
  });
});

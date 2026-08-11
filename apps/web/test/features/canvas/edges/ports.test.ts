import { describe, it, expect } from 'vitest';
import { Position } from '@xyflow/react';
import { PORT_PITCH, portCount, portPoint, chooseSides } from '@/features/canvas/edges/ports';

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

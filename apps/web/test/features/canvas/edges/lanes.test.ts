import { describe, it, expect } from 'vitest';
import { assignLanes, laneSlots, gutterWidth, laneX, LANE_PITCH, LANE_MARGIN } from '@/features/canvas/edges/lanes';

describe('assignLanes', () => {
  it('gives disjoint spans the SAME lane — density, not edge count, drives width', () => {
    const a = assignLanes([
      { id: 'a', y0: 0, y1: 100 },
      { id: 'b', y0: 200, y1: 300 },
      { id: 'c', y0: 400, y1: 500 },
    ]);
    expect(a).toEqual({ a: 0, b: 0, c: 0 });
    expect(laneSlots(a)).toBe(1);
  });

  it('gives overlapping spans different lanes', () => {
    const a = assignLanes([
      { id: 'a', y0: 0, y1: 300 },
      { id: 'b', y0: 100, y1: 400 },
      { id: 'c', y0: 200, y1: 500 },
    ]);
    expect(new Set(Object.values(a)).size).toBe(3);
    expect(laneSlots(a)).toBe(3);
  });

  it('uses exactly as many lanes as the peak overlap, not the edge count', () => {
    // Two overlap at a time, six spans total.
    const a = assignLanes([
      { id: 'a', y0: 0, y1: 100 }, { id: 'b', y0: 50, y1: 150 },
      { id: 'c', y0: 200, y1: 300 }, { id: 'd', y0: 250, y1: 350 },
      { id: 'e', y0: 400, y1: 500 }, { id: 'f', y0: 450, y1: 550 },
    ]);
    expect(laneSlots(a)).toBe(2);
  });

  it('is deterministic regardless of input order', () => {
    const spans = [
      { id: 'a', y0: 0, y1: 300 },
      { id: 'b', y0: 100, y1: 400 },
      { id: 'c', y0: 500, y1: 600 },
    ];
    expect(assignLanes([...spans].reverse())).toEqual(assignLanes(spans));
  });

  it('normalises an inverted span rather than dropping it', () => {
    const a = assignLanes([{ id: 'a', y0: 400, y1: 100 }, { id: 'b', y0: 200, y1: 300 }]);
    expect(new Set(Object.values(a)).size).toBe(2);
  });

  it('returns an empty map for no spans', () => {
    expect(assignLanes([])).toEqual({});
    expect(laneSlots({})).toBe(0);
  });
});

describe('gutterWidth', () => {
  it('never drops below the historical 120px COL_GAP', () => {
    expect(gutterWidth(0)).toBe(120);
    expect(gutterWidth(1)).toBe(120);
  });

  it('grows to fit the lanes once they need more than the floor', () => {
    expect(gutterWidth(20)).toBe(20 * LANE_PITCH + 2 * LANE_MARGIN);
  });
});

describe('laneX', () => {
  it('places lane 0 one margin in from the gutter edge and steps by LANE_PITCH', () => {
    expect(laneX(1000, 0)).toBe(1000 + LANE_MARGIN);
    expect(laneX(1000, 2)).toBe(1000 + LANE_MARGIN + 2 * LANE_PITCH);
  });
});

import { describe, it, expect } from 'vitest';
import { countCrossings } from './crossings';

describe('countCrossings', () => {
  it('counts a single X as one crossing', () => {
    expect(countCrossings([
      [{ x: 0, y: 0 }, { x: 10, y: 10 }],
      [{ x: 0, y: 10 }, { x: 10, y: 0 }],
    ])).toBe(1);
  });

  it('does not count parallel polylines', () => {
    expect(countCrossings([
      [{ x: 0, y: 0 }, { x: 10, y: 0 }],
      [{ x: 0, y: 5 }, { x: 10, y: 5 }],
    ])).toBe(0);
  });

  it('does not count segments that only share an endpoint', () => {
    expect(countCrossings([
      [{ x: 0, y: 0 }, { x: 5, y: 5 }],
      [{ x: 5, y: 5 }, { x: 10, y: 0 }],
    ])).toBe(0);
  });

  it('counts each crossing pair once for multi-segment polylines', () => {
    expect(countCrossings([
      [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 10 }],
      [{ x: 0, y: 5 }, { x: 10, y: 5 }],
    ])).toBe(1);
  });
});

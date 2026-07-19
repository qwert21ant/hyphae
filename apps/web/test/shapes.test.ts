import { describe, it, expect } from 'vitest';
import { shapeStyle, SHAPE_LABEL } from '../src/shapes';
import { c4Backend } from '@hyphae/schema';

describe('shapeStyle', () => {
  it('returns a distinct style for every shape the profile can name', () => {
    const shapes = [...new Set(c4Backend.roles.map((r) => r.shape))];
    const seen = new Set<string>();
    for (const s of shapes) {
      const style = JSON.stringify(shapeStyle(s));
      expect(style, `${s} produced an empty style`).not.toBe('{}');
      expect(seen.has(style), `${s} is visually identical to another shape`).toBe(false);
      seen.add(style);
    }
  });

  it('gives the cylinder rounded ends and the hexagon a clip path', () => {
    expect(shapeStyle('cylinder').borderRadius).toBeTruthy();
    expect(shapeStyle('hexagon').clipPath).toBeTruthy();
  });

  it('names every shape for the legend', () => {
    for (const r of c4Backend.roles) expect(SHAPE_LABEL[r.shape]).toMatch(/\S/);
  });
});

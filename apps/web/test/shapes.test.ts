import { describe, it, expect } from 'vitest';
import { shapeGeometry, shapePadding, SHAPE_LABEL } from '../src/shapes';
import { c4Backend, type Shape } from '@hyphae/schema';

const SHAPES = [...new Set(c4Backend.roles.map((r) => r.shape))] as Shape[];
const W = 220;
const H = 92;
const S = 1.5;

describe('shapeGeometry', () => {
  it('draws every shape the profile can name, and no two the same', () => {
    // Distinctness is over the whole drawing, not the outline alone: a UI surface is a plain box
    // plus its title band, which is a real visual difference even though the outline matches.
    const seen = new Map<string, Shape>();
    for (const s of SHAPES) {
      const g = shapeGeometry(s, W, H, S);
      expect(g.outline, `${s} produced an empty outline`).toMatch(/\S/);
      const key = JSON.stringify([g.outline, g.details, g.band]);
      const prev = seen.get(key);
      expect(prev, `${s} is drawn identically to ${prev}`).toBeUndefined();
      seen.set(key, s);
    }
  });

  it('insets every outline by half the stroke, so no edge of the border is clipped', () => {
    // This is the hexagon bug: a CSS clip-path cut the border off the diagonal edges. Drawing the
    // outline inside the box by half a stroke width keeps the whole border painted.
    for (const s of SHAPES) {
      const { bbox } = shapeGeometry(s, W, H, S);
      expect(bbox.x0, s).toBeGreaterThanOrEqual(S / 2);
      expect(bbox.y0, s).toBeGreaterThanOrEqual(S / 2);
      expect(bbox.x1, s).toBeLessThanOrEqual(W - S / 2);
      expect(bbox.y1, s).toBeLessThanOrEqual(H - S / 2);
    }
  });

  it('fills the box it is given rather than shrinking away from it', () => {
    // The rectangular div IS the node as far as floating edges are concerned (they anchor to its
    // box), so a drawn outline that pulled well inside it would break that illusion.
    for (const s of SHAPES) {
      const { bbox } = shapeGeometry(s, W, H, S);
      expect(bbox.x1 - bbox.x0, s).toBeGreaterThan(W * 0.9);
      expect(bbox.y1 - bbox.y0, s).toBeGreaterThan(H * 0.9);
    }
  });

  it('scales to any box, so the legend swatch and the canvas node share one geometry', () => {
    for (const s of SHAPES) {
      const small = shapeGeometry(s, 16, 14, 1);
      expect(small.outline, s).toMatch(/\S/);
      expect(small.bbox.x1, s).toBeLessThanOrEqual(16 - 0.5);
      expect(small.bbox.y1, s).toBeLessThanOrEqual(14 - 0.5);
      expect(Number.isFinite(small.bbox.x1), s).toBe(true);
    }
  });

  it('gives the hexagon six corners', () => {
    const g = shapeGeometry('hexagon', W, H, S);
    expect((g.outline.match(/L/g) ?? []).length).toBe(5); // 6 points = 5 line segments + close
    expect(g.outline).toMatch(/Z\s*$/);
  });

  it('gives the cylinder a front rim and the queue its two end caps as detail strokes', () => {
    expect(shapeGeometry('cylinder', W, H, S).details.length).toBeGreaterThan(0);
    expect(shapeGeometry('bar', W, H, S).details.length).toBe(2);
  });

  it('gives the titled rectangle a filled title band, and nothing else one', () => {
    expect(shapeGeometry('titled-rectangle', W, H, S).band).toMatch(/\S/);
    for (const s of SHAPES.filter((x) => x !== 'titled-rectangle')) {
      expect(shapeGeometry(s, W, H, S).band, s).toBeUndefined();
    }
  });

  it('keeps the content box clear of a cylinder rim that dips into the box', () => {
    // The front rim is an arc bulging DOWN from the top cap, so it reaches 2*ry into the box —
    // straight through the node title unless the text starts below it.
    const g = shapeGeometry('cylinder', W, H, S);
    const ry = Number(g.outline.match(/A[\d.]+ ([\d.]+)/)![1]);
    expect(g.content.y0).toBeGreaterThanOrEqual(2 * ry);
  });

  it('keeps every content box inside the drawn outline', () => {
    for (const s of SHAPES) {
      const { content, bbox } = shapeGeometry(s, W, H, S);
      expect(content.x0, s).toBeGreaterThanOrEqual(bbox.x0);
      expect(content.y0, s).toBeGreaterThanOrEqual(bbox.y0);
      expect(content.x1, s).toBeLessThanOrEqual(bbox.x1);
      expect(content.y1, s).toBeLessThanOrEqual(bbox.y1);
    }
  });

  it('leaves room for a name, two summary lines and a tech chip on every shape', () => {
    // NodeBox types at 12/10/9px with line-height 1.25 and two 2px gaps; shapePadding adds a 6px
    // breather top and bottom. A shape whose chrome eats more than this clips the tech chip.
    const needed = 12 * 1.25 + 2 * (10 * 1.25) + 9 * 1.25 + 2 * 2 + 2 * 6;
    for (const s of SHAPES) {
      const { content } = shapeGeometry(s, W, H, S);
      expect(content.y1 - content.y0, s).toBeGreaterThanOrEqual(needed);
    }
  });

  it('leaves a usable text width on every shape', () => {
    // A shape that bought vertical room by pinching the box horizontally would just move the
    // truncation from the tech chip to the node's name.
    for (const s of SHAPES) {
      const { content } = shapeGeometry(s, W, H, S);
      expect(content.x1 - content.x0, s).toBeGreaterThanOrEqual(W * 0.75);
    }
  });

  it('emits no NaN in any path', () => {
    for (const s of SHAPES) {
      const g = shapeGeometry(s, W, H, S);
      const all = [g.outline, ...g.details, g.band ?? ''].join(' ');
      expect(all, s).not.toMatch(/NaN|Infinity|undefined/);
    }
  });
});

describe('shapePadding', () => {
  it('pads content clear of a hexagon\'s notch and a person\'s dome', () => {
    // Text centred in the raw box would spill outside the drawn outline on these shapes.
    const plain = shapePadding('rectangle', W, H);
    expect(shapePadding('hexagon', W, H)).not.toBe(plain);
    expect(shapePadding('person', W, H)).not.toBe(plain);
  });

  it('returns a usable CSS padding string for every shape', () => {
    for (const s of SHAPES) expect(shapePadding(s, W, H), s).toMatch(/^[\d.]+px( [\d.]+px)*$/);
  });
});

describe('SHAPE_LABEL', () => {
  it('names every shape for the legend', () => {
    for (const r of c4Backend.roles) expect(SHAPE_LABEL[r.shape]).toMatch(/\S/);
  });
});

import type { Shape } from '@hyphae/schema';

/**
 * Geometry for a profile-declared shape name. The profile names the shape; this module owns how it
 * draws. Keyed by shape — never by role id or node type — so a new profile with a different role
 * vocabulary renders without touching the web app.
 *
 * Drawn as SVG paths sized to the box, NOT as CSS on the node div, because CSS could not express
 * these shapes honestly: `border-radius` in percent distorts with the box's aspect ratio (so a wide
 * canvas node and a near-square legend swatch disagreed), and `clip-path` clips the border away on
 * any diagonal edge (the hexagon had no visible outline on its slanted sides). Paths are inset by
 * half the stroke width so every edge of the border is painted inside the box.
 *
 * The node div keeps its plain NODE_W x NODE_H box: floating-edge anchoring (`floating.ts` boxOf)
 * and the invisible side handles are unaffected by what is drawn inside it.
 */

export type ShapeGeom = {
  /** Closed outline: filled with the node background, stroked with the border colour. */
  outline: string;
  /** Extra stroked-only detail (a cylinder's front rim, a queue's end caps). */
  details: string[];
  /** Extra filled-in-the-border-colour detail (a UI surface's title bar). */
  band?: string;
  /** Extents the outline actually occupies, for layout and for tests. */
  bbox: { x0: number; y0: number; x1: number; y1: number };
  /**
   * The rectangle text may safely occupy: inside the outline AND clear of any detail that intrudes
   * into the box (a cylinder's front rim dips 2*ry down from the top, a hexagon's notch bites into
   * both sides). `shapePadding` is derived from this, so a shape can never be given chrome the text
   * layout does not know about.
   */
  content: { x0: number; y0: number; x1: number; y1: number };
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Rounded-rectangle path. `r` is clamped so it can never exceed half the shorter side. */
function roundedRect(x0: number, y0: number, x1: number, y1: number, r: number): string {
  const rr = r2(Math.max(0, Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2)));
  const [a, b, c, d] = [r2(x0), r2(y0), r2(x1), r2(y1)];
  if (!rr) return `M${a} ${b}L${c} ${b}L${c} ${d}L${a} ${d}Z`;
  return `M${a + rr} ${b}L${c - rr} ${b}Q${c} ${b} ${c} ${b + rr}L${c} ${d - rr}Q${c} ${d} ${c - rr} ${d}L${a + rr} ${d}Q${a} ${d} ${a} ${d - rr}L${a} ${b + rr}Q${a} ${b} ${a + rr} ${b}Z`;
}

export function shapeGeometry(shape: Shape, w: number, h: number, stroke = 1): ShapeGeom {
  const i = stroke / 2;                 // inset so the stroke lands fully inside the box
  const x0 = i, y0 = i, x1 = w - i, y1 = h - i;
  const iw = x1 - x0, ih = y1 - y0;
  const cx = r2((x0 + x1) / 2), cy = r2((y0 + y1) / 2);
  const bbox = { x0, y0, x1, y1 };

  switch (shape) {
    case 'person': {
      // A domed "head" over a flat-bottomed body — a box a name still fits inside, unlike a
      // stick figure. The dome is an elliptical arc, so it stays a dome at any aspect ratio.
      // Text starts below the dome's chord, where the shape reaches full width.
      const dome = r2(Math.min(ih * 0.42, 26));
      const r = r2(Math.min(8, ih / 5));
      // Text rises halfway INTO the dome instead of starting below its chord, so the node does not
      // read as top-heavy. At half the dome's height the ellipse is still ~87% of full width, and
      // the content width is taken from the ellipse at exactly that height — so a long name cannot
      // poke outside the silhouette even though it sits higher.
      const RISE = 0.5;
      const halfW = r2((iw / 2) * Math.sqrt(1 - RISE ** 2));
      return {
        outline:
          `M${r2(x0)} ${r2(y0 + dome)}A${r2(iw / 2)} ${dome} 0 0 1 ${r2(x1)} ${r2(y0 + dome)}`
          + `L${r2(x1)} ${r2(y1 - r)}Q${r2(x1)} ${r2(y1)} ${r2(x1 - r)} ${r2(y1)}`
          + `L${r2(x0 + r)} ${r2(y1)}Q${r2(x0)} ${r2(y1)} ${r2(x0)} ${r2(y1 - r)}Z`,
        details: [],
        bbox,
        content: { x0: r2(cx - halfW), y0: r2(y0 + dome * RISE), x1: r2(cx + halfW), y1 },
      };
    }
    case 'cylinder': {
      // Classic datastore: an elliptical cap top and bottom. `details` adds the front half of the
      // top rim, which is what actually reads as "cylinder" rather than "rounded box".
      // The rim bulges DOWN to y0 + 2*ry, so the cap is kept shallow and the content starts under
      // it — otherwise the rim draws straight through the node's title.
      const ry = r2(Math.min(ih * 0.08, 7));
      return {
        outline:
          `M${r2(x0)} ${r2(y0 + ry)}A${r2(iw / 2)} ${ry} 0 0 1 ${r2(x1)} ${r2(y0 + ry)}`
          + `L${r2(x1)} ${r2(y1 - ry)}A${r2(iw / 2)} ${ry} 0 0 1 ${r2(x0)} ${r2(y1 - ry)}Z`,
        details: [`M${r2(x0)} ${r2(y0 + ry)}A${r2(iw / 2)} ${ry} 0 0 0 ${r2(x1)} ${r2(y0 + ry)}`],
        bbox,
        content: { x0, y0: r2(y0 + 2 * ry), x1, y1: r2(y1 - ry) },
      };
    }
    case 'bar': {
      // A queue: an open-ended bar, marked by a heavy vertical cap near each end.
      const cap = r2(Math.min(iw * 0.06, 10));
      return {
        outline: roundedRect(x0, y0, x1, y1, 0),
        details: [
          `M${r2(x0 + cap)} ${r2(y0)}L${r2(x0 + cap)} ${r2(y1)}`,
          `M${r2(x1 - cap)} ${r2(y0)}L${r2(x1 - cap)} ${r2(y1)}`,
        ],
        bbox,
        content: { x0: r2(x0 + cap), y0, x1: r2(x1 - cap), y1 },
      };
    }
    case 'hexagon': {
      // An external system. Every edge including the two diagonals carries the stroke, which is
      // exactly what the old clip-path could not do.
      const n = r2(Math.min(iw * 0.09, 20));
      return {
        outline:
          `M${r2(x0 + n)} ${r2(y0)}L${r2(x1 - n)} ${r2(y0)}L${r2(x1)} ${cy}`
          + `L${r2(x1 - n)} ${r2(y1)}L${r2(x0 + n)} ${r2(y1)}L${r2(x0)} ${cy}Z`,
        details: [],
        bbox,
        content: { x0: r2(x0 + n), y0, x1: r2(x1 - n), y1 },
      };
    }
    case 'titled-rectangle': {
      // A UI surface: a window with a title bar, filled in the border colour.
      const t = r2(Math.min(ih * 0.18, 14));
      const r = 4;
      return {
        outline: roundedRect(x0, y0, x1, y1, r),
        details: [`M${r2(x0)} ${r2(y0 + t)}L${r2(x1)} ${r2(y0 + t)}`],
        band:
          `M${r2(x0 + r)} ${r2(y0)}L${r2(x1 - r)} ${r2(y0)}Q${r2(x1)} ${r2(y0)} ${r2(x1)} ${r2(y0 + r)}`
          + `L${r2(x1)} ${r2(y0 + t)}L${r2(x0)} ${r2(y0 + t)}L${r2(x0)} ${r2(y0 + r)}`
          + `Q${r2(x0)} ${r2(y0)} ${r2(x0 + r)} ${r2(y0)}Z`,
        bbox,
        content: { x0, y0: r2(y0 + t), x1, y1 },
      };
    }
    case 'rectangle':
    default:
      return { outline: roundedRect(x0, y0, x1, y1, 4), details: [], bbox, content: { x0, y0, x1, y1 } };
  }
}

const GAP_X = 10;
const GAP_Y = 6;

/**
 * CSS padding keeping a node's text inside the shape's content box, plus a small breather. Derived
 * from the geometry rather than hand-maintained, so adding chrome to a shape moves the text out of
 * its way automatically.
 */
export function shapePadding(shape: Shape, w: number, h: number): string {
  const { content } = shapeGeometry(shape, w, h, 1);
  const top = r2(content.y0 + GAP_Y);
  const right = r2(w - content.x1 + GAP_X);
  const bottom = r2(h - content.y1 + GAP_Y);
  const left = r2(content.x0 + GAP_X);
  return `${top}px ${right}px ${bottom}px ${left}px`;
}

/** Human-readable shape names for the legend. */
export const SHAPE_LABEL: Record<Shape, string> = {
  rectangle: 'service',
  person: 'actor',
  cylinder: 'datastore',
  bar: 'queue',
  hexagon: 'external system',
  'titled-rectangle': 'UI surface',
};

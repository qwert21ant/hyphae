import type { XY } from '@/features/canvas/layout';

type Seg = { a: XY; b: XY };

const orient = (p: XY, q: XY, r: XY): number => {
  const v = (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return Math.abs(v) < 1e-9 ? 0 : Math.sign(v);
};

/** Proper intersection only: shared endpoints and collinear overlap do not count. Two edges that
 *  meet at a node port touch by design, and counting that would swamp the real signal. */
function crosses(s: Seg, t: Seg): boolean {
  const shared = [s.a, s.b].some((p) => [t.a, t.b].some((q) => p.x === q.x && p.y === q.y));
  if (shared) return false;
  const d1 = orient(s.a, s.b, t.a);
  const d2 = orient(s.a, s.b, t.b);
  const d3 = orient(t.a, t.b, s.a);
  const d4 = orient(t.a, t.b, s.b);
  return d1 !== d2 && d3 !== d4 && d1 !== 0 && d2 !== 0 && d3 !== 0 && d4 !== 0;
}

/** Number of proper intersections between segments belonging to DIFFERENT polylines. */
export function countCrossings(polylines: XY[][]): number {
  const perLine: Seg[][] = polylines.map((pts) => {
    const segs: Seg[] = [];
    for (let i = 1; i < pts.length; i++) segs.push({ a: pts[i - 1], b: pts[i] });
    return segs;
  });
  let n = 0;
  for (let i = 0; i < perLine.length; i++) {
    for (let j = i + 1; j < perLine.length; j++) {
      for (const s of perLine[i]) for (const t of perLine[j]) if (crosses(s, t)) n++;
    }
  }
  return n;
}

/** Horizontal distance between two adjacent lanes. Must clear a rotated label's LINE HEIGHT (~13px),
 *  not its text width — a label riding a lane is turned 90°, so its width runs down the lane. */
export const LANE_PITCH = 18;
/** Clearance between the outermost lane and each side of the gutter. */
export const LANE_MARGIN = 12;
/** The gutter never shrinks below the COL_GAP the layout used before lanes existed. */
const GUTTER_FLOOR = 120;

/** The vertical extent of one edge's run through a gutter. */
export type Span = { id: string; y0: number; y1: number };

/**
 * Assign each span a lane, sharing a lane between spans that cannot collide.
 *
 * This is left-edge channel routing: sort by the top of the span, then give each span the lowest
 * lane whose previous occupant already ended above it. The number of lanes is therefore the
 * channel DENSITY — the peak number of simultaneously open spans — not the number of edges. That
 * distinction is what makes lanes affordable at all: Process Layer sends 39 edges across its left
 * gutter, but only 25 are ever open at the same height.
 *
 * Sorting breaks ties on y1 and then id so the result is independent of input order, which matters
 * because a memoized view must not reshuffle lanes when nothing meaningful changed.
 */
export function assignLanes(spans: Span[]): Record<string, number> {
  const norm = spans.map((s) => ({ id: s.id, y0: Math.min(s.y0, s.y1), y1: Math.max(s.y0, s.y1) }));
  norm.sort((a, b) => a.y0 - b.y0 || a.y1 - b.y1 || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const laneEnd: number[] = [];   // laneEnd[i] = y1 of the last span placed in lane i
  const out: Record<string, number> = {};
  for (const s of norm) {
    let lane = laneEnd.findIndex((end) => end < s.y0);
    if (lane === -1) { lane = laneEnd.length; laneEnd.push(s.y1); }
    else laneEnd[lane] = s.y1;
    out[s.id] = lane;
  }
  return out;
}

/** How many distinct lanes an assignment occupies. */
export function laneSlots(assign: Record<string, number>): number {
  const vals = Object.values(assign);
  return vals.length ? Math.max(...vals) + 1 : 0;
}

/** How wide a gutter must be to hold `lanes` lanes, floored at the historical COL_GAP. */
export function gutterWidth(lanes: number): number {
  return Math.max(GUTTER_FLOOR, lanes * LANE_PITCH + 2 * LANE_MARGIN);
}

/** The absolute x of a lane, measured from the gutter's left edge. */
export function laneX(gutterLeft: number, lane: number): number {
  return gutterLeft + LANE_MARGIN + lane * LANE_PITCH;
}

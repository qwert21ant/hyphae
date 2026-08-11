import { Position } from '@xyflow/react';
import type { XY } from '@/features/canvas/layout';

export type Anchor = { x: number; y: number; side: Position };

export type DrawnPath = {
  d: string;
  labelX: number;
  labelY: number;
  /** -90 when the label rides a vertical lane, 0 otherwise. */
  labelAngle: number;
  /** The path as a polyline. The crossing metric measures this, so it must not be a decoration. */
  points: XY[];
};

const CORNER = 8;
const isVertical = (s: Position) => s === Position.Top || s === Position.Bottom;

/** `d` for a polyline with rounded corners: straight runs joined by quadratic elbows. */
function roundedD(pts: XY[]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1]; const cur = pts[i]; const next = pts[i + 1];
    const inLen = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    const outLen = Math.hypot(next.x - cur.x, next.y - cur.y);
    const r = Math.min(CORNER, inLen / 2, outLen / 2);
    if (r <= 0) { d += ` L ${cur.x},${cur.y}`; continue; }
    const a = { x: cur.x + ((prev.x - cur.x) / inLen) * r, y: cur.y + ((prev.y - cur.y) / inLen) * r };
    const b = { x: cur.x + ((next.x - cur.x) / outLen) * r, y: cur.y + ((next.y - cur.y) / outLen) * r };
    d += ` L ${a.x},${a.y} Q ${cur.x},${cur.y} ${b.x},${b.y}`;
  }
  const last = pts[pts.length - 1];
  return `${d} L ${last.x},${last.y}`;
}

/** Midpoint of the longest segment in a polyline — the only place a horizontal label reliably fits. */
function longestSegmentMid(pts: XY[]): XY {
  let best = { x: pts[0].x, y: pts[0].y };
  let bestLen = -1;
  for (let i = 1; i < pts.length; i++) {
    const len = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (len > bestLen) {
      bestLen = len;
      best = { x: (pts[i].x + pts[i - 1].x) / 2, y: (pts[i].y + pts[i - 1].y) / 2 };
    }
  }
  return best;
}

/**
 * Orthogonal route. With a lane, three runs: out of the source, down the lane, into the target —
 * and the label turns 90° to ride the lane. Without one, either a straight line (ends already
 * aligned) or a single dogleg at the midpoint.
 */
export function squaredPath(s: Anchor, t: Anchor, lane?: number): DrawnPath {
  const vertical = isVertical(s.side);
  let points: XY[];
  let labelAngle = 0;
  let label: XY;

  if (lane !== undefined && !vertical) {
    points = [{ x: s.x, y: s.y }, { x: lane, y: s.y }, { x: lane, y: t.y }, { x: t.x, y: t.y }];
    labelAngle = -90;
    label = { x: lane, y: (s.y + t.y) / 2 };
  } else if (vertical) {
    const midY = (s.y + t.y) / 2;
    points = s.x === t.x
      ? [{ x: s.x, y: s.y }, { x: t.x, y: t.y }]
      : [{ x: s.x, y: s.y }, { x: s.x, y: midY }, { x: t.x, y: midY }, { x: t.x, y: t.y }];
    label = longestSegmentMid(points);
  } else {
    const midX = (s.x + t.x) / 2;
    points = s.y === t.y
      ? [{ x: s.x, y: s.y }, { x: t.x, y: t.y }]
      : [{ x: s.x, y: s.y }, { x: midX, y: s.y }, { x: midX, y: t.y }, { x: t.x, y: t.y }];
    label = longestSegmentMid(points);
  }

  return { d: roundedD(points), labelX: label.x, labelY: label.y, labelAngle, points };
}

/** Bezier leaving and arriving perpendicular to the anchor faces. Ignores lanes by design. */
export function curvedPath(s: Anchor, t: Anchor): DrawnPath {
  const reach = Math.max(40, Math.abs(t.x - s.x) / 2, Math.abs(t.y - s.y) / 2);
  const off = (a: Anchor): XY => {
    switch (a.side) {
      case Position.Left:  return { x: a.x - reach, y: a.y };
      case Position.Right: return { x: a.x + reach, y: a.y };
      case Position.Top:   return { x: a.x, y: a.y - reach };
      default:             return { x: a.x, y: a.y + reach };
    }
  };
  const c1 = off(s);
  const c2 = off(t);
  return {
    d: `M ${s.x},${s.y} C ${c1.x},${c1.y} ${c2.x},${c2.y} ${t.x},${t.y}`,
    labelX: (s.x + t.x) / 2,
    labelY: (s.y + t.y) / 2,
    labelAngle: 0,
    points: [{ x: s.x, y: s.y }, { x: t.x, y: t.y }],
  };
}

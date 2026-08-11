import { Position } from '@xyflow/react';
import type { Box } from './floating';

export type { Box };

/**
 * MINIMUM spacing between two ports on the same side. The real pitch is `side / portCount(side)`,
 * which is always >= this — ports fill the side rather than clustering at its centre, because the
 * whole point is to keep arriving edges apart.
 */
export const PORT_PITCH = 24;

/** How many ports a side of the given length carries. Never zero: a tiny node still needs one. */
export function portCount(sideLength: number): number {
  return Math.max(1, Math.floor(sideLength / PORT_PITCH));
}

/** The `index`-th of `count` ports on `side`, at (index + 0.5) / count along it. */
export function portPoint(box: Box, side: Position, index: number, count: number): { x: number; y: number } {
  const n = Math.max(1, count);
  const i = Math.min(n - 1, Math.max(0, index));
  const t = (i + 0.5) / n;
  switch (side) {
    case Position.Left:   return { x: box.x, y: box.y + box.height * t };
    case Position.Right:  return { x: box.x + box.width, y: box.y + box.height * t };
    case Position.Top:    return { x: box.x + box.width * t, y: box.y };
    default:              return { x: box.x + box.width * t, y: box.y + box.height };
  }
}

export type NodeKind = 'child' | 'external';

/**
 * Which face each end uses. Rule-based rather than nearest-point, because a nearest-point anchor
 * gives every edge a different exit angle and that is what makes shallow crossings unreadable.
 *
 * - An external always uses the face pointing at the cluster, and the child answers on the
 *   opposite face — that is what gives the diagram its left-to-right grain.
 * - Two children use top/bottom, matching dagre's TB rank direction, unless they share a rank
 *   (comparable y), in which case left/right reads better than a U-turn.
 */
export function chooseSides(
  source: Box, target: Box, sourceKind: NodeKind, targetKind: NodeKind,
): { sourceSide: Position; targetSide: Position } {
  const dx = (target.x + target.width / 2) - (source.x + source.width / 2);
  const dy = (target.y + target.height / 2) - (source.y + source.height / 2);
  const horizontal = (): { sourceSide: Position; targetSide: Position } =>
    dx >= 0
      ? { sourceSide: Position.Right, targetSide: Position.Left }
      : { sourceSide: Position.Left, targetSide: Position.Right };

  if (sourceKind === 'external' || targetKind === 'external') return horizontal();
  if (Math.abs(dy) <= source.height) return horizontal();
  return dy >= 0
    ? { sourceSide: Position.Bottom, targetSide: Position.Top }
    : { sourceSide: Position.Top, targetSide: Position.Bottom };
}

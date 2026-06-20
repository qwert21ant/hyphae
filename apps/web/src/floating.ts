import { Position, type InternalNode } from '@xyflow/react';

export type Box = { x: number; y: number; width: number; height: number };

/** Point where the line from `node`'s center toward `other`'s center crosses `node`'s border. */
function intersection(node: Box, other: Box): { x: number; y: number } {
  const w = node.width / 2;
  const h = node.height / 2;
  const x2 = node.x + w;
  const y2 = node.y + h;
  const x1 = other.x + other.width / 2;
  const y1 = other.y + other.height / 2;
  const xx1 = (x1 - x2) / (2 * w) - (y1 - y2) / (2 * h);
  const yy1 = (x1 - x2) / (2 * w) + (y1 - y2) / (2 * h);
  const a = 1 / (Math.abs(xx1) + Math.abs(yy1) || 1);
  const xx3 = a * xx1;
  const yy3 = a * yy1;
  return { x: w * (xx3 + yy3) + x2, y: h * (-xx3 + yy3) + y2 };
}

/** Which side of `node` the point sits on. */
function side(node: Box, p: { x: number; y: number }): Position {
  const px = Math.round(p.x);
  const py = Math.round(p.y);
  if (px <= Math.round(node.x) + 1) return Position.Left;
  if (px >= Math.round(node.x + node.width) - 1) return Position.Right;
  if (py <= Math.round(node.y) + 1) return Position.Top;
  return Position.Bottom;
}

export type EdgeParams = { sx: number; sy: number; tx: number; ty: number; sourcePos: Position; targetPos: Position };

/** Endpoints + sides for a floating edge: each attaches to the border point nearest the other node. */
export function getEdgeParams(source: Box, target: Box): EdgeParams {
  const sp = intersection(source, target);
  const tp = intersection(target, source);
  return { sx: sp.x, sy: sp.y, tx: tp.x, ty: tp.y, sourcePos: side(source, sp), targetPos: side(target, tp) };
}

/** Absolute bounding box of a React Flow internal node. */
export function boxOf(n: InternalNode): Box {
  return {
    x: n.internals.positionAbsolute.x,
    y: n.internals.positionAbsolute.y,
    width: n.measured?.width ?? 0,
    height: n.measured?.height ?? 0,
  };
}

import { getBezierPath, type ConnectionLineComponentProps } from '@xyflow/react';
import { getEdgeParams, boxOf, type Box } from './floating';

/** Drag preview while creating a connection: starts from the nearest border point of the source node. */
export function FloatingConnectionLine({ toX, toY, fromNode }: ConnectionLineComponentProps) {
  if (!fromNode) return null;
  const target: Box = { x: toX, y: toY, width: 1, height: 1 };
  const { sx, sy, sourcePos, targetPos } = getEdgeParams(boxOf(fromNode), target);
  const [path] = getBezierPath({
    sourceX: sx, sourceY: sy, sourcePosition: sourcePos,
    targetX: toX, targetY: toY, targetPosition: targetPos,
  });
  return (
    <g>
      <path d={path} fill="none" stroke="#7c93b8" strokeWidth={1.5} strokeDasharray="4 3" />
      <circle cx={toX} cy={toY} r={3} fill="#7c93b8" stroke="#fff" />
    </g>
  );
}

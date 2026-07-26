import { BaseEdge, EdgeLabelRenderer, getBezierPath, useInternalNode, type EdgeProps } from '@xyflow/react';
import { getEdgeParams, fanEdgeParams, boxOf, EDGE_FAN_SPREAD } from './floating';

/** Class on the portaled edge label. Shared with Canvas's highlight CSS, which cannot reach the
 *  label through `.react-flow__edge` — the label renders outside the edge's <g>. */
export const EDGE_LABEL_CLASS = 'hyphae-edge-label';

/** Edge whose endpoints attach to the nearest point on each node's border (recomputed live). */
export function FloatingEdge({ id, source, target, style, markerEnd, markerStart, label, labelStyle, labelBgStyle, data }: EdgeProps) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  if (!sourceNode || !targetNode) return null;

  const { offsetIndex = 0, offsetCount = 1 } = (data ?? {}) as { offsetIndex?: number; offsetCount?: number };
  // The pair is grouped on id-sorted endpoints (see focusViewToFlow); an edge running the other way
  // must flip its offset, or its negated perpendicular cancels the shift and the two overlap.
  const { sx, sy, tx, ty, sourcePos, targetPos } = fanEdgeParams(
    getEdgeParams(boxOf(sourceNode), boxOf(targetNode)), offsetIndex, offsetCount,
    EDGE_FAN_SPREAD, source > target,
  );
  const [path, labelX, labelY] = getBezierPath({
    sourceX: sx, sourceY: sy, sourcePosition: sourcePos,
    targetX: tx, targetY: ty, targetPosition: targetPos,
  });

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} markerStart={markerStart} style={style} />
      {label != null && label !== '' && (
        <EdgeLabelRenderer>
          <div
            className={EDGE_LABEL_CLASS}
            data-edge-id={id}
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              fontSize: 11,
              padding: '1px 5px',
              borderRadius: 3,
              background: '#fff',
              color: '#444',
              pointerEvents: 'none',
              ...labelBgStyle,
              ...labelStyle,
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

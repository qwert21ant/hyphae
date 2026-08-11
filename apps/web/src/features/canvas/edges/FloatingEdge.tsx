import { BaseEdge, EdgeLabelRenderer, useInternalNode, type EdgeProps } from '@xyflow/react';
import { useStore } from '@/state/store';
import { boxOf, portPoint } from './ports';
import { squaredPath, curvedPath, type Anchor } from './paths';
import { fallbackRoute, type Route } from './routeEdges';

/** Class on the portaled edge label. Shared with Canvas's highlight CSS, which cannot reach the
 *  label through `.react-flow__edge` — the label renders outside the edge's <g>. */
export const EDGE_LABEL_CLASS = 'hyphae-edge-label';

/**
 * Resolves a precomputed Route against live geometry and draws it.
 *
 * The route is ASSIGNED once per view (routeEdges) and RESOLVED here every render. That is what
 * makes dragging read well: node positions only reach the store on drag stop, so the port and lane
 * stay fixed while these endpoints track the node every frame — the edge follows the box, and its
 * port snaps at the end rather than sliding along the border throughout.
 */
export function FloatingEdge({ id, source, target, style, markerEnd, markerStart, label, labelStyle, labelBgStyle, data }: EdgeProps) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const edgeStyle = useStore((s) => s.edgeStyle);
  if (!sourceNode || !targetNode) return null;

  const sBox = boxOf(sourceNode);
  const tBox = boxOf(targetNode);
  const route = ((data ?? {}) as { route?: Route }).route
    ?? fallbackRoute({ x: sBox.x, y: sBox.y }, { x: tBox.x, y: tBox.y });

  const s: Anchor = { ...portPoint(sBox, route.sourceSide, route.sourcePort, route.sourcePortCount), side: route.sourceSide };
  const t: Anchor = { ...portPoint(tBox, route.targetSide, route.targetPort, route.targetPortCount), side: route.targetSide };

  const drawn = edgeStyle === 'curved' ? curvedPath(s, t) : squaredPath(s, t, route.lane);

  return (
    <>
      <BaseEdge id={id} path={drawn.d} markerEnd={markerEnd} markerStart={markerStart} style={style} />
      {label != null && label !== '' && (
        <EdgeLabelRenderer>
          <div
            className={EDGE_LABEL_CLASS}
            data-edge-id={id}
            style={{
              position: 'absolute',
              // The rotation goes LAST so it turns the label about its own centre, after it has
              // been moved into place. A lane is 18px wide, which fits a rotated label's line
              // height but nothing like its text width.
              transform: `translate(-50%, -50%) translate(${drawn.labelX}px, ${drawn.labelY}px) rotate(${drawn.labelAngle}deg)`,
              fontSize: 11,
              padding: '1px 5px',
              borderRadius: 3,
              background: 'var(--surface-2)',
              color: 'var(--tx-2)',
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
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

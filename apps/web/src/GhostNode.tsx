import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useStore } from './store';
import type { NodeBoxData } from './NodeBox';
import { shapePadding } from './shapes';
import { NodeShape } from './NodeShape';
import { NODE_W, NODE_H, SUMMARY_LINES } from './layout';

// Invisible, non-interactive side handles kept only so floating edges can anchor to the node
// (React Flow drops edges whose endpoint exposes no handle). Connection-by-dragging is disabled,
// so the dots are hidden.
const sides: Array<{ id: string; position: Position }> = [
  { id: 't', position: Position.Top },
  { id: 'r', position: Position.Right },
  { id: 'b', position: Position.Bottom },
  { id: 'l', position: Position.Left },
];

export type GhostNodeData = NodeBoxData & { expandable?: boolean };

// A node borrowed from a higher layer (e.g. an ExternalSystem shown on the Container layer so its
// connection is visible). Tinted by its own C4 layer, but dashed + italic to read as "not native".
export function GhostNode({ id, data }: NodeProps) {
  const d = data as GhostNodeData;
  const color = d.color ?? { bg: 'var(--surface-2)', border: 'var(--rule)' };
  const toggle = useStore((s) => s.toggleExternal);
  const shape = d.shape ?? 'rectangle';
  // The dashed outline is stroked along the shape's own path, so it survives on every edge —
  // including a hexagon's diagonals, where a CSS border used to be clipped away. That is what the
  // old background hatch existed to compensate for; it is no longer needed.
  return (
    <div
      style={{
        position: 'relative',
        width: NODE_W,
        height: NODE_H,
        padding: shapePadding(shape, NODE_W, NODE_H),
        boxSizing: 'border-box',
        color: 'var(--tx-2)',
        fontSize: 12,
        lineHeight: 1.25,
        textAlign: 'center',
        fontStyle: 'italic',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 2,
        overflow: 'hidden',
      }}
    >
      <NodeShape shape={shape} w={NODE_W} h={NODE_H} bg={color.bg} border={color.border} stroke={1.5} dashed />
      {sides.map((s) => (
        <Handle key={s.id} id={s.id} type="source" position={s.position} style={{ opacity: 0, pointerEvents: 'none' }} />
      ))}
      {d.expandable && (
        <button
          onClick={(ev) => { ev.stopPropagation(); toggle(id); }}
          title="Expand connections"
          style={{ position: 'absolute', top: 2, right: 4, cursor: 'pointer', border: 'none', background: 'transparent', fontSize: 14, lineHeight: 1, padding: 0, fontStyle: 'normal' }}
        >＋</button>
      )}
      <div style={{ position: 'relative', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name ?? ''}</div>
      {d.summary && (
        // Same two-line clamp as NodeBox — a ghost is the same size box and should read the same.
        <div style={{
          position: 'relative',
          fontSize: 10, color: 'var(--tx-2)', overflow: 'hidden',
          display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: SUMMARY_LINES,
        }}>
          {d.summary}
        </div>
      )}
      {d.technology && (
        <div style={{ position: 'relative', fontSize: 9, color: 'var(--tx-2)', background: 'var(--chip)', borderRadius: 3, padding: '0 4px', alignSelf: 'center', maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {d.technology}
        </div>
      )}
    </div>
  );
}

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useStore } from './store';
import type { NodeBoxData } from './NodeBox';
import { shapeStyle } from './shapes';

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
  const color = d.color ?? { bg: '#f1f5f9', border: '#94a3b8' };
  const toggle = useStore((s) => s.toggleExternal);
  return (
    <div
      style={{
        position: 'relative',
        width: 190,
        height: 64,
        padding: '6px 10px',
        boxSizing: 'border-box',
        border: `1.5px dashed ${color.border}`,
        background: color.bg,
        color: '#475569',
        fontSize: 12,
        lineHeight: 1.25,
        textAlign: 'center',
        fontStyle: 'italic',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 2,
        overflow: 'hidden',
        ...shapeStyle(d.shape ?? 'rectangle'),
      }}
    >
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
      <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name ?? ''}</div>
      {d.summary && (
        <div style={{ fontSize: 10, color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {d.summary}
        </div>
      )}
      {d.technology && (
        <div style={{ fontSize: 9, color: '#334155', background: 'rgba(0,0,0,0.06)', borderRadius: 3, padding: '0 4px', alignSelf: 'center', maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {d.technology}
        </div>
      )}
    </div>
  );
}

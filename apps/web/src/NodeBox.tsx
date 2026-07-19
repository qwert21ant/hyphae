import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { Shape } from '@hyphae/schema';
import { shapeStyle } from './shapes';
import { NODE_W, NODE_H } from './layout';

// Invisible, non-interactive side handles kept only so floating edges can anchor to the node
// (React Flow drops edges whose endpoint exposes no handle). Connection-by-dragging is disabled,
// so the dots are hidden.
const sides: Array<{ id: string; position: Position }> = [
  { id: 't', position: Position.Top },
  { id: 'r', position: Position.Right },
  { id: 'b', position: Position.Bottom },
  { id: 'l', position: Position.Left },
];

export type NodeBoxData = {
  name?: string;
  summary?: string;
  technology?: string;
  shape?: Shape;
  color?: { bg: string; border: string };
};

export function NodeBox({ data }: NodeProps) {
  const d = data as NodeBoxData;
  const color = d.color ?? { bg: '#fff', border: '#b1b1b7' };
  return (
    <div
      style={{
        width: NODE_W,
        height: NODE_H,
        padding: '6px 10px',
        boxSizing: 'border-box',
        border: `1px solid ${color.border}`,
        borderColor: color.border,
        background: color.bg,
        fontSize: 12,
        lineHeight: 1.25,
        textAlign: 'center',
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

import { Handle, Position, type NodeProps } from '@xyflow/react';

const sides: Array<{ id: string; position: Position }> = [
  { id: 't', position: Position.Top },
  { id: 'r', position: Position.Right },
  { id: 'b', position: Position.Bottom },
  { id: 'l', position: Position.Left },
];

// A node borrowed from a higher layer (e.g. an ExternalSystem shown on the Container layer so its
// connection is visible). Dashed + muted to read as "not native to this layer".
export function GhostNode({ data }: NodeProps) {
  const label = (data as { label?: string }).label ?? '';
  return (
    <div
      style={{
        width: 160,
        padding: '8px 10px',
        boxSizing: 'border-box',
        border: '1.5px dashed #94a3b8',
        borderRadius: 4,
        background: '#f1f5f9',
        color: '#475569',
        fontSize: 12,
        lineHeight: 1.3,
        textAlign: 'center',
        whiteSpace: 'pre-wrap',
        fontStyle: 'italic',
      }}
    >
      {sides.map((s) => (
        <Handle key={s.id} id={s.id} type="source" position={s.position} style={{ width: 7, height: 7, background: '#94a3b8' }} />
      ))}
      {label}
    </div>
  );
}

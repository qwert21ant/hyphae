import { Handle, Position, type NodeProps } from '@xyflow/react';

// Invisible, non-interactive side handles kept only so floating edges can anchor to the node
// (React Flow drops edges whose endpoint exposes no handle). Connection-by-dragging is disabled,
// so the dots are hidden.
const sides: Array<{ id: string; position: Position }> = [
  { id: 't', position: Position.Top },
  { id: 'r', position: Position.Right },
  { id: 'b', position: Position.Bottom },
  { id: 'l', position: Position.Left },
];

export function NodeBox({ data }: NodeProps) {
  const d = data as { label?: string; color?: { bg: string; border: string } };
  const label = d.label ?? '';
  const color = d.color ?? { bg: '#fff', border: '#b1b1b7' };
  return (
    <div
      style={{
        width: 160,
        padding: '8px 10px',
        boxSizing: 'border-box',
        border: `1px solid ${color.border}`,
        borderRadius: 4,
        background: color.bg,
        fontSize: 12,
        lineHeight: 1.3,
        textAlign: 'center',
        whiteSpace: 'pre-wrap',
      }}
    >
      {sides.map((s) => (
        <Handle key={s.id} id={s.id} type="source" position={s.position} style={{ opacity: 0, pointerEvents: 'none' }} />
      ))}
      {label}
    </div>
  );
}

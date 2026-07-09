import { Handle, Position, type NodeProps } from '@xyflow/react';

// Four small side handles. With ConnectionMode.Loose any of them can be a source OR a target,
// so a connection can start/end on any side, while the node body stays draggable.
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
        <Handle key={s.id} id={s.id} type="source" position={s.position} style={{ width: 7, height: 7, background: '#7c93b8' }} />
      ))}
      {label}
    </div>
  );
}

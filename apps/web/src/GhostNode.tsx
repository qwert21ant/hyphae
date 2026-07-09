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

// A node borrowed from a higher layer (e.g. an ExternalSystem shown on the Container layer so its
// connection is visible). Tinted by its own C4 layer, but dashed + italic to read as "not native".
export function GhostNode({ data }: NodeProps) {
  const d = data as { label?: string; color?: { bg: string; border: string } };
  const label = d.label ?? '';
  const color = d.color ?? { bg: '#f1f5f9', border: '#94a3b8' };
  return (
    <div
      style={{
        width: 160,
        padding: '8px 10px',
        boxSizing: 'border-box',
        border: `1.5px dashed ${color.border}`,
        borderRadius: 4,
        background: color.bg,
        color: '#475569',
        fontSize: 12,
        lineHeight: 1.3,
        textAlign: 'center',
        whiteSpace: 'pre-wrap',
        fontStyle: 'italic',
      }}
    >
      {sides.map((s) => (
        <Handle key={s.id} id={s.id} type="source" position={s.position} style={{ opacity: 0, pointerEvents: 'none' }} />
      ))}
      {label}
    </div>
  );
}

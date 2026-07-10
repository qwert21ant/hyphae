import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useStore } from './store';

const sides: Array<{ id: string; position: Position }> = [
  { id: 't', position: Position.Top },
  { id: 'r', position: Position.Right },
  { id: 'b', position: Position.Bottom },
  { id: 'l', position: Position.Left },
];

/** An expanded external: a dashed, muted boundary wrapping the participating child ghosts. Its title
 *  bar carries a − caret that collapses it back to a single ghost. */
export function GhostGroupNode({ id, data }: NodeProps) {
  const label = String((data as { label?: string }).label ?? '');
  const toggle = useStore((s) => s.toggleExternal);
  return (
    <div className="region region--ghost" style={{ borderStyle: 'dashed' }}>
      {sides.map((s) => (
        <Handle key={s.id} id={s.id} type="source" position={s.position} style={{ opacity: 0, pointerEvents: 'none' }} />
      ))}
      <div className="region__handle" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontStyle: 'italic' }}>{label}</span>
        <button
          onClick={(ev) => { ev.stopPropagation(); toggle(id); }}
          title="Collapse"
          style={{ cursor: 'pointer', border: 'none', background: 'transparent', fontSize: 14, lineHeight: 1, padding: '0 2px' }}
        >−</button>
      </div>
    </div>
  );
}

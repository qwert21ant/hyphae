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
    <div className="region region--ghost">
      {sides.map((s) => (
        <Handle key={s.id} id={s.id} className="region__handle-point" type="source" position={s.position} />
      ))}
      <div className="region__handle region__handle--split">
        <span className="region__label">{label}</span>
        <button className="region__collapse" onClick={(ev) => { ev.stopPropagation(); toggle(id); }} title="Collapse">−</button>
      </div>
    </div>
  );
}

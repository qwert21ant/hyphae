import { Handle, Position, type NodeProps } from '@xyflow/react';

// Hidden side handles so floating edges can attach to the region. React Flow drops any edge whose
// endpoint node exposes no handle, which is how the focused node's own connections (it is drawn as a
// region) used to disappear. They are invisible and non-interactive — only there for edge anchoring.
const sides: Array<{ id: string; position: Position }> = [
  { id: 't', position: Position.Top },
  { id: 'r', position: Position.Right },
  { id: 'b', position: Position.Bottom },
  { id: 'l', position: Position.Left },
];

/** A containment region: a labeled boundary whose title bar is the drag handle. `data-layer` (the
 *  focus node's own C4 layer, set by focusViewToFlow) drives canvas.css's altitude tint — omitted
 *  entirely when the layer can't be resolved, so the base `.region` rule's --alt-2-* fallback applies. */
export function GroupNode({ data }: NodeProps) {
  const label = String((data as { label?: string }).label ?? '');
  const layer = (data as { layer?: string }).layer;
  return (
    <div className="region" data-layer={layer || undefined}>
      {sides.map((s) => (
        <Handle key={s.id} id={s.id} type="source" position={s.position} style={{ opacity: 0, pointerEvents: 'none' }} />
      ))}
      <div className="region__handle">{label}</div>
    </div>
  );
}

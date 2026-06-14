import type { NodeProps } from '@xyflow/react';

/** A containment region: a labeled boundary whose title bar is the drag handle. */
export function GroupNode({ data }: NodeProps) {
  const label = String((data as { label?: string }).label ?? '');
  return (
    <div className="region">
      <div className="region__handle">{label}</div>
    </div>
  );
}

import type { NodeProps } from '@xyflow/react';

/** A containment region (a parent node rendered as a labeled boundary box). */
export function GroupNode({ data }: NodeProps) {
  const label = String((data as { label?: string }).label ?? '');
  return (
    <div className="group-node">
      <span className="group-node__label">{label}</span>
    </div>
  );
}

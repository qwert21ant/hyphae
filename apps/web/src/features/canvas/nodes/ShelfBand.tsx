import type { NodeProps } from '@xyflow/react';

/**
 * The shelf: the band behind the foundational nodes whose edges are not drawn.
 *
 * Completely inert — no handles (no edge ever anchors on the band itself) and no pointer events
 * anywhere, including on its own label. It is furniture, not a participant: if it could become the
 * hovered node it would dim the entire graph on the way past, and it deliberately does NOT reuse
 * `.region__handle`, whose `cursor: grab` would promise a drag that does not exist.
 */
export function ShelfBand({ data }: NodeProps) {
  const d = data as { label?: string };
  return (
    <div className="region region--shelf">
      <div className="shelf__label">{d.label ?? ''}</div>
    </div>
  );
}

import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { Shape } from '@hyphae/schema';
import { shapePadding } from '@/features/canvas/shapes';
import { NodeShape } from './NodeShape';
import { NODE_W, NODE_H, SUMMARY_LINES } from '@/features/canvas/layout';

// Invisible, non-interactive side handles kept only so floating edges can anchor to the node
// (React Flow drops edges whose endpoint exposes no handle). Connection-by-dragging is disabled,
// so the dots are hidden.
const sides: Array<{ id: string; position: Position }> = [
  { id: 't', position: Position.Top },
  { id: 'r', position: Position.Right },
  { id: 'b', position: Position.Bottom },
  { id: 'l', position: Position.Left },
];

export type NodeBoxData = {
  name?: string;
  summary?: string;
  technology?: string;
  shape?: Shape;
  color?: { bg: string; border: string };
  /** Box size, supplied by focusViewToFlow — grows a badge row when hub quieting is on. */
  width?: number;
  height?: number;
};

export function NodeBox({ data }: NodeProps) {
  const d = data as NodeBoxData;
  const color = d.color ?? { bg: 'var(--alt-2-bg)', border: 'var(--alt-2-bd)' };
  const shape = d.shape ?? 'rectangle';
  const w = d.width ?? NODE_W;
  const h = d.height ?? NODE_H;
  return (
    // The div stays a plain NODE_W x NODE_H rectangle with no border or background of its own —
    // NodeShape paints the body behind the text. Floating edges anchor to this box (floating.ts),
    // so its geometry must not follow the drawn shape.
    <div
      style={{
        position: 'relative',
        width: w,
        height: h,
        padding: shapePadding(shape, w, h),
        boxSizing: 'border-box',
        fontSize: 12,
        lineHeight: 1.25,
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 2,
        overflow: 'hidden',
      }}
    >
      <NodeShape shape={shape} w={w} h={h} bg={color.bg} border={color.border} />
      {sides.map((s) => (
        <Handle key={s.id} id={s.id} type="source" position={s.position} style={{ opacity: 0, pointerEvents: 'none' }} />
      ))}
      <div style={{ position: 'relative', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name ?? ''}</div>
      {d.summary && (
        // Wrap to SUMMARY_LINES and clip at the line boundary: a one-line ellipsis cut a typical
        // summary mid-word, which is what made the box unreadable. The name stays single-line.
        <div style={{
          position: 'relative',
          fontSize: 10, color: 'var(--tx-2)', overflow: 'hidden',
          display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: SUMMARY_LINES,
        }}>
          {d.summary}
        </div>
      )}
      {d.technology && (
        <div style={{ position: 'relative', fontSize: 9, color: 'var(--tx-2)', background: 'var(--chip)', borderRadius: 3, padding: '0 4px', alignSelf: 'center', maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {d.technology}
        </div>
      )}
    </div>
  );
}

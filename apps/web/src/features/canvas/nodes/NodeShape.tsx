import { shapeGeometry } from '@/features/canvas/shapes';
import type { Shape } from '@hyphae/schema';

export type NodeShapeProps = {
  shape: Shape;
  w: number;
  h: number;
  bg: string;
  border: string;
  /** Stroke width. Ghost nodes use a heavier dashed stroke to read as "borrowed". */
  stroke?: number;
  dashed?: boolean;
};

/**
 * The drawn body of a node: an SVG sized 1:1 with the node div, sitting behind its text.
 *
 * The viewBox matches the pixel size exactly, so nothing is scaled and the stroke keeps a uniform
 * width whatever the box's aspect ratio — the reason the old percentage `border-radius` looked
 * different on a wide canvas node and a near-square legend swatch. Rendering the same component at
 * both sizes is what keeps the legend and the canvas in agreement.
 *
 * It is inert: the node div above it owns hover, clicks and the invisible edge handles.
 */
export function NodeShape({ shape, w, h, bg, border, stroke = 1, dashed = false }: NodeShapeProps) {
  const { outline, details, band } = shapeGeometry(shape, w, h, stroke);
  return (
    <svg
      data-shape={shape}
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}
    >
      <path
        d={outline}
        fill={bg}
        stroke={border}
        strokeWidth={stroke}
        {...(dashed ? { strokeDasharray: '5 3' } : {})}
      />
      {band && <path d={band} fill={border} stroke="none" />}
      {details.map((d) => (
        <path key={d} d={d} fill="none" stroke={border} strokeWidth={stroke} {...(dashed ? { strokeDasharray: '5 3' } : {})} />
      ))}
    </svg>
  );
}

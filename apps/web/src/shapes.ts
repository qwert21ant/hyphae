import type { CSSProperties } from 'react';
import type { Shape } from '@hyphae/schema';

/**
 * Geometry for a profile-declared shape name. The profile names the shape; this module owns
 * how it draws. Keyed by shape — never by role id or node type — so a new profile with a
 * different role vocabulary renders without touching the web app.
 *
 * Implemented as CSS on the existing node div rather than SVG so the floating-edge anchoring
 * and invisible side handles keep working unchanged.
 */
export function shapeStyle(shape: Shape): CSSProperties {
  switch (shape) {
    case 'cylinder':
      return { borderRadius: '50% / 16px' };
    case 'person':
      return { borderRadius: '50% 50% 8px 8px' };
    case 'bar':
      return { borderRadius: 0, borderLeftWidth: 4, borderRightWidth: 4, borderLeftStyle: 'solid', borderRightStyle: 'solid' };
    case 'hexagon':
      return { clipPath: 'polygon(8% 0, 92% 0, 100% 50%, 92% 100%, 8% 100%, 0 50%)', borderRadius: 0 };
    case 'titled-rectangle':
      return { borderRadius: 4, borderTopWidth: 8, borderTopStyle: 'solid' };
    case 'rectangle':
    default:
      return { borderRadius: 4 };
  }
}

/** Human-readable shape names for the legend. */
export const SHAPE_LABEL: Record<Shape, string> = {
  rectangle: 'service',
  person: 'actor',
  cylinder: 'datastore',
  bar: 'queue',
  hexagon: 'external system',
  'titled-rectangle': 'UI surface',
};

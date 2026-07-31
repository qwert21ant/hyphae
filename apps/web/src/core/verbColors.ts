import { c4Backend, layerOfType, type VerbClass } from '@hyphae/schema';

/** Tint each node by its C4 layer so altitude is readable at a glance — the design's core encoding,
 *  expressed as luminance with no hue at all (see styles/tokens.css). These are `var()` references,
 *  not values, so switching themes repaints the diagram with no React re-render and therefore no
 *  invalidation of the base-position memo, which is keyed on [model, focusId] only. */
export const LAYER_COLOR: Record<string, { bg: string; border: string }> = {
  Context: { bg: 'var(--alt-1-bg)', border: 'var(--alt-1-bd)' },
  Container: { bg: 'var(--alt-2-bg)', border: 'var(--alt-2-bd)' },
  Component: { bg: 'var(--alt-3-bg)', border: 'var(--alt-3-bd)' },
};
export function layerColorOf(type: string): { bg: string; border: string } {
  const layer = layerOfType(c4Backend, type);
  // An unmapped type takes the middle step. The old fallback was a bare white box, which in a dark
  // theme is the brightest thing on the canvas — the exact opposite of "this has no known altitude".
  return (layer && LAYER_COLOR[layer]) || { bg: 'var(--alt-2-bg)', border: 'var(--alt-2-bd)' };
}

/** Verb classes get distinct hues, and are the ONLY thing on the canvas that does. Violet is
 *  deliberately absent — it means "derived rollup edge" here and in the legend. */
export const VERB_CLASS_COLOR: Record<VerbClass, string> = {
  dataAccess: 'var(--verb-dataAccess)',
  messaging: 'var(--verb-messaging)',
  control: 'var(--verb-control)',
  user: 'var(--verb-user)',
  traceability: 'var(--verb-traceability)',
};

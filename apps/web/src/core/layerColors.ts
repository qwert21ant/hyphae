import { c4Backend, layerOfType } from '@hyphae/schema';

// Was `verbColors.ts`, back when it also held VERB_CLASS_COLOR. The verb vocabulary is gone and
// hue with it, so what remains is the one mapping the design still spends: node type -> altitude.

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

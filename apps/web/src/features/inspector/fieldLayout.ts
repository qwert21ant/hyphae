import type { FieldType } from '@hyphae/schema';

export type FieldLayout = 'grid' | 'stack';

/** Past this a value stops being a scalar you scan and becomes prose you read. Chosen against the
 *  Baritone model: summaries sit well under it, descriptions and invariants well over. */
const PROSE_CHARS = 64;

/**
 * Which of the inspector's two treatments a field gets: a scannable label/value grid row, or a
 * stacked block at full panel width.
 *
 * The field's declared type is not enough on its own — `summary` and `description` are both `text`
 * and only one of them is prose — so the decision also reads the value. `'core'` covers the rows
 * that are not profile fields at all (`description`, `root`, `parent`), which go through the same
 * rule rather than getting a bespoke one.
 */
export function fieldLayout(type: FieldType | 'core', value: unknown): FieldLayout {
  if (type === 'list') return 'stack';
  if (type === 'number' || type === 'boolean' || type === 'enum' || type === 'ref') return 'grid';
  const text = typeof value === 'string' ? value : '';
  return text.includes('\n') || text.length > PROSE_CHARS ? 'stack' : 'grid';
}

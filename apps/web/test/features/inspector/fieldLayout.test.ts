import { describe, expect, it } from 'vitest';
import { fieldLayout } from '@/features/inspector/fieldLayout';

describe('fieldLayout', () => {
  // FieldDef.type cannot decide this on its own: `summary` and `description` are BOTH 'text' and
  // only one of them is prose. The value's own shape is the deciding input.
  it('grids a short text value', () => {
    expect(fieldLayout('text', 'Owns the active path')).toBe('grid');
  });

  it('stacks a long text value', () => {
    expect(fieldLayout('text', 'Holds the current path and re-plans when the segment is exhausted or the world changes underneath it.')).toBe('stack');
  });

  it('stacks a multi-line text value even when it is short', () => {
    expect(fieldLayout('text', 'one\ntwo')).toBe('stack');
  });

  it('always stacks a list, because entries need their own lines', () => {
    expect(fieldLayout('list', ['a'])).toBe('stack');
  });

  it('grids the scalar types regardless of value', () => {
    expect(fieldLayout('number', 42)).toBe('grid');
    expect(fieldLayout('boolean', false)).toBe('grid');
    expect(fieldLayout('enum', 'sync')).toBe('grid');
    expect(fieldLayout('ref', 'some-uuid')).toBe('grid');
  });

  it('treats core rows by the same rule', () => {
    expect(fieldLayout('core', 'Component')).toBe('grid');
    expect(fieldLayout('core', 'x'.repeat(80))).toBe('stack');
  });

  it('grids an absent value rather than reserving a block for it', () => {
    expect(fieldLayout('text', undefined)).toBe('grid');
  });
});

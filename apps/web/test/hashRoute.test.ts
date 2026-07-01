import { describe, it, expect } from 'vitest';
import { hashToFocusId, focusIdToHash, resolveHashFocus } from '../src/hashRoute';

describe('hashRoute', () => {
  it('maps an empty/root hash to null', () => {
    expect(hashToFocusId('')).toBeNull();
    expect(hashToFocusId('#')).toBeNull();
    expect(hashToFocusId('#  ')).toBeNull();
  });

  it('reads a node id out of the hash', () => {
    expect(hashToFocusId('#abc-123')).toBe('abc-123');
  });

  it('decodes a percent-encoded id', () => {
    expect(hashToFocusId('#a%20b')).toBe('a b');
  });

  it('turns null focus into an empty hash', () => {
    expect(focusIdToHash(null)).toBe('');
  });

  it('turns a focus id into an encoded hash', () => {
    expect(focusIdToHash('abc-123')).toBe('#abc-123');
    expect(focusIdToHash('a b')).toBe('#a%20b');
  });

  it('round-trips any focus id', () => {
    for (const id of ['plain', 'with space', 'uuid-4-abc', 'weird#frag/slash']) {
      expect(hashToFocusId(focusIdToHash(id))).toBe(id);
    }
    expect(hashToFocusId(focusIdToHash(null))).toBeNull();
  });

  describe('resolveHashFocus', () => {
    const exists = (id: string) => ['a', 'b'].includes(id);

    it('keeps a hash that names an existing node', () => {
      expect(resolveHashFocus('#a', exists)).toEqual({ focusId: 'a', rewrite: false });
    });

    it('coerces an unknown node id to root and asks for a rewrite', () => {
      expect(resolveHashFocus('#nope', exists)).toEqual({ focusId: null, rewrite: true });
    });

    it('leaves the root hash at root without rewriting', () => {
      expect(resolveHashFocus('', exists)).toEqual({ focusId: null, rewrite: false });
      expect(resolveHashFocus('#', exists)).toEqual({ focusId: null, rewrite: false });
    });
  });
});

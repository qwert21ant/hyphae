import { describe, it, expect } from 'vitest';
import { c4Backend, allowedChildTypes, topLevelTypes } from '../src/index';

describe('profile child/top-level helpers', () => {
  it('returns the allowed child types for a kind', () => {
    expect(allowedChildTypes(c4Backend, 'System')).toEqual(['Container']);
    expect(allowedChildTypes(c4Backend, 'Container')).toEqual(['Component']);
    expect(allowedChildTypes(c4Backend, 'Class')).toEqual([]);
  });
  it('returns the kinds that can sit at the top level', () => {
    expect(topLevelTypes(c4Backend).sort()).toEqual(['Actor', 'ExternalSystem', 'System']);
  });
});

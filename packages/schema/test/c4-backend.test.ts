import { describe, it, expect } from 'vitest';
import { c4Backend, layerOfType, allowedParentTypes } from '../src/profiles/c4-backend';
import { ProfileSchema } from '../src/profile';

describe('c4-backend profile', () => {
  it('is a valid Profile', () => {
    expect(() => ProfileSchema.parse(c4Backend)).not.toThrow();
  });

  it('maps a type to its layer', () => {
    expect(layerOfType(c4Backend, 'Component')).toBe('Component');
    expect(layerOfType(c4Backend, 'Container')).toBe('Container');
  });

  it('exposes containment rules', () => {
    expect(allowedParentTypes(c4Backend, 'Component')).toContain('Container');
    expect(allowedParentTypes(c4Backend, 'Container')).toContain('System');
  });
});

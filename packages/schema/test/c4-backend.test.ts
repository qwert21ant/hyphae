import { describe, it, expect } from 'vitest';
import { c4Backend, layerOfType, allowedParentTypes } from '../src/profiles/c4-backend';
import { ProfileSchema, effectiveFields, connectionKindIds } from '../src/profile';

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

  it('defines the Code layer below Component', () => {
    expect(c4Backend.layers).toEqual(['Context', 'Container', 'Component', 'Code']);
  });

  it('maps the code kinds to the Code layer', () => {
    for (const k of ['Class', 'Interface', 'Function', 'Module', 'UIComponent']) {
      expect(layerOfType(c4Backend, k)).toBe('Code');
    }
  });

  it('code kinds are children of Component', () => {
    expect(allowedParentTypes(c4Backend, 'Class')).toEqual(['Component']);
    const component = c4Backend.nodeKinds.find((k) => k.id === 'Component')!;
    expect(component.allowedChildren).toEqual(
      expect.arrayContaining(['Class', 'Interface', 'Function', 'Module', 'UIComponent']),
    );
  });
});

describe('profile meta-schema', () => {
  it('exposes connection kinds', () => {
    expect(connectionKindIds(c4Backend).sort()).toEqual(['DataFlow', 'Dependency', 'Realization', 'Trace']);
  });

  it('effective node fields = common (responsibilities, invariants) then per-kind (technology)', () => {
    const keys = effectiveFields(c4Backend, 'Component', 'node').map((f) => f.key);
    expect(keys).toEqual(['responsibilities', 'invariants', 'technology']);
  });

  it('a node kind with no own fields gets just the common fields', () => {
    expect(effectiveFields(c4Backend, 'System', 'node').map((f) => f.key)).toEqual(['responsibilities', 'invariants']);
  });

  it('effective connection fields = common (transport, intent)', () => {
    expect(effectiveFields(c4Backend, 'Dependency', 'connection').map((f) => f.key)).toEqual(['transport', 'intent']);
  });

  it('common fields win on key collision', () => {
    const profile = {
      ...c4Backend,
      commonNodeFields: [{ key: 'technology', type: 'text' as const, description: 'common one' }],
      nodeKinds: c4Backend.nodeKinds.map((k) =>
        k.id === 'Component' ? { ...k, fields: [{ key: 'technology', type: 'text' as const, description: 'per-kind one' }] } : k),
    };
    const tech = effectiveFields(profile, 'Component', 'node').filter((f) => f.key === 'technology');
    expect(tech).toHaveLength(1);
    expect(tech[0].description).toBe('common one');
  });
});

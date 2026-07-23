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

  it('has three layers ending at Component (no Code layer)', () => {
    expect(c4Backend.layers).toEqual(['Context', 'Container', 'Component']);
  });

  it('Component is the leaf structural layer (no code-kind children)', () => {
    const component = c4Backend.nodeKinds.find((k) => k.id === 'Component')!;
    expect(component.allowedChildren).toEqual([]);
    for (const k of ['Class', 'Interface', 'Function', 'Module', 'UIComponent']) {
      expect(c4Backend.nodeKinds.find((nk) => nk.id === k)).toBeUndefined();
    }
  });
});

describe('profile meta-schema', () => {
  it('exposes connection kinds', () => {
    expect(connectionKindIds(c4Backend).sort()).toEqual(['DataFlow', 'Dependency', 'Realization', 'Trace']);
  });

  it('effective node fields = common (responsibilities, invariants) then per-kind (summary, technology)', () => {
    const keys = effectiveFields(c4Backend, 'Component', 'node').map((f) => f.key);
    expect(keys).toEqual(['responsibilities', 'invariants', 'summary', 'technology']);
  });

  it('a node kind with no own fields beyond summary gets the common fields plus summary', () => {
    expect(effectiveFields(c4Backend, 'System', 'node').map((f) => f.key)).toEqual(['responsibilities', 'invariants', 'summary']);
  });

  it('effective connection fields = common (transport)', () => {
    expect(effectiveFields(c4Backend, 'Dependency', 'connection').map((f) => f.key)).toEqual(['transport']);
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

describe('c4-backend visual vocabulary', () => {
  it('declares a role for every node kind, and every such role exists', () => {
    const roleIds = new Set(c4Backend.roles.map((r) => r.id));
    for (const k of c4Backend.nodeKinds) {
      expect(k.role, `${k.id} has no role`).toBeTruthy();
      expect(roleIds.has(k.role), `${k.id} role "${k.role}" is not declared`).toBe(true);
    }
  });

  it('describes every role and every verb', () => {
    for (const r of c4Backend.roles) expect(r.description).toMatch(/\S/);
    for (const v of c4Backend.verbs) expect(v.description).toMatch(/\S/);
  });

  it('includes the default verb "uses" so a defaulted connection is valid', () => {
    expect(c4Backend.verbs.some((v) => v.id === 'uses')).toBe(true);
  });

  it('covers all four verb classes', () => {
    expect(new Set(c4Backend.verbs.map((v) => v.class)))
      .toEqual(new Set(['dataAccess', 'messaging', 'control', 'user']));
  });

  it('has retired intent', () => {
    expect(c4Backend.commonConnectionFields.some((f) => f.key === 'intent')).toBe(false);
  });

  it('requires summary on the five structural kinds', () => {
    const summaryOf = (kindId: string) =>
      effectiveFields(c4Backend, kindId, 'node').find((f) => f.key === 'summary');
    for (const k of ['System', 'Actor', 'ExternalSystem', 'Container', 'Component']) {
      expect(summaryOf(k)?.required, `${k} should require summary`).toBe(true);
    }
  });

  it('declares the five pattern kinds, each with a described renderer', () => {
    const ids = c4Backend.patternKinds.map((k) => k.id).sort();
    expect(ids).toEqual(['event-bus', 'layered', 'middleware', 'pipeline', 'state-machine']);
    for (const k of c4Backend.patternKinds) expect(k.description).toMatch(/\S/);
  });

  it('marks pipeline and middleware as ordered', () => {
    const ordered = new Set(c4Backend.patternKinds.filter((k) => k.ordered).map((k) => k.id));
    expect(ordered).toEqual(new Set(['pipeline', 'middleware']));
  });
});

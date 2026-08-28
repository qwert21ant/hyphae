import { describe, it, expect } from 'vitest';
import { c4Backend, layerOfType, allowedParentTypes } from '../src/profiles/c4-backend';
import { ProfileSchema, nodeFields, connectionFields } from '../src/profile';

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
  it('no longer defines connection kinds', () => {
    expect('connectionKinds' in c4Backend).toBe(false);
  });

  it('effective node fields = common (responsibilities, rules) then per-kind (summary, technology)', () => {
    const keys = nodeFields(c4Backend, 'Component').map((f) => f.key);
    expect(keys).toEqual(['responsibilities', 'rules', 'summary', 'technology']);
  });

  it('a node kind with no own fields beyond summary gets the common fields plus summary', () => {
    expect(nodeFields(c4Backend, 'System').map((f) => f.key)).toEqual(['responsibilities', 'rules', 'summary']);
  });

  it('has retired invariants — the word invited code-level preconditions', () => {
    expect(c4Backend.commonNodeFields.some((f) => f.key === 'invariants')).toBe(false);
  });

  it('describes rules and responsibilities in domain terms, banning code detail', () => {
    const byKey = Object.fromEntries(c4Backend.commonNodeFields.map((f) => [f.key, f]));
    expect(byKey['rules'].description).toMatch(/never a code-level precondition/i);
    expect(byKey['responsibilities'].description).toMatch(/The system relies on/i);
  });

  it('ships no connection fields — the label and description carry the meaning', () => {
    expect(c4Backend.commonConnectionFields).toEqual([]);
    expect(connectionFields(c4Backend)).toEqual([]);
  });

  it('common fields win on key collision', () => {
    const profile = {
      ...c4Backend,
      commonNodeFields: [{ key: 'technology', type: 'text' as const, description: 'common one' }],
      nodeKinds: c4Backend.nodeKinds.map((k) =>
        k.id === 'Component' ? { ...k, fields: [{ key: 'technology', type: 'text' as const, description: 'per-kind one' }] } : k),
    };
    const tech = nodeFields(profile, 'Component').filter((f) => f.key === 'technology');
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

  it('describes every role', () => {
    for (const r of c4Backend.roles) expect(r.description).toMatch(/\S/);
  });

  it('declares no verb vocabulary — a connection says what it does in its label', () => {
    expect((c4Backend as unknown as Record<string, unknown>).verbs).toBeUndefined();
  });

  it('has retired intent', () => {
    expect(c4Backend.commonConnectionFields.some((f) => f.key === 'intent')).toBe(false);
  });

  it('requires summary on the five structural kinds', () => {
    const summaryOf = (kindId: string) =>
      nodeFields(c4Backend, kindId).find((f) => f.key === 'summary');
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

describe('profile shape', () => {
  it('still parses against the profile schema with no verbs', () => {
    expect(() => ProfileSchema.parse(c4Backend)).not.toThrow();
  });
});

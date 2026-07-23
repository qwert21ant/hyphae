import { describe, it, expect } from 'vitest';
import { c4Backend, allowedChildTypes, topLevelTypes, nodeAtOrAboveLayer } from '../src/index';
import { roleOfNode, roleDefOf, verbDefOf, verbClassOf, patternKindDefOf } from '../src/profile';

describe('profile child/top-level helpers', () => {
  it('returns the allowed child types for a kind', () => {
    expect(allowedChildTypes(c4Backend, 'System')).toEqual(['Container']);
    expect(allowedChildTypes(c4Backend, 'Container')).toEqual(['Component']);
    expect(allowedChildTypes(c4Backend, 'Component')).toEqual([]);
  });
  it('returns the kinds that can sit at the top level', () => {
    expect(topLevelTypes(c4Backend).sort()).toEqual(['Actor', 'ExternalSystem', 'System']);
  });
});

describe('nodeAtOrAboveLayer', () => {
  it('keeps types at or above the max layer and drops those below', () => {
    // layers: Context(0) Container(1) Component(2)
    expect(nodeAtOrAboveLayer(c4Backend, 'System', 'Component')).toBe(true);     // Context
    expect(nodeAtOrAboveLayer(c4Backend, 'Container', 'Component')).toBe(true);
    expect(nodeAtOrAboveLayer(c4Backend, 'Component', 'Component')).toBe(true);  // equal
    expect(nodeAtOrAboveLayer(c4Backend, 'Container', 'Context')).toBe(false);   // below the max
  });
  it('returns false for an unknown node type or unknown max layer', () => {
    expect(nodeAtOrAboveLayer(c4Backend, 'Nope', 'Component')).toBe(false);
    expect(nodeAtOrAboveLayer(c4Backend, 'Component', 'Nope')).toBe(false);
  });
  it('returns false for an unknown node type even when the profile has an empty-string layer', () => {
    const profileWithEmptyLayer = { ...c4Backend, layers: ['', 'Container', 'Component'] };
    expect(nodeAtOrAboveLayer(profileWithEmptyLayer, 'Nope', 'Component')).toBe(false);
  });
});

describe('roleOfNode', () => {
  it('uses the node kind default when the node declares no role', () => {
    expect(roleOfNode(c4Backend, { type: 'Component', role: null })).toBe('service');
    expect(roleOfNode(c4Backend, { type: 'Actor', role: null })).toBe('actor');
    expect(roleOfNode(c4Backend, { type: 'ExternalSystem', role: null })).toBe('external');
  });

  it("prefers the node's own role over its kind default", () => {
    expect(roleOfNode(c4Backend, { type: 'Component', role: 'datastore' })).toBe('datastore');
  });

  it('falls back to service for an unknown node type', () => {
    expect(roleOfNode(c4Backend, { type: 'Nope', role: null })).toBe('service');
  });
});

describe('role and verb lookup', () => {
  it('resolves a role to its shape', () => {
    expect(roleDefOf(c4Backend, 'datastore')?.shape).toBe('cylinder');
    expect(roleDefOf(c4Backend, 'actor')?.shape).toBe('person');
    expect(roleDefOf(c4Backend, 'nope')).toBeUndefined();
  });

  it('resolves a verb to its class', () => {
    expect(verbClassOf(c4Backend, 'reads')).toBe('dataAccess');
    expect(verbClassOf(c4Backend, 'publishes')).toBe('messaging');
    expect(verbClassOf(c4Backend, 'uses')).toBe('control');
    expect(verbClassOf(c4Backend, 'views')).toBe('user');
    expect(verbClassOf(c4Backend, 'nope')).toBeUndefined();
  });

  it('exposes the verb description for the LLM and tooltips', () => {
    expect(verbDefOf(c4Backend, 'reads')?.description).toMatch(/\S/);
  });
});

describe('patternKinds', () => {
  it('patternKindDefOf resolves a declared kind and its renderer', () => {
    expect(patternKindDefOf(c4Backend, 'pipeline')?.renderer).toBe('pipeline');
    expect(patternKindDefOf(c4Backend, 'nope')).toBeUndefined();
  });
});

import { describe, it, expect } from 'vitest';
import { c4Backend, allowedChildTypes, topLevelTypes, nodeAtOrAboveLayer } from '../src/index';

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

describe('nodeAtOrAboveLayer', () => {
  it('keeps types at or above the max layer and drops those below', () => {
    // layers: Context(0) Container(1) Component(2) Code(3)
    expect(nodeAtOrAboveLayer(c4Backend, 'System', 'Component')).toBe(true);     // Context
    expect(nodeAtOrAboveLayer(c4Backend, 'Container', 'Component')).toBe(true);
    expect(nodeAtOrAboveLayer(c4Backend, 'Component', 'Component')).toBe(true);  // equal
    expect(nodeAtOrAboveLayer(c4Backend, 'Class', 'Component')).toBe(false);     // Code, below
    expect(nodeAtOrAboveLayer(c4Backend, 'Class', 'Code')).toBe(true);           // opt into Code
  });
  it('returns false for an unknown node type or unknown max layer', () => {
    expect(nodeAtOrAboveLayer(c4Backend, 'Nope', 'Component')).toBe(false);
    expect(nodeAtOrAboveLayer(c4Backend, 'Component', 'Nope')).toBe(false);
  });
});

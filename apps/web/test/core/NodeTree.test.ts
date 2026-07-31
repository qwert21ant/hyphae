import { describe, expect, it } from 'vitest';
import { emptyModel, type HyphaeModel, type Node } from '@hyphae/schema';
import { NodeTree } from '@/core/NodeTree';

const node = (id: string, type: string, parentId?: string): Node => ({
  id, name: id, type, description: '', parentId: parentId ?? null,
  fields: {}, tags: [], refs: [],
} as unknown as Node);

const modelOf = (...nodes: Node[]): HyphaeModel => ({ ...emptyModel(), nodes });

describe('NodeTree', () => {
  it('treats a parentId absent from the model as top-level', () => {
    const t = new NodeTree(modelOf(node('a', 'Container', 'ghost')));
    expect(t.parentOf(t.get('a')!)).toBeNull();
    expect(t.depthOf(t.get('a')!)).toBe(0);
  });

  it('stops walking on a parent cycle instead of hanging', () => {
    const t = new NodeTree(modelOf(
      node('a', 'Container', 'b'),
      node('b', 'Container', 'a'),
    ));
    expect(t.ancestors('a').length).toBeLessThanOrEqual(2);
    expect(t.rootAncestor('a')).toBeDefined();
  });

  it('returns the direct child of an ancestor, or null outside the subtree', () => {
    const t = new NodeTree(modelOf(
      node('sys', 'System'),
      node('con', 'Container', 'sys'),
      node('cmp', 'Component', 'con'),
      node('other', 'System'),
    ));
    expect(t.childOf('cmp', 'sys')).toBe('con');
    expect(t.childOf('con', 'sys')).toBe('con');
    expect(t.childOf('other', 'sys')).toBeNull();
  });

  it('reports depth as the number of resolvable ancestors', () => {
    const t = new NodeTree(modelOf(
      node('sys', 'System'),
      node('con', 'Container', 'sys'),
      node('cmp', 'Component', 'con'),
    ));
    expect(t.depthOf(t.get('sys')!)).toBe(0);
    expect(t.depthOf(t.get('cmp')!)).toBe(2);
  });

  it('leaves an endpoint at or above the focus layer as itself', () => {
    const t = new NodeTree(modelOf(node('ext', 'ExternalSystem')));
    expect(t.representativeWith('ext', 'Container')).toBe('ext');
  });

  it('rolls a deeper endpoint up to its ancestor on the focus layer', () => {
    const t = new NodeTree(modelOf(
      node('sys', 'System'),
      node('con', 'Container', 'sys'),
      node('cmp', 'Component', 'con'),
    ));
    expect(t.representativeWith('cmp', 'Container')).toBe('con');
  });

  it('uses the top layer as the focus layer at the root view', () => {
    const t = new NodeTree(modelOf(node('sys', 'System')));
    expect(t.focusLayerOf(null)).toBeTruthy();
    expect(t.rootAncestor('sys')).toBe('sys');
  });
});

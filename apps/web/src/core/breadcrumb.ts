import { type HyphaeModel } from '@hyphae/schema';
import { NodeTree } from './NodeTree';

export type Crumb = { id: string | null; name: string };

export function breadcrumbPath(model: HyphaeModel, focusId: string | null): Crumb[] {
  const tree = new NodeTree(model);
  const focusNode = focusId ? tree.get(focusId) ?? null : null;
  if (!focusNode) return [{ id: null, name: 'Root' }];
  // The tree's walk yields the ancestors nearest-first; a breadcrumb reads outermost-first.
  const chain = [...tree.ancestors(focusNode.id)].reverse().concat(focusNode);
  return [{ id: null, name: 'Root' }, ...chain.map((n) => ({ id: n.id, name: n.name }))];
}

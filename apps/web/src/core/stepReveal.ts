import { type HyphaeModel, type FlowStep } from '@hyphae/schema';
import { NodeTree } from '@/core/NodeTree';

export type StepReveal = {
  focusId: string | null;    // the view to focus
  expand: Set<string>;       // externals to expand so the far endpoint surfaces (see expandedExternals)
  selectedId: string | null; // the step's connection, or its source node
};

/**
 * Where to go to see one flow step. Siblings share a parent, so that parent is the focus (the root
 * view when both are top-level). Otherwise focus the parent of the **deeper** endpoint: that
 * endpoint becomes a child box, and the shallower one is at or above the focus's layer, so it is
 * drawn as itself in an external column. Focusing the *source's* parent instead would aim too high
 * whenever the source is the shallower end — an Actor step would land on the root view with the
 * target still collapsed into its System.
 *
 * The shallower endpoint can still be represented by a coarser box (a sibling container standing in
 * for the component inside it); expanding that representative is what surfaces the endpoint itself,
 * so it is returned with the focus rather than left to the user. Only a node OUTSIDE the focus is
 * ever expanded: `resolveViewPositions` lays expanded groups out in the external columns, so
 * expanding a node that is drawn inside the view stacks a group box on top of the cluster.
 *
 * Returns null when either endpoint is missing from the model (a stale flow), so callers no-op.
 */
export function stepReveal(model: HyphaeModel, step: Pick<FlowStep, 'from' | 'to' | 'via'>): StepReveal | null {
  const tree = new NodeTree(model);
  const from = tree.get(step.from);
  const to = tree.get(step.to);
  if (!from || !to) return null;

  const selectedId = step.via ?? step.from;
  const fromParent = tree.parentOf(from);
  if (fromParent === tree.parentOf(to)) return { focusId: fromParent, expand: new Set<string>(), selectedId };

  const [deeper, other] = tree.depthOf(to) > tree.depthOf(from) ? [to, from] : [from, to];
  const focusId = tree.parentOf(deeper);
  const rep = tree.representativeAt(other.id, focusId, tree.focusLayerOf(focusId));
  const insideView = rep === focusId || (focusId === null ? true : tree.get(rep)?.parentId === focusId);
  return { focusId, expand: rep === other.id || insideView ? new Set<string>() : new Set([rep]), selectedId };
}

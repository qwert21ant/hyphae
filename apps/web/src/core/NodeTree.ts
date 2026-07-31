import { c4Backend, layerOfType, type HyphaeModel, type Node } from '@hyphae/schema';

const indexOfLayer = (layer: string | undefined): number =>
  layer ? c4Backend.layers.indexOf(layer) : -1;

/**
 * The model's containment tree: the id→node index, built once, plus the one cycle-guarded parent
 * walk every view derivation needs. Five functions in `focusView.ts` used to rebuild the index and
 * re-implement the walk; a guard duplicated five times is a guard that will be forgotten in one.
 *
 * Two rules are load-bearing and deliberately odd:
 * - a `parentId` that is not in the model counts as **top-level** (dangling refs never make a node
 *   look nested), so every walk here climbs only *resolvable* parents;
 * - layer index 0 is the **top** layer, so "at or above a layer" is `<=` on the index.
 */
export class NodeTree {
  private readonly byId: Map<string, Node>;

  constructor(model: HyphaeModel) {
    this.byId = new Map(model.nodes.map((n) => [n.id, n]));
  }

  get(id: string): Node | undefined {
    return this.byId.get(id);
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  /** `node.parentId`, but only when that id exists in the model — otherwise the node is top-level. */
  parentOf(node: Node): string | null {
    return node.parentId && this.byId.has(node.parentId) ? node.parentId : null;
  }

  /** The resolvable ancestors of `node`, nearest first, stopping on a cycle. The single guarded walk. */
  private climb(node: Node): Node[] {
    const chain: Node[] = [];
    const seen = new Set<string>([node.id]);
    let pid = this.parentOf(node);
    while (pid && !seen.has(pid)) {
      seen.add(pid);
      const parent = this.byId.get(pid)!; // parentOf only yields ids present in the model
      chain.push(parent);
      pid = this.parentOf(parent);
    }
    return chain;
  }

  /** The ancestors of `id`, nearest first. Empty when the node is missing or top-level. */
  ancestors(id: string): Node[] {
    const start = this.byId.get(id);
    return start ? this.climb(start) : [];
  }

  /** How many resolvable ancestors a node has (0 = top-level). */
  depthOf(node: Node): number {
    return this.climb(node).length;
  }

  /** The top-level ancestor of `id` — the last *resolvable* ancestor, or `id` itself when the node
   *  is missing or already top-level. */
  rootAncestor(id: string): string {
    const start = this.byId.get(id);
    if (!start) return id;
    const chain = this.climb(start);
    return chain.length ? chain[chain.length - 1].id : start.id;
  }

  /**
   * The descendant of `ancestorId` on the path to `id` (i.e. `id` itself when it is already a direct
   * child), or null when `id` is not inside that subtree. This is how connections authored deep below
   * a focus roll up to the children actually shown, instead of collapsing onto the focus.
   *
   * The parent comparison is on the raw `parentId`, not a resolved one, so an ancestor that is itself
   * absent from the model still matches its children.
   */
  childOf(id: string, ancestorId: string): string | null {
    let cur = this.byId.get(id);
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      if (cur.parentId === ancestorId) return cur.id;
      if (!cur.parentId) return null;
      cur = this.byId.get(cur.parentId);
    }
    return null;
  }

  /** The layer external endpoints roll up to at `focusId`: the focus node's own layer (its peers),
   *  or the top layer at the root view. */
  focusLayerOf(focusId: string | null): string {
    const focusNode = focusId ? this.byId.get(focusId) ?? null : null;
    return focusNode ? layerOfType(c4Backend, focusNode.type) ?? '' : c4Backend.layers[0];
  }

  /**
   * The node that should represent `endpointId` in a view focused at `focusLayer`:
   * - at or above the focus layer → the endpoint itself (e.g. an ExternalSystem stays itself);
   * - below the focus layer → its ancestor on the focus layer (its peer of the focus node).
   */
  representativeWith(endpointId: string, focusLayer: string): string {
    const fi = indexOfLayer(focusLayer);
    let cur = this.byId.get(endpointId);
    if (!cur) return endpointId;
    if (indexOfLayer(layerOfType(c4Backend, cur.type)) <= fi) return endpointId;
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      if (layerOfType(c4Backend, cur.type) === focusLayer) return cur.id;
      if (!cur.parentId) return cur.id;
      const p = this.byId.get(cur.parentId);
      if (!p) return cur.id;
      cur = p;
    }
    return endpointId;
  }

  /**
   * The node that stands in for connection endpoint `id` in a COLLAPSED view focused at `focusId`:
   * - root view: its top-level ancestor (a shown root);
   * - the focus itself: the focus;
   * - inside the focus subtree: the direct child of the focus that contains it (the children level);
   * - outside: a peer at the focus's own layer (an aggregated external box), or itself if at/above it.
   */
  representativeAt(id: string, focusId: string | null, focusLayer: string): string {
    if (!focusId) return this.rootAncestor(id);
    if (id === focusId) return focusId;
    const child = this.childOf(id, focusId);
    if (child) return child;
    return this.representativeWith(id, focusLayer);
  }
}

import type { HyphaeModel } from './model';
import type { Profile } from './profile';
import { layerOfType, nodeAtOrAboveLayer } from './profile';
import { parseRef, resolveRef } from './ref';

export type OrphanNode = { id: string; name: string; type: string; parentId: string | null };

export type UnboundCodeEdge = {
  id: string; from: string; to: string;
  fromName: string; toName: string;
  fromComponent: string | null; toComponent: string | null;
  type: string;
};

export type ThinDescription = {
  id: string; name: string; type: string; parentId: string | null;
  reason: 'empty' | 'echoes-name';
  inbound: number; outbound: number;
};

export type MissingRef = { nodeId: string; ref: string; resolved: string };

export type ModelGaps = {
  orphanNodes: OrphanNode[];
  unboundCodeEdges: UnboundCodeEdge[];
  thinDescriptions: ThinDescription[];
  missingRefs: MissingRef[];
};

/** Disk access is injected, so this package never imports node:fs and stays testable. */
export type GapOptions = { checkDisk?: { cwd: string; exists: (path: string) => boolean } };

const COMPONENT_LAYER = 'Component';
const CODE_LAYER = 'Code';

/** lowercase, keep alphanumerics, collapse runs of anything else to a single space, trim. */
const normalize = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Coverage / quality gaps in a model (advisory — flags candidates, never mutates or fixes):
 * orphan Component-layer nodes (zero edges), cross-component Code↔Code edges not bound via any
 * connection's realizedBy, and Component-and-above nodes whose description is empty or echoes the name.
 * Layer membership is resolved through profile helpers, not hardcoded type comparisons.
 * Missing refs (codeRefs whose resolved path is absent from disk) are reported only when
 * `options.checkDisk` is supplied; without it this function touches no filesystem.
 */
export function modelGaps(model: HyphaeModel, profile: Profile, options: GapOptions = {}): ModelGaps {
  const byId = new Map(model.nodes.map((n) => [n.id, n]));

  // Degree + touched-node index over all connections.
  const inbound = new Map<string, number>();
  const outbound = new Map<string, number>();
  const touched = new Set<string>();
  for (const c of model.connections) {
    outbound.set(c.from, (outbound.get(c.from) ?? 0) + 1);
    inbound.set(c.to, (inbound.get(c.to) ?? 0) + 1);
    touched.add(c.from);
    touched.add(c.to);
  }

  // 1. Orphans: Component-layer nodes with no connection touching them.
  const orphanNodes: OrphanNode[] = model.nodes
    .filter((n) => layerOfType(profile, n.type) === COMPONENT_LAYER && !touched.has(n.id))
    .map((n) => ({ id: n.id, name: n.name, type: n.type, parentId: n.parentId }));

  // Lift a node to its nearest Component-layer ancestor id (or null if none).
  const liftCache = new Map<string, string | null>();
  const liftToComponent = (id: string): string | null => {
    const cached = liftCache.get(id);
    if (cached !== undefined) return cached;
    let node = byId.get(id);
    const seen = new Set<string>();
    let result: string | null = null;
    while (node && !seen.has(node.id)) {
      seen.add(node.id);
      if (layerOfType(profile, node.type) === COMPONENT_LAYER) { result = node.id; break; }
      node = node.parentId ? byId.get(node.parentId) : undefined;
    }
    liftCache.set(id, result);
    return result;
  };

  // claimed = union of every connection's realizedBy (a bound edge is not "unbound").
  const claimed = new Set<string>();
  for (const c of model.connections) for (const rid of c.realizedBy) claimed.add(rid);

  // 2. Unbound code edges: both endpoints Code-layer, distinct Component ancestors, not claimed.
  const unboundCodeEdges: UnboundCodeEdge[] = [];
  for (const c of model.connections) {
    const from = byId.get(c.from);
    const to = byId.get(c.to);
    if (!from || !to) continue;
    if (layerOfType(profile, from.type) !== CODE_LAYER || layerOfType(profile, to.type) !== CODE_LAYER) continue;
    if (claimed.has(c.id)) continue;
    const fromComp = liftToComponent(c.from);
    const toComp = liftToComponent(c.to);
    if (fromComp === null || toComp === null || fromComp === toComp) continue;
    unboundCodeEdges.push({
      id: c.id, from: c.from, to: c.to,
      fromName: from.name, toName: to.name,
      fromComponent: byId.get(fromComp)?.name ?? null,
      toComponent: byId.get(toComp)?.name ?? null,
      type: c.type,
    });
  }

  // 3. Thin descriptions: Component-and-above nodes with empty or name-echoing description.
  const thinDescriptions: ThinDescription[] = [];
  for (const n of model.nodes) {
    if (!nodeAtOrAboveLayer(profile, n.type, COMPONENT_LAYER)) continue;
    const desc = n.description ?? '';
    let reason: 'empty' | 'echoes-name' | null = null;
    if (desc.trim() === '') reason = 'empty';
    else if (normalize(desc) === normalize(n.name)) reason = 'echoes-name';
    if (reason === null) continue;
    thinDescriptions.push({
      id: n.id, name: n.name, type: n.type, parentId: n.parentId,
      reason,
      inbound: inbound.get(n.id) ?? 0,
      outbound: outbound.get(n.id) ?? 0,
    });
  }

  // 4. Missing refs: resolved codeRefs absent from disk. Opt-in — drift is a reporting
  //    concern, not a validity one, and the server may not have the modeled repo checked out.
  const missingRefs: MissingRef[] = [];
  const disk = options.checkDisk;
  if (disk) {
    for (const n of model.nodes) {
      for (const ref of n.codeRefs) {
        // A glob needs a matcher, not an existence test; an unanchored ref is already
        // an Issue from validateModel and would only produce a duplicate complaint here.
        if (ref.includes('*')) continue;
        const resolved = resolveRef(model.nodes, n.id, ref);
        if (resolved === null) continue;
        if (!disk.exists(parseRef(resolved).path)) {
          missingRefs.push({ nodeId: n.id, ref, resolved });
        }
      }
    }
  }

  return { orphanNodes, unboundCodeEdges, thinDescriptions, missingRefs };
}

import type { HyphaeModel } from './model';
import type { Profile } from './profile';
import { layerOfType, nodeAtOrAboveLayer } from './profile';
import { parseRef, resolveRef } from './ref';

export type OrphanNode = { id: string; name: string; type: string; parentId: string | null };

export type ThinDescription = {
  id: string; name: string; type: string; parentId: string | null;
  reason: 'empty' | 'echoes-name';
  inbound: number; outbound: number;
};

export type MissingRef = { nodeId: string; ref: string; resolved: string };

export type ModelGaps = {
  orphanNodes: OrphanNode[];
  thinDescriptions: ThinDescription[];
  missingRefs: MissingRef[];
};

/** Disk access is injected, so this package never imports node:fs and stays testable. */
export type GapOptions = { checkDisk?: { cwd: string; exists: (path: string) => boolean } };

const COMPONENT_LAYER = 'Component';

/** lowercase, keep alphanumerics, collapse runs of anything else to a single space, trim. */
const normalize = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Coverage / quality gaps in a model (advisory — flags candidates, never mutates or fixes):
 * orphan Component-layer nodes (zero edges) and Component-and-above nodes whose description is
 * empty or echoes the name. Layer membership is resolved through profile helpers, not hardcoded
 * type comparisons. Missing refs (codeRefs whose resolved path is absent from disk) are reported
 * only when `options.checkDisk` is supplied; without it this function touches no filesystem.
 */
export function modelGaps(model: HyphaeModel, profile: Profile, options: GapOptions = {}): ModelGaps {
  // Degree index over all connections.
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

  // 2. Thin descriptions: Component-and-above nodes with empty or name-echoing description.
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

  // 3. Missing refs: resolved codeRefs absent from disk. Opt-in — drift is a reporting
  //    concern, not a validity one, and the server may not have the modeled repo checked out.
  const missingRefs: MissingRef[] = [];
  const disk = options.checkDisk;
  if (disk) {
    for (const n of model.nodes) {
      for (const ref of n.codeRefs) {
        // A glob needs a matcher, not an existence test; an unanchored ref is already an Issue.
        if (ref.includes('*')) continue;
        const resolved = resolveRef(model.nodes, n.id, ref);
        if (resolved === null) continue;
        if (!disk.exists(parseRef(resolved).path)) {
          missingRefs.push({ nodeId: n.id, ref, resolved });
        }
      }
    }
  }

  return { orphanNodes, thinDescriptions, missingRefs };
}

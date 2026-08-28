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

export type BloatedProse = {
  kind: 'node' | 'connection';
  id: string;
  name: string;                 // connection: "<from name> → <to name>"
  reason: 'over-budget' | 'code-shaped' | 'restates-description';
  chars: number;
  identifierDensity: number;
  coverage?: number;            // restates-description only
  item?: string;                // restates-description only
  inbound: number; outbound: number;
};

export type ModelGaps = {
  orphanNodes: OrphanNode[];
  thinDescriptions: ThinDescription[];
  missingRefs: MissingRef[];
  bloatedProse: BloatedProse[];
};

/** Disk access is injected, so this package never imports node:fs and stays testable. */
export type GapOptions = { checkDisk?: { cwd: string; exists: (path: string) => boolean } };

const COMPONENT_LAYER = 'Component';

/** All three are the measured p90 of the real 112-node Baritone model — one methodology, so they
 *  can be re-derived rather than re-argued after a rebuild. Length p90 was 630 chars, density p90
 *  16.1 per 100 words, responsibilities word-coverage p90 0.80. */
const BLOAT_CHARS = 600;
const BLOAT_DENSITY = 15;
const RESTATE_COVERAGE = 0.8;

/** lowercase, keep alphanumerics, collapse runs of anything else to a single space, trim. */
const normalize = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Shapes that mean "this is a code identifier, not prose": camelCase, a call, a source file name.
 *  Deliberately NOT an exhaustive identifier grammar — this is a density signal, not a parser. */
const CODE_SHAPES: RegExp[] = [
  /\b[a-z][a-z0-9]*[A-Z]\w*/g,                              // camelCase
  /\b\w+\(\)/g,                                             // call syntax
  /\b\w+\.(java|ts|tsx|js|py|go|rs|cs|rb|json|gradle|toml)\b/g, // source file names
  /\b[A-Z][a-z0-9]+[A-Z]\w*/g,                              // PascalCase
];

/**
 * Code-identifier hits per 100 words. Measured p90 on the real 112-node model is 16.1, so
 * BLOAT_DENSITY sits at 15.
 *
 * A genuinely CamelCase product name (PostgreSQL, TypeScript) scores as an identifier, and that
 * is accepted: two proper nouns in a 60-word description score about 3, so the flag only fires at
 * pathological density. Do NOT "fix" this with an allow-list of product names — the list would
 * never be complete and the threshold already absorbs the noise.
 */
export function identifierDensity(text: string): number {
  const words = (text.match(/\S+/g) ?? []).length;
  if (words === 0) return 0;
  let hits = 0;
  for (const re of CODE_SHAPES) hits += (text.match(re) ?? []).length;
  return (hits / words) * 100;
}

/** Words carrying no topical signal, dropped before comparing an item against a description. */
const STOPWORDS = new Set(
  ('a an the and or of to in on for with by is are be it its this that as at from into over per '
   + 'not no all any each every which when while so if then than').split(' '),
);

const contentWords = (s: string): string[] =>
  (s.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => w.length > 2 && !STOPWORDS.has(w));

/**
 * The fraction of `item`'s content words that also appear in `hay` — how much of a list entry the
 * node's own description already says.
 *
 * Word overlap, not phrase overlap, on purpose: measured on the real model, bigram coverage of
 * responsibilities sits near zero at every percentile while word coverage reaches 0.80 at p90.
 * The duplication is the same facts *reworded*, so a phrase test finds almost nothing.
 */
export function wordCoverage(item: string, hay: string): number {
  const words = contentWords(item);
  if (words.length === 0) return 0;
  const haystack = new Set(contentWords(hay));
  return words.filter((w) => haystack.has(w)).length / words.length;
}

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

  // 3. Bloated prose: a description that is over budget, reads as code, or is restated by a list.
  //    Three independent reasons on purpose — measured on the real model, the densest prose is not
  //    the longest (a 390-char pure-identifier description scored 39.3/100 words while an 899-char
  //    one scored 2.3), and duplication is item-level (only 1 node of 56 had every item covered).
  //    Advisory: this flags candidates and never mutates.
  const bloatedProse: BloatedProse[] = [];
  const nameById = new Map(model.nodes.map((n) => [n.id, n.name]));

  const measure = (
    kind: 'node' | 'connection', id: string, name: string, description: string,
    responsibilities: string[],
  ) => {
    const density = identifierDensity(description);
    const degree = { inbound: inbound.get(id) ?? 0, outbound: outbound.get(id) ?? 0 };
    const base = { kind, id, name, chars: description.length, identifierDensity: density, ...degree };
    if (description.length > BLOAT_CHARS) bloatedProse.push({ ...base, reason: 'over-budget' });
    if (density > BLOAT_DENSITY) bloatedProse.push({ ...base, reason: 'code-shaped' });
    // Scoped to responsibilities: `rules` measured zero items above the coverage threshold, so
    // checking it would only add noise.
    for (const item of responsibilities) {
      const coverage = wordCoverage(item, description);
      if (coverage >= RESTATE_COVERAGE) {
        bloatedProse.push({ ...base, reason: 'restates-description', coverage, item });
      }
    }
  };

  for (const n of model.nodes) {
    const responsibilities = Array.isArray(n.fields?.responsibilities)
      ? (n.fields.responsibilities as unknown[]).map(String)
      : [];
    measure('node', n.id, n.name, n.description ?? '', responsibilities);
  }
  for (const c of model.connections) {
    const name = `${nameById.get(c.from) ?? c.from} → ${nameById.get(c.to) ?? c.to}`;
    measure('connection', c.id, name, c.description ?? '', []);
  }

  // 4. Missing refs: resolved codeRefs absent from disk. Opt-in — drift is a reporting
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

  return { orphanNodes, thinDescriptions, missingRefs, bloatedProse };
}

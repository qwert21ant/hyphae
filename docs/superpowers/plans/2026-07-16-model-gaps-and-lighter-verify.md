# model_gaps + Lighter Verify Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a server-side `model_gaps` coverage/quality read (orphans, unbound cross-component code edges, thin/name-echoing descriptions) and lighten the modeling skill's Verify (fold the sweep into Phase 3, 4 human gates → 3).

**Architecture:** Pure `modelGaps(model, profile)` in `packages/schema` (mirrors `validateModel`), a thin `model_gaps` wrapper in `apps/server/src/mcp.ts`, and prose edits to the modeling `SKILL.md`. Read-only, advisory, whole-model.

**Tech Stack:** TypeScript, Zod, Vitest, pnpm workspace, MCP SDK.

## Global Constraints

- Layer names in the gap algorithm are resolved via profile helpers (`layerOfType`, `nodeAtOrAboveLayer`), not hardcoded string comparisons on `n.type` — honours the configurable-profiles goal. The constants `COMPONENT_LAYER = 'Component'` / `CODE_LAYER = 'Code'` are the c4 defaults, compared against `layerOfType(...)` output.
- The tool is read-only and advisory — it flags candidates; it never mutates or auto-fixes.
- Pure functions never mutate the model.
- Commit after each task. Line-ending warnings (`LF will be replaced by CRLF`) are normal here — ignore them.
- Co-author trailer on every commit: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Profile layers order (reference): `['Context', 'Container', 'Component', 'Code']`. Type→layer: System/Actor/ExternalSystem→Context, Container→Container, Component→Component, Class/Interface/Module/UIComponent/Function→Code. Connection kinds: Dependency, DataFlow, Realization, Trace.

---

### Task 1: `modelGaps` pure function in `packages/schema`

**Files:**
- Create: `packages/schema/src/gaps.ts`
- Modify: `packages/schema/src/index.ts` (add `export * from './gaps';`)
- Test: `packages/schema/test/gaps.test.ts`

**Interfaces:**
- Consumes: `HyphaeModel` (`./model`), `Profile` + `layerOfType` + `nodeAtOrAboveLayer` (`./profile`).
- Produces:
  - `modelGaps(model: HyphaeModel, profile: Profile): ModelGaps`
  - `type OrphanNode = { id: string; name: string; type: string; parentId: string | null }`
  - `type UnboundCodeEdge = { id: string; from: string; to: string; fromName: string; toName: string; fromComponent: string | null; toComponent: string | null; type: string }`
  - `type ThinDescription = { id: string; name: string; type: string; parentId: string | null; reason: 'empty' | 'echoes-name'; inbound: number; outbound: number }`
  - `type ModelGaps = { orphanNodes: OrphanNode[]; unboundCodeEdges: UnboundCodeEdge[]; thinDescriptions: ThinDescription[] }`

- [ ] **Step 1: Write the failing test**

Create `packages/schema/test/gaps.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { modelGaps } from '../src/gaps';
import { emptyModel } from '../src/model';
import { c4Backend } from '../src/profiles/c4-backend';
import type { HyphaeModel } from '../src/model';

const nodeBase = { codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {} };
const edgeBase = { description: '', direction: 'Unidirectional' as const, realizedBy: [], codeRefs: [], fields: {} };

/** sys > (ca > a1[code: ka1], a2[code: ka2]) , (cb > b1[code: kb1]) , orphan component a3 */
function model(): HyphaeModel {
  const m = emptyModel();
  m.nodes.push(
    { id: 'sys', name: 'Sys', type: 'System', parentId: null, description: 'The system', ...nodeBase },
    { id: 'ca', name: 'Alpha', type: 'Container', parentId: 'sys', description: 'Alpha container', ...nodeBase },
    { id: 'cb', name: 'Beta', type: 'Container', parentId: 'sys', description: 'Beta container', ...nodeBase },
    { id: 'a1', name: 'A1', type: 'Component', parentId: 'ca', description: 'Handles alpha ingest', ...nodeBase },
    { id: 'a2', name: 'A2', type: 'Component', parentId: 'ca', description: 'a2', ...nodeBase }, // echoes-name
    { id: 'b1', name: 'B1', type: 'Component', parentId: 'cb', description: '', ...nodeBase }, // empty
    { id: 'a3', name: 'A3', type: 'Component', parentId: 'ca', description: 'Standalone', ...nodeBase }, // orphan
    { id: 'ka1', name: 'KA1', type: 'Class', parentId: 'a1', description: 'k', ...nodeBase },
    { id: 'ka2', name: 'KA2', type: 'Class', parentId: 'a2', description: 'k', ...nodeBase },
    { id: 'kb1', name: 'KB1', type: 'Class', parentId: 'b1', description: 'k', ...nodeBase },
  );
  m.connections.push(
    { id: 'e1', from: 'a1', to: 'b1', type: 'Dependency', ...edgeBase }, // component edge a1->b1
    { id: 'e2', from: 'a1', to: 'a2', type: 'Dependency', ...edgeBase }, // component edge a1->a2 (keeps a2 non-orphan)
    { id: 'ce1', from: 'ka1', to: 'kb1', type: 'Dependency', ...edgeBase }, // cross-component code edge, UNBOUND
    { id: 'ce2', from: 'ka1', to: 'ka2', type: 'Dependency', ...edgeBase }, // cross-component code edge (a1->a2)
    { id: 'ci', from: 'ka1', to: 'ka1', type: 'Dependency', ...edgeBase }, // intra-component (self) code edge
  );
  return m;
}

describe('modelGaps', () => {
  it('flags Component-layer nodes with zero connections as orphans', () => {
    const g = modelGaps(model(), c4Backend);
    expect(g.orphanNodes.map((n) => n.id)).toEqual(['a3']);
  });

  it('flags cross-component code edges not bound via realizedBy, excluding intra-component edges', () => {
    const g = modelGaps(model(), c4Backend);
    const ids = g.unboundCodeEdges.map((e) => e.id).sort();
    expect(ids).toEqual(['ce1', 'ce2']); // ci (self, intra-component) excluded
    const ce1 = g.unboundCodeEdges.find((e) => e.id === 'ce1')!;
    expect(ce1).toMatchObject({ fromComponent: 'A1', toComponent: 'B1' });
  });

  it('excludes a code edge already bound via some connection realizedBy', () => {
    const m = model();
    m.connections.find((c) => c.id === 'e1')!.realizedBy = ['ce1'];
    const g = modelGaps(m, c4Backend);
    expect(g.unboundCodeEdges.map((e) => e.id)).toEqual(['ce2']); // ce1 now claimed
  });

  it('classifies thin descriptions as empty or echoes-name with degree counts', () => {
    const g = modelGaps(model(), c4Backend);
    const byId = Object.fromEntries(g.thinDescriptions.map((t) => [t.id, t]));
    expect(byId['b1']).toMatchObject({ reason: 'empty' });
    expect(byId['a2']).toMatchObject({ reason: 'echoes-name' });
    // a1 has a real description -> not thin
    expect(byId['a1']).toBeUndefined();
    // b1 degree: inbound e1 (a1->b1) = 1, outbound 0
    expect(byId['b1']).toMatchObject({ inbound: 1, outbound: 0 });
  });

  it('does not flag Code-layer nodes for thin descriptions (floor is Component-and-above)', () => {
    const g = modelGaps(model(), c4Backend);
    expect(g.thinDescriptions.some((t) => t.type === 'Class')).toBe(false);
  });

  it('returns empty gap lists for an empty model', () => {
    expect(modelGaps(emptyModel(), c4Backend)).toEqual({ orphanNodes: [], unboundCodeEdges: [], thinDescriptions: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hyphae/schema test gaps`
Expected: FAIL — cannot find module `../src/gaps` / `modelGaps` is not a function.

- [ ] **Step 3: Write minimal implementation**

Create `packages/schema/src/gaps.ts`:

```ts
import type { HyphaeModel } from './model';
import type { Profile } from './profile';
import { layerOfType, nodeAtOrAboveLayer } from './profile';

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

export type ModelGaps = {
  orphanNodes: OrphanNode[];
  unboundCodeEdges: UnboundCodeEdge[];
  thinDescriptions: ThinDescription[];
};

const COMPONENT_LAYER = 'Component';
const CODE_LAYER = 'Code';

/** lowercase, keep alphanumerics, collapse runs of anything else to a single space, trim. */
const normalize = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Coverage / quality gaps in a model (advisory — flags candidates, never mutates or fixes):
 * orphan Component-layer nodes (zero edges), cross-component Code↔Code edges not bound via any
 * connection's realizedBy, and Component-and-above nodes whose description is empty or echoes the name.
 * Layer membership is resolved through profile helpers, not hardcoded type comparisons.
 */
export function modelGaps(model: HyphaeModel, profile: Profile): ModelGaps {
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

  return { orphanNodes, unboundCodeEdges, thinDescriptions };
}
```

Then add to `packages/schema/src/index.ts` after the `export * from './rollup';` line:

```ts
export * from './gaps';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @hyphae/schema test gaps`
Expected: PASS (6 tests).

- [ ] **Step 5: Typecheck the package**

Run: `pnpm --filter @hyphae/schema build` (or the repo's typecheck script if `build` is absent — check `packages/schema/package.json` scripts)
Expected: no type errors.

- [ ] **Step 6: Commit**

```bash
git add packages/schema/src/gaps.ts packages/schema/src/index.ts packages/schema/test/gaps.test.ts
git commit -m "feat(schema): add modelGaps coverage/quality read

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `model_gaps` MCP tool wrapper

**Files:**
- Modify: `apps/server/src/mcp.ts` (import `modelGaps`; add handler in `buildTools`; register tool; update `validate_model` description)
- Test: `apps/server/test/mcp.test.ts` (add a `model_gaps` case)

**Interfaces:**
- Consumes: `modelGaps` from `@hyphae/schema`, `resolveProfile` (already imported), the `buildTools(api)` pattern.
- Produces: `tools.model_gaps({})` returning `ModelGaps`; a registered `model_gaps` MCP tool.

- [ ] **Step 1: Write the failing test**

In `apps/server/test/mcp.test.ts`, add inside the `describe('MCP tool handlers', ...)` block (after the `validate_model` test at line ~57):

```ts
  it('model_gaps flags orphans, unbound code edges, and thin descriptions', async () => {
    const api = fakeApi({ getModel: async () => {
      const m = model();
      // add a second container with a lone (orphan) component + an unbound cross-component code edge
      m.nodes.push(
        { id: 'comp', name: 'Comp', type: 'Component', parentId: 'api', description: 'does work', fields: {}, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't' },
        { id: 'orph', name: 'Orph', type: 'Component', parentId: 'api', description: '', fields: {}, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't' },
      );
      return m;
    } });
    const g = (await buildTools(api).model_gaps({})) as {
      orphanNodes: Array<{ id: string }>;
      thinDescriptions: Array<{ id: string; reason: string }>;
      unboundCodeEdges: unknown[];
    };
    expect(g.orphanNodes.map((n) => n.id)).toEqual(['comp', 'orph']); // both components have no edges
    expect(g.thinDescriptions.some((t) => t.id === 'orph' && t.reason === 'empty')).toBe(true);
    expect(Array.isArray(g.unboundCodeEdges)).toBe(true);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hyphae/server test mcp`
Expected: FAIL — `tools.model_gaps is not a function`.

- [ ] **Step 3: Add the import**

In `apps/server/src/mcp.ts`, extend the `@hyphae/schema` import (the block at lines 4–8) to include `modelGaps`:

```ts
import {
  modelOverview, rollupConnections, validateModel, modelGaps, resolveProfile, HyphaeModelSchema, c4Backend,
  effectiveFields, connectionKindIds, nodeAtOrAboveLayer,
  type HyphaeModel, type FieldDef,
} from '@hyphae/schema';
```

- [ ] **Step 4: Add the handler**

In `buildTools`, immediately after the `validate_model` handler (ends at line ~213), add:

```ts
    model_gaps: async (_: Record<string, never>) => {
      const model = await api.getModel();
      return modelGaps(model, resolveProfile(model));
    },
```

- [ ] **Step 5: Register the tool**

In `main()`, immediately after the `validate_model` registration (ends at line ~414), add:

```ts
  server.registerTool('model_gaps', {
    description: 'Advisory coverage/quality read (read-only, whole-model). Returns three gap lists: orphanNodes (Component-layer nodes with zero connections), unboundCodeEdges (cross-component Code↔Code edges whose id is in no connection\'s realizedBy — candidates to bind), and thinDescriptions (Component-and-above nodes whose description is empty or echoes the name, each with inbound/outbound degree so a thin hub is visible). Flags candidates only — it never mutates or auto-fixes; a legitimately standalone component or a terse-but-fine node may appear. Complements validate_model, which checks structure/fields; this checks semantic coverage.',
    inputSchema: {},
  }, async () => text(await tools.model_gaps({})));
```

- [ ] **Step 6: Update the `validate_model` description**

In the `validate_model` registration, change the trailing sentence that reads
`Note: this checks structure/fields only — it does NOT find semantic gaps like orphan components or unbound code edges.`
to:
`Note: this checks structure/fields only — for semantic coverage gaps (orphan components, unbound code edges, thin descriptions) use model_gaps.`

- [ ] **Step 7: Run the test to verify it passes**

Run: `pnpm --filter @hyphae/server test mcp`
Expected: PASS (including the new `model_gaps` case).

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/mcp.ts apps/server/test/mcp.test.ts
git commit -m "feat(server): expose model_gaps MCP read tool

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Lighten Verify in the modeling SKILL.md

**Files:**
- Modify: `plugins/hyphae-modeling/skills/building-architecture-models/SKILL.md`

No code/tests — this is a prose/procedure change. Verify by reading the diff and confirming every required clause below is present and the ownership/idempotency guarantees survive.

**Interfaces:** none (documentation).

- [ ] **Step 1: Add the coverage-sweep tail to Phase 3**

In `### Phase 3 — Reconcile + connections + GATE 2`, insert a new step between the current step 1 (aggregate) and step 2 (GATE 2), and fold the verify flags into GATE 2. Replace the existing steps 1–4 so they read:

```markdown
1. Aggregate all reports into one review bundle using the shared **Reconcile procedure** below:
   - cross-package connections — resolve each endpoint to an id by **(container, name)**, not by bare name (component names repeat across containers); dedupe,
   - proposed amendments to System / Containers (`update_nodes`),
   - new ExternalSystem nodes + edges to them.
2. **Coverage sweep (context still hot).** Call `model_gaps` once — it returns orphan Components, unbound cross-component code edges, and thin/name-echoing descriptions (with degree) in a single read. Carry the flags into GATE 2 as *candidates*, separating likely-real gaps from legitimately standalone components (a component a subagent listed under `standaloneComponents` is expected — not a gap).
3. **GATE 2: show the bundle + the coverage flags.** Conflicting amendments from different subagents are surfaced for the user to resolve — never last-write-wins. Confirmed gaps are filled by the **owning container's subagent**, never by the orchestrator inventing edges. Wait for approval/trim.
4. Apply the approved bundle: one `update_nodes` for amendments → one `create_nodes` for ExternalSystems → one `create_connections` for all cross-package/external edges. Re-dispatch owning subagents for any confirmed intra-container gaps.
5. Tick the plan artifact's progress markers. Call `model_overview` and summarize the model.
```

- [ ] **Step 2: Add the shared Reconcile procedure**

Immediately after the Phase 3 section (before `### Phase 4`), add:

```markdown
#### Reconcile procedure (shared by GATE 2 and GATE 3)

Mechanical part (do this before showing the gate, so the human sees only real decisions):
1. **Resolve** each reported endpoint to a node id by **(container[, component], name)** — never bare name.
2. **Dedupe** identical resolved edges (same from/to/type) into one.
3. **Surface only**: amendments that *conflict* between subagents, and new ExternalSystem nodes/edges. Identical or non-overlapping amendments need no human decision — apply them.

Never resolve a conflict by last-write-wins; a genuine disagreement is always a human decision at the gate.
```

- [ ] **Step 3: Point GATE 3 at the shared procedure**

In `### Phase 4`, step 2 (`GATE 3 (mirrors Phase 3)`), replace the sentence
`The orchestrator aggregates reports, resolves each cross-component code edge endpoint by (container, component, name), dedupes, and surfaces conflicts (never last-write-wins).`
with:
`The orchestrator aggregates reports with the shared **Reconcile procedure** (resolve each cross-component code edge endpoint by (container, component, name), dedupe, surface only conflicts — never last-write-wins).`

- [ ] **Step 4: Demote Phase 5 to an optional re-run built on the tools**

Replace the `### Phase 5 — Verify (optional, re-runnable)` section body (the intro line plus steps 0–4) with:

```markdown
A standalone consistency pass over an existing model. The Phase-3 tail already runs this sweep inline (its checkpoint folded into GATE 2), so Phase 5 is only needed as a **re-run** — after Phase 4, or any time later. Read-mostly: gaps are filled by the owning subagent, never by the orchestrator inventing edges.
0. **Structural check.** Call `validate_model` — it returns any structural/field issues (bad containment, dangling/bad endpoints, unknown or missing-required fields, bad enum values, bad refs) in one read. Fix those first. Empty means structurally clean.
1. **Coverage sweep.** Call `model_gaps` — one read returns orphan Components (zero connections), unbound cross-component code edges (id in no `realizedBy`), and thin/name-echoing descriptions (with inbound/outbound degree, so a thin hub — high inbound but an empty/echoing description — stands out). Separate likely-real gaps from legitimately standalone components (`standaloneComponents` are expected).
2. **CHECKPOINT: show the flagged gaps.** Wait for confirmation of which to fix.
3. For confirmed gaps, **re-dispatch the owning container's subagent** (same `references/subagent-prompt.md`) to add the missing intra-container edges or descriptions. The orchestrator must not write intra-container edges itself.
4. Idempotent (create-or-skip), so Verify can be re-run until clean.
```

- [ ] **Step 5: Update the closing note under Phase 5**

Replace the blockquote that currently begins `> \`list_connections\` returns the whole edge set ...` with:

```markdown
> `model_gaps` computes the coverage flags server-side in one call, so the sweep stays cheap even on large models — no need to pull the whole edge set and re-derive orphans/unbound edges in context. To inspect a single flagged node's edges, use `list_connections({nodeId})`.
```

- [ ] **Step 6: Update the flow summary line count**

In `## The flow`, the line `Follow the phases in order. Do not skip the gates.` — leave as is. Then in the intro to `## Keep the orchestrator cheap` nothing changes. Confirm no other line asserts a fixed "4 gates" count; if a phase/gate summary names the number of human stops, update it to three (GATE 1, GATE 2, GATE 3). (Search the file for `GATE` and for `Phase 5` to confirm consistency.)

- [ ] **Step 7: Sanity-check the whole file**

Read the modified `SKILL.md` end to end and confirm:
- The idempotency contract section is unchanged.
- The Red flags section still forbids subagents creating shared nodes and the orchestrator inventing edges; add a red flag if missing: `- The orchestrator writing an intra-container edge to "fix" a model_gaps flag → re-dispatch the owning subagent instead.`
- Ownership fences and conflict-surfacing language survive.

- [ ] **Step 8: Commit**

```bash
git add plugins/hyphae-modeling/skills/building-architecture-models/SKILL.md
git commit -m "docs(skill): fold Verify sweep into Phase 3 via model_gaps (4 gates -> 3)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification (after all tasks)

- [ ] Run the whole suite: `pnpm -r test` — all green.
- [ ] Read the three commits' combined diff; confirm scope is only `packages/schema`, `apps/server/src/mcp.ts` + its test, and `SKILL.md`.
- [ ] Confirm `model_gaps` is registered and its description contrasts with `validate_model`.
```

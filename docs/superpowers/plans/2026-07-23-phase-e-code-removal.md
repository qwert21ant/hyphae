# Phase E — Retire the Code Node Layer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the Code node layer (the 5 Code node kinds + the `'Code'` layer) from the `c4-backend` profile and clean up every downstream surface that assumed it, with no model migration (the model is recreated afterward).

**Architecture:** The profile is the single source of truth. The one substantive source edit (dropping the Code vocabulary from `c4-backend.ts`) ripples into hand-built test literals and a few Code-specific descriptions/colors. Tasks are ordered so `pnpm -r test` stays green at every task boundary: the incidental Code-using fixtures (web, server) are rebased onto the surviving Context/Container/Component layers **before** the profile change; the tests that directly assert Code semantics flip **with** the profile change in one commit.

**Tech Stack:** pnpm workspaces · TypeScript · Zod (`packages/schema`, source of truth) · Hono (`apps/server`) · Vite + React 18 + `@xyflow/react` + Zustand (`apps/web`) · Vitest · MCP over an HTTP client of the running server.

## Global Constraints

- **NEVER `git add` a model `.json`.** `apps/server/hyphae-cctv-new.json` and `apps/server/hyphae.json` are untracked. Stage files **explicitly** (never `git add apps/server` or `git add -A`). Run `git status --short` before **every** commit and confirm no `.json` is staged.
- **`schemaVersion` stays `1`** (spec D-E2). Do **not** touch `packages/schema/src/model.ts`.
- **No model migration.** Do not write a migration script, author Patterns, or edit any model `.json`.
- **`pnpm -r test` does NOT type-check.** After every task run all three: `pnpm --filter @hyphae/schema exec tsc -p tsconfig.json`, `pnpm --filter @hyphae/server exec tsc -p tsconfig.json`, `pnpm --filter @hyphae/web exec tsc --noEmit -p tsconfig.json`.
- **Zod schemas in `packages/schema/src` are the single source of truth.** Removing a node kind is a profile edit; never hardcode vocabulary elsewhere.
- **Baseline:** 402 tests (schema 139, server 101, web 162), all three tsc clean, branch `phase-e-code-removal` off spec commit `b010c07`.
- **Write scratch to** `C:\Users\qwert\AppData\Local\Temp\claude\C--projects-hyphae\<session>\scratchpad`, never the repo.

---

## Task 1: Remove the `unboundCodeEdge` gap

**Files:**
- Modify: `packages/schema/src/gaps.ts`
- Test: `packages/schema/test/gaps.test.ts`
- Modify: `apps/server/src/mcp.ts:512` (validate_model desc), `apps/server/src/mcp.ts:525` (model_gaps desc)
- Test: `apps/server/test/mcp.test.ts:74-81`

**Interfaces:**
- Produces: `ModelGaps = { orphanNodes, thinDescriptions, missingRefs }` (the `unboundCodeEdges` field is removed). `UnboundCodeEdge` type no longer exported.

This is independent of the Code-kind removal (the Code layer still exists after this task); it only deletes a gap that becomes impossible in Task 4.

- [ ] **Step 1: Update `gaps.test.ts` to drop the unbound-code tests and de-Code its fixture.**

Replace the `model()` factory (lines 10-33) with (removes the `ka1`/`ka2`/`kb1` Class nodes and the `ce1`/`ce2`/`ci` code connections; keeps the orphan/thin fixtures):

```ts
/** sys > (ca > a1[desc], a2[echoes], a3[orphan]) , (cb > b1[empty]) */
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
  );
  m.connections.push(
    { id: 'e1', from: 'a1', to: 'b1', type: 'Dependency', ...edgeBase }, // component edge a1->b1
    { id: 'e2', from: 'a1', to: 'a2', type: 'Dependency', ...edgeBase }, // component edge a1->a2 (keeps a2 non-orphan)
  );
  return m;
}
```

Delete the two `unboundCodeEdges` tests entirely (the `it('flags cross-component code edges…')` block and the `it('excludes a code edge already bound…')` block, lines 41-54).

Delete the `it('does not flag Code-layer nodes for thin descriptions…')` block (lines 67-70).

Change the empty-model test (line 73) to drop the field:

```ts
  it('returns empty gap lists for an empty model', () => {
    expect(modelGaps(emptyModel(), c4Backend)).toEqual({ orphanNodes: [], thinDescriptions: [], missingRefs: [] });
  });
```

- [ ] **Step 2: Update `mcp.test.ts` gap-shape assertion.**

In `apps/server/test/mcp.test.ts`, in the `model_gaps` result type (lines 74-78) delete the line `unboundCodeEdges: unknown[];` and delete the assertion line `expect(Array.isArray(g.unboundCodeEdges)).toBe(true);` (line 81).

- [ ] **Step 3: Run the tests to verify they fail (source still returns the field).**

Run: `pnpm --filter @hyphae/schema test -- gaps && pnpm --filter @hyphae/server test -- mcp`
Expected: FAIL — the empty-model `toEqual` fails because the actual result still carries `unboundCodeEdges`.

- [ ] **Step 4: Remove the gap from `gaps.ts`.**

Rewrite `packages/schema/src/gaps.ts` to (a) delete the `UnboundCodeEdge` export, (b) delete `unboundCodeEdges` from `ModelGaps`, (c) delete the `CODE_LAYER` constant, `byId`, the `liftCache`/`liftToComponent` helper, the `claimed` set, and the entire unbound-code detection loop, renumbering the remaining comments 1/2/3:

```ts
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
```

- [ ] **Step 5: Update the two MCP descriptions in `apps/server/src/mcp.ts`.**

Line 512 (`validate_model` description) — change the tail `…for semantic coverage gaps (orphan components, unbound code edges, thin descriptions) use model_gaps.` to:

```
for semantic coverage gaps (orphan components, thin descriptions) use model_gaps.
```

Line 525 (`model_gaps` description) — change `Returns four gap lists: orphanNodes (…), unboundCodeEdges (…candidates to bind), thinDescriptions (…), and missingRefs (…).` to remove the `unboundCodeEdges` clause and say three lists:

```
description: 'Advisory coverage/quality read (read-only, whole-model). Returns three gap lists: orphanNodes (Component-layer nodes with zero connections), thinDescriptions (Component-and-above nodes whose description is empty or echoes the name, each with inbound/outbound degree so a thin hub is visible), and missingRefs (codeRefs that resolve to a path absent on disk — populated only when a disk check is requested; currently always empty, as no caller wires checkDisk yet). Flags candidates only — it never mutates or auto-fixes; a legitimately standalone component or a terse-but-fine node may appear. Complements validate_model, which checks structure/fields; this checks semantic coverage.',
```

- [ ] **Step 6: Verify tests pass and all three type-checks are clean.**

Run: `pnpm --filter @hyphae/schema test -- gaps && pnpm --filter @hyphae/server test -- mcp`
Expected: PASS.
Run: `pnpm -r test` → Expected: PASS (schema 136, server 101, web 162 — three schema tests removed).
Run the three tsc commands (see Global Constraints) → Expected: all clean.

- [ ] **Step 7: Commit.**

```bash
git add packages/schema/src/gaps.ts packages/schema/test/gaps.test.ts apps/server/src/mcp.ts apps/server/test/mcp.test.ts
git status --short   # confirm NO .json staged
git commit -m "refactor(schema,server): remove the unbound-code-edge gap

Both endpoints can never be Code once the Code layer is dropped (Phase E),
so the gap can never fire. Removes UnboundCodeEdge, the unboundCodeEdges
field on ModelGaps, and the detection loop; updates the model_gaps /
validate_model MCP descriptions. Code layer still present after this task.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Rebase web test fixtures off the Code layer

**Files:**
- Test: `apps/web/test/focusView.test.ts`
- Test: `apps/web/test/Canvas.test.tsx`

**Interfaces:**
- Consumes: nothing new. Pure test refactor — the surviving Context/Container/Component layers exercise the same rollup/representative/render machinery. These edits pass **with the Code layer still present** (they simply stop using `Class` nodes) and survive Task 4 unchanged.

The `Class` nodes here are incidental "deep" fixtures. Since Component becomes the leaf, endpoints that used to roll up *from below a Component* are re-expressed as endpoints that roll up *from Component to Container* (at a System focus) or drawn directly. Three tests assert behavior that only exists because Code nodes are Component children; those are removed.

- [ ] **Step 1: `focusView.test.ts` — de-Code `model()` and its docstring.**

Change the docstring (line 9) and remove the `k1` node (line 19):

```ts
/** sys › (ca, cb containers); ca has comps a1,a2; cb has comp b1; ext is external. */
function model() {
  const m = emptyModel();
  m.nodes.push(
    { id: 'sys', name: 'Sys', type: 'System', parentId: null, ...base },
    { id: 'ca', name: 'Alpha', type: 'Container', parentId: 'sys', ...base },
    { id: 'cb', name: 'Beta', type: 'Container', parentId: 'sys', ...base },
    { id: 'a1', name: 'A1', type: 'Component', parentId: 'ca', ...base },
    { id: 'a2', name: 'A2', type: 'Component', parentId: 'ca', ...base },
    { id: 'b1', name: 'B1', type: 'Component', parentId: 'cb', ...base },
    { id: 'ext', name: 'Ext', type: 'ExternalSystem', parentId: null, ...base },
  );
  return m;
}
```

- [ ] **Step 2: `focusView.test.ts` — rebase the two rollup tests that used `k1`→`b1`.**

Replace the `it('merges opposite-direction rollups…')` body (lines 63-78). The pair now rolls up on the `b1`→`cb` side; `a1` is a shown child:

```ts
  it('merges opposite-direction rollups between the same pair into one undirected edge', () => {
    // a1 (shown child of focus ca) ↔ b1 (Component under cb) in both directions: both map to a1↔cb.
    // They must collapse to a single edge (count 2) with no direction, not two overlapping arrows.
    const m = model();
    m.connections.push(
      { id: 'f', from: 'a1', to: 'b1', type: 'Dependency', ...e },
      { id: 'b', from: 'b1', to: 'a1', type: 'Dependency', ...e },
    );
    const v = buildFocusView(m, 'ca');
    const between = v.edges.filter(
      (x) => (x.from === 'a1' && x.to === 'cb') || (x.from === 'cb' && x.to === 'a1'),
    );
    expect(between).toHaveLength(1);
    expect(between[0]).toMatchObject({ derived: true, count: 2, direction: 'None' });
    expect([...between[0].realizedBy].sort()).toEqual(['b', 'f']);
  });
```

Replace the `it('keeps the arrow direction when all rollups between a pair point the same way')` body (lines 80-89):

```ts
  it('keeps the arrow direction when all rollups between a pair point the same way', () => {
    const m = model();
    m.connections.push(
      { id: 'f1', from: 'a1', to: 'b1', type: 'Dependency', ...e },
      { id: 'f2', from: 'a1', to: 'b1', type: 'Dependency', ...e },
    );
    const v = buildFocusView(m, 'ca');
    const edge = v.edges.find((x) => x.from === 'a1' && x.to === 'cb')!;
    expect(edge).toMatchObject({ derived: true, count: 2, direction: 'Unidirectional' });
  });
```

- [ ] **Step 3: `focusView.test.ts` — delete the now-redundant deep-rollup test.**

Delete the entire `it('rolls a connection several levels below the children up to the children (System focus)')` block (lines 147-154). With Component as the floor, it is identical to the `it('rolls a connection authored below the children up to the shown children (System focus)')` test immediately above it (a Component rolling up to its Container at a System focus).

- [ ] **Step 4: `focusView.test.ts` — rebase the "does not double-count realizedBy children" test.**

Replace its body (lines 170-190) to use Container/Component levels at a System focus:

```ts
  it('does not double-count realizedBy children: a direct edge with realized children stays one real edge', () => {
    // Parent ca→cb (Container level, both shown children of sys) is realized by child a1→b1 (Component
    // level), which rolls up to the same ca→cb pair. The child must not inflate the pair to a rollup —
    // it is represented by its parent (reachable via the parent's realizedBy in the panel).
    const m = emptyModel();
    m.nodes.push(
      { id: 'sys', name: 'Sys', type: 'System', parentId: null, ...base },
      { id: 'ca', name: 'Alpha', type: 'Container', parentId: 'sys', ...base },
      { id: 'cb', name: 'Beta', type: 'Container', parentId: 'sys', ...base },
      { id: 'a1', name: 'A1', type: 'Component', parentId: 'ca', ...base },
      { id: 'b1', name: 'B1', type: 'Component', parentId: 'cb', ...base },
    );
    m.connections.push(
      { id: 'parent', from: 'ca', to: 'cb', type: 'Dependency', ...e, realizedBy: ['child'] },
      { id: 'child', from: 'a1', to: 'b1', type: 'DataFlow', ...e },
    );
    const v = buildFocusView(m, 'sys');
    const caCb = v.edges.filter((x) => x.from === 'ca' && x.to === 'cb');
    expect(caCb).toHaveLength(1);
    expect(caCb[0]).toMatchObject({ id: 'parent', kind: 'Dependency', derived: false, count: 1 });
  });
```

- [ ] **Step 5: `focusView.test.ts` — rebase the "child-anchored edge, not the group-node rollup" test up one altitude.**

Replace the `it('at a Component focus shows code-child↔external edges…')` block (lines 192-216). Focus is now a Container whose shown child Component `x` is the finer anchor; `other` is a peer Container:

```ts
  it('at a Container focus anchors a realizing edge to the shown child component, not the group-node rollup', () => {
    // Parent other→cont (Container level) is realized by m1→x (Component level), where x is a child
    // component of the focus cont. Focusing cont, the child must surface as an edge to the shown child
    // (other → x), and the coarse parent must NOT also appear as a group-node edge (other → cont). A
    // connection authored directly on the focus (cont → ext, no realizedBy) is preserved.
    const m = emptyModel();
    m.nodes.push(
      { id: 'sys', name: 'Sys', type: 'System', parentId: null, ...base },
      { id: 'cont', name: 'Cont', type: 'Container', parentId: 'sys', ...base },
      { id: 'x', name: 'X', type: 'Component', parentId: 'cont', ...base },
      { id: 'other', name: 'Other', type: 'Container', parentId: 'sys', ...base },
      { id: 'm1', name: 'M1', type: 'Component', parentId: 'other', ...base },
      { id: 'ext', name: 'Ext', type: 'ExternalSystem', parentId: null, ...base },
    );
    m.connections.push(
      { id: 'pc', from: 'other', to: 'cont', type: 'Dependency', ...e, realizedBy: ['cc'] },
      { id: 'cc', from: 'm1', to: 'x', type: 'Dependency', ...e },
      { id: 'q', from: 'cont', to: 'ext', type: 'DataFlow', ...e },
    );
    const v = buildFocusView(m, 'cont');
    expect(v.edges.find((edge) => edge.from === 'other' && edge.to === 'x')).toBeTruthy(); // child-anchored
    expect(v.edges.find((edge) => edge.to === 'cont')).toBeUndefined();                    // no group-node rollup edge
    expect(v.edges.find((edge) => edge.from === 'cont' && edge.to === 'ext')).toMatchObject({ kind: 'DataFlow', derived: false });
    expect(v.externals.map((n) => n.id).sort()).toEqual(['ext', 'other']);
  });
```

- [ ] **Step 6: `focusView.test.ts` — replace the stakeholder "hides Code children" test.**

Delete the `it('hides Code-layer children at a Component focus')` block (lines 243-248). With Component as the floor there are no below-Component children to hide. (The stakeholder describe block keeps its other three tests, which exercise derived-edge and external hiding.)

- [ ] **Step 7: `focusView.test.ts` — rebase the `representative` deep-climb test.**

Replace the `it('climbs to the ancestor on the focus layer when the endpoint is below it')` body (lines 347-350):

```ts
  it('climbs to the ancestor on the focus layer when the endpoint is below it', () => {
    expect(representative(model(), 'a1', 'Container')).toBe('ca'); // a1 (Component) under ca
    expect(representative(model(), 'b1', 'Container')).toBe('cb'); // b1 (Component) under cb
  });
```

- [ ] **Step 8: `focusView.test.ts` — replace `k1` with `a2` in the boundary tests.**

In the `externalConnections` and `partitionConnections` describe blocks, `k1` was a descendant of `a1` inside `ca`; `a2` is a sibling Component inside `ca`, so every "inside the ca subtree" assertion holds identically. Apply:
- `c2: { id: 'c2', from: 'k1', to: 'ext', … }` → `from: 'a2'` (line 358).
- `desc: { id: 'desc', from: 'a1', to: 'k1', … }` → `to: 'a2'` (line 368).
- `x: { id: 'x', from: 'k1', to: 'ext', … }` (realized child, line 378) → `from: 'a2'`.
- `out2: { id: 'out2', from: 'k1', to: 'b1', … }` → `from: 'a2'` (line 389).
- `x: { id: 'x', from: 'k1', to: 'ext', … }` (line 402) → `from: 'a2'`.

Update the three docstring comments that mention `k1`/`a1 › k1` (lines 355, 386) to drop the code-child phrasing (e.g. "sys › ca › (a1, a2); cb › b1; ext"). All expected id arrays are unchanged.

- [ ] **Step 9: Run the web focusView tests.**

Run: `pnpm --filter @hyphae/web test -- focusView`
Expected: PASS (Code layer still present; fixtures no longer use it). Two tests fewer than baseline.

- [ ] **Step 10: `Canvas.test.tsx` — de-Code `model()` and rebase its dependent tests.**

Remove `k1` from `model()` (line 22) so `model()` ends at `b1`.

Rebase `it('double-clicking a leaf only selects (focus unchanged)')` (lines 61-67) — `a1` is now a leaf Component under `ca`:

```tsx
  it('double-clicking a leaf only selects (focus unchanged)', () => {
    useStore.setState({ model: model(), focusId: 'ca', selectedId: null });
    const { container } = render(<Canvas />);
    dblclick(container, 'a1');
    expect(useStore.getState().focusId).toBe('ca');
    expect(useStore.getState().selectedId).toBe('a1');
  });
```

Delete `it('in stakeholder mode, double-clicking a Component does not drill into its Code')` (lines 165-171): a Component has no Code children to drill into.

Rebase `it('in full mode, double-clicking a Component with children still drills')` (lines 173-178) to drill a Container:

```tsx
  it('in full mode, double-clicking a node with children still drills', () => {
    useStore.setState({ model: model(), focusId: 'sys', selectedId: null, audience: 'full' });
    const { container } = render(<Canvas />);
    dblclick(container, 'ca');
    expect(useStore.getState().focusId).toBe('ca');
  });
```

- [ ] **Step 11: `Canvas.test.tsx` — rebase `chainModel()` to produce a derived edge without Code.**

Replace `chainModel()` (lines 200-219). The derived `a2→a3` edge now comes from two `DataFlow` connections (count 2 ⇒ derived) instead of a rolled-up Code edge; both hide under a Dependency-only filter and under stakeholder mode (derived edges dropped):

```tsx
// A container whose children form a chain a1 → a2 → a3, where a2 → a3 exists only as a DERIVED edge
// (two DataFlow connections collapsed, count 2). Filtering to Dependency-only, or switching to
// stakeholder (which drops derived edges), hides it — which under the old (unstable) pipeline re-ran
// dagre and moved a3. The stable-base pipeline must keep a3 put.
function chainModel() {
  const m = emptyModel();
  m.nodes.push(
    { id: 'ca', name: 'Alpha', type: 'Container', parentId: null, ...base },
    { id: 'a1', name: 'A1', type: 'Component', parentId: 'ca', ...base },
    { id: 'a2', name: 'A2', type: 'Component', parentId: 'ca', ...base },
    { id: 'a3', name: 'A3', type: 'Component', parentId: 'ca', ...base },
  );
  m.connections.push(
    { id: 'e1', from: 'a1', to: 'a2', type: 'Dependency', ...e },
    { id: 'e2', from: 'a2', to: 'a3', type: 'DataFlow', ...e }, // two DataFlow edges → derived a2 → a3
    { id: 'e3', from: 'a2', to: 'a3', type: 'DataFlow', ...e },
  );
  return m;
}
```

- [ ] **Step 12: Run the Canvas tests.**

Run: `pnpm --filter @hyphae/web test -- Canvas`
Expected: PASS (one test fewer than baseline).

- [ ] **Step 13: Full web suite + type-check.**

Run: `pnpm --filter @hyphae/web test` → Expected: PASS (web 159 = 162 − 3 removed).
Run: `pnpm --filter @hyphae/web exec tsc --noEmit -p tsconfig.json` → Expected: clean.

- [ ] **Step 14: Commit.**

```bash
git add apps/web/test/focusView.test.ts apps/web/test/Canvas.test.tsx
git status --short   # confirm NO .json staged
git commit -m "test(web): rebase focus-view/Canvas fixtures off the Code layer

Class nodes were incidental deep fixtures; re-express the same rollup /
representative / layout-stability coverage using the surviving
Context/Container/Component layers, and drop the three tests that assert
Code-children behavior (which disappears in Phase E). Code layer still
present; these pass unchanged before and after the profile change.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Rebase server MCP `maxLayer` tests off the Code layer

**Files:**
- Test: `apps/server/test/mcp.test.ts` (the three `maxLayer:'Code'` tests)

**Interfaces:**
- Consumes: `graphModel()` (sys › ca › n1,n2 ; cb › n3,n4) and `connModel()` (sys › ca › a1,a2 ; cb › b1 ; ext) — unchanged fixtures.

`maxLayer` defaults to the deepest layer (`Component`). With Code gone there is nothing *below* the default to opt into, so these tests are re-expressed to verify `maxLayer` **caps to a shallower layer** (`Container`), which is the surviving direction of the control. They pass with the Code layer present and after its removal (they use only Container/Component/Context).

- [ ] **Step 1: Rewrite the `list_nodes` maxLayer test (lines 249-260).**

```ts
  it('list_nodes includes Components by default and caps to a shallower layer via maxLayer', async () => {
    const a = fakeApi({ getModel: async () => graphModel() });
    const def = (await buildTools(a).list_nodes({ parentId: 'ca' })) as Array<{ id: string }>;
    expect(def.map((n) => n.id).sort()).toEqual(['n1', 'n2']);          // Components included by default
    const capped = (await buildTools(a).list_nodes({ parentId: 'ca', maxLayer: 'Container' })) as Array<{ id: string }>;
    expect(capped.map((n) => n.id)).toEqual([]);                        // capped above Component
  });
```

- [ ] **Step 2: Rewrite the `get_subgraph` maxLayer test (lines 307-318).**

```ts
  it('get_subgraph includes Components by default and caps to a shallower layer via maxLayer', async () => {
    const a = fakeApi({ getModel: async () => graphModel() });
    const def = (await buildTools(a).get_subgraph({ nodeId: 'ca', depth: 1 })) as { nodes: Array<{ id: string }> };
    expect(def.nodes.map((n) => n.id)).toContain('n1');                 // Component reached by default
    const capped = (await buildTools(a).get_subgraph({ nodeId: 'ca', depth: 1, maxLayer: 'Container' })) as { nodes: Array<{ id: string }> };
    expect(capped.nodes.map((n) => n.id)).not.toContain('n1');          // capped above Component
  });
```

- [ ] **Step 3: Rewrite the `list_connections` maxLayer test (lines 386-398).**

```ts
  it('caps edges to the max layer: a Component edge is dropped, a Container edge kept', async () => {
    const withContainerEdge = () => {
      const m = connModel();
      m.connections.push({ id: 'cc', from: 'ca', to: 'cb', type: 'Dependency', fields: {}, verb: 'uses', object: '', description: '', direction: 'Unidirectional', realizedBy: [], codeRefs: [] });
      return m;
    };
    const a = fakeApi({ getModel: async () => withContainerEdge() });
    const def = (await buildTools(a).list_connections({})) as Array<{ id: string }>;
    expect(def.map((c) => c.id).sort()).toEqual(['cc', 'x1', 'x2', 'x3', 'x4']);   // all included by default
    const capped = (await buildTools(a).list_connections({ maxLayer: 'Container' })) as Array<{ id: string }>;
    expect(capped.map((c) => c.id).sort()).toEqual(['cc']);                        // only the Container↔Container edge survives
  });
```

- [ ] **Step 4: Run the server suite + type-check.**

Run: `pnpm --filter @hyphae/server test -- mcp` → Expected: PASS.
Run: `pnpm --filter @hyphae/server test` → Expected: PASS (server count unchanged: 101).
Run: `pnpm --filter @hyphae/server exec tsc -p tsconfig.json` → Expected: clean.

- [ ] **Step 5: Commit.**

```bash
git add apps/server/test/mcp.test.ts
git status --short   # confirm NO .json staged
git commit -m "test(server): rebase MCP maxLayer tests to cap shallower

With the Code layer gone there is nothing below the default (Component) to
opt into, so re-express the three maxLayer:'Code' tests to verify capping to
a shallower layer (Container). Uses only surviving layers; green before and
after the profile change.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Remove the Code layer from the profile and its assertions

**Files:**
- Modify: `packages/schema/src/profiles/c4-backend.ts`
- Test: `packages/schema/test/c4-backend.test.ts`, `packages/schema/test/profile.test.ts`, `packages/schema/test/validate.test.ts`, `packages/schema/test/overview.test.ts`
- Modify: `apps/server/src/mcp.ts` (Code-mentioning descriptions)
- Modify: `apps/web/src/reactflow.ts` (dead `Code` color)

**Interfaces:**
- Produces: `c4Backend.layers === ['Context','Container','Component']`; `nodeKinds` has no `Class`/`Interface`/`Module`/`Function`/`UIComponent`; `Component.allowedChildren === []`. `layerOfType(c4Backend, 'Class')` returns `undefined`; the MCP `maxLayer`/`create_nodes` `type` enums auto-shrink.

The Code-asserting tests flip **in the same commit** as the profile edit so `pnpm -r test` never goes red. Web (Task 2) and server MCP (Task 3) fixtures are already Code-free, so they are untouched here.

- [ ] **Step 1: Flip the Code-asserting schema tests to the new reality.**

In `packages/schema/test/c4-backend.test.ts`:

Replace `it('defines the Code layer below Component')` (lines 20-22):

```ts
  it('has three layers ending at Component (no Code layer)', () => {
    expect(c4Backend.layers).toEqual(['Context', 'Container', 'Component']);
  });
```

Delete `it('maps the code kinds to the Code layer')` (lines 24-28).

Replace `it('code kinds are children of Component')` (lines 30-36):

```ts
  it('Component is the leaf structural layer (no code-kind children)', () => {
    const component = c4Backend.nodeKinds.find((k) => k.id === 'Component')!;
    expect(component.allowedChildren).toEqual([]);
    for (const k of ['Class', 'Interface', 'Function', 'Module', 'UIComponent']) {
      expect(c4Backend.nodeKinds.find((nk) => nk.id === k)).toBeUndefined();
    }
  });
```

Replace `it('requires summary on the five non-Code kinds and not on Code kinds')` (lines 97-106) with the surviving half only:

```ts
  it('requires summary on the five structural kinds', () => {
    const summaryOf = (kindId: string) =>
      effectiveFields(c4Backend, kindId, 'node').find((f) => f.key === 'summary');
    for (const k of ['System', 'Actor', 'ExternalSystem', 'Container', 'Component']) {
      expect(summaryOf(k)?.required, `${k} should require summary`).toBe(true);
    }
  });
```

In `packages/schema/test/profile.test.ts`:

In `it('returns the allowed child types for a kind')` (lines 6-10), delete the line `expect(allowedChildTypes(c4Backend, 'Class')).toEqual([]);` and add `expect(allowedChildTypes(c4Backend, 'Component')).toEqual([]);`.

Replace `it('keeps types at or above the max layer and drops those below')` (lines 17-24):

```ts
  it('keeps types at or above the max layer and drops those below', () => {
    // layers: Context(0) Container(1) Component(2)
    expect(nodeAtOrAboveLayer(c4Backend, 'System', 'Component')).toBe(true);     // Context
    expect(nodeAtOrAboveLayer(c4Backend, 'Container', 'Component')).toBe(true);
    expect(nodeAtOrAboveLayer(c4Backend, 'Component', 'Component')).toBe(true);  // equal
    expect(nodeAtOrAboveLayer(c4Backend, 'Container', 'Context')).toBe(false);   // below the max
  });
```

In `it('returns false for an unknown node type even when the profile has an empty-string layer')` (lines 29-32), drop the trailing `'Code'` from the override literal:

```ts
    const profileWithEmptyLayer = { ...c4Backend, layers: ['', 'Container', 'Component'] };
```

In `packages/schema/test/validate.test.ts`, replace the entire `describe('Code layer containment', …)` block (lines 69-91) with containment coverage over surviving kinds:

```ts
describe('containment', () => {
  const base = { description: '', root: null, role: null, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {} };
  function withParent(parentType: string) {
    const m = emptyModel();
    m.nodes.push(
      { id: 'sys', name: 'S', type: 'System', parentId: null, ...base, fields: { summary: 'x' } },
      { id: 'ct', name: 'C', type: 'Container', parentId: 'sys', ...base, fields: { summary: 'x' } },
    );
    const parentId = parentType === 'System' ? 'sys' : 'ct';
    m.nodes.push({ id: 'cmp', name: 'Cmp', type: 'Component', parentId, ...base, fields: { summary: 'x' } });
    return m;
  }

  it('allows a Component under a Container', () => {
    expect(validateModel(withParent('Container'), c4Backend)).toEqual([]);
  });

  it('rejects a Component under a System', () => {
    const issues = validateModel(withParent('System'), c4Backend);
    expect(issues).toEqual([expect.objectContaining({ kind: 'bad-parent', ref: 'cmp' })]);
  });
});
```

In `packages/schema/test/overview.test.ts`:

Remove the `code` node from `model()` (line 14) so it ends at `cmp`, and change the count assertion. In `it('shows per-layer and per-kind counts and totals')` (lines 21-31) change `expect(out).toContain('Nodes: 4');` to `expect(out).toContain('Nodes: 3');`, and delete the two lines `expect(out).toMatch(/Code=1/);` and `expect(out).toMatch(/Class=1/);`. The `it('lists only System and Container nodes…')` test is unaffected (it already asserts `AuthService` and `[Component]` are absent).

- [ ] **Step 2: Run the schema tests to verify they now fail (source still has Code).**

Run: `pnpm --filter @hyphae/schema test`
Expected: FAIL — e.g. `c4Backend.layers` still equals `[…, 'Code']`; `Component.allowedChildren` still lists code kinds.

- [ ] **Step 3: Remove the Code vocabulary from `c4-backend.ts`.**

In `packages/schema/src/profiles/c4-backend.ts`:

Change `layers` (line 14):

```ts
  layers: ['Context', 'Container', 'Component'],
```

Change the `Component` node kind (line 70) so `allowedChildren` is empty:

```ts
    { id: 'Component', category: 'Structure', layer: 'Component', role: 'service', allowedParents: ['Container'], allowedChildren: [], fields: [summary, technology] },
```

Delete the five Code node-kind lines (lines 71-75: `Class`, `Interface`, `Module`, `UIComponent`, `Function`).

- [ ] **Step 4: Run the schema tests to verify they pass.**

Run: `pnpm --filter @hyphae/schema test`
Expected: PASS.

- [ ] **Step 5: Update the Code-mentioning MCP descriptions in `apps/server/src/mcp.ts`.**

These are text-only (the `maxLayer` and `create_nodes` `type` enums shrink automatically). Apply:

Line 381 (`model_overview`): change `It never dumps Components or Code.` → `It never dumps Components.`

Line 390 (`list_nodes` description): change `Reads default to Component-and-above; pass maxLayer:"Code" to include the Code layer.` → `Reads default to Component-and-above; pass maxLayer to cap at a shallower layer (Container/Context).`

Line 398 (`list_nodes` `maxLayer`): change `Deepest layer to include (default Component). Nodes below it are omitted — pass "Code" to include Code-layer nodes (Class/Interface/Function/Module/UIComponent).` → `Deepest layer to include (default Component, the deepest layer). Nodes below it are omitted; pass a shallower layer (Container/Context) to cap.`

Line 406 (`list_connections` description): change `By default only edges among Component-and-above nodes are returned (Code plumbing is hidden); pass maxLayer:"Code" for the full edge set.` → `By default edges among Component-and-above nodes are returned; pass maxLayer to cap at a shallower layer.`

Line 414 (`list_connections` `maxLayer`): change `Deepest layer to include (default Component). An edge is dropped if either endpoint is below it — pass "Code" to include Code-layer plumbing.` → `Deepest layer to include (default Component, the deepest layer). An edge is dropped if either endpoint is below it.`

Line 436 (`get_subgraph` description): change `Traversal stops at Component-and-above by default; pass maxLayer:"Code" to reach the Code layer.` → `Traversal stops at Component-and-above by default; pass maxLayer to cap at a shallower layer.`

Line 443 (`get_subgraph` `maxLayer`): change `Deepest layer to traverse/return (default Component). Nodes below it are not visited — pass "Code" to reach a Component's Code children.` → `Deepest layer to traverse/return (default Component, the deepest layer). Nodes below it are not visited.`

Line 463 (`create_nodes` description): change `Containment: Component→Container, Container→System, Code (Class/Interface/Function/Module/UIComponent)→Component.` → `Containment: Component→Container, Container→System. Component is the deepest structural layer (a Component's internal code lives in its codeRefs plus an optional Pattern, not child nodes).`

Line 475 (`realizedBy`): change `Ids of lower-layer connections this edge aggregates/describes (e.g. a Component↔Component edge realizedBy the Code↔Code edges that explain it). Bound edges are excluded from rollup.` → `Ids of lower-layer connections this edge aggregates/describes (e.g. a Container↔Container edge realizedBy the Component↔Component edges that explain it). Bound edges are excluded from rollup.`

- [ ] **Step 6: Remove the dead `Code` color from `apps/web/src/reactflow.ts`.**

Delete line 11 (`  Code: { bg: '#fefce8', border: '#ca8a04' },`) from the `LAYER_COLOR` object. The Legend (`Legend.tsx`) already filters `c4Backend.layers.filter((l) => LAYER_COLOR[l])`, so the Code swatch drops automatically.

- [ ] **Step 7: Full verification.**

Run: `pnpm -r test`
Expected: PASS — schema 135 (136 − 1 code test removed net; confirm the actual number and record it), server 101, web 159.
Run the three tsc commands (Global Constraints) → Expected: all clean. (This is the critical check: removing enum values and node kinds only shows up under tsc, not vitest.)

- [ ] **Step 8: Grep for stragglers.**

Run: `git grep -nE "'Code'|\"Code\"|type: 'Class'|type: 'Interface'|type: 'Module'|type: 'UIComponent'|type: 'Function'|unboundCodeEdge|CODE_LAYER" -- '*.ts' '*.tsx'`
Expected: no matches in `src`/`test` (docs handled in Task 5). If any remain, resolve before committing.

- [ ] **Step 9: Commit.**

```bash
git add packages/schema/src/profiles/c4-backend.ts packages/schema/test/c4-backend.test.ts packages/schema/test/profile.test.ts packages/schema/test/validate.test.ts packages/schema/test/overview.test.ts apps/server/src/mcp.ts apps/web/src/reactflow.ts
git status --short   # confirm NO .json staged
git commit -m "feat(schema)!: retire the Code node layer from c4-backend

Drop the five Code node kinds (Class/Interface/Module/Function/UIComponent)
and the 'Code' layer; Component.allowedChildren becomes []. Flips the
Code-asserting schema tests, the Code-mentioning MCP tool descriptions, and
the dead Code entry in the web LAYER_COLOR. schemaVersion stays 1; no
migration (the model is recreated). Code is now codeRefs + optional Pattern.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Update the modeling skill and docs

**Files:**
- Modify: `plugins/hyphae-modeling/skills/building-architecture-models/SKILL.md`
- Modify: `plugins/hyphae-modeling/skills/building-architecture-models/references/subagent-prompt.md`
- Modify: `plugins/hyphae-modeling/skills/building-architecture-models/references/plan-artifact-template.md`
- Check: `docs/MODEL.md` (verify — likely already correct)

**Interfaces:**
- Consumes: nothing (docs only). No test impact; `pnpm -r test` unaffected.

The skill currently instructs agents to build a Code layer (Phase 4, GATE 3, `maxLayer:'Code'`, unbound-code-edge gap). Phase E removes all of that; code now lives in `codeRefs` + an optional Pattern on the Component. `docs/MODEL.md` was rewritten during the design session and already states "No Code layer" (§5 line 252, §7 rule 7), so it needs only a verification pass.

- [ ] **Step 1: `SKILL.md` — delete the Code-layer phase and rewire references.**

- Delete the entire **`### Phase 4 — Code layer (re-runnable; runs after Phase 3)`** section (lines 79-108), including its GATE 3.
- In the **Reconcile procedure** intro (line 70), change `#### Reconcile procedure (shared by GATE 2 and GATE 3)` → `#### Reconcile procedure (used by GATE 2)`.
- In **Phase 5 — Verify** (line 111), change `Phase 5 is only needed as a **re-run** — after Phase 4, or any time later.` → `Phase 5 is only needed as a **re-run** — any time after the initial build.`
- In **Phase 3** step 2 (line 65), change `it returns orphan Components, unbound cross-component code edges, and thin/name-echoing descriptions` → `it returns orphan Components and thin/name-echoing descriptions`.
- In **Phase 5** step 1 (line 114), change `one read returns orphan Components (zero connections), unbound cross-component code edges (id in no `realizedBy`), and thin/name-echoing descriptions` → `one read returns orphan Components (zero connections) and thin/name-echoing descriptions`.
- In the **Idempotency contract** (line 219), change `Reads default to Component-and-above; pass `maxLayer:'Code'` when the scope you are about to touch is the Code layer.` → `Reads default to Component-and-above (Component is the deepest layer).`
- In the **Red flags** list, delete the bullet `- The orchestrator writing an intra-container edge to "fix" a model_gaps flag → re-dispatch the owning subagent instead.` only if it referenced the Code layer — it does not; **keep it**. Delete instead any residual "GATE 3" mention: the "Skipping a gate" bullet (line 232) says "all three gates (GATE 1, GATE 2, GATE 3) are mandatory" → change to `all gates (GATE 1, GATE 2) are mandatory`.

- [ ] **Step 2: `SKILL.md` — confirm the code-presence guidance points at refs + Patterns.**

The **Refs and roots** section (line 145) already says "Prefer a directory or glob Ref over a long list of file Refs" and the **Patterns** section (lines 193-215) already teaches Component internals as Patterns. Add one sentence at the end of the **Overview → Core rules** list (after line 16) to make the model explicit:

```markdown
- **Code is refs, not nodes.** A Component's internals are its `codeRefs` (directory/glob Refs into the source) plus an optional **Pattern** — never child "Class"/"Interface"/etc. nodes. Component is the deepest node layer.
```

- [ ] **Step 3: `references/subagent-prompt.md` — remove the Code-layer subagent section.**

- Delete the entire **`## Phase 4 (Code layer) subagent prompt`** section (from line 63 through the end of its report-schema block — everything describing writing `Class/Interface/Function/Module/UIComponent` nodes, `maxLayer:'Code'` reads, intra-/cross-component code edges, and the `codeNodesWritten` report field).
- If any earlier component-building section says code elements/Code nodes are added later, reword to: a Component records its important source locations in `codeRefs` (relative to the container `root`) and, where the internal structure is worth showing, an optional Pattern.

- [ ] **Step 4: `references/plan-artifact-template.md` — drop the Code-layer checklist item.**

Delete line 25 (`- [ ] Phase 4 — Code layer per container:`) and any of its sub-items.

- [ ] **Step 5: Verify `docs/MODEL.md` (and `README.md`).**

Run: `git grep -nE "Code layer|type = Class|Class/Interface|maxLayer: 'Code'|maxLayer:\"Code\"" -- docs/MODEL.md README.md`
Expected: matches only in already-correct contexts (`docs/MODEL.md:252` "No Code layer", `:308` "Code is refs + shape, not nodes", `:352` the roadmap row). The `frontend` profile row (`docs/MODEL.md:253`) legitimately lists `UIComponent` as one of *that* profile's layers — leave it. If any prose still tells a reader that `c4-backend` has a Code layer or Code node kinds, fix it to match §5.1. If nothing needs changing, do not touch the file.

- [ ] **Step 6: Sanity-check the skill has no dangling Code references.**

Run: `git grep -nE "Code layer|Code node|Class/Interface|maxLayer.*Code|GATE 3|unbound.*code" -- plugins/hyphae-modeling/`
Expected: no matches.

- [ ] **Step 7: Commit.**

```bash
git add plugins/hyphae-modeling/skills/building-architecture-models/SKILL.md plugins/hyphae-modeling/skills/building-architecture-models/references/subagent-prompt.md plugins/hyphae-modeling/skills/building-architecture-models/references/plan-artifact-template.md
# add docs/MODEL.md and/or README.md ONLY if Step 5 changed them
git status --short   # confirm NO .json staged
git commit -m "docs(skill): stop teaching the Code layer; code = refs + Pattern

Remove Phase 4 (Code layer) + GATE 3 from the modeling skill and its
subagent-prompt / plan-artifact references, and drop the unbound-code-edge
and maxLayer:'Code' guidance. Component is the deepest node layer; a
Component's internals are its codeRefs plus an optional Pattern.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final whole-branch verification (after all tasks)

- [ ] `pnpm -r test` → all pass; record final counts (expected ≈ schema 135, server 101, web 159 = 395 — confirm exact numbers).
- [ ] All three tsc commands clean.
- [ ] `git grep -nE "'Code'|type: 'Class'|type: 'Interface'|type: 'Module'|type: 'UIComponent'|type: 'Function'|unboundCodeEdge|CODE_LAYER|maxLayer.*Code" -- '*.ts' '*.tsx'` → no matches.
- [ ] `git log --oneline b010c07..HEAD` shows the 5 task commits; `git diff --stat b010c07..HEAD` confirms **no `.json`** file changed.
- [ ] Acceptance criteria (spec §11): `c4Backend.layers === ['Context','Container','Component']`; the five Code kinds gone; `Component.allowedChildren === []`; `ModelGaps` has no `unboundCodeEdges`; no MCP description mentions the Code layer; no `Code` entry in `LAYER_COLOR`; the modeling skill no longer instructs creating Code-kind nodes; `schemaVersion` stays `1`.

## Self-review notes (for the executor)

- **Green at every boundary is the load-bearing invariant.** Tasks 1-3 keep the Code layer present and only stop *using* it; Task 4 removes it and flips the asserting tests in one commit. Never run Task 4 before Tasks 2-3, or `pnpm -r test` will go red mid-branch.
- **tsc is the real gate.** Vitest strips types; the enum/kind removal in Task 4 surfaces only under the three tsc commands. Run them.
- **Test counts are estimates** — Task 1 removes 3 schema tests, Task 2 removes 3 web tests, Task 4 removes 1 schema test net (deletes "maps code kinds", keeps a renamed replacement for the others). Record the real numbers rather than trusting these.

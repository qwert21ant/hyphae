# Code Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fourth `Code` layer (Class/Interface/Function/Module/UIComponent under Component) to the `c4-backend` profile, plus an authored `realizedBy` edge-binding mechanism, rollup exclusion of bound edges, MCP/migration support, and a reworked modeling skill that builds the layer with gitnexus.

**Architecture:** This is primarily a **profile + skill** change. The schema is profile-driven, so new node kinds validate automatically via `allowedParents`; the only schema *code* changes are the `realizes`→`realizedBy` field rename on connections and the rollup-exclusion rule. The server/store persist any schema field automatically (`ConnectionSchema.parse`), so MCP only needs the field exposed in its tool input shape. The web editor is layer-generic and is verified, not rewritten.

**Tech Stack:** TypeScript, Zod, Vitest, pnpm workspaces, Hono (server), React + React Flow + Zustand (web), `@modelcontextprotocol/sdk` (MCP), gitnexus MCP (skill-time, optional).

## Global Constraints

- `schemaVersion` stays `1` — no migration framework; migrate files with the script instead.
- Strict, profile-driven validation; rejected writes return `{issues}` with 422. Do not weaken it.
- `codeRefs` stays `string[]` (convention `path/to/file.ext#SymbolName`, not schema-enforced).
- No new per-kind fields for Code nodes; reuse core fields + common `responsibilities`/`invariants`.
- Reuse existing connection kinds (`Dependency`/`DataFlow`/`Realization`/`Trace`) at the Code layer.
- Profile definitions stay hardcoded in `packages/schema/src/profiles/c4-backend.ts` but stay declarative (a future goal is per-project configurable profiles).
- Run from repo root `C:\projects\hyphae`. Per-package tests: `pnpm --filter <pkg> test`. Full suite: `pnpm -r test`. A single file: `pnpm --filter <pkg> exec vitest run <relative/path.test.ts>`.
- Work happens on branch `feat/code-layer` (already created).

---

### Task 1: Rename `realizes` → `realizedBy` on the Connection schema

Replace the dead `realizes` field (always `[]`, unread) with a top-down `realizedBy: string[]` — the ids of lower-layer connections a higher edge aggregates/describes. Because the schema type changes, every test fixture across the monorepo that sets `realizes: []` must change too, so the whole repo stays green.

**Files:**
- Modify: `packages/schema/src/connection.ts`
- Create: `packages/schema/test/connection.test.ts`
- Modify (fixtures): `packages/schema/test/rollup.test.ts:20`, `packages/schema/test/validate.test.ts:14`, `packages/schema/test/context.test.ts:12`, `apps/server/test/mcp.test.ts:13,90,188`, `apps/web/test/store.test.ts`, `apps/web/test/SidePanel.test.tsx`, `apps/web/test/toModel.test.ts`

**Interfaces:**
- Produces: `Connection.realizedBy: string[]` (default `[]`). `Connection.realizes` no longer exists.

- [ ] **Step 1: Write the failing test**

Create `packages/schema/test/connection.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ConnectionSchema } from '../src/connection';

describe('ConnectionSchema', () => {
  it('defaults realizedBy to an empty array', () => {
    const c = ConnectionSchema.parse({ id: 'c1', from: 'a', to: 'b', type: 'Dependency' });
    expect(c.realizedBy).toEqual([]);
  });

  it('accepts realizedBy ids and no longer exposes realizes', () => {
    const c = ConnectionSchema.parse({ id: 'c1', from: 'a', to: 'b', type: 'Dependency', realizedBy: ['x1', 'x2'] });
    expect(c.realizedBy).toEqual(['x1', 'x2']);
    expect('realizes' in c).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hyphae/schema exec vitest run test/connection.test.ts`
Expected: FAIL — `c.realizedBy` is `undefined` (field is still named `realizes`).

- [ ] **Step 3: Edit `packages/schema/src/connection.ts`**

Replace the `realizes` line:

```ts
  realizes: z.array(z.string()).default([]),
```

with:

```ts
  realizedBy: z.array(z.string()).default([]),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @hyphae/schema exec vitest run test/connection.test.ts`
Expected: PASS.

- [ ] **Step 5: Fix all fixtures that still set `realizes`**

In each of these files, replace `realizes: []` with `realizedBy: []` (in shared edge-base objects like `const e = { ... realizes: [], ... }` and inline connection literals):
- `packages/schema/test/rollup.test.ts` (line ~20)
- `packages/schema/test/validate.test.ts` (line ~14)
- `packages/schema/test/context.test.ts` (line ~12)
- `apps/server/test/mcp.test.ts` (lines ~13, ~90, ~188)
- `apps/web/test/store.test.ts`, `apps/web/test/SidePanel.test.tsx`, `apps/web/test/toModel.test.ts`

Then confirm none remain (excluding docs, the migration script, and the data file):

Run: `git grep -n "realizes" -- 'packages/**/test/**' 'apps/**/test/**' 'packages/schema/src/**'`
Expected: only `packages/schema/src/profiles/c4-backend.ts` (the `Realization` kind's prose description "A realizes/implements …") — NOT the connection field. No matches in test files.

- [ ] **Step 6: Run the full suite**

Run: `pnpm -r test`
Expected: PASS across schema, server, web (28/51/35-ish, all green).

- [ ] **Step 7: Commit**

```bash
git add packages/schema apps/server/test apps/web/test
git commit -m "refactor(schema): replace dead connection.realizes with realizedBy

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Add the `Code` layer and its node kinds to the profile

**Files:**
- Modify: `packages/schema/src/profiles/c4-backend.ts`
- Modify: `packages/schema/test/c4-backend.test.ts`
- Modify: `packages/schema/test/validate.test.ts` (add Code containment cases)

**Interfaces:**
- Produces: profile `layers` includes `'Code'`; node kinds `Class`, `Interface`, `Module`, `UIComponent` (category `Structure`), `Function` (category `Behavior`), each `layer: 'Code'`, `allowedParents: ['Component']`, `allowedChildren: []`. `Component.allowedChildren` includes those five.

- [ ] **Step 1: Write the failing profile tests**

In `packages/schema/test/c4-backend.test.ts`, add inside the `describe('c4-backend profile', …)` block:

```ts
  it('defines the Code layer below Component', () => {
    expect(c4Backend.layers).toEqual(['Context', 'Container', 'Component', 'Code']);
  });

  it('maps the code kinds to the Code layer', () => {
    for (const k of ['Class', 'Interface', 'Function', 'Module', 'UIComponent']) {
      expect(layerOfType(c4Backend, k)).toBe('Code');
    }
  });

  it('code kinds are children of Component', () => {
    expect(allowedParentTypes(c4Backend, 'Class')).toEqual(['Component']);
    const component = c4Backend.nodeKinds.find((k) => k.id === 'Component')!;
    expect(component.allowedChildren).toEqual(
      expect.arrayContaining(['Class', 'Interface', 'Function', 'Module', 'UIComponent']),
    );
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @hyphae/schema exec vitest run test/c4-backend.test.ts`
Expected: FAIL — `layers` lacks `'Code'`; `layerOfType` returns `undefined` for code kinds.

- [ ] **Step 3: Edit `packages/schema/src/profiles/c4-backend.ts`**

Change the `layers` line to:

```ts
  layers: ['Context', 'Container', 'Component', 'Code'],
```

Change the `Component` node-kind entry so `allowedChildren` lists the code kinds:

```ts
    { id: 'Component', category: 'Structure', layer: 'Component', allowedParents: ['Container'], allowedChildren: ['Class', 'Interface', 'Function', 'Module', 'UIComponent'], fields: [technology] },
```

Add the five code kinds immediately after the `Component` entry, still inside `nodeKinds`:

```ts
    { id: 'Class', category: 'Structure', layer: 'Code', allowedParents: ['Component'], allowedChildren: [], fields: [] },
    { id: 'Interface', category: 'Structure', layer: 'Code', allowedParents: ['Component'], allowedChildren: [], fields: [] },
    { id: 'Module', category: 'Structure', layer: 'Code', allowedParents: ['Component'], allowedChildren: [], fields: [] },
    { id: 'UIComponent', category: 'Structure', layer: 'Code', allowedParents: ['Component'], allowedChildren: [], fields: [] },
    { id: 'Function', category: 'Behavior', layer: 'Code', allowedParents: ['Component'], allowedChildren: [], fields: [] },
```

- [ ] **Step 4: Run to verify the profile tests pass**

Run: `pnpm --filter @hyphae/schema exec vitest run test/c4-backend.test.ts`
Expected: PASS.

- [ ] **Step 5: Add containment validation tests**

In `packages/schema/test/validate.test.ts`, add a test that a Code node validates only under a Component. Use the file's existing model/helper style; this self-contained block builds its own model:

```ts
import { c4Backend } from '../src/profiles/c4-backend';
// (validateModel is already imported in this file)

describe('Code layer containment', () => {
  const base = { description: '', codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {} };
  function withParent(parentType: string) {
    const m = emptyModel(); // emptyModel already imported in this file
    m.nodes.push(
      { id: 'sys', name: 'S', type: 'System', parentId: null, ...base },
      { id: 'ct', name: 'C', type: 'Container', parentId: 'sys', ...base },
      { id: 'cmp', name: 'Cmp', type: 'Component', parentId: 'ct', ...base },
    );
    const parentId = parentType === 'System' ? 'sys' : parentType === 'Container' ? 'ct' : 'cmp';
    m.nodes.push({ id: 'code', name: 'Svc', type: 'Class', parentId, ...base });
    return m;
  }

  it('allows a Class under a Component', () => {
    expect(validateModel(withParent('Component'), c4Backend)).toEqual([]);
  });

  it('rejects a Class under a Container', () => {
    const issues = validateModel(withParent('Container'), c4Backend);
    expect(issues).toEqual([expect.objectContaining({ kind: 'bad-parent', ref: 'code' })]);
  });
});
```

If `emptyModel`/`validateModel` are not yet imported at the top of `validate.test.ts`, add them to the existing import from `'../src/...'` (check the file header before adding).

- [ ] **Step 6: Run validation tests**

Run: `pnpm --filter @hyphae/schema exec vitest run test/validate.test.ts`
Expected: PASS (no change to `validate.ts` was needed — containment is profile-driven).

- [ ] **Step 7: Commit**

```bash
git add packages/schema
git commit -m "feat(schema): add Code layer + Class/Interface/Function/Module/UIComponent kinds

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Exclude `realizedBy`-claimed edges from rollup

A code edge bound to an authored Component↔Component edge (via that edge's `realizedBy`) must not also be auto-derived by rollup — the authored parent already represents it.

**Files:**
- Modify: `packages/schema/src/rollup.ts`
- Modify: `packages/schema/test/rollup.test.ts`

**Interfaces:**
- Consumes: `Connection.realizedBy` (Task 1).
- Produces: `rollupConnections(model, layer)` skips any connection whose id appears in some connection's `realizedBy`.

- [ ] **Step 1: Write the failing test**

In `packages/schema/test/rollup.test.ts`, add inside `describe('rollupConnections', …)`:

```ts
  it('excludes edges claimed by another edge realizedBy (no double counting)', () => {
    const m = model();
    // authored parent edge that binds x1; it must replace x1 in the ca->cb rollup
    m.connections.push({
      id: 'p1', from: 'a1', to: 'b1', type: 'Dependency',
      description: '', direction: 'Unidirectional', realizedBy: ['x1'], codeRefs: [], fields: {},
    });
    const r = rollupConnections(m, 'Container');
    const caCb = r.find((e) => e.from === 'ca' && e.to === 'cb')!;
    expect(caCb.realizedBy.sort()).toEqual(['p1', 'x2']); // x1 is claimed -> excluded
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @hyphae/schema exec vitest run test/rollup.test.ts`
Expected: FAIL — `caCb.realizedBy` is `['p1', 'x1', 'x2']` (x1 not yet excluded).

- [ ] **Step 3: Edit `packages/schema/src/rollup.ts`**

Inside `rollupConnections`, after building `groups` is initialized and before the `for (const conn of model.connections)` loop, add the claimed-set computation, and skip claimed edges in the loop:

```ts
  const claimed = new Set<string>();
  for (const c of model.connections) for (const id of c.realizedBy) claimed.add(id);

  const groups = new Map<string, RollupConnection>();
  for (const conn of model.connections) {
    if (claimed.has(conn.id)) continue; // already represented by an authored higher edge
    const from = lift(conn.from);
    const to = lift(conn.to);
    if (from === to) continue;
    const key = `${from}:${to}`;
    const group = groups.get(key);
    if (group) group.realizedBy.push(conn.id);
    else groups.set(key, { from, to, realizedBy: [conn.id] });
  }
```

(Replace the existing `const groups = …` + loop with the block above; keep the surrounding `lift`/`liftCache` code and the final `return [...groups.values()];`.)

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @hyphae/schema exec vitest run test/rollup.test.ts`
Expected: PASS (the new test and all four originals).

- [ ] **Step 5: Run the schema suite**

Run: `pnpm --filter @hyphae/schema test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/schema
git commit -m "feat(schema): rollup excludes edges bound via realizedBy

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Persist + expose `realizedBy` through the server and MCP

The store already persists any schema field via `ConnectionSchema.parse`. Add a server-level test proving it, then expose `realizedBy` in the MCP connection tool input shape so agents can author bindings.

**Files:**
- Modify: `apps/server/test/store.test.ts` (add a persistence test)
- Modify: `apps/server/src/mcp.ts` (add `realizedBy` to `coreConnFields`; mention it in tool descriptions)
- Modify: `apps/server/test/mcp.test.ts` (handler forwards `realizedBy`)

**Interfaces:**
- Consumes: `Connection.realizedBy` (Task 1).
- Produces: `create_connection` / `update_connection` accept `realizedBy: string[]`.

- [ ] **Step 1: Write the failing store test**

Open `apps/server/test/store.test.ts`, read its existing helpers (it constructs a `ModelStore` over a temp file and adds nodes/connections). Add a test that mirrors the file's existing pattern; the essential assertion:

```ts
it('persists realizedBy on a connection', () => {
  // build a store with two component nodes (follow this file's existing setup helper),
  // then:
  const conn = store.addConnection({ from: '<id A>', to: '<id B>', type: 'Dependency', realizedBy: ['x1'] });
  expect(conn.realizedBy).toEqual(['x1']);
  expect(store.get().connections.at(-1)!.realizedBy).toEqual(['x1']);
});
```

Use the same node ids/setup the surrounding tests use so both endpoints exist (otherwise validation 422s). If the file has no reusable two-node fixture, create the two Component nodes (under a Container under a System) at the start of this test, exactly like `apps/server/test/mcp.test.ts`'s `connModel` does.

- [ ] **Step 2: Run to verify it fails or passes**

Run: `pnpm --filter @hyphae/server exec vitest run test/store.test.ts`
Expected: PASS immediately is acceptable here (persistence is automatic via the schema). If it FAILS, the cause is a missing endpoint (422) — fix the fixture, not the store. This test locks the behavior so a future schema regression is caught.

- [ ] **Step 3: Add `realizedBy` to the MCP connection input shape**

In `apps/server/src/mcp.ts`, find `const coreConnFields = { … }` (around line 320) and add a `realizedBy` entry:

```ts
  const coreConnFields = {
    description: z.string().optional(),
    direction: z.enum(['Unidirectional', 'Bidirectional']).optional(),
    realizedBy: z.array(z.string()).optional()
      .describe('Ids of lower-layer connections this edge aggregates/describes (e.g. a Component↔Component edge realizedBy the Code↔Code edges that explain it). Bound edges are excluded from rollup.'),
    fields: z.object(fieldsShape('connection')).partial().optional(),
  };
```

In the `create_connection` tool description string, append a sentence: ` Use realizedBy to bind the lower-layer edges this connection aggregates.`

- [ ] **Step 4: Add the handler forward test**

In `apps/server/test/mcp.test.ts`, add inside the first `describe('MCP tool handlers', …)`:

```ts
  it('create_connection forwards realizedBy', async () => {
    const r = await buildTools(fakeApi()).create_connection({ from: 'a', to: 'b', type: 'Dependency', realizedBy: ['c1'] });
    expect(r).toMatchObject({ connection: { realizedBy: ['c1'] } });
  });
```

- [ ] **Step 5: Run the server suite**

Run: `pnpm --filter @hyphae/server test`
Expected: PASS.

- [ ] **Step 6: Typecheck the server**

Run: `npx tsc -p apps/server --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/mcp.ts apps/server/test
git commit -m "feat(server): expose + persist connection realizedBy via MCP

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Migrate `realizes` → `realizedBy` in the migration script + data

**Files:**
- Modify: `apps/server/scripts/migrate-model.ts`
- Data: `apps/server/hyphae-cctv.json` (re-run the script), `apps/server/hyphae.json` (if it exists)

**Interfaces:**
- Produces: migrated model files whose connections use `realizedBy` (old `realizes` values folded in).

- [ ] **Step 1: Edit the migration script**

In `apps/server/scripts/migrate-model.ts`:

Change the `CORE_CONN` set so it no longer lists `realizes` and does list `realizedBy`:

```ts
const CORE_CONN = new Set(['id', 'from', 'to', 'type', 'description', 'direction', 'realizedBy', 'codeRefs', 'fields']);
```

In the `connections` mapping inside `migrate(...)`, replace the `realizes` line:

```ts
      realizes: c.realizes ?? [],
```

with (fold any legacy `realizes` into `realizedBy`):

```ts
      realizedBy: c.realizedBy ?? c.realizes ?? [],
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -p apps/server --noEmit`
Expected: no errors.

- [ ] **Step 3: Re-run the migration on the data files (idempotent)**

Run:
```bash
pnpm --filter @hyphae/server exec tsx scripts/migrate-model.ts hyphae-cctv.json
```
Expected: `✓ apps/server/hyphae-cctv.json: N nodes, M connections migrated.` and no schema/validation errors. If `apps/server/hyphae.json` exists, run it on that file too.

Note: the server owns these files at runtime — do this only while the server is NOT running.

- [ ] **Step 4: Confirm the data no longer contains a `realizes` key**

Run: `git grep -n '"realizes"' -- apps/server/hyphae-cctv.json; echo "exit:$?"`
Expected: `exit:1` (no matches).

- [ ] **Step 5: Commit**

```bash
git add apps/server/scripts/migrate-model.ts apps/server/hyphae-cctv.json
git commit -m "chore(server): migrate-model renames realizes -> realizedBy

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Verify the web editor handles the Code layer

The editor reads `c4Backend.layers`/`typesForLayer`/`layerOfType`, so the Code layer should appear automatically. Verify; fix only if something is layer-specific.

**Files:**
- Verify (no change expected): `apps/web/src/toModel.ts`, `apps/web/src/Canvas.tsx`, `apps/web/src/store.ts`
- Possibly modify only if a verification step fails.

- [ ] **Step 1: Run web tests + typecheck + build**

Run:
```bash
pnpm --filter @hyphae/web test
npx tsc -p apps/web --noEmit
pnpm --filter @hyphae/web build
```
Expected: all PASS / build succeeds.

- [ ] **Step 2: Manual smoke test (use the `verify` skill or run the apps)**

Start the server (point it at a model that has at least one Code node — add one via MCP or the editor first), then the web app:
```bash
pnpm --filter @hyphae/server dev   # :5173
pnpm --filter @hyphae/web dev      # :3000
```
Check: (a) the layer switcher lists `Code`; (b) double-clicking a Component drills into the `Code` layer and shows its child code nodes as regions/nodes; (c) the SidePanel for a Code node shows core fields + `responsibilities`/`invariants`; (d) no console errors specific to an unknown layer.

- [ ] **Step 3: Fix only if needed**

If drill-down or rendering breaks: the likely spots are `childLayer` in `toModel.ts` (already generic via `layerOfType`) and any hardcoded layer list in `Canvas.tsx`/`store.ts`. Make the minimal change to treat `Code` like `Component` (raw connections, no rollup — `isRollupLayer` already excludes it). Add a focused test in `apps/web/test/toModel.test.ts` covering a Code node appearing on the Code layer if you touch `toModel.ts`.

- [ ] **Step 4: Commit (only if changes were made)**

```bash
git add apps/web
git commit -m "fix(web): handle Code layer in editor

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

If no changes were needed, skip the commit and note "web verified, no change" in the task report.

---

### Task 7: Rework the modeling skill for the Code layer + gitnexus

Update both the in-repo plugin copy AND the installed copy. Promote Phase 4 to a full Code-layer pass, add a cross-cutting gitnexus preamble, a GATE 3 with the binding rule, extend Verify, and fix the pre-existing `relationCategory` drift.

**Files:**
- Modify: `plugins/hyphae-modeling/skills/building-architecture-models/SKILL.md`
- Modify: `plugins/hyphae-modeling/skills/building-architecture-models/references/subagent-prompt.md`
- Modify: `plugins/hyphae-modeling/skills/building-architecture-models/references/analysis-loop.md`
- Modify: `plugins/hyphae-modeling/skills/building-architecture-models/references/plan-artifact-template.md`
- Mirror every edit into `~/.claude/skills/building-architecture-models/` (same relative paths).

- [ ] **Step 1: Fix the `relationCategory` drift in `subagent-prompt.md`**

In `references/subagent-prompt.md`:
- Step 4: change "Set `relationCategory` and `transport`." to "Set the connection `type` (a profile connection kind id) and put `transport`/`intent` in the `fields` bag." Add at the start of the steps: "0. Call `describe_profile` first to learn the current node kinds, connection kinds, fields, and enum values."
- In the JSON report's `crossPackageDeps` item, replace `"relationCategory": "Dependency|DataFlow"` with `"type": "Dependency|DataFlow|Realization|Trace", "transport": "Sync|Async|InProcess|None"`.

- [ ] **Step 2: Add the gitnexus preamble to `analysis-loop.md`**

Replace the `## Optional code depth (Phase 4 only)` section with a cross-cutting version:

```markdown
## gitnexus (cross-cutting accelerator — any phase)

If the `gitnexus` MCP is connected AND its index is current for this repo, you MAY use it in ANY
phase to go faster and deeper — it is never required (every phase must also succeed by reading the
filesystem):

- **Freshness first.** Confirm the index matches the working tree (re-index if the repo changed
  since indexing). Stale graph data is worse than none — fall back to reading files if unsure.
- **Discovery:** `query` (concept → execution flows), `context` (360° of one symbol), `cypher`
  (structural queries), `route_map`/`group_list` (entrypoints/packages).
- **Edges & importance:** `impact` (blast radius / fan-in — high fan-in marks an important element),
  graph relations `CALLS`/`IMPORTS`/`IMPLEMENTS`/`EXTENDS` → hyphae connection kinds.
- **codeRefs:** every symbol carries a `filePath`; record `path#SymbolName` as the node's `codeRefs`.
```

- [ ] **Step 3: Rewrite Phase 4 in `SKILL.md`**

Replace the `### Phase 4 — Deepen (optional, later passes)` section with:

```markdown
### Phase 4 — Code layer (re-runnable; runs after Phase 3)

Build the code-level layer below Components: the *important* classes/interfaces/functions/modules/UI
components that realize each Component. Selective — NOT every file.

**Selectivity.** Include an element if ANY holds: it realizes a stated responsibility/invariant of the
parent Component; it is a public entrypoint / API surface; it carries core domain logic; it has high
fan-in (other elements depend on it — confirm with gitnexus `impact`/`context`); or it participates in
a documented flow. Exclude by default: generic utils/helpers/constants/config, migrations, generated
code, scaffolding, tests/fixtures, trivial DTOs, framework boilerplate. No cap — model what matters; an
unwieldy count is a signal the Component is too coarse (surface it, don't truncate).

1. Dispatch one **per-container** subagent per container that has Components (parallel). Each owns ONLY
   its container's subtree. Using `references/subagent-prompt.md` (Code-layer section), each subagent:
   reads existing nodes (create-or-skip), finds the important code elements in its Components, and writes
   `Code` nodes (`type` = Class/Interface/Function/Module/UIComponent, `parentId` = the Component id),
   each with a 1–3 sentence purpose-focused `description`, `responsibilities`/`invariants` where known,
   and `codeRefs` as `path#SymbolName`. It writes **intra-component** connections (both endpoints its own
   Code nodes) and reports **cross-component** code edges upward.
2. **GATE 3 (mirrors Phase 3).** The orchestrator aggregates reports, resolves each cross-component code
   edge endpoint by (container, component, name), dedupes, and surfaces conflicts (never last-write-wins).
   Wait for approval.
3. **Binding rule (orchestrator only).** Apply approved cross-component code edges, then bind each one:
   if a Component↔Component edge between the two owning Components exists, add the code edge id to that
   edge's `realizedBy` (via `update_connection`); if none exists, `create_connection` a Component↔Component
   edge (description = what these child edges collectively represent) and set its `realizedBy`. Intra-
   component code edges need no binding. Bound edges are automatically excluded from rollup.
4. Tick the plan artifact's Code-layer markers; call `get_text_context` and summarize.
```

Renumber the old Verify section to **Phase 5** (it already is) and add this bullet to its coverage sweep:

```markdown
- **Unbound code edges.** Flag any cross-component code edge whose id is NOT in any Component↔Component
  edge's `realizedBy`. Fix by binding it (orchestrator) or by having the owning subagent confirm it.
```

Also, near **Prerequisites**, add one line: "gitnexus MAY be used in any phase when its index is current — see `references/analysis-loop.md`. It is always optional."

- [ ] **Step 4: Add a Code-layer section to `subagent-prompt.md`**

Append a clearly marked second template after the Phase 2 template:

```markdown
## Phase 4 (Code layer) subagent prompt

Same ownership rules. The orchestrator fills placeholders and dispatches one per container.

---
You are adding the CODE layer for ONE container. Stay strictly within your container's Components.

Container: {{CONTAINER_NAME}}  (id: {{CONTAINER_ID}})

0. Call `describe_profile`, then `get_text_context` and `list_nodes` (parentId per Component) — reuse
   existing Code nodes, never duplicate (match by name + parentId).
1. For each Component under your container, find the IMPORTANT code elements (apply the selectivity
   rule from SKILL.md Phase 4). Use gitnexus if its index is current; otherwise read the files.
2. `create_node` each as type Class/Interface/Function/Module/UIComponent with parentId = the Component
   id, a 1–3 sentence purpose `description`, `responsibilities`/`invariants` where known, and `codeRefs`
   as ["path/to/file.ext#SymbolName", ...].
3. `create_connection` ONLY intra-component code edges (both endpoints your own Code nodes); set `type`
   and `fields.transport`. Report cross-component code edges upward — do NOT create them.
4. On any 422, read `issues` and fix the input.

Return ONLY this JSON:
{
  "container": "{{CONTAINER_NAME}}",
  "codeNodesWritten": [ { "name": "...", "id": "...", "component": "...", "type": "Class|Interface|Function|Module|UIComponent" } ],
  "intraComponentEdges": [ { "from": "...", "to": "...", "type": "...", "why": "..." } ],
  "crossComponentEdges": [
    { "fromComponent": "...", "from": "<your code node name>",
      "toContainer": "...", "toComponent": "...", "to": "<target code node name>",
      "type": "Dependency|DataFlow|Realization", "transport": "Sync|Async|InProcess|None", "why": "..." }
  ]
}
---
```

- [ ] **Step 5: Add Code-layer markers to `plan-artifact-template.md`**

In the `## Progress` block append:

```markdown
- [ ] Phase 4 — Code layer per container:
  - [ ] <container name>
- [ ] GATE 3 approved
- [ ] Phase 5 — Verify pass (orphans + hubs + unbound code edges)
```

- [ ] **Step 6: Mirror all four edits to the installed copy**

Run (copies the in-repo skill over the installed one):
```bash
cp -r plugins/hyphae-modeling/skills/building-architecture-models/* ~/.claude/skills/building-architecture-models/
```
Then confirm: `git grep -n "relationCategory" plugins/hyphae-modeling` returns nothing, and `grep -rn "Code layer" ~/.claude/skills/building-architecture-models/` shows the new content.

- [ ] **Step 7: Commit**

```bash
git add plugins/hyphae-modeling
git commit -m "docs(skill): Code-layer Phase 4, gitnexus-anywhere, realizedBy binding; fix relationCategory drift

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Update docs + final full-suite verification

**Files:**
- Modify: `docs/HANDOFF.md`
- Verify: whole monorepo

- [ ] **Step 1: Update `docs/HANDOFF.md`**

Make these edits (match the surrounding terse style):
- Layers: note the profile now has **four** layers — Context → Container → Component → **Code**, and the Code node kinds (Class/Interface/Function/Module/UIComponent) under Component.
- Connection core: replace the `realizes` mention with `realizedBy` (top-down: a higher edge lists the lower-layer connection ids it aggregates; bound edges are excluded from rollup). Update the "exposing realizes on the MCP connection tools" open item to "done (`realizedBy`)".
- Skill section: Phase 4 is now the Code-layer pass (per-container subagents, GATE 3, binding rule); gitnexus usable in any phase when indexed; the `relationCategory` drift is fixed.
- `codeRefs` convention `path#SymbolName` for Code nodes.

- [ ] **Step 2: Run the full suite + typechecks + build**

Run:
```bash
pnpm -r test
npx tsc -p packages/schema --noEmit
npx tsc -p apps/server --noEmit
npx tsc -p apps/web --noEmit
pnpm --filter @hyphae/web build
```
Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add docs/HANDOFF.md
git commit -m "docs: HANDOFF for Code layer + realizedBy

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review (completed)

- **Spec coverage:** profile layer/kinds → Task 2; `realizes`→`realizedBy` → Task 1; rollup exclusion → Task 3; MCP exposure + persistence → Task 4; migration → Task 5; web verify → Task 6; selectivity + skill Phase 4 + GATE 3 + binding rule + gitnexus-anywhere + drift fix + Verify extension → Task 7; docs → Task 8. No new schema fields (honored). codeRefs stays `string[]` (honored).
- **Placeholder scan:** the only `{{...}}` are inside skill prompt templates (intentional). The web fix step (Task 6 Step 3) is conditional by design (verify-then-fix) with concrete locations.
- **Type consistency:** `realizedBy: string[]` used identically in connection.ts, rollup.ts (`c.realizedBy`), mcp.ts (`coreConnFields`), migrate-model.ts, and all tests. Node kind ids (`Class`/`Interface`/`Function`/`Module`/`UIComponent`) consistent across profile, validation tests, and skill prompts.

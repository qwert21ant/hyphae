# MCP Efficiency + Skill Cost Reduction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut Hyphae modeling token cost by replacing single-write MCP tools with best-effort batch tools, trimming write responses, swapping the unbounded `get_text_context` for a bounded `model_overview`, and updating the skill to use them (plus inter-phase context resets and file-based subagent reports).

**Architecture:** Batch MCP tools loop the existing single-item HTTP API (one LLM round-trip, N cheap server calls) — no new server endpoints. `model_overview` is a small bounded renderer in `@hyphae/schema`. The web editor is untouched (it uses the HTTP API directly). The skill changes are documentation.

**Tech Stack:** TypeScript, Zod, Vitest, pnpm workspaces, Hono, `@modelcontextprotocol/sdk`.

## Global Constraints

- Batch tools are **best-effort**: process items in input order, continue past failures, preserve index alignment.
- Write responses never include `version`. Creates → `{ids}` (full success) / `{results:[{id}|{issues}|{error}]}` (any failure). Updates & deletes → `{ok:true}` (full success) / `{results:[{ok}|{issues}|{error}]}` (any failure).
- No new HTTP server endpoints; batch tools call the existing `HyphaeApi` methods.
- The web editor and HTTP API are unchanged.
- `model_overview` output is bounded regardless of model size: model name/description, counts per layer + per kind, total connection count, and the System + Container nodes only (id, name, one-line desc).
- Skill process files live under `.hyphae/` in the target repo (not `docs/hyphae/`).
- Do NOT update `docs/HANDOFF.md` or `docs/mcp-tools-roadmap.md` (no longer maintained; leave untouched).
- Run from repo root `C:\projects\hyphae`. Per-package test: `pnpm --filter <pkg> test`; single file: `pnpm --filter <pkg> exec vitest run <relative/path.test.ts>`; full: `pnpm -r test`. Work on branch `feat/mcp-efficiency` (already created).

---

### Task 1: Schema — replace `getContext` with `modelOverview`

**Files:**
- Rename/replace: `packages/schema/src/context.ts` → `packages/schema/src/overview.ts`
- Modify: `packages/schema/src/index.ts:9`
- Create: `packages/schema/test/overview.test.ts`
- Delete: `packages/schema/test/context.test.ts`

**Interfaces:**
- Produces: `modelOverview(model: HyphaeModel): string`. Removes `getContext` and `ContextScope`.

- [ ] **Step 1: Write the failing test**

Create `packages/schema/test/overview.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { modelOverview } from '../src/overview';
import { emptyModel } from '../src/model';
import type { HyphaeModel } from '../src/model';

function model(): HyphaeModel {
  const m = emptyModel();
  m.metadata.name = 'Demo';
  const base = { description: '', codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {} };
  m.nodes.push(
    { id: 'sys', name: 'Sys', type: 'System', parentId: null, ...base, description: 'the system' },
    { id: 'ca', name: 'Api', type: 'Container', parentId: 'sys', ...base, description: 'edge service' },
    { id: 'cmp', name: 'Auth', type: 'Component', parentId: 'ca', ...base },
    { id: 'code', name: 'AuthService', type: 'Class', parentId: 'cmp', ...base },
  );
  m.connections.push({ id: 'x1', from: 'cmp', to: 'cmp', type: 'Dependency', description: '', direction: 'Unidirectional', realizedBy: [], codeRefs: [], fields: {} });
  return m;
}

describe('modelOverview', () => {
  it('shows per-layer and per-kind counts and totals', () => {
    const out = modelOverview(model());
    expect(out).toContain('# Demo');
    expect(out).toContain('Nodes: 4');
    expect(out).toContain('Connections: 1');
    expect(out).toMatch(/Context=1/);
    expect(out).toMatch(/Container=1/);
    expect(out).toMatch(/Component=1/);
    expect(out).toMatch(/Code=1/);
    expect(out).toMatch(/Class=1/);
  });

  it('lists only System and Container nodes (not Components or Code)', () => {
    const out = modelOverview(model());
    expect(out).toContain('Sys [System]');
    expect(out).toContain('Api [Container]');
    expect(out).not.toContain('AuthService');
    expect(out).not.toContain('[Component]');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @hyphae/schema exec vitest run test/overview.test.ts`
Expected: FAIL — cannot resolve `../src/overview`.

- [ ] **Step 3: Create `packages/schema/src/overview.ts`**

```ts
import type { HyphaeModel } from './model';
import { c4Backend, layerOfType } from './profiles/c4-backend';

/** A small, size-independent orientation view: counts + the System/Container map. */
export function modelOverview(model: HyphaeModel): string {
  const out: string[] = [`# ${model.metadata.name}`];
  if (model.metadata.description) out.push(model.metadata.description);

  const byLayer = new Map<string, number>();
  const byKind = new Map<string, number>();
  for (const n of model.nodes) {
    const layer = layerOfType(c4Backend, n.type) ?? '(unknown)';
    byLayer.set(layer, (byLayer.get(layer) ?? 0) + 1);
    byKind.set(n.type, (byKind.get(n.type) ?? 0) + 1);
  }

  out.push('', `Nodes: ${model.nodes.length}  Connections: ${model.connections.length}`);
  out.push('Per layer: ' + c4Backend.layers.map((l) => `${l}=${byLayer.get(l) ?? 0}`).join('  '));
  out.push('Per kind: ' + [...byKind.entries()].sort((a, b) => b[1] - a[1]).map(([k, c]) => `${k}=${c}`).join('  '));

  const top = model.nodes.filter((n) => n.type === 'System' || n.type === 'Container');
  if (top.length) {
    const nameById = new Map(model.nodes.map((n) => [n.id, n.name]));
    out.push('', '# Systems & Containers');
    for (const n of top) {
      const parent = n.parentId ? ` (in ${nameById.get(n.parentId) ?? n.parentId})` : '';
      const desc = n.description ? ' — ' + n.description.split('\n')[0].trim().slice(0, 120) : '';
      out.push(`- ${n.name} [${n.type}] [id: ${n.id}]${parent}${desc}`);
    }
  }
  return out.join('\n');
}
```

Then delete the old renderer: remove `packages/schema/src/context.ts`.

- [ ] **Step 4: Update the barrel export**

In `packages/schema/src/index.ts`, change line 9 from:

```ts
export * from './context';
```
to:
```ts
export * from './overview';
```

- [ ] **Step 5: Delete the obsolete test**

Delete `packages/schema/test/context.test.ts`.

- [ ] **Step 6: Run tests + typecheck**

Run: `pnpm --filter @hyphae/schema test`
Expected: PASS (incl. the new overview tests; context tests gone).
Run: `npx tsc -p packages/schema --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/schema
git commit -m "feat(schema): replace getContext with bounded modelOverview

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

Note: `apps/server` will not typecheck until Task 3 (it still imports `getContext`). That is expected between tasks; do not patch the server here.

---

### Task 2: Server — replace single write tools with best-effort batch tools

**Files:**
- Modify: `apps/server/src/mcp.ts` (buildTools handlers + tool registrations)
- Modify: `apps/server/test/mcp.test.ts`

**Interfaces:**
- Consumes: existing `HyphaeApi` methods (`createNode`, `updateNode`, `deleteNode`, `createConnection`, `updateConnection`, `deleteConnection`) — unchanged.
- Produces: handlers `create_nodes`, `create_connections`, `update_nodes`, `update_connections`, `delete_nodes`, `delete_connections` on the object returned by `buildTools`. The six single write handlers (`create_node`, `create_connection`, `update_node`, `update_connection`, `delete_node`, `delete_connection`) are removed.

- [ ] **Step 1: Write failing tests**

In `apps/server/test/mcp.test.ts`, inside `describe('MCP tool handlers', …)`, REMOVE the tests named `create_node forwards input and returns the created node`, `create_node surfaces issues when the server rejects the write`, `update_node splits id from the patch`, `update_connection splits id from the patch`, and `create_node forwards a fields bag`. ADD:

```ts
  it('create_nodes returns ids on full success', async () => {
    const r = await buildTools(fakeApi()).create_nodes({ nodes: [{ name: 'X', type: 'Component' }] });
    expect(r).toEqual({ ids: ['new'] });
  });

  it('create_nodes is best-effort: returns per-item results when one fails', async () => {
    let call = 0;
    const api = fakeApi({ createNode: async (input) => (call++ === 0
      ? { node: { id: 'a', ...(input as object) }, version: 1 }
      : { issues: [{ kind: 'bad-parent', ref: 'b', message: 'no' }] }) });
    const r = await buildTools(api).create_nodes({ nodes: [{ name: 'A', type: 'Component' }, { name: 'B', type: 'Component', parentId: 'z' }] });
    expect(r).toEqual({ results: [{ id: 'a' }, { issues: [{ kind: 'bad-parent', ref: 'b', message: 'no' }] }] });
  });

  it('create_connections returns ids on full success', async () => {
    const r = await buildTools(fakeApi()).create_connections({ connections: [{ from: 'a', to: 'b', type: 'Dependency' }] });
    expect(r).toEqual({ ids: ['c2'] });
  });

  it('update_nodes returns ok on full success and splits id from patch', async () => {
    const seen: Array<[string, unknown]> = [];
    const api = fakeApi({ updateNode: async (id, patch) => { seen.push([id, patch]); return { node: { id }, version: 1 }; } });
    const r = await buildTools(api).update_nodes({ updates: [{ id: 'n1', name: 'Renamed' }] });
    expect(r).toEqual({ ok: true });
    expect(seen).toEqual([['n1', { name: 'Renamed' }]]);
  });

  it('update_connections reports per-item issues on partial failure', async () => {
    const api = fakeApi({ updateConnection: async () => ({ issues: [{ kind: 'bad-endpoint', ref: 'c', message: 'no' }] }) });
    const r = await buildTools(api).update_connections({ updates: [{ id: 'c1', type: 'Realization' }] });
    expect(r).toEqual({ results: [{ issues: [{ kind: 'bad-endpoint', ref: 'c', message: 'no' }] }] });
  });

  it('delete_nodes returns ok and forwards ids', async () => {
    const seen: string[] = [];
    const api = fakeApi({ deleteNode: async (id) => { seen.push(id); return { version: 1 }; } });
    const r = await buildTools(api).delete_nodes({ ids: ['a', 'b'] });
    expect(r).toEqual({ ok: true });
    expect(seen).toEqual(['a', 'b']);
  });

  it('delete_connections surfaces not-found error per item', async () => {
    const api = fakeApi({ deleteConnection: async () => ({ error: 'connection x not found' }) });
    const r = await buildTools(api).delete_connections({ ids: ['x'] });
    expect(r).toEqual({ results: [{ error: 'connection x not found' }] });
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @hyphae/server exec vitest run test/mcp.test.ts`
Expected: FAIL — `create_nodes` etc. are not functions (handlers don't exist yet).

- [ ] **Step 3: Add batch helpers + handlers in `apps/server/src/mcp.ts`**

Add these module-level helpers just above `export function buildTools(api: HyphaeApi) {`:

```ts
type ApiResult = { node?: { id: string }; connection?: { id: string }; issues?: unknown; error?: unknown };

async function runCreate(
  items: Record<string, unknown>[],
  fn: (i: Record<string, unknown>) => Promise<unknown>,
  key: 'node' | 'connection',
) {
  const results: Array<{ id: string } | { issues: unknown } | { error: unknown }> = [];
  let ok = true;
  for (const it of items) {
    const r = (await fn(it)) as ApiResult;
    const created = r?.[key];
    if (created?.id) results.push({ id: created.id });
    else { ok = false; results.push('issues' in (r ?? {}) ? { issues: r.issues } : { error: r?.error ?? 'failed' }); }
  }
  return ok ? { ids: results.map((x) => (x as { id: string }).id) } : { results };
}

async function runVoid(calls: Array<() => Promise<unknown>>) {
  const results: Array<{ ok: true } | { issues: unknown } | { error: unknown }> = [];
  let ok = true;
  for (const call of calls) {
    const r = (await call()) as ApiResult;
    if (r && 'issues' in r) { ok = false; results.push({ issues: r.issues }); }
    else if (r && 'error' in r) { ok = false; results.push({ error: r.error }); }
    else results.push({ ok: true });
  }
  return ok ? { ok: true } : { results };
}
```

In the object returned by `buildTools`, DELETE the six single write handlers (`create_node`, `update_node`, `delete_node`, `create_connection`, `update_connection`, `delete_connection`) and ADD:

```ts
    create_nodes: async ({ nodes }: { nodes: Record<string, unknown>[] }) => runCreate(nodes, api.createNode, 'node'),
    create_connections: async ({ connections }: { connections: Record<string, unknown>[] }) => runCreate(connections, api.createConnection, 'connection'),
    update_nodes: async ({ updates }: { updates: Array<{ id: string } & Record<string, unknown>> }) =>
      runVoid(updates.map((u) => () => { const { id, ...patch } = u; return api.updateNode(id, patch); })),
    update_connections: async ({ updates }: { updates: Array<{ id: string } & Record<string, unknown>> }) =>
      runVoid(updates.map((u) => () => { const { id, ...patch } = u; return api.updateConnection(id, patch); })),
    delete_nodes: async ({ ids }: { ids: string[] }) => runVoid(ids.map((id) => () => api.deleteNode(id))),
    delete_connections: async ({ ids }: { ids: string[] }) => runVoid(ids.map((id) => () => api.deleteConnection(id))),
```

- [ ] **Step 4: Replace the single-tool registrations in `main()`**

In `apps/server/src/mcp.ts`, the `coreNodeFields` and `coreConnFields` consts stay. DELETE the six `server.registerTool('create_node'…)` … `server.registerTool('delete_connection'…)` blocks and replace with:

```ts
  const nodeItem = z.object({ name: z.string(), type: z.enum(c4Backend.nodeKinds.map((k) => k.id) as [string, ...string[]]), ...coreNodeFields });
  server.registerTool('create_nodes', {
    description: "Create one OR MANY nodes in a single call. Pass an array (a single write is a one-element array). Call describe_profile first. Each item: name, type (a profile node kind), parentId, and domain values in `fields`. Containment: Component→Container, Container→System, Code (Class/Interface/Function/Module/UIComponent)→Component. Best-effort: returns {ids:[...]} if all succeed, else {results:[{id}|{issues}]} aligned to input order.",
    inputSchema: { nodes: z.array(nodeItem) },
  }, async (a) => text(await tools.create_nodes(a)));

  const connItem = z.object({ from: z.string(), to: z.string(), type: z.enum(connectionKindIds(c4Backend) as [string, ...string[]]), ...coreConnFields });
  server.registerTool('create_connections', {
    description: "Create one OR MANY connections in a single call (single write = one-element array). Each item: from, to (existing node ids), type (a profile connection kind), domain values in `fields`, and optional realizedBy to bind lower-layer edges. Best-effort: {ids:[...]} on full success, else {results:[{id}|{issues}]}.",
    inputSchema: { connections: z.array(connItem) },
  }, async (a) => text(await tools.create_connections(a)));

  const nodeUpdate = z.object({ id: z.string(), name: z.string().optional(), type: z.string().optional(), ...coreNodeFields });
  server.registerTool('update_nodes', {
    description: 'Update one OR MANY nodes by id (single update = one-element array). Each item: id + the fields to change; domain values go in `fields`. Best-effort: {ok:true} on full success, else {results:[{ok}|{issues}]}.',
    inputSchema: { updates: z.array(nodeUpdate) },
  }, async (a) => text(await tools.update_nodes(a)));

  const connUpdate = z.object({ id: z.string(), from: z.string().optional(), to: z.string().optional(), type: z.string().optional(), ...coreConnFields });
  server.registerTool('update_connections', {
    description: 'Update one OR MANY connections by id (single update = one-element array). Each item: id + fields to change (e.g. realizedBy to bind lower-layer edges); domain values in `fields`. Best-effort: {ok:true} on full success, else {results:[{ok}|{issues}]}.',
    inputSchema: { updates: z.array(connUpdate) },
  }, async (a) => text(await tools.update_connections(a)));

  server.registerTool('delete_nodes', {
    description: 'Delete one OR MANY nodes by id (single delete = one-element array). Their connections are removed too. Best-effort: {ok:true} on full success, else {results:[{ok}|{error}]}.',
    inputSchema: { ids: z.array(z.string()) },
  }, async (a) => text(await tools.delete_nodes(a)));

  server.registerTool('delete_connections', {
    description: 'Delete one OR MANY connections by id (single delete = one-element array). Best-effort: {ok:true} on full success, else {results:[{ok}|{error}]}.',
    inputSchema: { ids: z.array(z.string()) },
  }, async (a) => text(await tools.delete_connections(a)));
```

- [ ] **Step 5: Run the new tests + typecheck**

Run: `pnpm --filter @hyphae/server exec vitest run test/mcp.test.ts`
Expected: PASS (the seven new write tests; query/describe_profile tests unchanged). The `get_text_context returns plain text` test still references the old tool — it is handled in Task 3, so it may still pass for now (the handler still exists). If it errors due to the schema import, proceed to Task 3 before committing the full suite.

Run: `npx tsc -p apps/server --noEmit`
Expected: it will still error on the `getContext` import (removed in Task 1) — that is fixed in Task 3. Do not commit until Step 6 is green *after Task 3*… EXCEPT this task must stand alone, so:

- [ ] **Step 6: Commit (handlers + tests only)**

Because `apps/server` shares one typecheck with Task 3's `get_text_context` removal, commit this task's source + test changes now; the server typecheck/full-suite green is asserted at the end of Task 3.

```bash
git add apps/server/src/mcp.ts apps/server/test/mcp.test.ts
git commit -m "feat(server): batch MCP write tools (best-effort), remove single write tools

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Server — remove `get_text_context`, add `model_overview`

**Files:**
- Modify: `apps/server/src/mcp.ts`
- Modify: `apps/server/test/mcp.test.ts`

**Interfaces:**
- Consumes: `modelOverview` from `@hyphae/schema` (Task 1).
- Produces: handler `model_overview` on `buildTools`; removes `get_text_context`.

- [ ] **Step 1: Update the failing test**

In `apps/server/test/mcp.test.ts`, replace the test `get_text_context returns plain text` with:

```ts
  it('model_overview returns counts and the container map', async () => {
    const out = await buildTools(fakeApi()).model_overview({});
    expect(out).toContain('API [Container]'); // the container is listed with its name
    expect(out).toContain('Connections:');    // counts header present
  });
```

(The `fakeApi()` model has one Container `API` and one self-connection — see the file's `model()` helper.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @hyphae/server exec vitest run test/mcp.test.ts`
Expected: FAIL — `model_overview` is not a function.

- [ ] **Step 3: Swap the import and handler in `apps/server/src/mcp.ts`**

Change the schema import: replace `getContext` with `modelOverview` in the top `import { … } from '@hyphae/schema'` line.

In `buildTools`, DELETE the `get_text_context` handler and ADD (place it first, as the orientation read):

```ts
    model_overview: async () => modelOverview(await api.getModel()),
```

- [ ] **Step 4: Replace the registration in `main()`**

DELETE the entire `server.registerTool('get_text_context', { … }, …)` block and ADD:

```ts
  server.registerTool(
    'model_overview',
    {
      description: 'Orientation read — call this FIRST. Returns a small, size-independent overview: model name, node counts per layer and per kind, total connections, and the System + Container nodes (id, name, one-line description). It never dumps Components or Code. Drill deeper with list_nodes (by parentId), get_subgraph, list_connections, search_nodes, get_node.',
      inputSchema: {},
    },
    async () => text(await tools.model_overview()),
  );
```

- [ ] **Step 5: Run server tests + typecheck**

Run: `pnpm --filter @hyphae/server exec vitest run test/mcp.test.ts`
Expected: PASS.
Run: `npx tsc -p apps/server --noEmit`
Expected: no errors (the `getContext` import is gone).
Run: `pnpm --filter @hyphae/server test`
Expected: PASS (all files).

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/mcp.ts apps/server/test/mcp.test.ts
git commit -m "feat(server): replace get_text_context with bounded model_overview

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Skill — adopt new tools, `.hyphae/` dir, context resets, file reports

**Files (in-repo copy, then mirror to `~/.claude/skills/building-architecture-models/`):**
- Modify: `plugins/hyphae-modeling/skills/building-architecture-models/SKILL.md`
- Modify: `plugins/hyphae-modeling/skills/building-architecture-models/references/subagent-prompt.md`
- Modify: `plugins/hyphae-modeling/skills/building-architecture-models/references/plan-artifact-template.md`
- Modify: `plugins/hyphae-modeling/skills/building-architecture-models/references/analysis-loop.md` (only if it names `get_text_context`)

- [ ] **Step 1: SKILL.md — orientation, tools, working dir, prefix, resets**

Apply these edits to `SKILL.md`:
- **Every `get_text_context` reference** (Overview "single source of truth" line, Prerequisites, Phase 1 step 1, Phase 3 step 4, Phase 4 step 4, Phase 5 sweep, Idempotency contract "Read first") → use **`model_overview`** for orientation and **`list_nodes`/`get_subgraph`** for drill-down. Example replacements:
  - Prerequisites: "Confirm by calling `model_overview` — it returns a small overview of the current model (possibly empty). If it errors, stop and ask the user to start the server."
  - Idempotency "Read first": "**Read first** (`model_overview`, then `list_nodes`/`get_subgraph` for the scope you're about to touch). Never assume empty."
  - Phase 5 sweep: keep `list_connections`; change any `get_text_context` summary call to `model_overview`.
- **Batch tools.** Update write instructions to batch:
  - Phase 1 step 2: "Create the System node and all Containers in one `create_nodes` call (a single write is a one-element array). Domain values (`responsibilities`, `invariants`, `technology` for Containers) go in each item's `fields` bag."
  - Phase 3 step 3: "Apply the approved bundle: one `update_nodes` for amendments → one `create_nodes` for ExternalSystems → one `create_connections` for all cross-package/external edges."
  - Phase 4 step 3 (binding): "bind with a single `update_connections` call; create any missing Component↔Component parent edges with `create_connections`."
- **Working dir → `.hyphae/`.** Replace `docs/hyphae/model-plan.md` with `.hyphae/model-plan.md` everywhere (Phase 1 step 3, Phase 5).
- **Tool-name prefix.** Add to Prerequisites: "The hyphae MCP tools are invoked with the `mcp__hyphae__` prefix (e.g. `mcp__hyphae__model_overview`, `mcp__hyphae__create_nodes`). Subagents must use the prefixed names."
- **Inter-phase context resets (new subsection after "The flow" intro or in Idempotency).** Add:

```markdown
## Keep the orchestrator cheap

Cost ≈ turns × context size. To avoid carrying a huge context across many turns:
- **Reset/compact context between phases.** The skill is resumable — the server is the source of truth — so after each phase you can clear context and re-orient with `model_overview` + scoped `list_nodes`/`get_subgraph`. Nothing is lost.
- **Batch every multi-write step** (`create_nodes`/`create_connections`/`update_*`) instead of one call per node/edge.
- **Read subagent reports from their files** (see Phase 2/4), not from chat history — they survive a context reset.
```

- [ ] **Step 2: subagent-prompt.md — file reports, batch tools, prefix (both templates)**

- Add a `{{REPORT_FILE}}` placeholder note in the intro: "The orchestrator passes a `{{REPORT_FILE}}` path under `.hyphae/reports/`."
- **Phase 2 template:** 
  - Step 0: "Call `mcp__hyphae__describe_profile` first…"; note all hyphae tools use the `mcp__hyphae__` prefix.
  - Step 3: "Create all your Components in one `mcp__hyphae__create_nodes` call (domain values in each item's `fields`)."
  - Step 4: "Create all intra-container edges in one `mcp__hyphae__create_connections` call."
  - Replace "Return ONLY this JSON report (no surrounding prose):" with: "**Write this JSON report to `{{REPORT_FILE}}`** (create parent dirs). Then return ONLY `{ \"status\": \"done\", \"reportPath\": \"{{REPORT_FILE}}\", \"counts\": { \"components\": N, \"crossPackageDeps\": N } }` — do NOT paste the full report into your reply."
- **Phase 4 template:** same prefix note; step 2 → "create all Code nodes in one `mcp__hyphae__create_nodes` call"; step 3 → "create intra-component edges in one `mcp__hyphae__create_connections` call"; replace the final "Return ONLY this JSON" with the same write-to-`{{REPORT_FILE}}` + short-status pattern.

- [ ] **Step 3: plan-artifact-template.md — `.hyphae/` path**

Change line 3: "Write this to `.hyphae/model-plan.md` in the TARGET repo during Phase 1." (Progress block already has the Phase 4/GATE 3/Phase 5 markers.)

- [ ] **Step 4: analysis-loop.md — check for stale tool names**

Run `grep -n "get_text_context" plugins/hyphae-modeling/skills/building-architecture-models/references/analysis-loop.md`. If any hits, replace with `model_overview`. (Expected: none — it references gitnexus tools, not hyphae reads.)

- [ ] **Step 5: Verify no stale references remain, then mirror**

Run:
```bash
grep -rn "get_text_context\|docs/hyphae" plugins/hyphae-modeling/ || echo "(clean)"
cp -r plugins/hyphae-modeling/skills/building-architecture-models/* "$HOME/.claude/skills/building-architecture-models/"
diff -rq plugins/hyphae-modeling/skills/building-architecture-models "$HOME/.claude/skills/building-architecture-models" && echo "copies identical"
```
Expected: `(clean)` (no `get_text_context` or `docs/hyphae` left) and `copies identical`.

- [ ] **Step 6: Commit**

```bash
git add plugins/hyphae-modeling
git commit -m "docs(skill): use model_overview + batch tools, .hyphae dir, context resets, file reports

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Final whole-feature verification

**Files:** none (verification only).

- [ ] **Step 1: Full suite + typechecks + build**

Run:
```bash
pnpm -r test
npx tsc -p packages/schema --noEmit
npx tsc -p apps/server --noEmit
npx tsc -p apps/web --noEmit
pnpm --filter @hyphae/web build
```
Expected: all green. (Web is unaffected by these changes but is verified to confirm no accidental coupling.)

- [ ] **Step 2: Confirm the MCP surface**

Run: `grep -n "registerTool" apps/server/src/mcp.ts`
Expected: read tools `model_overview`, `get_node`, `list_nodes`, `search_nodes`, `find_connections`, `list_connections`, `get_subgraph`, `describe_profile`; write tools `create_nodes`, `create_connections`, `update_nodes`, `update_connections`, `delete_nodes`, `delete_connections`. NO `get_text_context`, NO single `create_node`/`update_node`/`delete_node`/`create_connection`/`update_connection`/`delete_connection`.

- [ ] **Step 3: Note for the user**

Report that the MCP process must be **restarted** to pick up the new tool surface (per the SDK), and that any model file is untouched.

---

## Self-Review (completed)

- **Spec coverage:** batch write tools (Task 2) ✓; trimmed responses incl. no `version` (Task 2 handlers/tests) ✓; remove single tools (Task 2) ✓; remove `get_text_context` + add `model_overview` (Tasks 1, 3) ✓; `.hyphae/` dir, prefix fix, context resets, file reports, batch usage (Task 4) ✓; not touching HANDOFF/roadmap (no task does) ✓; tests + final verify (Tasks 1–3, 5) ✓.
- **Placeholder scan:** `{{REPORT_FILE}}` / `{{CONTAINER_*}}` are intentional skill-template placeholders. No TODO/TBD.
- **Type consistency:** `runCreate`/`runVoid` result shapes match the documented `{ids}`/`{ok}`/`{results}` contract and the Task 2 tests. `modelOverview` signature matches Task 1 test and Task 3 import. The cross-task note about the server not typechecking until Task 3 is explicit (Task 1 Step 7, Task 2 Step 5/6).

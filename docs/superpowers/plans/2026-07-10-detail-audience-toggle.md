# Detail / Audience Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Default MCP reads to the Component altitude (opt into Code) and add a web "Stakeholder ⇄ Full" toggle that hides the Code layer and derived edges.

**Architecture:** One shared, profile-aware layer helper in `@hyphae/schema` drives both surfaces. The MCP handlers (`list_nodes`, `list_connections`, `get_subgraph`) gain a `maxLayer` param defaulting to `'Component'`. The web side threads an `audience` flag from the store through `buildFocusView` (which filters Code children + derived edges) and into `Canvas` (which blocks drilling into Components in stakeholder mode) with a toolbar toggle.

**Tech Stack:** TypeScript (strict), pnpm monorepo, Zod, Vitest, React + Zustand + `@xyflow/react`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-10-detail-audience-toggle-design.md`. Every task's requirements implicitly include it.
- Layer order comes from `profile.layers` (`['Context','Container','Component','Code']`) — never hardcode layer index numbers; use the helper. Do not hardcode the strings `'Code'`/`'Component'` for altitude tests outside the helper call sites this plan specifies.
- MCP `maxLayer` default is `'Component'` and lives in the **handler** destructuring (handlers are called directly in tests without Zod parsing).
- MCP: `get_node`, `rollup_connections`, `model_overview` are NOT changed.
- Web audience default is `'full'`; the flag is persisted to `localStorage` key `hyphae.audience`; it is NOT put in the URL hash.
- No schema changes, no new node/connection kinds, no new fields.
- Test commands (run from repo root):
  - schema: `pnpm --filter @hyphae/schema test`
  - server: `pnpm --filter @hyphae/server test`
  - web: `pnpm --filter @hyphae/web test`
  - A single web file: `pnpm --filter @hyphae/web test focusView` (vitest name filter on the file path).
- Commit after every task.

---

### Task 1: Shared `nodeAtOrAboveLayer` schema helper

**Files:**
- Modify: `packages/schema/src/profile.ts` (add exported function after `typesForLayer`, ~line 68)
- Test: `packages/schema/test/profile.test.ts`

**Interfaces:**
- Produces: `nodeAtOrAboveLayer(profile: Profile, type: string, maxLayer: string): boolean` — true when `type`'s layer index ≤ `maxLayer`'s index in `profile.layers`; false for unknown `type` or unknown `maxLayer`. Exported from `@hyphae/schema` (via `export * from './profile'`).

- [ ] **Step 1: Write the failing test**

Append to `packages/schema/test/profile.test.ts`:

```ts
import { c4Backend, allowedChildTypes, topLevelTypes, nodeAtOrAboveLayer } from '../src/index';

describe('nodeAtOrAboveLayer', () => {
  it('keeps types at or above the max layer and drops those below', () => {
    // layers: Context(0) Container(1) Component(2) Code(3)
    expect(nodeAtOrAboveLayer(c4Backend, 'System', 'Component')).toBe(true);     // Context
    expect(nodeAtOrAboveLayer(c4Backend, 'Container', 'Component')).toBe(true);
    expect(nodeAtOrAboveLayer(c4Backend, 'Component', 'Component')).toBe(true);  // equal
    expect(nodeAtOrAboveLayer(c4Backend, 'Class', 'Component')).toBe(false);     // Code, below
    expect(nodeAtOrAboveLayer(c4Backend, 'Class', 'Code')).toBe(true);           // opt into Code
  });
  it('returns false for an unknown node type or unknown max layer', () => {
    expect(nodeAtOrAboveLayer(c4Backend, 'Nope', 'Component')).toBe(false);
    expect(nodeAtOrAboveLayer(c4Backend, 'Component', 'Nope')).toBe(false);
  });
});
```

(Keep the existing single top-of-file `import` line consistent — merge `nodeAtOrAboveLayer` into the existing `from '../src/index'` import rather than adding a second import.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hyphae/schema test profile`
Expected: FAIL — `nodeAtOrAboveLayer is not a function` / not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `packages/schema/src/profile.ts`:

```ts
/** True when `type`'s layer is at or above (index <=) `maxLayer` in the profile's ordered
 *  layers. An unknown `type` (no layer) or unknown `maxLayer` returns false. */
export function nodeAtOrAboveLayer(profile: Profile, type: string, maxLayer: string): boolean {
  const li = profile.layers.indexOf(layerOfType(profile, type) ?? '');
  const mi = profile.layers.indexOf(maxLayer);
  return li !== -1 && mi !== -1 && li <= mi;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @hyphae/schema test profile`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/schema/src/profile.ts packages/schema/test/profile.test.ts
git commit -m "feat(schema): add profile-aware nodeAtOrAboveLayer helper"
```

---

### Task 2: `maxLayer` filter on `list_nodes` (MCP)

**Files:**
- Modify: `apps/server/src/mcp.ts` — `list_nodes` handler (~line 56), its registration/description (~line 288), imports (~line 4)
- Test: `apps/server/test/mcp.test.ts`

**Interfaces:**
- Consumes: `nodeAtOrAboveLayer` (Task 1), `c4Backend` (already imported).
- Produces: `list_nodes({ ..., maxLayer })` where `maxLayer?: string` defaults to `'Component'`; nodes whose layer is below `maxLayer` are dropped from results.

- [ ] **Step 1: Write the failing test**

Add inside the existing `describe('MCP query tools', ...)` block in `apps/server/test/mcp.test.ts` (the `graphModel` there has only Container/Component nodes, so add a Code node in a local model):

```ts
it('list_nodes defaults to Component-and-above and opts into Code via maxLayer', async () => {
  const withCode = () => {
    const m = graphModel();
    m.nodes.push({ id: 'k1', name: 'K1', type: 'Class', description: '', parentId: 'n1', fields: {}, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't' });
    return m;
  };
  const a = fakeApi({ getModel: async () => withCode() });
  const def = (await buildTools(a).list_nodes({ parentId: 'n1' })) as Array<{ id: string }>;
  expect(def.map((n) => n.id)).toEqual([]);                         // Code child hidden by default
  const code = (await buildTools(a).list_nodes({ parentId: 'n1', maxLayer: 'Code' })) as Array<{ id: string }>;
  expect(code.map((n) => n.id)).toEqual(['k1']);                    // opt in
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hyphae/server test mcp`
Expected: FAIL — default currently returns `['k1']` (no maxLayer filter yet).

- [ ] **Step 3: Write minimal implementation**

In `apps/server/src/mcp.ts`, ensure `nodeAtOrAboveLayer` is imported from `@hyphae/schema` (add it to the existing import block at the top). Then update the `list_nodes` handler signature and add the filter. Change the signature to include `maxLayer` with a `'Component'` default and apply it alongside the other filters:

```ts
    list_nodes: async ({ parentId, type, query, fields, limit, offset, maxLayer = 'Component' }: { parentId?: string; type?: string; query?: string; fields?: string[]; limit?: number; offset?: number; maxLayer?: string } = {}) => {
      const model = await api.getModel();
      let nodes = model.nodes;
      nodes = nodes.filter((n) => nodeAtOrAboveLayer(c4Backend, n.type, maxLayer));
      if (parentId !== undefined) nodes = nodes.filter((n) => n.parentId === parentId);
```

(Insert the `maxLayer` filter line as the first filter, immediately after `let nodes = model.nodes;`. Leave the rest of the handler unchanged.)

Update the `list_nodes` registration `inputSchema` (add the param) and description. In the `server.registerTool('list_nodes', {...})` block, append to `inputSchema`:

```ts
        maxLayer: z.enum(c4Backend.layers as [string, ...string[]]).optional().describe('Deepest layer to include (default Component). Nodes below it are omitted — pass "Code" to include Code-layer nodes (Class/Interface/Function/Module/UIComponent).'),
```

And append this sentence to the `description` string: `Reads default to Component-and-above; pass maxLayer:"Code" to include the Code layer.`

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @hyphae/server test mcp`
Expected: PASS (new test plus all existing `list_nodes` tests — their models contain no Code nodes, so the Component default leaves them unchanged).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/mcp.ts apps/server/test/mcp.test.ts
git commit -m "feat(mcp): default list_nodes to Component-and-above with maxLayer opt-in"
```

---

### Task 3: `maxLayer` filter on `list_connections` (MCP)

**Files:**
- Modify: `apps/server/src/mcp.ts` — `list_connections` handler (~line 86), its registration/description (~line 304)
- Test: `apps/server/test/mcp.test.ts`

**Interfaces:**
- Consumes: `nodeAtOrAboveLayer` (Task 1), `c4Backend`.
- Produces: `list_connections({ ..., maxLayer })` defaulting to `'Component'`; an edge is dropped if EITHER endpoint node is below `maxLayer`.

- [ ] **Step 1: Write the failing test**

Add inside `describe('list_connections', ...)` in `apps/server/test/mcp.test.ts` (extend `connModel` locally with a Code node + a code edge):

```ts
it('drops edges touching a Code node by default and includes them with maxLayer:Code', async () => {
  const withCode = () => {
    const m = connModel();
    m.nodes.push({ id: 'k1', name: 'K1', type: 'Class', parentId: 'a1', description: '', fields: {}, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't' });
    m.connections.push({ id: 'kx', from: 'k1', to: 'b1', type: 'Dependency', fields: { transport: 'InProcess' }, description: '', direction: 'Unidirectional', realizedBy: [], codeRefs: [] });
    return m;
  };
  const a = fakeApi({ getModel: async () => withCode() });
  const def = (await buildTools(a).list_connections({})) as Array<{ id: string }>;
  expect(def.map((c) => c.id).sort()).toEqual(['x1', 'x2', 'x3', 'x4']);      // kx (Code-touching) hidden
  const all = (await buildTools(a).list_connections({ maxLayer: 'Code' })) as Array<{ id: string }>;
  expect(all.map((c) => c.id).sort()).toEqual(['kx', 'x1', 'x2', 'x3', 'x4']); // opt in
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hyphae/server test mcp`
Expected: FAIL — default currently includes `kx`.

- [ ] **Step 3: Write minimal implementation**

In the `list_connections` handler, add `maxLayer = 'Component'` to the destructured param object (and its type: `maxLayer?: string`). Inside the `model.connections.filter((c) => {...})` predicate, add as the FIRST check:

```ts
        const fromNode = byId.get(c.from);
        const toNode = byId.get(c.to);
        if (!fromNode || !toNode) return false;
        if (!nodeAtOrAboveLayer(c4Backend, fromNode.type, maxLayer) || !nodeAtOrAboveLayer(c4Backend, toNode.type, maxLayer)) return false;
```

(Place these lines at the top of the existing predicate body, before the `type`/`transport`/`nodeId` checks. `byId` is already built above the filter.)

Update the registration: append to `inputSchema`:

```ts
        maxLayer: z.enum(c4Backend.layers as [string, ...string[]]).optional().describe('Deepest layer to include (default Component). An edge is dropped if either endpoint is below it — pass "Code" to include Code-layer plumbing.'),
```

Append to the `description` string: `By default only edges among Component-and-above nodes are returned (Code plumbing is hidden); pass maxLayer:"Code" for the full edge set.`

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @hyphae/server test mcp`
Expected: PASS (existing `list_connections` tests use `connModel`, which has no Code nodes, so they are unaffected).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/mcp.ts apps/server/test/mcp.test.ts
git commit -m "feat(mcp): default list_connections to Component-and-above with maxLayer opt-in"
```

---

### Task 4: `maxLayer` filter on `get_subgraph` (MCP)

**Files:**
- Modify: `apps/server/src/mcp.ts` — `get_subgraph` handler (~line 145), its registration/description (~line 333)
- Test: `apps/server/test/mcp.test.ts`

**Interfaces:**
- Consumes: `nodeAtOrAboveLayer` (Task 1), `c4Backend`.
- Produces: `get_subgraph({ ..., maxLayer })` defaulting to `'Component'`; BFS never visits/returns nodes below `maxLayer` (the explicitly requested root is always kept); connections are only those among returned nodes.

- [ ] **Step 1: Write the failing test**

Add inside `describe('MCP query tools', ...)` in `apps/server/test/mcp.test.ts`:

```ts
it('get_subgraph stops at Component by default and descends into Code with maxLayer:Code', async () => {
  const withCode = () => {
    const m = graphModel();
    m.nodes.push({ id: 'k1', name: 'K1', type: 'Class', description: '', parentId: 'n1', fields: {}, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't' });
    return m;
  };
  const a = fakeApi({ getModel: async () => withCode() });
  const def = (await buildTools(a).get_subgraph({ nodeId: 'n1', depth: 1 })) as { nodes: Array<{ id: string }> };
  expect(def.nodes.map((n) => n.id)).not.toContain('k1');            // Code child not reached by default
  const code = (await buildTools(a).get_subgraph({ nodeId: 'n1', depth: 1, maxLayer: 'Code' })) as { nodes: Array<{ id: string }> };
  expect(code.nodes.map((n) => n.id)).toContain('k1');              // opt in
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hyphae/server test mcp`
Expected: FAIL — default currently reaches `k1` via containment.

- [ ] **Step 3: Write minimal implementation**

In the `get_subgraph` handler, add `maxLayer = 'Component'` to the destructured params (and type `maxLayer?: string`). After `byId`/`parentOf` maps are available, define a keep predicate and gate the `visit` helper with it (the root is always allowed). Concretely, change the `visit` closure and add the predicate:

```ts
      const withinLayer = (id: string): boolean =>
        id === nodeId || nodeAtOrAboveLayer(c4Backend, byId.get(id)?.type ?? '', maxLayer);
      const visit = (id: string, next: string[]) => { if (!reached.has(id) && withinLayer(id)) { reached.add(id); next.push(id); } };
```

Note: the handler does not currently build `byId`. Add it near the top of the handler (after `const model = await api.getModel();`):

```ts
      const byId = new Map(model.nodes.map((n) => [n.id, n]));
```

The final `nodes`/`connections` projection already filters by `reached`, so no further change is needed there.

Update the registration: append to `inputSchema`:

```ts
        maxLayer: z.enum(c4Backend.layers as [string, ...string[]]).optional().describe('Deepest layer to traverse/return (default Component). Nodes below it are not visited — pass "Code" to reach a Component\'s Code children.'),
```

Append to the `description` string: `Traversal stops at Component-and-above by default; pass maxLayer:"Code" to reach the Code layer.`

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @hyphae/server test mcp`
Expected: PASS (existing `get_subgraph` tests use Container/Component-only models, so the Component default leaves them unchanged).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/mcp.ts apps/server/test/mcp.test.ts
git commit -m "feat(mcp): default get_subgraph to Component-and-above with maxLayer opt-in"
```

---

### Task 5: Update the modeling skill for the new read default

**Files:**
- Modify: `plugins/hyphae-modeling/skills/building-architecture-models/SKILL.md`
- Modify: `plugins/hyphae-modeling/skills/building-architecture-models/references/subagent-prompt.md`

**Interfaces:**
- Consumes: the Component-default behavior from Tasks 2–4.
- Produces: skill guidance that passes `maxLayer:'Code'` wherever the workflow operates at the Code layer, so the default flip does not starve the builder. (Docs-only task — verified by inspection, no unit test.)

- [ ] **Step 1: Patch the Verify coverage sweep (SKILL.md)**

In `SKILL.md`, the Coverage sweep step (the paragraph beginning `1. **Coverage sweep.** Call \`list_connections\` once ...`) computes unbound **code** edges, which now require Code-touching edges. Edit that step so the `list_connections` call for the unbound-code-edge check passes `maxLayer:'Code'`, e.g. change `Call \`list_connections\` once (optionally per container via \`containerId\`)` to `Call \`list_connections({ maxLayer: 'Code' })\` once (optionally per container via \`containerId\`)` and add a trailing note: `Reads now default to Component-and-above, so \`maxLayer:'Code'\` is required here to see the code edges the unbound-edge check needs.`

- [ ] **Step 2: Patch the idempotency read-first rule (SKILL.md)**

In the `- **Read first**` bullet (the `list_nodes`/`get_subgraph` line), append: ` Reads default to Component-and-above; pass \`maxLayer:'Code'\` when the scope you are about to touch is the Code layer.`

- [ ] **Step 3: Patch the Code-building subagent prompt**

In `references/subagent-prompt.md`, the Code-phase step that reads existing Code nodes (`Call \`mcp__hyphae__describe_profile\`, then \`mcp__hyphae__model_overview\` and \`mcp__hyphae__list_nodes\` (parentId per Component) — reuse existing Code nodes`), change the `list_nodes` call to pass `maxLayer: 'Code'` so the Code children it must dedupe against are actually returned. Make the instruction explicit: `\`mcp__hyphae__list_nodes({ parentId: <componentId>, maxLayer: 'Code' })\` (Code nodes are hidden unless maxLayer:'Code' is passed)`.

- [ ] **Step 4: Verify the edits landed**

Run: `git -C C:/projects/hyphae grep -n "maxLayer" plugins/hyphae-modeling`
Expected: at least three matches across `SKILL.md` and `subagent-prompt.md` covering the coverage sweep, the read-first rule, and the Code subagent.

- [ ] **Step 5: Commit**

```bash
git add plugins/hyphae-modeling/skills/building-architecture-models/SKILL.md plugins/hyphae-modeling/skills/building-architecture-models/references/subagent-prompt.md
git commit -m "docs(skill): pass maxLayer:'Code' where the workflow needs the Code layer"
```

---

### Task 6: Web store `audience` flag + persistence

**Files:**
- Modify: `apps/web/src/store.ts` — add `audience` state, `setAudience`, `localStorage` init
- Modify: `apps/web/src/focusView.ts` — export the `Audience` type (used by the store's type)
- Test: `apps/web/test/store.test.ts`

**Interfaces:**
- Produces (focusView.ts): `export type Audience = 'stakeholder' | 'full'`.
- Produces (store.ts): store state `audience: Audience` (default `'full'`, initialized from `localStorage['hyphae.audience']`) and `setAudience(a: Audience): void` which updates state and writes `localStorage`.

- [ ] **Step 1: Add the Audience type (no test yet)**

At the top of `apps/web/src/focusView.ts`, after the existing `ConnFilter` type export (~line 3), add:

```ts
export type Audience = 'stakeholder' | 'full';
```

- [ ] **Step 2: Write the failing test**

Add to `apps/web/test/store.test.ts` inside `describe('editor store', ...)`:

```ts
it('toggles audience and persists it to localStorage', () => {
  expect(useStore.getState().audience).toBe('full');
  useStore.getState().setAudience('stakeholder');
  expect(useStore.getState().audience).toBe('stakeholder');
  expect(localStorage.getItem('hyphae.audience')).toBe('stakeholder');
  useStore.getState().setAudience('full');
  expect(localStorage.getItem('hyphae.audience')).toBe('full');
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @hyphae/web test store`
Expected: FAIL — `audience`/`setAudience` do not exist.

- [ ] **Step 4: Write minimal implementation**

In `apps/web/src/store.ts`:

Add the import of the type (top of file, near the other imports):

```ts
import type { Audience } from './focusView';
```

Add to the `State` type:

```ts
  audience: Audience;
  setAudience: (a: Audience) => void;
```

Inside `create<State>((set, get) => {`, before `return {`, read the persisted value:

```ts
  const initialAudience: Audience =
    (typeof localStorage !== 'undefined' && localStorage.getItem('hyphae.audience') === 'stakeholder')
      ? 'stakeholder' : 'full';
```

In the returned object, add the field and setter (place near `focusId`/`select`):

```ts
    audience: initialAudience,
    setAudience: (audience) => {
      if (typeof localStorage !== 'undefined') localStorage.setItem('hyphae.audience', audience);
      set({ audience });
    },
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @hyphae/web test store`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/store.ts apps/web/src/focusView.ts apps/web/test/store.test.ts
git commit -m "feat(web): add persisted audience (stakeholder/full) store flag"
```

---

### Task 7: Stakeholder mode in `buildFocusView`

**Files:**
- Modify: `apps/web/src/focusView.ts` — `buildFocusView` signature + Code-child filter + edge/external derivation
- Test: `apps/web/test/focusView.test.ts`

**Interfaces:**
- Consumes: `Audience` (Task 6), `nodeAtOrAboveLayer` + `c4Backend` (schema).
- Produces: `buildFocusView(model, focusId, filter?, audience: Audience = 'full')`. When `audience === 'stakeholder'`: `children` excludes Code-layer nodes; returned `edges` exclude `derived` edges and any edge with a Code-layer endpoint; `externals` are recomputed from the surviving edges (no orphan ghosts). `'full'` is unchanged.

- [ ] **Step 1: Write the failing tests**

Add a new describe block to `apps/web/test/focusView.test.ts` (reuse the file's `model`, `base`, `e` helpers):

```ts
describe('buildFocusView — stakeholder audience', () => {
  it('hides Code-layer children at a Component focus', () => {
    const full = buildFocusView(model(), 'a1', undefined, 'full');
    expect(full.children.map((n) => n.id)).toEqual(['k1']);           // Class child shown in full
    const stake = buildFocusView(model(), 'a1', undefined, 'stakeholder');
    expect(stake.children).toHaveLength(0);                            // Code hidden
  });

  it('drops derived edges and their orphan externals', () => {
    const m = model();
    m.connections.push({ id: 'x', from: 'a1', to: 'b1', type: 'Dependency', ...e }); // rolls up to ca->cb (derived) at sys focus
    const full = buildFocusView(m, 'sys', undefined, 'full');
    expect(full.edges.some((x) => x.derived)).toBe(true);
    const stake = buildFocusView(m, 'sys', undefined, 'stakeholder');
    expect(stake.edges).toHaveLength(0);                              // derived edge removed
  });

  it('keeps a solid authored edge in stakeholder mode', () => {
    const m = model();
    m.connections.push({ id: 'r', from: 'a1', to: 'a2', type: 'Dependency', ...e });
    const stake = buildFocusView(m, 'ca', undefined, 'stakeholder');
    expect(stake.edges.map((x) => x.id)).toEqual(['r']);
    expect(stake.edges[0].derived).toBe(false);
  });

  it('keeps a solid external edge but drops a derived one', () => {
    const m = model();
    m.connections.push({ id: 's', from: 'a1', to: 'ext', type: 'Dependency', ...e }); // solid a1->ext
    const stake = buildFocusView(m, 'ca', undefined, 'stakeholder');
    expect(stake.externals.map((n) => n.id)).toEqual(['ext']);
    expect(stake.edges.map((x) => x.id)).toEqual(['s']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @hyphae/web test focusView`
Expected: FAIL — `buildFocusView` ignores the 4th arg (Code children and derived edges still present).

- [ ] **Step 3: Write minimal implementation**

In `apps/web/src/focusView.ts`:

Add to the imports from `@hyphae/schema` (they already import `c4Backend, layerOfType, ...`): add `nodeAtOrAboveLayer`.

Change the signature:

```ts
export function buildFocusView(model: HyphaeModel, focusId: string | null, filter?: ConnFilter, audience: Audience = 'full'): FocusView {
```

Right after `children` is computed (the `const children = focusId ? ... : ...;` block), narrow it for stakeholder mode. Change `const children` to `let children` and add:

```ts
  const stakeholder = audience === 'stakeholder';
  if (stakeholder) children = children.filter((n) => nodeAtOrAboveLayer(c4Backend, n.type, 'Component'));
```

Remove the inline external collection so externals are derived from the final edges instead. Delete these two lines inside the `for (const c of conns)` pair-aggregation loop:

```ts
    if (!inside.has(from)) externalIds.add(from);
    if (!inside.has(to)) externalIds.add(to);
```

and delete the `const externalIds = new Set<string>();` declaration above the loop.

Then replace the final `edges`-building tail and the `const externals = ...; return ...;` (from the `const edges: FocusEdge[] = [];` block onward is unchanged up to where edges are fully built). After the `for (const p of pairs.values()) { ... }` loop that fills `edges`, add filtering + external derivation and update the return:

```ts
  const atComponent = (id: string): boolean => {
    const n = nodes.get(id);
    return !!n && nodeAtOrAboveLayer(c4Backend, n.type, 'Component');
  };
  const shownEdges = stakeholder
    ? edges.filter((ed) => !ed.derived && atComponent(ed.from) && atComponent(ed.to))
    : edges;

  const shownExternalIds = new Set<string>();
  for (const ed of shownEdges) {
    if (!inside.has(ed.from)) shownExternalIds.add(ed.from);
    if (!inside.has(ed.to)) shownExternalIds.add(ed.to);
  }
  const externals = [...shownExternalIds].map((id) => nodes.get(id)).filter((n): n is Node => !!n);
  return { focusId, focusNode, children, externals, edges: shownEdges };
```

(Delete the old `const externals = [...externalIds]...` line and the old `return { ... }` line that this replaces.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @hyphae/web test focusView`
Expected: PASS — the new stakeholder block AND all existing `buildFocusView` tests (full mode externals are now derived from final edges, which is equivalent to the previous per-pair collection).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/focusView.ts apps/web/test/focusView.test.ts
git commit -m "feat(web): stakeholder audience hides Code children and derived edges in focus view"
```

---

### Task 8: Wire the toggle into Canvas + App toolbar

**Files:**
- Modify: `apps/web/src/Canvas.tsx` — read `audience`, thread into `buildFocusView`, block Component drill in stakeholder mode
- Modify: `apps/web/src/App.tsx` — add the toolbar "Stakeholder | Full" toggle
- Test: `apps/web/test/Canvas.test.tsx`, `apps/web/test/App.test.tsx`

**Interfaces:**
- Consumes: `audience`/`setAudience` (Task 6), `buildFocusView(..., audience)` (Task 7), `layerOfType` + `c4Backend` (schema).

- [ ] **Step 1: Write the failing Canvas test**

Add to `apps/web/test/Canvas.test.tsx` inside `describe('Canvas navigation (real React Flow)', ...)`:

```ts
it('in stakeholder mode, double-clicking a Component does not drill into its Code', () => {
  useStore.setState({ model: model(), focusId: 'ca', selectedId: null, audience: 'stakeholder' });
  const { container } = render(<Canvas />);
  dblclick(container, 'a1');                        // a1 is a Component with a Class child (k1)
  expect(useStore.getState().focusId).toBe('ca');   // stayed put
  expect(useStore.getState().selectedId).toBe('a1');
});

it('in full mode, double-clicking a Component with children still drills', () => {
  useStore.setState({ model: model(), focusId: 'ca', selectedId: null, audience: 'full' });
  const { container } = render(<Canvas />);
  dblclick(container, 'a1');
  expect(useStore.getState().focusId).toBe('a1');
});
```

- [ ] **Step 2: Write the failing App test**

Add to `apps/web/test/App.test.tsx` inside `describe('App', ...)`:

```ts
it('toggles audience from the toolbar', async () => {
  render(<App />);
  await new Promise((r) => setTimeout(r, 0));
  fireEvent.click(screen.getByRole('button', { name: /stakeholder/i }));
  expect(useStore.getState().audience).toBe('stakeholder');
  fireEvent.click(screen.getByRole('button', { name: /full/i }));
  expect(useStore.getState().audience).toBe('full');
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @hyphae/web test Canvas` then `pnpm --filter @hyphae/web test App`
Expected: FAIL — Canvas still drills into `a1` in stakeholder mode; App has no Stakeholder/Full buttons.

- [ ] **Step 4: Implement Canvas changes**

In `apps/web/src/Canvas.tsx`:

Add to the schema import: `import { c4Backend, layerOfType } from '@hyphae/schema';` (new import line near the top).

Read `audience` from the store (alongside the other `useStore` selectors):

```ts
  const audience = useStore((s) => s.audience);
```

Thread it into the view memo (update the call and deps):

```ts
  const view = useMemo(() => buildFocusView(model, focusId, connFilter, audience), [model, focusId, connFilter, audience]);
```

Update `drill` to block Component drill-in under stakeholder mode:

```ts
  const drill = (node: FlowNode) => {
    if (node.type === 'ghost') { setFocus(node.id); return; }
    if (!model.nodes.some((n) => n.parentId === node.id)) return;
    if (audience === 'stakeholder') {
      const target = model.nodes.find((n) => n.id === node.id);
      if (target && layerOfType(c4Backend, target.type) === 'Component') return; // Components are leaves for stakeholders
    }
    setFocus(node.id);
  };
```

- [ ] **Step 5: Implement App toolbar toggle**

In `apps/web/src/App.tsx`, read the store values (add near the other `useStore` selectors):

```ts
  const audience = useStore((s) => s.audience);
  const setAudience = useStore((s) => s.setAudience);
```

Add the control to the `<header className="toolbar">`, after the `addable.map(...)` buttons (before `</header>`):

```tsx
        <div className="audience-toggle" role="group" aria-label="detail level" style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          {(['stakeholder', 'full'] as const).map((a) => (
            <button
              key={a}
              onClick={() => setAudience(a)}
              aria-pressed={audience === a}
              style={{ fontWeight: audience === a ? 700 : 400, textTransform: 'capitalize' }}
            >
              {a}
            </button>
          ))}
        </div>
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @hyphae/web test Canvas` then `pnpm --filter @hyphae/web test App`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/Canvas.tsx apps/web/src/App.tsx apps/web/test/Canvas.test.tsx apps/web/test/App.test.tsx
git commit -m "feat(web): toolbar Stakeholder/Full toggle and stakeholder drill cap"
```

---

### Task 9: Full-suite green + manual verification

**Files:** none (verification only)

- [ ] **Step 1: Run every package's tests**

Run: `pnpm -r test`
Expected: all of `@hyphae/schema`, `@hyphae/server`, `@hyphae/web` pass.

- [ ] **Step 2: Manual web check (per superpowers:verification-before-completion)**

Start the app (`pnpm dev`), open the web editor, and confirm:
- The toolbar shows a Stakeholder | Full toggle; Full is the default.
- In Stakeholder mode: focusing a Container shows its Components but they cannot be drilled into; dashed (derived) edges disappear, solid authored edges remain.
- Switching back to Full restores Code drill-in and dashed edges. Refreshing the page keeps the last-chosen mode.

- [ ] **Step 3: Manual MCP check**

With the server running, confirm via the MCP tools that `list_connections({})` omits Code-touching edges while `list_connections({ maxLayer: 'Code' })` includes them (and likewise `list_nodes`/`get_subgraph`).

- [ ] **Step 4: Commit any doc/screenshot notes if produced** (otherwise nothing to commit).

---

## Self-Review

**Spec coverage:**
- Shared helper → Task 1. ✅
- MCP `maxLayer` on `list_nodes`/`list_connections`/`get_subgraph`, default Component → Tasks 2/3/4. ✅
- `get_node`/`rollup_connections`/`model_overview` untouched → not modified in any task. ✅
- SKILL.md / subagent-prompt ripple → Task 5. ✅
- Web store `audience` + localStorage, not in hash → Task 6. ✅
- `buildFocusView` stakeholder (hide Code children, drop derived edges, recompute externals) → Task 7. ✅
- Canvas drill cap + App toolbar toggle → Task 8. ✅
- Testing across schema/server/web + manual verify → each task's tests + Task 9. ✅

**Placeholder scan:** No TBD/TODO; every code step shows the exact edit.

**Type consistency:** `nodeAtOrAboveLayer(profile, type, maxLayer)` used identically in Tasks 1–4 and 7. `Audience = 'stakeholder' | 'full'` defined in focusView (Task 6) and consumed by store (Task 6) and `buildFocusView` (Task 7). `buildFocusView(model, focusId, filter?, audience)` 4-arg signature consistent between Task 7 (definition) and Task 8 (Canvas call). Store `audience`/`setAudience` names consistent across Tasks 6/8.

# Retire `Connection.type` and `transport` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the `Connection.type` field and the `transport` connection field from Hyphae, replacing both with the already-derived verb class, and give the reserved Intent axis a `traceability` verb class to live in.

**Architecture:** Both fields are read in only a handful of places (a side-list suffix, two filter groups, a `<select>`, two MCP filter params). Consumers are cleaned up **first**, while the fields still exist, so every task leaves the suite green. The schema removal — the one change that breaks compilation everywhere at once — lands last, as a single atomic task.

**Tech Stack:** pnpm workspaces, Zod 4, React 19 + @xyflow/react, Zustand, Hono, `@modelcontextprotocol/sdk`, Vitest (+ jsdom in `apps/web`).

**Spec:** `docs/superpowers/specs/2026-07-27-retire-connection-kind-and-transport-design.md`

## Global Constraints

- **Never run bare `pnpm vitest run` from the repo root.** There is no root vitest config; web tests then run without jsdom and report dozens of bogus failures. Use `pnpm -r test`, or `cd apps/web` first.
- **`apps/server/hyphae-baritone.json` is permanently untracked — never `git add` it.** Verify with `git status --short` before every commit. Stage explicit paths; never `git add -A`.
- Conventional commits with a scope (`feat(web):`, `fix(web):`, `refactor(schema):`, `docs:`). Explain *why* in the body.
- End every commit message with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Branch is already created: `feat/retire-connection-kind-transport`. The spec is already committed on it.
- The Zod schema in `packages/schema` wins any disagreement with docs.
- Roughly 80 `act(...)` warnings in the web suite are **pre-existing noise**, not a regression.
- Baseline before this work: **490 tests green** (schema 143, server 106, web 241). This plan *removes* assertions, so the final count will be lower. That is expected; record the new number in `CLAUDE.md` in Task 8.

## File Structure

| File | Responsibility after this change |
|---|---|
| `packages/schema/src/connection.ts` | Connection shape — no `type` |
| `packages/schema/src/profile.ts` | Profile shape — no `connectionKinds`; `nodeFields()` / `connectionFields()` replace `effectiveFields()`; `VerbClassSchema` gains `traceability` |
| `packages/schema/src/profiles/c4-backend.ts` | The shipped profile — no `connectionKinds`, no `transport`, two new traceability verbs |
| `packages/schema/src/validate.ts` | Validation — no connection-kind or endpoint-allowlist checks |
| `apps/web/src/reactflow.ts` | Edge visuals — `VERB_CLASS_COLOR` gains `traceability` |
| `apps/web/src/Legend.tsx` | Key — verb classes derived from the profile, not hardcoded |
| `apps/web/src/FilterPanel.tsx` | Connection filter — by verb class |
| `apps/web/src/focusView.ts` | Focus pipeline — `ConnFilter` by verb class; `FocusEdge` has no `kind` |
| `apps/web/src/store.ts` | Store — `toggleConnVerbClass`; imports `ConnFilter` from `focusView` instead of redeclaring it |
| `apps/web/src/SidePanel.tsx` | Inspector — no connection type `<select>` |
| `apps/web/src/ConnectionList.tsx` | Side list — shows the connection's `object` |
| `apps/server/src/mcp.ts` | MCP — `verb`/`verbClass` filters replace `type`/`transport` |
| `apps/server/src/store.ts` | `ConnectionInput` no longer requires `type` |

---

### Task 1: Add the `traceability` verb class

Purely additive. Nothing is removed, so the whole suite stays green.

**Files:**
- Modify: `packages/schema/src/profile.ts:28`
- Modify: `packages/schema/src/profiles/c4-backend.ts:26-45`
- Modify: `apps/web/src/reactflow.ts:35-40`
- Modify: `apps/web/src/Legend.tsx:52-61`
- Test: `packages/schema/test/c4-backend.test.ts`, `apps/web/test/Legend.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `VerbClass` now includes `'traceability'`; verb ids `implements` and `satisfies` exist in `c4Backend.verbs`; `VERB_CLASS_COLOR.traceability === '#0d9488'`.

- [ ] **Step 1: Write the failing schema test**

Append to `packages/schema/test/c4-backend.test.ts`:

```ts
describe('traceability verbs', () => {
  it('offers a traceability class for non-runtime links', () => {
    const trace = c4Backend.verbs.filter((v) => v.class === 'traceability').map((v) => v.id);
    expect(trace.sort()).toEqual(['implements', 'satisfies']);
  });

  it('gives every verb a class the schema knows', () => {
    expect(() => ProfileSchema.parse(c4Backend)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd packages/schema && pnpm vitest run test/c4-backend.test.ts`
Expected: FAIL — `[]` does not equal `['implements', 'satisfies']`.

- [ ] **Step 3: Widen `VerbClassSchema`**

`packages/schema/src/profile.ts:28`:

```ts
export const VerbClassSchema = z.enum(['dataAccess', 'messaging', 'control', 'user', 'traceability']);
```

- [ ] **Step 4: Add the two verbs**

Append to the `verbs` array in `packages/schema/src/profiles/c4-backend.ts`, after the `user` verbs:

```ts
    { id: 'implements', class: 'traceability', description: 'Implements a functional requirement or a declared interface.' },
    { id: 'satisfies', class: 'traceability', description: 'Meets a quality requirement (performance, security, availability).' },
```

- [ ] **Step 5: Run the schema test — expect PASS**

Run: `cd packages/schema && pnpm vitest run test/c4-backend.test.ts`

- [ ] **Step 6: Write the failing web test for the colour and the derived legend**

Append to `apps/web/test/Legend.test.tsx`:

```tsx
describe('Legend verb classes', () => {
  it('lists every verb class in the profile, derived not hardcoded', () => {
    const { getByText } = openLegend();
    for (const cls of new Set(c4Backend.verbs.map((v) => v.class))) {
      expect(getByText(new RegExp(cls)), cls).toBeTruthy();
    }
  });
});
```

And append to `apps/web/test/reactflow.test.ts`:

```ts
it('gives every profile verb class a distinct colour', () => {
  const classes = [...new Set(c4Backend.verbs.map((v) => v.class))];
  const colors = classes.map((c) => VERB_CLASS_COLOR[c]);
  expect(colors.every(Boolean)).toBe(true);
  expect(new Set(colors).size).toBe(classes.length);
  // Violet means "derived rollup edge" everywhere else; one colour, one meaning.
  expect(colors).not.toContain('#7c3aed');
});
```

Make sure `c4Backend` and `VERB_CLASS_COLOR` are imported in `reactflow.test.ts`; add to the existing import from `@hyphae/schema` / `../src/reactflow` if not already present.

- [ ] **Step 7: Run them and watch them fail**

Run: `cd apps/web && pnpm vitest run test/Legend.test.tsx test/reactflow.test.ts`
Expected: FAIL — no legend row matching `/traceability/`, and `VERB_CLASS_COLOR.traceability` is `undefined`.

- [ ] **Step 8: Add the colour**

`apps/web/src/reactflow.ts`, in `VERB_CLASS_COLOR`:

```ts
export const VERB_CLASS_COLOR: Record<VerbClass, string> = {
  dataAccess: '#0369a1',
  messaging: '#b45309',
  control: '#475569',
  user: '#be185d',
  traceability: '#0d9488',
};
```

- [ ] **Step 9: Derive the legend's class list from the profile**

`apps/web/src/Legend.tsx` — replace the hardcoded tuple on line 53 so the legend cannot drift from the profile again:

```tsx
          {[...new Set(c4Backend.verbs.map((v) => v.class))].map((cls) => {
            const verbs = c4Backend.verbs.filter((v) => v.class === cls).map((v) => v.id);
            return (
              <div key={cls}>
                <span style={{ ...line(false), borderColor: VERB_CLASS_COLOR[cls] }} />
                {cls} — {verbs.slice(0, 3).join(', ')}{verbs.length > 3 ? '…' : ''}
              </div>
            );
          })}
```

- [ ] **Step 10: Fix the stale legend copy**

`apps/web/src/Legend.tsx:40` still says the solid-edge label is the kind. It has been verb+object since Phase A:

```tsx
          <div><span style={line(false)} />solid — one authored connection (label = verb + object)</div>
```

- [ ] **Step 11: Run the full suite — expect green**

Run: `pnpm -r test`
Expected: all green, count unchanged from baseline plus the 4 new tests.

- [ ] **Step 12: Commit**

```bash
git add packages/schema/src/profile.ts packages/schema/src/profiles/c4-backend.ts \
        packages/schema/test/c4-backend.test.ts \
        apps/web/src/reactflow.ts apps/web/src/Legend.tsx \
        apps/web/test/Legend.test.tsx apps/web/test/reactflow.test.ts
git status --short   # confirm hyphae-baritone.json is NOT staged
git commit -m "$(cat <<'EOF'
feat(schema): add a traceability verb class

The reserved Intent axis (SPEC 6.8) needs a home for requirement -> component
links, which are not runtime edges. Adding `implements` and `satisfies` as a
`traceability` verb class gives them one inside the vocabulary that already
colours the canvas, so the `Trace` connection kind has somewhere to go when it
is retired.

The legend now derives its class list from the profile rather than repeating
it, which is what let the hardcoded list go stale in the first place.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Filter connections by verb class

The `FilterPanel` currently offers four connection kinds plus four transport values. Both groups are about to disappear, so it switches to the axis actually drawn on the canvas.

**Files:**
- Modify: `apps/web/src/focusView.ts:3` (the `ConnFilter` type), `:34-39` (`matchesFilter`)
- Modify: `apps/web/src/store.ts:9` (duplicate `ConnFilter` — delete and import), `:33` , `:70`, `:124-128`, `:135`
- Modify: `apps/web/src/FilterPanel.tsx`
- Test: `apps/web/test/focusView.test.ts`, `apps/web/test/store.test.ts`

**Interfaces:**
- Consumes: `verbClassOf(profile, verbId)` from `@hyphae/schema` (already exported); `VerbClass` from Task 1.
- Produces: `ConnFilter = { verbClasses: string[]; fields: Record<string, string[]> }`, exported from `apps/web/src/focusView.ts` only. Store action `toggleConnVerbClass(value: string): void` replaces `toggleConnKind`.

- [ ] **Step 1: Write the failing filter test**

Append to `apps/web/test/focusView.test.ts` (inside the existing top-level `describe`, or as a new one — match the file's style):

```ts
describe('connection filter by verb class', () => {
  it('keeps only edges whose verb belongs to a selected class', () => {
    const m = baseModel();
    m.connections.push(
      { id: 'r', from: 'a1', to: 'a2', ...e, verb: 'reads', object: '' },      // dataAccess
      { id: 'p', from: 'a1', to: 'a2', ...e, verb: 'publishes', object: '' },  // messaging
    );
    const view = buildFocusView(m, 'ca', { verbClasses: ['messaging'], fields: {} });
    expect(view.edges.flatMap((ed) => ed.realizedBy)).toEqual(['p']);
  });

  it('an empty verbClasses list filters nothing', () => {
    const m = baseModel();
    m.connections.push({ id: 'r', from: 'a1', to: 'a2', ...e, verb: 'reads', object: '' });
    const view = buildFocusView(m, 'ca', { verbClasses: [], fields: {} });
    expect(view.edges.flatMap((ed) => ed.realizedBy)).toEqual(['r']);
  });
});
```

Use whatever model-builder helper the file already defines in place of `baseModel()` and whatever connection-base constant it already spreads in place of `e` — read the top of `focusView.test.ts` first and match it exactly. The two component nodes must be `a1`/`a2` inside container `ca`.

- [ ] **Step 2: Run it and watch it fail**

Run: `cd apps/web && pnpm vitest run test/focusView.test.ts`
Expected: FAIL — TypeScript/runtime rejects `verbClasses`; the filter still reads `kinds`.

- [ ] **Step 3: Change the type and the matcher**

`apps/web/src/focusView.ts:3`:

```ts
export type ConnFilter = { verbClasses: string[]; fields: Record<string, string[]> };
```

`apps/web/src/focusView.ts:34-39`:

```ts
function matchesFilter(c: Connection, f: ConnFilter): boolean {
  if (f.verbClasses.length && !f.verbClasses.includes(verbClassOf(c4Backend, c.verb) ?? '')) return false;
  for (const [key, vals] of Object.entries(f.fields)) {
    if (vals.length && !vals.includes(String(c.fields[key] ?? ''))) return false;
  }
  return true;
}
```

Add `verbClassOf` to the existing `@hyphae/schema` import at the top of the file.

- [ ] **Step 4: Run the focusView test — expect PASS**

Run: `cd apps/web && pnpm vitest run test/focusView.test.ts`

- [ ] **Step 5: Write the failing store test**

Append to `apps/web/test/store.test.ts`:

```ts
describe('connection verb-class filter', () => {
  beforeEach(() => useStore.setState({ connFilter: { verbClasses: [], fields: {} } }));

  it('toggles a verb class on and off', () => {
    useStore.getState().toggleConnVerbClass('messaging');
    expect(useStore.getState().connFilter.verbClasses).toEqual(['messaging']);
    useStore.getState().toggleConnVerbClass('messaging');
    expect(useStore.getState().connFilter.verbClasses).toEqual([]);
  });

  it('clearConnFilter empties both groups', () => {
    useStore.getState().toggleConnVerbClass('control');
    useStore.getState().toggleConnField('anything', 'x');
    useStore.getState().clearConnFilter();
    expect(useStore.getState().connFilter).toEqual({ verbClasses: [], fields: {} });
  });
});
```

- [ ] **Step 6: Run it and watch it fail**

Run: `cd apps/web && pnpm vitest run test/store.test.ts`
Expected: FAIL — `toggleConnVerbClass is not a function`.

- [ ] **Step 7: Update the store**

In `apps/web/src/store.ts`, delete the duplicate `ConnFilter` declaration on line 9 and import the single definition instead — it is already declared in `focusView.ts` and the two must not be able to drift:

```ts
import { stepReveal, type Audience, type ConnFilter } from './focusView';
```

Re-export it so existing importers of `./store` keep working:

```ts
export type { ConnFilter };
```

Then, in the `State` type (line 33):

```ts
  toggleConnVerbClass: (value: string) => void;
```

Initial state (line 70):

```ts
    connFilter: { verbClasses: [], fields: {} },
```

The action (replacing lines 124-128):

```ts
    toggleConnVerbClass: (value) =>
      set((s) => {
        const verbClasses = s.connFilter.verbClasses.includes(value)
          ? s.connFilter.verbClasses.filter((v) => v !== value)
          : [...s.connFilter.verbClasses, value];
        return { connFilter: { ...s.connFilter, verbClasses } };
      }),
```

And `clearConnFilter` (line 135):

```ts
    clearConnFilter: () => set({ connFilter: { verbClasses: [], fields: {} } }),
```

- [ ] **Step 8: Run the store test — expect PASS**

Run: `cd apps/web && pnpm vitest run test/store.test.ts`

- [ ] **Step 9: Rewrite the FilterPanel's first group**

`apps/web/src/FilterPanel.tsx` — replace `KindGroup` with `VerbClassGroup` and update the import. The class list is derived from the profile, exactly like the legend, so the two panels always agree:

```tsx
import { useStore } from './store';
import { c4Backend, type FieldDef } from '@hyphae/schema';
import { VERB_CLASS_COLOR } from './reactflow';

function VerbClassGroup() {
  const selected = useStore((s) => s.connFilter.verbClasses);
  const toggle = useStore((s) => s.toggleConnVerbClass);
  const classes = [...new Set(c4Backend.verbs.map((v) => v.class))];
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4, color: '#888' }}>Verb class</div>
      {classes.map((cls) => (
        <label key={cls} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={selected.includes(cls)} onChange={() => toggle(cls)} />
          <span style={{ display: 'inline-block', width: 10, height: 2, background: VERB_CLASS_COLOR[cls] }} />
          {cls}
        </label>
      ))}
    </div>
  );
}
```

In `FilterPanel`, swap the usage and the active count:

```tsx
  const active = filter.verbClasses.length + Object.values(filter.fields).reduce((a, v) => a + v.length, 0);
```

```tsx
      <VerbClassGroup />
```

`FieldGroup` and the `enumFields` loop are unchanged — that generic mechanism stays for custom profiles.

- [ ] **Step 10: Run the full suite — expect green**

Run: `pnpm -r test`

- [ ] **Step 11: Commit**

```bash
git add apps/web/src/focusView.ts apps/web/src/store.ts apps/web/src/FilterPanel.tsx \
        apps/web/test/focusView.test.ts apps/web/test/store.test.ts
git status --short
git commit -m "$(cat <<'EOF'
feat(web): filter connections by verb class

The connection kind filter is about to lose its field, and transport with it.
Verb class is the axis the canvas already draws — it colours every edge — so
filtering on it means a filter can never disagree with what is on screen. It
is also derived from the verb, so unlike the kind it cannot go inconsistent.

Five checkboxes replace the previous eight. ConnFilter was declared twice, in
focusView and in store; the store now imports the one definition.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Stop reading `type` and `transport` in the web UI

**Files:**
- Modify: `apps/web/src/SidePanel.tsx:159-162`
- Modify: `apps/web/src/ConnectionList.tsx:28`
- Modify: `apps/web/src/focusView.ts:15`, `:188`, `:201`, `:205`, `:218`
- Test: `apps/web/test/SidePanel.test.tsx`, `apps/web/test/ConnectionList.test.tsx`

**Interfaces:**
- Consumes: `ConnFilter` from Task 2.
- Produces: `FocusEdge` no longer has a `kind` property.

- [ ] **Step 1: Write the failing ConnectionList test**

In `apps/web/test/ConnectionList.test.tsx`, replace the first test with one asserting the new suffix, and change the fixture's `verb`/`object` so there is something to show:

```tsx
const conns: Connection[] = [
  { id: 'x', from: 'a1', to: 'b1', type: 'Dependency', verb: 'reads', object: 'camera list', description: '', direction: 'Unidirectional', realizedBy: [], codeRefs: [], fields: { transport: 'Sync' } },
];
```

```tsx
  it('renders a row per connection with endpoint names and the object', () => {
    render(<ConnectionList connections={conns} />);
    expect(screen.getByRole('button', { name: 'A1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'B1' })).toBeTruthy();
    expect(screen.getByText(/camera list/)).toBeTruthy();
    expect(screen.queryByText(/Dependency/)).toBeNull();
    expect(screen.queryByText(/Sync/)).toBeNull();
  });
```

(`type` and `fields.transport` stay in the fixture for now — they are removed wholesale in Task 6.)

- [ ] **Step 2: Run it and watch it fail**

Run: `cd apps/web && pnpm vitest run test/ConnectionList.test.tsx`
Expected: FAIL — `Dependency` is still rendered.

- [ ] **Step 3: Show the object instead**

`apps/web/src/ConnectionList.tsx:28`:

```tsx
          {c.object && <small> · {c.object}</small>}
```

- [ ] **Step 4: Run it — expect PASS**

Run: `cd apps/web && pnpm vitest run test/ConnectionList.test.tsx`

- [ ] **Step 5: Write the failing SidePanel test**

Append to `apps/web/test/SidePanel.test.tsx`, inside the connection-inspector describe block (reuse whatever helper the file uses to render a selected connection — read it first and match):

```tsx
  it('no longer offers a connection type select', () => {
    // ...render the panel with a selected connection, as the neighbouring tests do...
    expect(screen.queryByLabelText('type')).toBeNull();
    expect(screen.getByLabelText('verb')).toBeTruthy();
  });
```

- [ ] **Step 6: Run it and watch it fail**

Run: `cd apps/web && pnpm vitest run test/SidePanel.test.tsx`
Expected: FAIL — the `type` select is still in the DOM.

- [ ] **Step 7: Delete the type select**

Remove these four lines from `apps/web/src/SidePanel.tsx` (159-162):

```tsx
        <label className="field"><span>type</span>
          <select aria-label="type" value={conn.type} onChange={(e) => updateConnection(conn.id, { type: e.target.value })}>
            {connectionKindIds(c4Backend).map((k) => <option key={k} value={k}>{k}</option>)}
          </select></label>
```

Leave the `connectionKindIds` import in place for now — Task 6 removes it along with the function.

- [ ] **Step 8: Run it — expect PASS**

Run: `cd apps/web && pnpm vitest run test/SidePanel.test.tsx`

- [ ] **Step 9: Delete the dead `FocusEdge.kind`**

Nothing reads it — `reactflow.ts` builds every edge from verb, object and direction. Four edits in `apps/web/src/focusView.ts`:

Line 15 area — remove from the `FocusEdge` type:

```ts
  kind: string | null; // connection type for a 1:1 real edge; null when aggregated
```

Line 188 — remove `kind` from `Entry`:

```ts
  type Entry = { id: string; from: string; to: string; direction: string; verb: string; object: string; direct: boolean };
```

Line 201 — drop `kind: c.type,` from the pushed entry:

```ts
    p.entries.push({ id: c.id, from, to, direction: c.direction, verb: c.verb, object: c.object, direct: from === c.from && to === c.to });
```

Line 205 — drop `kind: d.kind,` from `realEdgeOf`:

```ts
  const realEdgeOf = (d: Entry): FocusEdge => ({
    id: d.id, from: d.from, to: d.to, count: 1, derived: false,
    realizedBy: [d.id], direction: d.direction, verb: d.verb, object: d.object,
  });
```

Line 218 — drop `kind: null,` from the object returned by `aggregateEdgeOf`:

```ts
    return { id: `agg:${p.a}->${p.b}`, from, to, count: items.length, derived: true, realizedBy: items.map((i) => i.id), direction };
```

- [ ] **Step 10: Run the full suite — expect green**

Run: `pnpm -r test`
If any test asserts on `edge.kind`, delete that assertion — the property is gone by design.

- [ ] **Step 11: Commit**

```bash
git add apps/web/src/SidePanel.tsx apps/web/src/ConnectionList.tsx apps/web/src/focusView.ts \
        apps/web/test/SidePanel.test.tsx apps/web/test/ConnectionList.test.tsx
git status --short
git commit -m "$(cat <<'EOF'
refactor(web): stop reading connection type and transport

The inspector's type select let you set a value nothing rendered, and the
connection list's "· Dependency · Sync" suffix spent a line on two fields that
were the same for most rows. The list now shows the object, which is populated
on every connection in the real model and actually says something.

FocusEdge.kind was already dead: reactflow builds each edge from verb, object
and direction alone.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Swap the MCP read-side filters to verb / verb class

Write-side tools (`create_connections`, `update_connections`) still take `type`, because `ConnectionSchema` still requires it. They change in Task 6.

**Files:**
- Modify: `apps/server/src/mcp.ts:145` (signature), `:186-187` (predicate), `:204` (result), `:214` + `:454` (get_subgraph), `:264` (rollup result), `:419-422` (tool schema)
- Test: `apps/server/test/mcp.test.ts`

**Interfaces:**
- Consumes: `verbClassOf` from `@hyphae/schema`; `VerbClass` values from Task 1.
- Produces: `list_connections({ verb?, verbClass?, nodeId?, containerId?, crossingBoundary?, involvingExternal?, limit?, offset?, maxLayer? })`. `get_subgraph` takes `verbClass?` in place of `type?`. Neither `type` nor `transport` appears in any result object.

- [ ] **Step 1: Write the failing MCP tests**

In `apps/server/test/mcp.test.ts`, the fixture at lines 331-334 gives `x1`/`x3`/`x4` distinct edges. Give them distinct verbs first — add `verb` to each so the classes differ:

```ts
    { id: 'x1', from: 'a1', to: 'b1', ...e, verb: 'reads' },       // dataAccess
    { id: 'x2', from: 'a1', to: 'ext', ...e, verb: 'publishes' },  // messaging
    { id: 'x3', from: 'b1', to: 'ext', ...e, verb: 'invokes' },    // control
    { id: 'x4', from: 'a1', to: 'a2', ...e, verb: 'reads' },       // dataAccess
```

Replace the `type` filter assertion on line 348 and add a verb filter:

```ts
    expect(ids(await buildTools(api()).list_connections({ verbClass: 'dataAccess' }))).toEqual(['x1', 'x4']);
    expect(ids(await buildTools(api()).list_connections({ verb: 'invokes' }))).toEqual(['x3']);
```

Add a test that the retired fields are gone from results:

```ts
  it('never returns the retired type/transport fields', async () => {
    const [first] = (await buildTools(api()).list_connections({})) as Array<Record<string, unknown>>;
    expect('type' in first).toBe(false);
    expect('transport' in first).toBe(false);
  });
```

Update the `get_subgraph` filter test on line 271 — `e3` is the odd edge out, so give it a distinguishing verb in the fixture at line 207 (`verb: 'publishes'`) and filter on the class:

```ts
    const r = (await buildTools(api()).get_subgraph({ nodeId: 'n1', depth: 1, verbClass: 'messaging' })) as { nodes: Array<{ id: string }>; connections: unknown[] };
```

Update the rollup expectation on line 404 to drop both fields:

```ts
    expect(caCb.realizedBy).toEqual([{ id: 'x1', fromName: 'A1', toName: 'B1', verb: 'uses', object: '', description: '' }]);
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd apps/server && pnpm vitest run test/mcp.test.ts`
Expected: FAIL — `verbClass` is ignored, so every connection comes back; `type` is still present in results.

- [ ] **Step 3: Update `list_connections`**

`apps/server/src/mcp.ts:145` — the destructured signature:

```ts
    list_connections: async ({ verb, verbClass, nodeId, containerId, crossingBoundary, involvingExternal, limit, offset, maxLayer = 'Component' }: { verb?: string; verbClass?: string; nodeId?: string; containerId?: string; crossingBoundary?: boolean; involvingExternal?: boolean; limit?: number; offset?: number; maxLayer?: string } = {}) => {
```

Lines 186-187 — the predicate:

```ts
        if (verb !== undefined && c.verb !== verb) return false;
        if (verbClass !== undefined && verbClassOf(c4Backend, c.verb) !== verbClass) return false;
```

Line 204 — the result:

```ts
        verb: c.verb, object: c.object,
```

Add `verbClassOf` to the `@hyphae/schema` import at the top of `mcp.ts`.

- [ ] **Step 4: Update `get_subgraph` and `rollup_connections`**

`apps/server/src/mcp.ts:213` — the signature's `type?: string` becomes `verbClass?: string`; line 214:

```ts
      const edges = verbClass ? model.connections.filter((c) => verbClassOf(c4Backend, c.verb) === verbClass) : model.connections;
```

Line 264 — the rollup's `realizedBy` entries:

```ts
          return { id: c.id, fromName: byId.get(c.from)?.name ?? c.from, toName: byId.get(c.to)?.name ?? c.to, verb: c.verb, object: c.object, description: c.description };
```

- [ ] **Step 5: Update the two registered tool schemas**

`apps/server/src/mcp.ts:419-422` — the `list_connections` description and inputs:

```ts
      description: 'Query raw connections across the model. Filters (all optional, AND-combined): verb (an exact verb id), verbClass (dataAccess/messaging/control/user/traceability), nodeId (edges touching exactly this node — use to inspect one node\'s edges), containerId (edges touching that container or any of its descendants), crossingBoundary (true = endpoints in different owning containers — i.e. inter-container / external edges; false = intra-container only), involvingExternal (an endpoint is an ExternalSystem). Supports offset/limit. Each result is enriched with fromName/toName and fromContainer/toContainer. By default edges among Component-and-above nodes are returned; pass maxLayer to cap at a shallower layer. For DERIVED higher-level edges (component edges aggregated to Container/Context level) use rollup_connections.',
      inputSchema: {
        verb: z.enum(c4Backend.verbs.map((v) => v.id) as [string, ...string[]]).optional().describe('Only connections with this exact verb.'),
        verbClass: z.enum(VerbClassSchema.options as [string, ...string[]]).optional().describe('Only connections whose verb belongs to this class.'),
```

`apps/server/src/mcp.ts:454` — the `get_subgraph` input, and its description's `optional \`type\` filter` phrase becomes `optional \`verbClass\` filter`:

```ts
        verbClass: z.enum(VerbClassSchema.options as [string, ...string[]]).optional().describe('Only traverse connections whose verb belongs to this class.'),
```

Add `VerbClassSchema` to the `@hyphae/schema` import.

- [ ] **Step 6: Run the MCP tests — expect PASS**

Run: `cd apps/server && pnpm vitest run test/mcp.test.ts`

- [ ] **Step 7: Run the full suite — expect green**

Run: `pnpm -r test`

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/mcp.ts apps/server/test/mcp.test.ts
git status --short
git commit -m "$(cat <<'EOF'
feat(server): filter MCP connection queries by verb and verb class

Replaces the `type` and `transport` filters on list_connections and
get_subgraph. Both retired fields also leave the result objects of
list_connections, get_subgraph and rollup_connections.

verbClass is strictly more useful than the kind it replaces: it partitions
edges the same way but is derived from the verb, so it agrees with the canvas
by construction. `verb` is new and finer-grained than anything the old filters
offered.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Remove `transport` from the profile

Nothing reads it now. Removing it leaves `commonConnectionFields` empty — and leaves `c4-backend` with **no enum field at all**, so the generic enum-validation path needs coverage from a synthetic profile instead.

**Files:**
- Modify: `packages/schema/src/profiles/c4-backend.ts:57-67`
- Test: `packages/schema/test/c4-backend.test.ts:48`, `packages/schema/test/validate.test.ts:47-55`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `c4Backend.commonConnectionFields === []`.

- [ ] **Step 1: Rewrite the two tests that depend on `transport`**

`packages/schema/test/c4-backend.test.ts:48` becomes:

```ts
  it('ships no connection fields — verb and object carry the meaning', () => {
    expect(c4Backend.commonConnectionFields).toEqual([]);
  });
```

`packages/schema/test/validate.test.ts:47-55` — the `bad-enum-value` test currently relies on `transport` being the profile's one enum field. Keep the generic path covered with a synthetic profile:

```ts
  it('flags a bad enum value on a connection field', () => {
    const profile = {
      ...c4Backend,
      commonConnectionFields: [{
        key: 'channel', type: 'enum' as const, description: 'test-only enum field',
        values: [{ value: 'Radio', description: 'over the air' }],
      }],
    };
    const m = model({
      nodes: [node({ id: 'a', type: 'System' }), node({ id: 'b', type: 'System' })],
      connections: [conn({ from: 'a', to: 'b', fields: { channel: 'Telepathy' } })],
    });
    expect(validateModel(m, profile).map((i) => i.kind)).toContain('bad-enum-value');
  });
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd packages/schema && pnpm vitest run test/c4-backend.test.ts test/validate.test.ts`
Expected: FAIL — `commonConnectionFields` still contains the transport definition.

- [ ] **Step 3: Delete the field definition**

In `packages/schema/src/profiles/c4-backend.ts`, replace lines 57-67 with:

```ts
  // Empty by design: verb + object + description carry a connection's meaning. The array stays
  // so a custom profile can define its own connection fields.
  commonConnectionFields: [],
```

- [ ] **Step 4: Run them — expect PASS**

Run: `cd packages/schema && pnpm vitest run test/c4-backend.test.ts test/validate.test.ts`

- [ ] **Step 5: Run the full suite — expect green**

Run: `pnpm -r test`
The `FilterPanel`'s `enumFields` loop now renders nothing; that is intended and no test should assert otherwise.

- [ ] **Step 6: Commit**

```bash
git add packages/schema/src/profiles/c4-backend.ts \
        packages/schema/test/c4-backend.test.ts packages/schema/test/validate.test.ts
git status --short
git commit -m "$(cat <<'EOF'
refactor(schema): drop the transport connection field

The enum conflated two orthogonal axes — whether the caller blocks (Sync/Async)
and whether the call crosses a process boundary (InProcess) — so whoever filled
it had to pick one and silently discard the other. In the Baritone model the
same verb lands as `invokes | InProcess` 86 times and `invokes | Sync` 20 times
in a single build pass. 325 of 411 values are InProcess, which only restates
"both endpoints share a container", already derivable from parentId. Genuinely
informative values: Async, four of them.

The messaging verb class already implies asynchrony where it matters.

c4-backend now has no enum field at all, so the generic enum-validation path is
covered by a synthetic profile in the test instead.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Remove `Connection.type` and `connectionKinds`

The atomic break. Removing the field breaks the schema, web and server compile at once, so all three move together.

**Files:**
- Modify: `packages/schema/src/connection.ts:9`
- Modify: `packages/schema/src/profile.ts:68-74`, `:80`, `:93`, `:146-160`
- Modify: `packages/schema/src/profiles/c4-backend.ts:75-80`
- Modify: `packages/schema/src/validate.ts:4`, `:10-11` (Issue union), `:95`, `:117`, `:137-153`
- Modify: `apps/web/src/SidePanel.tsx:6`, `:83`, `:103`, `:170`
- Modify: `apps/web/src/store.ts:180`
- Modify: `apps/server/src/store.ts:12`
- Modify: `apps/server/src/mcp.ts:6`, `:71-77`, `:378-380`, `:491`, `:503`, `:520`
- Test: every file listed in Step 9

**Interfaces:**
- Consumes: everything from Tasks 1-5.
- Produces: `Connection` has no `type`. `Profile` has no `connectionKinds`. `nodeFields(profile: Profile, type: string): FieldDef[]` and `connectionFields(profile: Profile): FieldDef[]` replace `effectiveFields(profile, kindId, scope)`. `connectionKindIds` and the `ConnectionKind` type no longer exist.

- [ ] **Step 1: Write the failing schema tests**

`packages/schema/test/connection.test.ts` — replace the file's fixtures so nothing passes `type`, and pin the new behaviour:

```ts
describe('ConnectionSchema', () => {
  it('defaults realizedBy to an empty array', () => {
    const c = ConnectionSchema.parse({ id: 'c1', from: 'a', to: 'b' });
    expect(c.realizedBy).toEqual([]);
  });

  it('accepts realizedBy ids and no longer exposes realizes', () => {
    const c = ConnectionSchema.parse({ id: 'c1', from: 'a', to: 'b', realizedBy: ['x1', 'x2'] });
    expect(c.realizedBy).toEqual(['x1', 'x2']);
    expect('realizes' in c).toBe(false);
  });

  it('strips a legacy type so an old model file needs no migration', () => {
    const c = ConnectionSchema.parse({ id: 'c1', from: 'a', to: 'b', type: 'Dependency' });
    expect('type' in c).toBe(false);
  });
});

describe('ConnectionSchema verb/object', () => {
  const base = { id: 'c', from: 'a', to: 'b' };
  // ...the three existing verb/object tests, unchanged apart from `base`...
});
```

In `packages/schema/test/c4-backend.test.ts`, replace the `connectionKindIds` assertion on line 35:

```ts
  it('no longer defines connection kinds', () => {
    expect('connectionKinds' in c4Backend).toBe(false);
  });
```

...and change the `effectiveFields` calls on lines 39, 44 and 93 to `nodeFields(c4Backend, 'Component')` etc., updating the import on line 3 to `import { ProfileSchema, nodeFields, connectionFields } from '../src/profile';`.

In `packages/schema/test/validate.test.ts`, delete the `unknown connection kind` test (lines 31-37) — the issue kind no longer exists — and drop `type: 'Dependency'` from the `conn` helper on line 13.

- [ ] **Step 2: Run them and watch them fail**

Run: `cd packages/schema && pnpm vitest run`
Expected: FAIL — `type` survives parsing, `connectionKinds` is still on the profile, `nodeFields` is not exported.

- [ ] **Step 3: Remove the field from `ConnectionSchema`**

`packages/schema/src/connection.ts` — delete line 9 entirely:

```ts
  type: z.string().min(1), // a ConnectionKind id, validated against active profile
```

Zod strips unknown keys by default, so a legacy `"type"` in a model file simply disappears on parse.

- [ ] **Step 4: Remove `connectionKinds` from the profile**

`packages/schema/src/profile.ts` — delete `ConnectionKindSchema` (lines 68-74), the `connectionKinds:` entry in `ProfileSchema` (line 80), the `ConnectionKind` type alias (line 93), and `connectionKindIds` (lines 146-147).

Replace `effectiveFields` (lines 149-160) with two focused functions:

```ts
/** Common node fields then the kind's own; common wins on key collision. */
export function nodeFields(profile: Profile, type: string): FieldDef[] {
  const common = profile.commonNodeFields;
  const own = profile.nodeKinds.find((k) => k.id === type)?.fields ?? [];
  const seen = new Set(common.map((f) => f.key));
  return [...common, ...own.filter((f) => !seen.has(f.key))];
}

/** Connections have no kinds, so their fields are exactly the profile's common ones. */
export function connectionFields(profile: Profile): FieldDef[] {
  return profile.commonConnectionFields;
}
```

`packages/schema/src/profiles/c4-backend.ts` — delete the whole `connectionKinds` array (lines 75-80).

- [ ] **Step 5: Update validation**

`packages/schema/src/validate.ts`:

Line 4 — the import:

```ts
import { nodeFields, connectionFields, roleDefOf, verbDefOf } from './profile';
```

Lines 10-11 — remove `'unknown-connection-kind'` and `'bad-endpoint'` from the `Issue` union. Both become unreachable: the first had no kind to look up, the second was driven by `ConnectionKind.allowedFrom` / `allowedTo`, which no longer exist (c4-backend never set them, so nothing observable is lost):

```ts
    | 'unknown-type' | 'bad-parent' | 'missing-parent' | 'dangling-endpoint'
    | 'dangling-realizedBy'
```

Line 95 — delete the `connKindById` map.

Line 117 — `effectiveFields(profile, n.type, 'node')` becomes `nodeFields(profile, n.type)`.

Lines 137-153 — delete the kind lookup, the unknown-kind issue, and both endpoint-allowlist checks, leaving:

```ts
    if (!verbDefOf(profile, c.verb)) {
      issues.push({ kind: 'unknown-verb', ref: c.id, message: `Unknown verb "${c.verb}"` });
    }
    issues.push(...validateFields(c.fields, connectionFields(profile), nodeById, c.id));
```

Note the `continue` on line 140 goes with the deleted block: a connection with an unknown kind used to skip verb and field validation. Now every connection is fully checked.

- [ ] **Step 6: Run the schema suite — expect PASS**

Run: `cd packages/schema && pnpm vitest run`

- [ ] **Step 7: Update the web consumers**

`apps/web/src/SidePanel.tsx` — line 6, drop `connectionKindIds` and swap the field helper:

```ts
  DirectionSchema, allowedParentTypes, nodeFields, connectionFields, c4Backend,
```

Lines 83 and 103 — `effectiveFields(c4Backend, node.type, 'node')` becomes `nodeFields(c4Backend, node.type)`.

Line 170 — `effectiveFields(c4Backend, conn.type, 'connection')` becomes `connectionFields(c4Backend)`.

`apps/web/src/store.ts:180` — drop the type from the create call:

```ts
        const { connection, version } = await api.createConnection({ id: newId(), from, to });
```

- [ ] **Step 8: Update the server consumers**

`apps/server/src/store.ts:12`:

```ts
export type ConnectionInput = Partial<Connection> & { from: string; to: string };
```

`apps/server/src/mcp.ts`:

Line 6 — the import:

```ts
  nodeFields, connectionFields, nodeAtOrAboveLayer, refOwners, resolveRoot, resolveRef,
```

Lines 71-77 — `Identity` no longer carries a connection's type:

```ts
type Identity = { id: string; name?: string; from?: string; to?: string };
function identityOf(e: CreatedEntity): Identity {
  return e.name !== undefined
    ? { id: e.id, name: e.name }
    : e.from !== undefined || e.to !== undefined
      ? { id: e.id, from: e.from, to: e.to }
      : { id: e.id };
}
```

Lines 377-384 — `fieldsShape` no longer loops over connection kinds:

```ts
function fieldsShape(scope: 'node' | 'connection'): Record<string, z.ZodTypeAny> {
  const defs = scope === 'node'
    ? c4Backend.nodeKinds.flatMap((k) => nodeFields(c4Backend, k.id))
    : connectionFields(c4Backend);
  const byKey = new Map<string, FieldDef>();
  for (const f of defs) if (!byKey.has(f.key)) byKey.set(f.key, f);
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [key, def] of byKey) shape[key] = fieldToZod(def);
  return shape;
}
```

Line 491 — `connItem` loses `type`:

```ts
  const connItem = z.object({ from: z.string(), to: z.string(), ...coreConnFields });
```

...and the `create_connections` description on the next line drops its `type` mentions:

```ts
    description: "Create one OR MANY connections in a single call (single write = one-element array). Each item: from, to (existing node ids), verb + object (what the edge does and to what — this is the diagram label), domain values in `fields`, and optional realizedBy to bind lower-layer edges. Best-effort: {created:[{id,from,to},...]} in input order on full success, else {results:[{id,from,to}|{issues}]}. Use the echoed ids to fill `realizedBy` on a higher-layer edge without re-listing.",
```

Line 503 — `connUpdate` loses `type`:

```ts
  const connUpdate = z.object({ id: z.string(), from: z.string().optional(), to: z.string().optional(), ...coreConnFields });
```

Line 520 — the `describe_profile` description no longer promises connection kinds:

```ts
    description: 'The active profile: its layers, node kinds, roles, verbs (with their classes), pattern kinds, and the documented custom fields (with enum values and descriptions) valid for each. Call this to learn what `type`, `role` and `verb` values are available before creating nodes/connections.',
```

- [ ] **Step 9: Strip the retired literals from every test fixture**

`type: 'Dependency'` and friends are now excess properties on `Connection` literals. Remove them — carefully, because node fixtures use `type:` too, so only these four literals may be touched:

```bash
cd C:/projects/hyphae
grep -rl "type: '\(Dependency\|DataFlow\|Realization\|Trace\)'" apps packages \
  --include=*.ts --include=*.tsx | grep -v node_modules | grep -v /dist/ | \
  xargs sed -i "s/type: '\(Dependency\|DataFlow\|Realization\|Trace\)', //g; s/, type: '\(Dependency\|DataFlow\|Realization\|Trace\)'//g"
grep -rn "type: '\(Dependency\|DataFlow\|Realization\|Trace\)'" apps packages \
  --include=*.ts --include=*.tsx | grep -v node_modules | grep -v /dist/
```

The second grep must print nothing. Then handle the leftovers by hand:

- `apps/server/test/mcp.test.ts:118` — `update_connections({ updates: [{ id: 'c1', type: 'Realization' }] })` needs a different field to update; use `{ id: 'c1', verb: 'reads' }` and adjust the assertion.
- `apps/server/test/mcp.test.ts:105`, `:140` — the expected `created` payloads drop `type`.
- `apps/web/test/Canvas.test.tsx:227-228` — the comment says "two DataFlow edges"; reword to "two edges on the same pair".
- Any fixture still carrying `fields: { transport: ... }` — remove the field; `unknown-field` would now flag it.

- [ ] **Step 10: Run the full suite — expect green**

Run: `pnpm -r test`
Expect a **lower** total than 490: the unknown-connection-kind test and several kind/transport assertions are gone. Record the new per-package counts.

- [ ] **Step 11: Build, to catch anything tests do not typecheck**

Run: `pnpm -r build`
Expected: clean. Any residual reference to `effectiveFields`, `connectionKindIds`, `ConnectionKind` or `c.type` surfaces here.

- [ ] **Step 12: Commit**

```bash
git add packages/schema/src apps/web/src apps/server/src packages/schema/test apps/web/test apps/server/test
git status --short   # confirm hyphae-baritone.json is NOT staged
git commit -m "$(cat <<'EOF'
refactor: remove Connection.type and the profile's connection kinds

The four kinds were not distinguishable by whoever filled them. Across the 411
connections of the Baritone model, `reads` is filed as Dependency 53 times and
DataFlow 25 times — effectively a coin flip — and 315 of 411 edges are the
shrug value Dependency. Realization, documented as "A implements an interface
defined by B", sits on `modifies` and `subscribes`.

verb.class gives the same categorical axis, is derived from the verb so it
cannot go inconsistent, and is already what colours every edge on the canvas.
Nothing in the renderer ever read `type`.

Trace, the one kind that described a non-runtime link, became the traceability
verb class in an earlier commit.

Zod strips unknown keys, so an existing model file needs no migration for the
field itself. effectiveFields splits into nodeFields and connectionFields now
that only nodes have kinds. The unknown-connection-kind and bad-endpoint issue
kinds are unreachable and removed; bad-endpoint was driven by allowedFrom /
allowedTo, which c4-backend never set.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Update the living docs

`README.md`, `docs/MODEL.md`, `docs/SPEC.md` and the skill are living docs — they change in the same branch as the behaviour. Historical records under `docs/superpowers/{plans,reviews}/` are left alone.

**Files:**
- Modify: `README.md:48-49`
- Modify: `docs/MODEL.md:52`, `:86`, `:288`
- Modify: `docs/SPEC.md:143-144`, `:216`, `:298`
- Modify: `skills/building-architecture-models/references/subagent-prompt.md:84`

**Interfaces:**
- Consumes: the final schema from Task 6.
- Produces: docs that match the shipped schema.

- [ ] **Step 1: Re-read each site before editing**

Run: `grep -n "Dependency\|DataFlow\|Realization\|Trace\|transport" README.md docs/MODEL.md docs/SPEC.md skills/building-architecture-models/references/subagent-prompt.md`

Line numbers may have shifted; work from this output, not from the numbers above.

- [ ] **Step 2: `README.md`**

The sentence at 48-49 currently reads "A connection's kind is its `type` (`Dependency` / `DataFlow` / `Realization` / `Trace`)". Replace with:

```markdown
node's incoming/outgoing connections. A connection's meaning is its **verb** + **object** ("reads
camera list"), and its verb's *class* (`dataAccess` / `messaging` / `control` / `user` /
`traceability`) decides the edge colour. Layout is automatic (dagre) and stable — the connection
filter, the
```

Also update the `list_connections` entry in the MCP tool list to name the `verb` / `verbClass` filters instead of `type` / `transport`.

- [ ] **Step 3: `docs/MODEL.md`**

Line 86 — replace the kind enum with the verb-class vocabulary. Line 52's Intent row and line 288's traceability question both reference `Trace` connections; rewrite both to the `traceability` verb class (`implements` / `satisfies`).

- [ ] **Step 4: `docs/SPEC.md`**

Lines 143-144 — the core connection field list drops `type`:

```markdown
**Core:** `id`, `from`, `to`, **`verb`** (profile business action), **`object`** (short noun or a
```

Line 216 — the reserved Intent axis: "traced from nodes/flows via `Trace`" becomes "traced from nodes/flows via the `traceability` verb class (`implements` / `satisfies`)".

Line 298 — the traceability bullet: replace `Trace` with the verb class in the `Trace` / `realizedBy` / `carries` / `codeRefs` list.

- [ ] **Step 5: `skills/building-architecture-models/references/subagent-prompt.md`**

Line 84 tells a subagent to emit both retired fields. Replace:

```
      "type": "Dependency|DataFlow|Realization|Trace", "transport": "Sync|Async|InProcess|None",
```

with a line that names what actually matters — pick the verb, and always give an object:

```
      "verb": "reads|writes|publishes|invokes|…", "object": "camera list",
```

Check the surrounding prose for any instruction to choose a kind or a transport and remove it.

- [ ] **Step 6: Verify no living doc still names a retired field**

Run:

```bash
grep -rn "Dependency\|DataFlow\|Realization\|transport" README.md docs/MODEL.md docs/SPEC.md skills/
```

Only legitimate uses may remain (e.g. the English word "dependency"). `docs/superpowers/` is excluded on purpose.

- [ ] **Step 7: Commit**

```bash
git add README.md docs/MODEL.md docs/SPEC.md skills/building-architecture-models/references/subagent-prompt.md
git status --short
git commit -m "$(cat <<'EOF'
docs: bring the living docs in line with verb-only connections

README, MODEL, SPEC and the model-building skill all told an LLM to fill in a
connection `type` and a `transport` that no longer exist. The subagent prompt
was the most costly of these: every connection written by a model build spent
tokens on two fields the renderer ignored.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Verify against the real model and record the new baseline

The Baritone model still carries `fields.transport` on 411 connections, which `validate_model` now reports as `unknown-field`. The strip script is a throwaway — it is **not committed**, and neither is the model.

**Files:**
- Create (untracked, scratchpad): `C:/Users/qwert/AppData/Local/Temp/claude/C--projects-hyphae/<session>/scratchpad/strip-retired.mjs`
- Modify: `CLAUDE.md` (the test baseline line)

**Interfaces:**
- Consumes: the finished implementation from Tasks 1-7.
- Produces: a clean `validate_model` over the real model; an accurate baseline in `CLAUDE.md`.

- [ ] **Step 1: Write the strip script in the scratchpad**

```js
// strip-retired.mjs — one-off. Removes the retired `type` and `fields.transport`
// keys from a Hyphae model file. Not part of the repo.
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) { console.error('usage: node strip-retired.mjs <model.json>'); process.exit(1); }

copyFileSync(file, `${file}.bak`);
const model = JSON.parse(readFileSync(file, 'utf8'));

let types = 0, transports = 0;
for (const c of model.connections ?? []) {
  if ('type' in c) { delete c.type; types++; }
  if (c.fields && 'transport' in c.fields) { delete c.fields.transport; transports++; }
}

writeFileSync(file, `${JSON.stringify(model, null, 2)}\n`);
console.log(`stripped ${types} type and ${transports} transport keys from ${model.connections?.length ?? 0} connections`);
```

- [ ] **Step 2: Run it against the Baritone model**

```bash
node "<scratchpad>/strip-retired.mjs" apps/server/hyphae-baritone.json
```

Expected: `stripped 411 type and 411 transport keys from 411 connections`.

- [ ] **Step 3: Start the server on that model**

```bash
HYPHAE_FILE=$(pwd)/apps/server/hyphae-baritone.json pnpm server
```

Leave it running in the background for the next step.

- [ ] **Step 4: Check the model is clean through the MCP**

Call `validate_model`. Expected: **no `unknown-field` issues** for connections and no `unknown-connection-kind` at all. Then call `list_connections` with `verbClass: 'messaging'` and confirm it returns only publish/subscribe/send/notify edges, and that no result carries `type` or `transport`.

If the MCP tools are missing, check `/mcp` — `.mcp.json` launches the client at project scope, and it needs the server above to be running.

- [ ] **Step 5: Eyeball the editor**

```bash
pnpm dev
```

Open a Container focus. Confirm: edges are coloured by verb class; the Connections filter shows five verb-class checkboxes and filtering one hides the rest; the legend lists all five classes; selecting a connection shows verb / object / direction with **no** type select; the connection list rows show the object.

- [ ] **Step 6: Run the full suite and capture the counts**

Run: `pnpm -r test`
Record the per-package totals from the output — do not estimate them.

- [ ] **Step 7: Update the baseline in `CLAUDE.md`**

Replace the line

```
    pnpm -r test        # baseline 490 green: schema 143, server 106, web 241
```

with the real numbers from Step 6.

- [ ] **Step 8: Commit**

```bash
git add CLAUDE.md
git status --short   # hyphae-baritone.json, hyphae-baritone.json.bak: BOTH must stay untracked
git commit -m "$(cat <<'EOF'
docs: update the test baseline after retiring type and transport

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 9: Delete the backup**

Once the editor and the MCP both look right, remove `apps/server/hyphae-baritone.json.bak`. The scratchpad script can stay where it is.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §1 remove `Connection.type` | 6 |
| §1 remove `connectionKinds` / `ConnectionKindSchema` / `connectionKindIds` | 6 |
| §1 split `effectiveFields` | 6 |
| §1 empty `commonConnectionFields` | 5 |
| §1 add `traceability` verb class | 1 |
| §1 validate.ts changes | 5 (enum test), 6 (kind + endpoint checks) |
| §2 no migration | 8 (throwaway script, uncommitted) |
| §3 `VERB_CLASS_COLOR` + `FocusEdge.kind` + legend | 1 (colour, legend), 3 (`FocusEdge.kind`) |
| §4 FilterPanel / store / SidePanel / ConnectionList | 2, 3 |
| §5 MCP read-side | 4 |
| §5 MCP write-side (`create_connections`, `connUpdate`, `identityOf`, `fieldsShape`, `describe_profile` copy) | 6 |
| §6 docs | 7 |
| §7 testing | every task; baseline recorded in 8 |

**Placeholder scan:** the only deliberately non-literal steps are Task 2 Step 1 and Task 3 Step 5, which tell the implementer to match an existing fixture helper they must read first — the assertions themselves are given in full. Task 8 Step 4 is a manual MCP check with stated expected output.

**Type consistency:** `ConnFilter` is `{ verbClasses, fields }` in Tasks 2, 3 and the store, declared once in `focusView.ts`. `toggleConnVerbClass` is used under that name in Tasks 2 and the FilterPanel. `nodeFields(profile, type)` / `connectionFields(profile)` are defined in Task 6 Step 4 and called with those signatures in Task 6 Steps 5, 7 and 8, and in the Task 6 Step 1 test import. `verbClass` is the MCP param name in Task 4 Steps 1, 3, 4 and 5.

## Risks

- **Task 6 Step 9's `sed` is the sharpest edge in the plan.** It rewrites ~100 lines across a dozen files. The verification grep in the same step must print nothing, and `pnpm -r test` in Step 10 is the real gate. If the two-pattern substitution misfires on a line where the literal is the only property (`{ type: 'Dependency' }`), fix by hand.
- **`bad-endpoint` removal is a real capability loss**, not just dead code: a future profile could have used `allowedFrom` / `allowedTo` to constrain endpoints. c4-backend never did, so nothing observable changes today, but the mechanism goes with the kinds.
- **The Baritone model's discarded classifications do not come back** without a rebuild.

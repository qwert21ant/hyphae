# Connection label Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse a connection's `verb` + `object` into one free-text `label`, and remove the verb
vocabulary and its colour system from the schema, the MCP and the viewer.

**Architecture:** Expand → migrate → contract. Task 1 adds `label` alongside `verb`/`object` with a
back-compat shim, so nothing breaks. Tasks 2–3 move every reader and writer onto `label`. Tasks 4–5
delete `verb`, `object`, the profile's verb vocabulary, `VERB_CLASS_COLOR`, the Legend's verb
section, the FilterPanel's verb axis and the five `--verb-*` tokens. **The suite is green at the end
of every task.**

**Tech Stack:** Zod (`packages/schema` — the single source of truth for types, the HTTP API and the
MCP tool params), Hono + `@modelcontextprotocol/sdk` (`apps/server`), Vite + React + `@xyflow/react`
+ Zustand (`apps/web`), Vitest everywhere.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-08-12-model-legibility-design.md` — Part 2.
- **Baseline:** `pnpm -r test` → **745 green** (schema 147, server 107, web 491). Never run bare
  `pnpm vitest run` from the repo root — there is no root vitest config and web tests then run
  without jsdom, reporting dozens of bogus failures. Use `pnpm -r test`, or `cd apps/web` first.
- **`pnpm --filter @hyphae/web typecheck`** (`tsc --noEmit`) is **not** part of `pnpm -r build` and
  must be run explicitly after any import-touching change. `vite build` fails on an unresolvable
  specifier but happily ships a *wrong named export*. Typecheck has a **pre-existing 4-error floor**,
  all in test files. 4 is clean, 5 is yours.
- **Web imports use the `@/` alias**, except a file in the *same directory*, which is `./Name`.
- **No colour literal anywhere in `apps/web/src` outside `tokens.css`** — no hex, no `rgb()`/`hsl()`.
  Enforced by `apps/web/test/styles/tokens.test.ts`, which walks `src/` recursively.
- **Every token declared in `:root` must be referenced somewhere, and must exist in both themes.**
  Both directions fail the suite. This is why token deletion and code deletion land in the **same
  commit** (Task 5).
- **`--edge-derived` (violet) keeps its exclusive meaning "derived rollup edge"** and is not touched.
- `apps/server/hyphae-baritone.json` and any other `*.json` model is **permanently untracked — never
  `git add` it.** Verify with `git status --short` before every commit.
- Conventional commits with a scope, explaining *why* in the body. End every commit message with
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Stage explicit paths, never `git add -A`.

---

### Task 1: Schema gains `label`, with a legacy shim

**Files:**
- Modify: `packages/schema/src/connection.ts`
- Test: `packages/schema/test/connection.test.ts`

**Interfaces:**
- Produces: `ConnectionSchema` accepting `label: string` (default `''`) and composing it from legacy
  `verb`/`object` when absent. `Connection` gains `label: string`. `verb` and `object` stay on the
  type until Task 4.

Zod strips unknown keys, so a model file written before this change would load with every label
blank — 195 labels destroyed on the Baritone model, silently. The shim is what makes the rest of the
plan safe, so it is built and tested first. `ConnectionSchema` is only ever consumed via `.parse()`
(`apps/server/src/store.ts:76,84`) and `z.array()` (`packages/schema/src/model.ts:24`), both of which
work on the `ZodEffects` that `z.preprocess` returns — no `.partial()`/`.omit()` caller exists.

- [ ] **Step 1: Write the failing test**

Append to `packages/schema/test/connection.test.ts`:

```ts
describe('label back-compat shim', () => {
  const base = { id: 'c1', from: 'a', to: 'b' };

  it('composes label from legacy verb + object when label is absent', () => {
    expect(ConnectionSchema.parse({ ...base, verb: 'reads', object: 'settings' }).label)
      .toBe('reads settings');
  });

  it('falls back to the verb alone when the object is empty', () => {
    expect(ConnectionSchema.parse({ ...base, verb: 'triggers', object: '' }).label)
      .toBe('triggers');
  });

  it('leaves an explicit label untouched even when verb and object are present', () => {
    expect(ConnectionSchema.parse({
      ...base, verb: 'reads', object: 'settings', label: 'reads the session settings',
    }).label).toBe('reads the session settings');
  });

  it('leaves label empty when there is no legacy verb or object either', () => {
    expect(ConnectionSchema.parse({ ...base }).label).toBe('');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/schema && pnpm vitest run test/connection.test.ts`
Expected: FAIL — the parsed object has no `label`, so each assertion receives `undefined`.

- [ ] **Step 3: Write the implementation**

Replace the whole of `packages/schema/src/connection.ts`:

```ts
import { z } from 'zod';

export const DirectionSchema = z.enum(['Unidirectional', 'Bidirectional']);

const ConnectionShape = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  // The whole point of the edge, in the author's own words. The ONLY thing drawn on the diagram.
  // An edge earns its place by saying something a reader cannot infer from the two node names —
  // see docs/superpowers/specs/2026-08-12-model-legibility-design.md.
  label: z.string().default(''),
  // Legacy, superseded by `label`. Retained only so an older model file still parses; removed in
  // Task 4 of docs/superpowers/plans/2026-08-12-connection-label.md.
  verb: z.string().default('uses'),
  object: z.string().default(''),
  description: z.string().default(''),
  direction: DirectionSchema.default('Unidirectional'),
  realizedBy: z.array(z.string()).default([]),
  codeRefs: z.array(z.string()).default([]),
  fields: z.record(z.string(), z.unknown()).default({}),
});

/** A model written before `label` existed carries `verb` + `object` instead. Compose the label from
 *  them rather than letting it default to '', which would blank every edge in the file on load.
 *  An explicit non-empty `label` always wins, so `store.updateConnection` — which re-parses
 *  `{...existing, ...patch}` — never regresses a label the author already wrote. */
export const ConnectionSchema = z.preprocess((raw) => {
  if (typeof raw !== 'object' || raw === null) return raw;
  const r = raw as Record<string, unknown>;
  if (typeof r.label === 'string' && r.label.trim()) return r;
  const legacy = [r.verb, r.object]
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .join(' ');
  return legacy ? { ...r, label: legacy } : r;
}, ConnectionShape);

export type Connection = z.infer<typeof ConnectionShape>;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd packages/schema && pnpm vitest run`
Expected: PASS, 147 + 4 = **151 green**.

- [ ] **Step 5: Commit**

```bash
git add packages/schema/src/connection.ts packages/schema/test/connection.test.ts
git commit -m "feat(schema): add connection label with a legacy verb+object shim

Zod strips unknown keys, so introducing `label` without a preprocess step
would blank every edge in an existing model file on load. Compose it from
the legacy fields instead; an explicit label always wins.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: The viewer renders `label`

**Files:**
- Modify: `apps/web/src/core/focusView/types.ts:6-16`
- Modify: `apps/web/src/core/focusView/edges.ts:19-25`
- Modify: `apps/web/src/core/focusView/buildFocusView.ts:80`
- Modify: `apps/web/src/features/canvas/reactflow.ts:23-47`
- Modify: `apps/web/src/features/inspector/ConnectionList.tsx:34`
- Modify: `apps/web/src/features/inspector/SidePanel.tsx:97-100`
- Test: `apps/web/test/features/canvas/reactflow.test.ts`,
  `apps/web/test/features/inspector/SidePanel.test.tsx`

**Interfaces:**
- Consumes: `Connection.label` from Task 1.
- Produces: `FocusEdge.label?: string`; `clipLabel(label: string): string` exported from
  `features/canvas/reactflow.ts`, replacing `edgeLabel(verb, object)`.

`verb` stays on `FocusEdge` through this task because `realEdge` still needs it to pick a colour.
Task 5 removes it together with the colour system. Only the *rendered text* changes here.

- [ ] **Step 1: Write the failing test**

In `apps/web/test/features/canvas/reactflow.test.ts`, replace the existing `edgeLabel` describe block
with:

```ts
describe('clipLabel', () => {
  it('returns a short label unchanged', () => {
    expect(clipLabel('reads settings')).toBe('reads settings');
  });

  it('trims surrounding whitespace', () => {
    expect(clipLabel('  reads settings  ')).toBe('reads settings');
  });

  it('clips a label longer than the cap and marks it with an ellipsis', () => {
    const long = 'constructs at startup and owns for the whole session';
    const out = clipLabel(long);
    expect(out).toHaveLength(40);
    expect(out.endsWith('…')).toBe(true);
  });

  it('returns an empty string for an unlabelled edge', () => {
    expect(clipLabel('')).toBe('');
  });
});
```

Update the file's import to pull `clipLabel` instead of `edgeLabel`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && pnpm vitest run test/features/canvas/reactflow.test.ts`
Expected: FAIL — `clipLabel is not a function` / no such export.

- [ ] **Step 3: Write the implementation**

In `apps/web/src/features/canvas/reactflow.ts`, replace lines 23–47:

```ts
// A label carries the whole meaning of the edge now, so it gets more room than the old 24-char
// object cap allowed — but still a cap, because an unbounded label wrecks the layout.
const LABEL_CAP = 40;

/** The edge's label, trimmed and clipped to something a diagram can carry. */
export function clipLabel(label: string): string {
  const t = label.trim();
  return t.length > LABEL_CAP ? `${t.slice(0, LABEL_CAP - 1)}…` : t;
}

function realEdge(e: FocusEdge): FlowEdge {
  const color = VERB_CLASS_COLOR[verbClassOf(c4Backend, e.verb ?? 'uses') ?? 'control'];
  return {
    id: e.id,
    type: 'floating',
    source: e.from,
    target: e.to,
    label: clipLabel(e.label ?? ''),
    style: { stroke: color },
    labelStyle: { fill: color, fontWeight: 500 },
    ...markers(e.direction, color),
  };
}
```

In `apps/web/src/core/focusView/types.ts`, add `label` to `FocusEdge` beside the existing `verb`:

```ts
  label?: string;       // the connection's label for a 1:1 real edge
  verb?: string;        // legacy: still the colour key until the verb system is removed
  object?: string;      // legacy
```

In `apps/web/src/core/focusView/edges.ts`, add `label` to `Entry` and to `realEdgeOf`:

```ts
export type Entry = { id: string; from: string; to: string; direction: string; label: string; verb: string; object: string; direct: boolean };

export const realEdgeOf = (d: Entry): FocusEdge => ({
  id: d.id, from: d.from, to: d.to, count: 1, derived: false,
  realizedBy: [d.id], direction: d.direction, label: d.label, verb: d.verb, object: d.object,
});
```

In `apps/web/src/core/focusView/buildFocusView.ts:80`, add `label: c.label,` to the pushed entry.

In `apps/web/src/features/inspector/ConnectionList.tsx:34`, replace the object line:

```tsx
            {c.label && <small className="rollup-meta"> · {c.label}</small>}
```

In `apps/web/src/features/inspector/SidePanel.tsx`, replace lines 97–100 (the `verb` and `object`
rows) with a single label row:

```tsx
        <Row label="label" layout="grid" title="What this edge says. The only text drawn on the diagram.">{conn.label}</Row>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && pnpm vitest run`
Expected: PASS. Fix any test that asserted the old `verb object` edge text or the SidePanel `verb` /
`object` rows — they now assert `label`. Then run `cd .. && pnpm --filter @hyphae/web typecheck`,
expecting exactly the 4-error floor.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/core/focusView apps/web/src/features/canvas/reactflow.ts \
        apps/web/src/features/inspector/ConnectionList.tsx \
        apps/web/src/features/inspector/SidePanel.tsx apps/web/test
git commit -m "feat(web): draw the connection label instead of verb + object

The label now carries the edge's whole meaning, so it earns a 40-char cap
rather than the 24 the object alone had. verb survives one more task as the
edge colour key.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: The MCP writes and returns `label`

**Files:**
- Modify: `apps/server/src/mcp/register.ts:100-110`
- Modify: `apps/server/src/mcp/tools/connections.ts:62-68`
- Test: `apps/server/test/mcp.test.ts`

**Interfaces:**
- Consumes: `Connection.label` from Task 1.
- Produces: `create_connections` / `update_connections` accept `label`; `list_connections` returns
  `label` on every row.

`verb` and `object` stay accepted here so the tools keep working against a model mid-migration; Task
4 removes them.

- [ ] **Step 1: Write the failing test**

Append to `apps/server/test/mcp.test.ts`, inside the existing connection-tools describe block:

```ts
it('creates a connection from a label and echoes it back from list_connections', async () => {
  const { tools, ids } = await seedTwoNodes();
  await tools.create_connections({
    connections: [{ from: ids.a, to: ids.b, label: 'constructs at startup' }],
  });
  const rows = await tools.list_connections({});
  expect(rows[0].label).toBe('constructs at startup');
});
```

Use whatever seeding helper the file already provides rather than `seedTwoNodes` if it is named
differently — read the top of the file first.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/server && pnpm vitest run test/mcp.test.ts`
Expected: FAIL — `label` is not in the tool's param shape, so it is dropped, and the returned row has
no `label` key.

- [ ] **Step 3: Write the implementation**

In `apps/server/src/mcp/register.ts`, add `label` to `coreConnFields` ahead of the legacy pair:

```ts
    label: z.string().optional()
      .describe('What this edge says, in your own words — the ONLY text drawn on the diagram. State something a reader cannot infer from the two node names ("constructs at startup and owns for the session"), not a restatement of the target ("uses the mine process"). Keep it under about 40 characters. An edge with nothing worth saying here should not be created.'),
```

and update `create_connections`' description on the following lines to name `label` instead of
`verb + object`:

```ts
    description: "Create one OR MANY connections in a single call (single write = one-element array). Each item: from, to (existing node ids), label (what the edge says — this is the diagram label), and optional realizedBy to bind lower-layer edges. Best-effort: {created:[{id,from,to},...]} in input order on full success, else {results:[{id,from,to}|{issues}]}. Use the echoed ids to fill `realizedBy` on a higher-layer edge without re-listing.",
```

In `apps/server/src/mcp/tools/connections.ts`, add `label` to the mapped row (lines 62–68):

```ts
        verb: c.verb, object: c.object, label: c.label,
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/server && pnpm vitest run`
Expected: PASS, 107 + 1 = **108 green**.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/mcp/register.ts apps/server/src/mcp/tools/connections.ts apps/server/test/mcp.test.ts
git commit -m "feat(server): accept and return a connection label over MCP

The param description carries the authoring rule, since the skill that
builds models reads it: an edge must say something the node names do not.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Delete `verb`, `object` and the profile's verb vocabulary

**Files:**
- Modify: `packages/schema/src/connection.ts` (drop the two legacy fields, **keep** the shim)
- Modify: `packages/schema/src/profile.ts:28-34,73,97-107`
- Modify: `packages/schema/src/profiles/c4-backend.ts:26` (the `verbs` array)
- Modify: `packages/schema/src/validate.ts:4,14,136-138`
- Modify: `packages/schema/src/index.ts` (drop any verb re-export)
- Modify: `apps/server/src/mcp/register.ts:3,36,38-39,66,71,100-105,137`
- Modify: `apps/server/src/mcp/tools/connections.ts:7,48-49,66`
- Modify: `apps/server/src/mcp/tools/query.ts:1,7,13`
- Test: `packages/schema/test/{connection,validate,profile,c4-backend}.test.ts`,
  `apps/server/test/mcp.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–3.
- Produces: `Connection` with no `verb`/`object`. `VerbClass`, `VerbDef`, `verbDefOf`, `verbClassOf`,
  `verbClasses` and `Profile.verbs` no longer exist.

The preprocess shim **stays**. It reads `verb`/`object` off the *raw input*, so it keeps composing
labels from legacy files even once the fields are gone from the parsed output — which is exactly what
we want and what its four Task 1 tests already pin.

- [ ] **Step 1: Write the failing test**

In `packages/schema/test/connection.test.ts`, replace the `ConnectionSchema verb/object` describe
block with:

```ts
describe('legacy verb/object are dropped from the parsed connection', () => {
  it('does not carry verb or object through', () => {
    const c = ConnectionSchema.parse({ id: 'c1', from: 'a', to: 'b', verb: 'reads', object: 'settings' });
    expect(c).not.toHaveProperty('verb');
    expect(c).not.toHaveProperty('object');
    expect(c.label).toBe('reads settings');
  });
});
```

In `packages/schema/test/validate.test.ts`, delete the `unknown-verb` case and add:

```ts
it('does not report an unknown verb, because verbs no longer exist', () => {
  const model = modelWith({ connections: [{ id: 'c1', from: 'n1', to: 'n2', verb: 'nonsense' }] });
  expect(validateModel(model, c4Backend).map((i) => i.kind)).not.toContain('unknown-verb');
});
```

Adapt `modelWith` to whatever helper the file already uses.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/schema && pnpm vitest run`
Expected: FAIL — the parsed connection still has `verb`/`object`, and `validateModel` still emits
`unknown-verb`.

- [ ] **Step 3: Write the implementation**

`packages/schema/src/connection.ts` — delete these two lines and the comment above them from
`ConnectionShape`:

```ts
  verb: z.string().default('uses'),
  object: z.string().default(''),
```

`packages/schema/src/profile.ts` — delete `VerbClassSchema` and `VerbDefSchema` (lines 28–34), the
`verbs:` entry in `ProfileSchema` (line 73), the `VerbClass` / `VerbDef` type exports (lines 86–87),
and `verbDefOf`, `verbClassOf` and `verbClasses` (lines 97–107).

`packages/schema/src/profiles/c4-backend.ts` — delete the whole `verbs: [...]` array starting at line
26. Update the comment at line 59 to read:

```ts
  // Empty by design: the connection's label and description carry its meaning. The array stays
```

`packages/schema/src/validate.ts` — drop `verbDefOf` from the import on line 4, drop
`| 'unknown-verb'` from the issue-kind union on line 14, and delete the check at lines 136–138.

`packages/schema/src/index.ts` — remove any `VerbClass` / `VerbDef` / `verbDefOf` / `verbClassOf` /
`verbClasses` re-export. Run `grep -n "erb" packages/schema/src/index.ts` to find them.

`apps/server/src/mcp/register.ts` — drop `verbClasses` from the import on line 3; delete the `verb`
and `verbClass` params on lines 38–39 and the `verbClass` param on line 71; delete the `verb` and
`object` entries from `coreConnFields` (lines 100–105); and remove the verb clauses from the
`list_connections` (line 36), `get_subgraph` (line 66) and `describe_profile` (line 137)
descriptions.

`apps/server/src/mcp/tools/connections.ts` — drop `verbClassOf` from the import on line 1, remove
`verb`/`verbClass` from the `list_connections` param type and destructure on line 7, delete the two
filter clauses on lines 48–49, and drop `verb: c.verb, object: c.object,` from the returned row.

`apps/server/src/mcp/tools/query.ts` — drop `verbClassOf` from the import, remove `verbClass` from
the `get_subgraph` param type and destructure, and replace line 13 with:

```ts
      const edges = model.connections;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm -r test`
Expected: schema and server green. Delete or rewrite any remaining test that asserts a verb
vocabulary — `c4-backend.test.ts` and `profile.test.ts` both assert `verbs`. Then
`pnpm --filter @hyphae/web typecheck`, expecting the 4-error floor.

- [ ] **Step 5: Commit**

```bash
git add packages/schema/src packages/schema/test apps/server/src apps/server/test
git commit -m "feat(schema)!: remove connection verb and object

The verb vocabulary asserted a shape the models never used well: half of
Baritone's 411 edges were \`uses\` or \`invokes\`, and 73 objects merely
paraphrased an endpoint's name. The label replaces both. The preprocess
shim stays — it reads the legacy fields off raw input, so old files still
compose a label even though the fields are gone from the parsed type.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Delete the verb colour system and its tokens

**Files:**
- Modify: `apps/web/src/core/verbColors.ts` (drop `VERB_CLASS_COLOR`; keep `LAYER_COLOR` /
  `layerColorOf`)
- Modify: `apps/web/src/features/canvas/reactflow.ts:2,5,34-47`
- Modify: `apps/web/src/features/canvas/patternView.ts:40-47`
- Modify: `apps/web/src/features/canvas/overlay/Legend.tsx:2-3,36,46-57`
- Modify: `apps/web/src/features/canvas/overlay/FilterPanel.tsx:1-21,63,71`
- Modify: `apps/web/src/state/store.ts:51,73,134-139,147`
- Modify: `apps/web/src/core/focusView/types.ts:3,14-15`
- Modify: `apps/web/src/core/focusView/edges.ts:1-10,19-25`
- Modify: `apps/web/src/core/focusView/buildFocusView.ts:80`
- Modify: `apps/web/src/features/inspector/ConnectionList.tsx:2-3,23-28`
- Modify: `apps/web/src/styles/tokens.css:42-46,113-117`
- Test: `apps/web/test/styles/{tokens,contrast}.test.ts`,
  `apps/web/test/features/canvas/overlay/Legend.test.tsx`, `apps/web/test/state/store.test.ts`,
  `apps/web/test/core/focusView.test.ts`

**Interfaces:**
- Consumes: `FocusEdge.label` from Task 2; the verb-free schema from Task 4.
- Produces: `ConnFilter = { fields: Record<string, string[]> }` (no `verbClasses`); `FocusEdge` with
  no `verb`/`object`; a single `--edge-line` token replacing the five `--verb-*` ones.

**This must be one commit.** `tokens.test.ts` fails on a `:root` token that nothing references, so
deleting `VERB_CLASS_COLOR` without deleting the tokens breaks the suite, and vice versa.

`--verb-control` was already "the baseline: deliberately the least chromatic" (`#8896A3` dark,
`#5A6570` light) and is already contrast-tested against `--surface-2`. **Rename it to `--edge-line`
and delete the other four** — the surviving value needs no retuning, and every edge becomes one
neutral line, which is the point: the spec leaves the chromatic budget empty rather than inventing a
new hue meaning.

- [ ] **Step 1: Write the failing test**

In `apps/web/test/styles/tokens.test.ts`, replace the five `--verb-*` entries in the required-token
list (line 40) with `'--edge-line',`, and replace the "gives every verb hue a distinct hex value"
test (lines 87–93) with:

```ts
  it('declares no verb tokens, in either theme', () => {
    for (const [label, blk] of [['dark', dark], ['light', light]] as const) {
      const verbs = [...blk.keys()].filter((n) => n.startsWith('--verb-'));
      expect(verbs, `${label}: --verb-* tokens survived the verb removal`).toEqual([]);
    }
  });
```

In `apps/web/test/styles/contrast.test.ts`, replace the five verb pairs on lines 55–57 with:

```ts
  // the edge line is edge-label text, and the label sits on --surface-2
  ['--edge-line', '--surface-2'], ['--edge-derived', '--surface-2'],
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && pnpm vitest run test/styles`
Expected: FAIL — `--edge-line missing from :root`, and `--verb-* tokens survived`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/styles/tokens.css` — in the `:root` block replace lines 42–46 with:

```css
  --edge-line: #8896A3;        /* every real edge; deliberately the least chromatic thing here */
```

and in `[data-theme="light"]` replace lines 113–117 with:

```css
  --edge-line: #5A6570;
```

Update the file-header comment on line 4, which still claims the chromatic budget belongs to "the
five verb hues".

`apps/web/src/core/verbColors.ts` — delete `VERB_CLASS_COLOR` and the `VerbClass` import; keep
`LAYER_COLOR` and `layerColorOf`. **Do not rename the file** — it is imported as `@/core/verbColors`
by four modules and renaming is out of scope for this plan.

`apps/web/src/features/canvas/reactflow.ts` — drop `verbClassOf` from the schema import and
`VERB_CLASS_COLOR` from the verbColors import, then:

```ts
function realEdge(e: FocusEdge): FlowEdge {
  const color = 'var(--edge-line)';
  return {
    id: e.id,
    type: 'floating',
    source: e.from,
    target: e.to,
    label: clipLabel(e.label ?? ''),
    style: { stroke: color },
    labelStyle: { fill: color, fontWeight: 500 },
    ...markers(e.direction, color),
  };
}
```

`apps/web/src/features/canvas/patternView.ts` — replace all three `var(--verb-control)` uses (lines
42, 46, 47) with `var(--edge-line)`, and update the comment on lines 40–41 to say the pattern's
internal edges take the baseline edge colour.

`apps/web/src/features/canvas/overlay/Legend.tsx` — delete the `verbClasses` schema import and the
`VERB_CLASS_COLOR` import, delete the entire "Edge verbs" group (lines 46–57), and change line 36 to:

```tsx
          <div className="legend__row"><span className="legend__line" />solid — one authored connection (label = what it does)</div>
```

`apps/web/src/features/canvas/overlay/FilterPanel.tsx` — delete `VerbClassGroup` entirely (lines
5–21) and its `<VerbClassGroup />` usage (line 71); drop the `verbClasses` and `VERB_CLASS_COLOR`
imports; and change line 63 to:

```tsx
  const active = Object.values(filter.fields).reduce((a, v) => a + v.length, 0);
```

`apps/web/src/state/store.ts` — delete `toggleConnVerbClass` from the interface (line 51) and its
implementation (lines 134–139); change the initial state (line 73) and `clearConnFilter` (line 147)
to `{ fields: {} }`.

`apps/web/src/core/focusView/types.ts` — `export type ConnFilter = { fields: Record<string, string[]> };`
and delete `verb` and `object` from `FocusEdge`.

`apps/web/src/core/focusView/edges.ts` — drop the schema import down to `type Connection`, delete the
`verbClasses` branch from `matchesFilter`, and drop `verb`/`object` from `Entry` and `realEdgeOf`.

`apps/web/src/core/focusView/buildFocusView.ts:80` — drop `verb: c.verb, object: c.object,` from the
pushed entry.

`apps/web/src/features/inspector/ConnectionList.tsx` — drop the `verbClassOf` and `VERB_CLASS_COLOR`
imports and replace the dot (lines 23–28) with a class-free one:

```tsx
        return (
          <li className="rollup-item" key={c.id} onClick={() => select(c.id)} style={{ cursor: 'pointer' }}>
            <span className="conn__dot" style={{ background: 'var(--edge-line)' }} />
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && pnpm vitest run`
Expected: PASS. `Legend.test.tsx` and `store.test.ts` assert the verb group and
`toggleConnVerbClass`; delete those cases. `focusView.test.ts` builds `ConnFilter` literals with
`verbClasses`; drop the key. Then `cd .. && pnpm --filter @hyphae/web typecheck`, expecting the
4-error floor, and `pnpm -r build`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src apps/web/test
git commit -m "feat(web)!: remove the verb colour system

Deleting VERB_CLASS_COLOR orphans the five --verb-* tokens, and
tokens.test.ts fails on any token in :root that nothing references — so the
code and the tokens have to go in one commit. --verb-control was already
the least chromatic of the five and already contrast-tested, so it survives
renamed as --edge-line and every real edge takes it.

This leaves the chromatic budget empty on purpose. Per SPEC.md section 9 a
hue must mean something or not exist, and nothing here has earned one.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Update the living docs and verify the real model

**Files:**
- Modify: `README.md`, `docs/MODEL.md`, `docs/SPEC.md` §6 and §9, `CLAUDE.md`
- Modify: `skills/building-architecture-models/SKILL.md`

**Interfaces:**
- Consumes: the finished schema, MCP and viewer from Tasks 1–5.

The skill is a **root cause**, not an afterthought: it produced a model that was 79% undescribed and
50% `uses`/`invokes`. It must now state the rule and require a label that survives it.

- [ ] **Step 1: Find every stale mention**

Run: `grep -rn "verb\|--verb-\|\bobject\b" README.md docs/MODEL.md docs/SPEC.md CLAUDE.md skills/`
Read each hit before editing; several are prose about the design rationale, not field references.

- [ ] **Step 2: Rewrite them**

- `README.md` — the MCP tool list's `create_connections` / `list_connections` entries lose their
  `verb`/`verbClass` params and gain `label`.
- `docs/MODEL.md` — the connection section drops the verb vocabulary and describes `label`.
- `docs/SPEC.md` §6 — the connection data model becomes `label` + optional `description`. §9 — the
  claim that "the five `--verb-*` tokens own the whole chromatic budget" is now false; state that
  the palette is deliberately achromatic and that `--edge-derived` (violet) and `--accent` /
  `--warn` are the only hues left.
- `CLAUDE.md` — the Styling section makes the same claim and must match §9. Update the
  `pnpm -r test` baseline count to whatever the suite now reports.
- `skills/building-architecture-models/SKILL.md` — replace the verb+object authoring guidance with
  the rule: *an edge earns its place by saying something a reader cannot infer from the two node
  names.* State explicitly that a label restating the target's name (`"uses the mine process"` →
  `MineProcess`) is not worth an edge, and that an edge with nothing to say should not be created.

- [ ] **Step 3: Verify the real model still loads and renders**

The Baritone model is untracked and predates `label`, so it exercises the shim end to end.

```bash
HYPHAE_FILE=$PWD/apps/server/hyphae-baritone.json pnpm server   # in a background shell
curl -s --noproxy '*' http://localhost:5173/model | head -c 400
```

Expected: 195 connections, each carrying a composed `label` such as `"triggers mine process"`, and
no `verb`/`object` keys. **A local HTTP proxy intercepts `curl` on this machine and returns 503 —
`--noproxy '*'` is required.** Then run `validate_model` over the MCP and expect `[]`.

- [ ] **Step 4: Run the whole suite**

Run: `pnpm -r test && pnpm -r build && pnpm --filter @hyphae/web typecheck`
Expected: all green; typecheck at exactly its 4-error floor.

- [ ] **Step 5: Commit**

```bash
git status --short   # confirm no *.json model is staged
git add README.md docs/MODEL.md docs/SPEC.md CLAUDE.md skills/building-architecture-models/SKILL.md
git commit -m "docs: connections carry a label, not a verb and an object

The modelling skill is updated too, because it is the root cause: it
produced a model that was 79% undescribed and 50% \`uses\`/\`invokes\`. It now
states the rule an edge has to survive.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Self-review notes

- **Spec coverage.** Part 2's schema change is Task 1 + 4; the migration shim is Task 1; the listed
  costs (`VERB_CLASS_COLOR`, Legend, FilterPanel, store, MCP filters, profile vocabulary,
  `unknown-verb`, `--verb-*` tokens, `contrast.test.ts` pairs) are Tasks 4–5; the living-docs and
  skill updates are Task 6. Part 1 is already done and Part 3 is a separate plan.
- **Naming.** `clipLabel` is used in Tasks 2 and 5 and defined once, in Task 2. `--edge-line` is
  introduced in Task 5 and used only there and after. `ConnFilter` loses `verbClasses` in Task 5 only,
  after every reader has stopped consulting it.
- **Known risk.** The shim composes mediocre labels (`"triggers mine process"`). That is deliberate
  and non-blocking per the spec — improving them is a later model round, not part of this plan.

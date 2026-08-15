# Foundational nodes and the shelf — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An author can mark a node `foundational`; when it appears outside the focused container the
viewer stops drawing its edges, parks it on a shelf below the graph, and states its weight as a count
chip — with the edges revealed on hover or select and always listed in full in the inspector.

**Architecture:** The whole feature is one bit on `NodeSchema` plus a partition in the pure focus-view
layer. `buildFocusView` splits foundational externals out of `externals` into a new `shelf` list and
marks every edge touching one as `shelved`; `layoutFocusView` gives the shelf its own band of slots
below everything else; `focusViewToFlow` draws the band, the shelved boxes and their count chips; and
`highlightCss` hides shelved edges at rest and lets the existing highlight machinery reveal them. The
model is never changed — only the resting picture.

**Tech Stack:** Zod (`packages/schema`), Hono + MCP SDK (`apps/server`), React + @xyflow/react +
Zustand (`apps/web`), Vitest everywhere.

## Global Constraints

Copied from `docs/superpowers/specs/2026-08-12-model-legibility-design.md` (Part 3) and `CLAUDE.md`.
Every task's requirements implicitly include this section.

- **The field is `foundational: z.boolean().default(false)` on `NodeSchema`**, at the same tier as
  `root` and `role`. It is **not** a profile field and **not** `role`.
- **Author-marked, never derived from a degree threshold.** No code anywhere may infer it.
- **Shelved only when the node is external to the focused container.** Inside its own container it is
  drawn as an ordinary member. (This falls out for free: a child of the focus is never in
  `view.externals`.)
- **Form, not hue** (`docs/SPEC.md` §9). The shelf and the chip get **no** new colour token and no new
  hue. Reuse `--chip`, `--rule`, `--surface-2`, `--tx-2`, `--tx-3`. `--edge-line` stays the one
  neutral edge colour. **No colour literal anywhere in `apps/web/src` outside `tokens.css`** — the
  suite fails on a hex/`rgb()`/`hsl()`, and on a `:root` token that nothing references.
- **Nothing is permanently hidden.** Hover or select reveals a shelved node's edges; the inspector
  lists them in full; the MCP still answers about them.
- **Chip glyph and format: `◂ 10`** — a left-pointing triangle, a space, the count. The count is the
  number of **edges in the current view** that touch the node (not the number of underlying
  connections, and not the node's total model degree).
- **Web imports use the `@/` alias** (`@/core/focusView`), except a file in the *same* directory,
  which is `./Name`. The alias is declared in `apps/web/tsconfig.json`, `vite.config.ts` and
  `vitest.config.ts` and all three must agree — no new alias is needed here.
- **`apps/web/test/` mirrors `src/`.** A test for `src/features/canvas/nodes/ShelfBand.tsx` goes at
  `test/features/canvas/nodes/ShelfBand.test.tsx`.
- **Verification commands, in this order, for every task:**
  `pnpm -r test` (baseline **732 green**: schema 143, server 106, web 483 in 35 files) →
  `pnpm -r build` → `pnpm --filter @hyphae/web typecheck` (pre-existing **4-error floor**, all in test
  files; 4 is clean, 5 is yours).
- **Never run bare `pnpm vitest run` from the repo root** — there is no root vitest config, so web
  tests run without jsdom and report dozens of bogus failures. Use `pnpm -r test`, or `cd apps/web`
  first. Prefer absolute paths; the shell's cwd drifts after a `cd`.
- ~80 `act(...)` warnings in the web suite are pre-existing noise. `Canvas.test.tsx > "double-clicking
  a childless Component drills into it"` is known-flaky; re-run once before investigating.
- **`apps/server/hyphae-baritone.json` and `hyphae-baritone-lagacy.json` are permanently untracked —
  never `git add` them.** Run `git status --short` before every commit and stage explicit paths, never
  `git add -A`.
- Commit on this branch (`feat/model-legibility`) without asking. End every commit message with
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. **Ask before pushing or merging.**

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `packages/schema/src/node.ts` | modify | declares `foundational` |
| `packages/schema/test/node.test.ts` | modify | default + explicit-mark cases |
| `apps/server/src/mcp/register.ts` | modify | `coreNodeFields` gains `foundational`, so `create_nodes` and `update_nodes` both accept it |
| `apps/server/test/mcp.test.ts` | modify | round-trips the flag through the tools |
| `apps/web/src/core/focusView/types.ts` | modify | `FocusView.shelf`, `FocusEdge.shelved` |
| `apps/web/src/core/focusView/buildFocusView.ts` | modify | partitions the shelf, marks shelved edges, counts them |
| `apps/web/src/features/canvas/layout.ts` | modify | `SHELF_GAP`; shelf slots in `layoutFocusView`; shelf ids kept in `resolveViewPositions` |
| `apps/web/src/features/canvas/reactflow.ts` | modify | `SHELF_ID`; the band node; shelf boxes with `shelfCount`; `data.shelved` on shelved edges |
| `apps/web/src/features/canvas/nodes/ShelfBand.tsx` | **create** | the inert band behind the shelved boxes |
| `apps/web/src/features/canvas/nodes/GhostNode.tsx` | modify | renders the `◂ n` chip |
| `apps/web/src/features/canvas/canvas.css` | modify | `.region--shelf`, `.shelf__label` |
| `apps/web/src/features/canvas/highlight.ts` | modify | hides shelved edges at rest; leaves the band undimmed |
| `apps/web/src/features/canvas/Canvas.tsx` | modify | registers `shelf` in `nodeTypes`; passes `shelvedEdges` to `highlightCss` |
| `apps/web/src/features/canvas/useCanvasView.ts` | modify | keeps shelved edges out of `routeEdges`' input |
| `apps/web/src/features/inspector/SidePanel.tsx` | modify | a `foundational` chip on the node header |
| `README.md`, `docs/MODEL.md`, `docs/SPEC.md`, `skills/building-architecture-models/SKILL.md`, `CLAUDE.md` | modify | living docs |

## Design decisions already settled — do not re-litigate

1. **Shelved edges stay in the graph and are only hidden.** They remain in `view.edges` and in the
   React Flow edge array, carrying `data.shelved`. That is what lets `highlightSets` and the flow
   overlay reveal them with no new machinery — `highlightCss` only changes opacity, so an edge that
   was never created cannot be revealed.
2. **Shelved edges are excluded from `routeEdges`' input** (in `useCanvasView`), so they consume no
   ports on the in-view nodes and no gutter lanes. They therefore fall back to `fallbackRoute`
   (`edges/routeEdges.ts`) — a mid-side anchor on both ends — which draws a reveal as a fan from one
   point on the shelved box. That reads as "these all come from this one thing", and it is the whole
   reason the shelf buys anything: a routed hidden edge would still be reserving the space it was
   supposed to give back.
3. **The shelf is a band along the bottom**, below the children cluster, the isolated-child grid and
   both external columns. Left/right are already the external columns.
4. **The band is a real React Flow node** (`type: 'shelf'`, id `SHELF_ID`), fully inert:
   `pointerEvents: 'none'`, `selectable: false`, `draggable: false`, no handles, and no
   `.region__handle` (whose `cursor: grab` would lie). It must never become `hoveredId`, or hovering
   furniture would dim the whole graph.
5. **`FocusView.shelf` is optional** (`shelf?: …`) for the same reason `externalGroups?` and
   `expandableExternalIds?` are: several test files build `FocusView` literals, and a required field
   would break them at typecheck for no benefit.
6. **A shelved node gets no `＋` expand affordance.** It is furniture, not a collapsed group.

---

### Task 1: The `foundational` field on `NodeSchema`

**Files:**
- Modify: `packages/schema/src/node.ts:13` (after `role`)
- Test: `packages/schema/test/node.test.ts`
- Modify (mechanical fixture churn — see Step 5): the node fixtures the compiler names

**Interfaces:**
- Consumes: nothing.
- Produces: `Node.foundational: boolean` — non-optional in the inferred output type, defaulting to
  `false`. Every later task reads `n.foundational`.

- [x] **Step 1: Write the failing tests**

Append to `packages/schema/test/node.test.ts`:

```ts
  it('defaults foundational to false', () => {
    const n = NodeSchema.parse({ id: 'a', name: 'A', type: 'Component', createdAt: 't', updatedAt: 't' });
    expect(n.foundational).toBe(false);
  });
  it('keeps an explicit foundational mark', () => {
    const n = NodeSchema.parse({ id: 'a', name: 'A', type: 'Container', createdAt: 't', updatedAt: 't', foundational: true });
    expect(n.foundational).toBe(true);
  });
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `cd C:/projects/hyphae/packages/schema && pnpm vitest run test/node.test.ts`
Expected: FAIL — both new cases, `expected undefined to be false` / `to be true`.

- [x] **Step 3: Declare the field**

In `packages/schema/src/node.ts`, insert immediately after the `role` declaration (line 13):

```ts
  // Author's mark: this node is infrastructure the rest of the model naturally leans on (a
  // composition root, a settings store). The viewer stops drawing its edges when it appears OUTSIDE
  // the focused container and parks it on the shelf with a count instead — see the shelf in
  // features/canvas/layout.ts. Never derived from a degree threshold: guessing at a threshold is
  // exactly what made the removed hub-quieting feature wrong. Structural, like `root` — not a
  // profile field, and not `role` (which picks the drawn shape).
  foundational: z.boolean().default(false),
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `cd C:/projects/hyphae/packages/schema && pnpm vitest run test/node.test.ts`
Expected: PASS, and the whole file green.

- [x] **Step 5: Fix the node fixtures the new field breaks**

`Node` gains a non-optional property, so every test fixture that builds a `Node` **object literal**
without a cast now fails to compile. `packages/schema` and `apps/server` build with `tsc -p`, which
typechecks their tests, so this surfaces as a **build** failure, not a test failure.

Run all three verification commands and add `foundational: false` to each fixture the compiler names:

```bash
cd C:/projects/hyphae && pnpm -r build
cd C:/projects/hyphae && pnpm --filter @hyphae/web typecheck
```

Expected offenders (fixtures typed `: Node` or object literals pushed into `model.nodes`, with **no**
`as Node` / `as any` cast — those are already safe):

- `apps/web/test/core/focusView.test.ts` — the shared `base` object on line 9
- `apps/web/test/features/canvas/Canvas.test.tsx` — the shared `base` object on line 16
- `apps/web/test/features/inspector/ConnectionList.test.tsx` — `mkNode`
- `apps/web/test/features/inspector/FieldRows.test.tsx` — `mk`
- `apps/web/test/features/inspector/SidePanel.test.tsx` — `mk`
- `apps/web/test/features/toolbar/SearchBox.test.tsx` — `mk`
- `apps/web/test/App.test.tsx`, `apps/web/test/state/store.test.ts`,
  `apps/web/test/features/outline/TreePanel.test.tsx`,
  `apps/web/test/features/canvas/patternView.test.ts`,
  `apps/web/test/features/canvas/nodes/PatternMemberNode.test.tsx`,
  `apps/web/test/features/toolbar/Altimeter.test.tsx` — check each for a `base`/`mk` fixture

In each, the edit is the same shape — add the key to the shared fixture object, e.g. in
`apps/web/test/core/focusView.test.ts`:

```ts
const base = { description: '', root: null, role: null, foundational: false, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {} };
```

Do **not** "fix" a fixture by adding an `as any` cast, and do **not** touch the four pre-existing
typecheck errors (three `TS2698` spreads plus a `Model` import in `Altimeter.test.tsx`).

- [x] **Step 6: Run the full verification**

```bash
cd C:/projects/hyphae && pnpm -r test
cd C:/projects/hyphae && pnpm -r build
cd C:/projects/hyphae && pnpm --filter @hyphae/web typecheck
```

Expected: 734 green (732 + 2 new schema tests); build clean; typecheck at exactly 4 errors.

- [x] **Step 7: Commit**

```bash
cd C:/projects/hyphae && git status --short   # confirm no *.json model is staged
git add packages/schema/src/node.ts packages/schema/test/node.test.ts apps/web/test
git commit -m "$(cat <<'EOF'
feat(schema): add an author-marked foundational flag to a node

A node the rest of the model naturally leans on — a composition root, a
settings store — attracts edges by its nature, not because those edges say
anything. Marking it lets the viewer state its weight once instead of drawing
the fan.

The mark is authored, never derived: a degree threshold is precisely what made
the removed hub-quieting feature guess wrong. It sits at the same tier as
`root`, not in the profile vocabulary and not on `role`, which already picks
the drawn shape.

The field is non-optional in the inferred type, so every uncast node fixture
in the suites had to gain it.
EOF
)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: `foundational` over MCP

**Files:**
- Modify: `apps/server/src/mcp/register.ts:76-87` (`coreNodeFields`)
- Test: `apps/server/test/mcp.test.ts`

**Interfaces:**
- Consumes: `Node.foundational` from Task 1.
- Produces: `create_nodes` and `update_nodes` both accept `foundational?: boolean`; `get_node` returns
  it (it already returns the whole node, so no handler change).

The tool handlers in `apps/server/src/mcp/tools/nodes.ts` pass an opaque `Record<string, unknown>`
straight to the API, so `coreNodeFields` is the only gate. Adding it there covers both tools.

- [x] **Step 1: Write the failing test**

Append to `apps/server/test/mcp.test.ts`, inside the same `describe` that holds the other
`create_nodes` / `update_nodes` cases (mirror whatever `fakeApi()`/`buildTools` helper those use — read
lines 80-110 first and match the local style):

```ts
  it('round-trips a foundational mark through create_nodes and update_nodes', async () => {
    const api = fakeApi();
    const tools = buildTools(api);
    await tools.create_nodes({ nodes: [{ name: 'Settings', type: 'Component', foundational: true }] });
    const created = (await api.getModel()).nodes.find((n) => n.name === 'Settings')!;
    expect(created.foundational).toBe(true);

    await tools.update_nodes({ updates: [{ id: created.id, foundational: false }] });
    expect((await api.getModel()).nodes.find((n) => n.id === created.id)!.foundational).toBe(false);
  });
```

- [x] **Step 2: Run it to verify it fails**

Run: `cd C:/projects/hyphae/apps/server && pnpm vitest run test/mcp.test.ts -t foundational`
Expected: FAIL — `expected false to be true`, because nothing strips it yet at the *handler* level but
nothing sets it either if `fakeApi` parses through `NodeSchema`. If it passes immediately, the fake API
is not parsing through the schema — that is fine, keep the test as the regression guard for the
registration in Step 3 and note it in the commit body.

- [x] **Step 3: Add the field to the tool's input schema**

In `apps/server/src/mcp/register.ts`, inside `coreNodeFields`, after the `role` entry:

```ts
    foundational: z.boolean().optional()
      .describe('Mark this node as foundational: infrastructure the rest of the model naturally leans on (a composition root, a settings/config store, a shared logger). The viewer then stops drawing its edges when it appears OUTSIDE the container being focused and parks it on a shelf with a count of them instead, so one mark replaces a fan of near-identical lines. Set it by judgement, on a handful of nodes at most — it is not a degree threshold, and marking a genuine participant hides real structure. The connections themselves are unaffected and every query still returns them.'),
```

- [x] **Step 4: Run the test to verify it passes**

Run: `cd C:/projects/hyphae/apps/server && pnpm vitest run test/mcp.test.ts`
Expected: PASS, whole file green.

- [x] **Step 5: Run the full verification**

```bash
cd C:/projects/hyphae && pnpm -r test
cd C:/projects/hyphae && pnpm -r build
```

Expected: 735 green; build clean.

- [x] **Step 6: Commit**

```bash
cd C:/projects/hyphae && git status --short
git add apps/server/src/mcp/register.ts apps/server/test/mcp.test.ts
git commit -m "$(cat <<'EOF'
feat(server): accept a foundational mark over MCP

Added to coreNodeFields, so create_nodes and update_nodes both take it and
get_node already returns it. The description spells out that this is a
judgement call on a handful of nodes, not a threshold, because an agent given
a boolean with no guidance will mark everything with a big fan.
EOF
)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: `buildFocusView` partitions the shelf

**Files:**
- Modify: `apps/web/src/core/focusView/types.ts`
- Modify: `apps/web/src/core/focusView/buildFocusView.ts:100-134`
- Test: `apps/web/test/core/focusView.test.ts`

**Interfaces:**
- Consumes: `Node.foundational` (Task 1).
- Produces, and every later task depends on these exact names:
  ```ts
  export type ShelfItem = { node: Node; count: number };
  // on FocusView:
  shelf?: ShelfItem[];        // foundational externals; NOT also present in `externals`
  // on FocusEdge:
  shelved?: boolean;          // true when either endpoint is on the shelf — drawn, but hidden at rest
  ```

- [x] **Step 1: Write the failing tests**

Add to `apps/web/test/core/focusView.test.ts`. The file's `model()` helper builds
`sys › (ca[a1,a2], cb[b1]) + ext`; read it first, then add a local helper that marks a node
foundational so the fixture stays shared:

```ts
describe('buildFocusView — the foundational shelf', () => {
  /** The shared model with one node marked foundational. */
  const withFoundational = (id: string) => {
    const m = model();
    const n = m.nodes.find((x) => x.id === id)!;
    n.foundational = true;
    return m;
  };

  it('leaves the view untouched when nothing is marked', () => {
    const v = buildFocusView(model(), 'ca');
    expect(v.shelf ?? []).toEqual([]);
    expect(v.edges.some((e) => e.shelved)).toBe(false);
  });

  it('moves a foundational external off the columns and onto the shelf', () => {
    const v = buildFocusView(withFoundational('cb'), 'ca');
    expect(v.shelf?.map((s) => s.node.id)).toEqual(['cb']);
    expect(v.externals.map((n) => n.id)).not.toContain('cb');
  });

  it('marks every edge touching a shelved node as shelved, and keeps drawing the rest', () => {
    const v = buildFocusView(withFoundational('cb'), 'ca');
    const touching = v.edges.filter((e) => e.from === 'cb' || e.to === 'cb');
    expect(touching.length).toBeGreaterThan(0);
    expect(touching.every((e) => e.shelved)).toBe(true);
    expect(v.edges.filter((e) => e.from !== 'cb' && e.to !== 'cb').every((e) => !e.shelved)).toBe(true);
  });

  it('counts the shelved edges, not the underlying connections', () => {
    const v = buildFocusView(withFoundational('cb'), 'ca');
    const shelved = v.edges.filter((e) => e.shelved).length;
    expect(v.shelf?.[0].count).toBe(shelved);
  });

  it('draws a foundational node normally inside its own container', () => {
    // 'a1' is a child of the focus 'ca', so it is never an external and never shelved.
    const v = buildFocusView(withFoundational('a1'), 'ca');
    expect(v.shelf ?? []).toEqual([]);
    expect(v.children.map((n) => n.id)).toContain('a1');
    expect(v.edges.some((e) => e.shelved)).toBe(false);
  });

  it('offers no expand affordance on a shelved node', () => {
    const v = buildFocusView(withFoundational('cb'), 'ca');
    expect(v.expandableExternalIds?.has('cb')).toBe(false);
  });
});
```

- [x] **Step 2: Run them to verify they fail**

Run: `cd C:/projects/hyphae/apps/web && pnpm vitest run test/core/focusView.test.ts -t shelf`
Expected: FAIL — `v.shelf` is `undefined`, so `.map` throws / `expect(undefined).toEqual([])` fails
on the marked cases. The "nothing is marked" case should already pass (it is the no-regression guard).

- [x] **Step 3: Extend the types**

In `apps/web/src/core/focusView/types.ts`, add to `FocusEdge`:

```ts
  /** Either endpoint is on the shelf: the edge is still built and still highlightable, but
   *  highlight.ts hides it until the shelved node is hovered or selected. */
  shelved?: boolean;
```

and above `FocusView`, plus the new field:

```ts
/** A foundational node parked on the shelf, with how many of this view's edges it carries. */
export type ShelfItem = { node: Node; count: number };
```

```ts
  /** Foundational externals, drawn on the shelf instead of in a column. Disjoint from `externals`. */
  shelf?: ShelfItem[];
```

Re-export `ShelfItem` from `apps/web/src/core/focusView/index.ts` alongside the existing type
exports (read the file and match how `FocusEdge`/`FocusView` are re-exported).

- [x] **Step 4: Partition the shelf in `buildFocusView`**

In `apps/web/src/core/focusView/buildFocusView.ts`, replace the block that currently computes
`externals` (lines 102-107) with:

```ts
  const shownExternalIds = new Set<string>();
  for (const ed of shownEdges) {
    if (!inside.has(ed.from)) shownExternalIds.add(ed.from);
    if (!inside.has(ed.to)) shownExternalIds.add(ed.to);
  }
  const shown = [...shownExternalIds].map((id) => tree.get(id)).filter((n): n is Node => !!n);

  // A foundational node is shelved only where it is EXTERNAL to the focus — which is automatic here,
  // since a child of the focus is in `children` and never reaches this list. Inside its own container
  // it stays an ordinary member, and the fan it causes there is an accepted cost: the alternative
  // removes a container's own child from its own cluster, which makes containment lie.
  const shelfNodes = shown.filter((n) => n.foundational);
  const shelfIds = new Set(shelfNodes.map((n) => n.id));
  const externals = shown.filter((n) => !shelfIds.has(n.id));

  // Not drawn at rest, but still built: highlight.ts only changes opacity, so an edge that was never
  // created could not be revealed on hover. The count is EDGES in this view — one mark saying how
  // many things here lean on this node — not connections and not the node's model degree.
  const shelfCount: Record<string, number> = {};
  for (const ed of shownEdges) {
    const ends = [ed.from, ed.to].filter((id) => shelfIds.has(id));
    if (!ends.length) continue;
    ed.shelved = true;
    for (const id of new Set(ends)) shelfCount[id] = (shelfCount[id] ?? 0) + 1;
  }
  const shelf = shelfNodes.map((node) => ({ node, count: shelfCount[node.id] ?? 0 }));
```

Then guard the expandable scan (the loop at what was line 112) so a shelved node gets no `＋` — add
`shelfIds.has(rep) ||` to the existing `continue` condition:

```ts
      if (inside.has(rep) || shelfIds.has(rep) || expandedExternals.has(rep) || expandableExternalIds.has(rep)) continue;
```

and add `shelf` to the return:

```ts
  return { focusId, focusNode, children, externals, shelf, edges: shownEdges, externalGroups, expandableExternalIds };
```

`externalGroups` already derives its `childIds` from `externals`, so a shelved node simply does not
appear as a group member — no change needed there.

- [x] **Step 5: Run the tests to verify they pass**

Run: `cd C:/projects/hyphae/apps/web && pnpm vitest run test/core/focusView.test.ts`
Expected: PASS — the whole file, not just the new describe. `buildFocusView` is the most
widely-depended-on pure function here, so a regression in the older cases matters more than the new
ones passing.

- [x] **Step 6: Run the full verification**

```bash
cd C:/projects/hyphae && pnpm -r test
cd C:/projects/hyphae && pnpm --filter @hyphae/web typecheck
```

Expected: 741 green; typecheck at exactly 4 errors.

- [x] **Step 7: Commit**

```bash
cd C:/projects/hyphae && git status --short
git add apps/web/src/core/focusView apps/web/test/core/focusView.test.ts
git commit -m "$(cat <<'EOF'
feat(web): partition foundational externals onto a shelf in the focus view

buildFocusView now splits a foundational external out of `externals` into
`shelf` and marks every edge touching one `shelved`, with a count of how many
of this view's edges it carries.

The edges are marked, not dropped: the highlight machinery works by changing
opacity, so an edge that was never built could not be revealed on hover, and
the whole point is that nothing is permanently hidden.

The "external to the focus only" rule needs no check — a child of the focus is
in `children` and never reaches the external list.
EOF
)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: The shelf's slots in the layout

**Files:**
- Modify: `apps/web/src/features/canvas/layout.ts` (a new `SHELF_GAP`; the tail of
  `layoutFocusView`; one line in `resolveViewPositions`)
- Test: `apps/web/test/features/canvas/layout.test.ts`

**Interfaces:**
- Consumes: `FocusView.shelf` (Task 3).
- Produces: `export const SHELF_GAP` and a base slot in `layoutFocusView`'s returned
  `Record<string, XY>` for every `view.shelf[].node.id`, plus the same id kept by
  `resolveViewPositions`.

**Why this matters:** a node with **no base slot gets no position** and renders at the origin on top of
everything else. If the shelf boxes stack in a corner after Task 5, the bug is here.

- [x] **Step 1: Write the failing tests**

Add to `apps/web/test/features/canvas/layout.test.ts`. The file already has a `node()` helper (cast
`as any`) and a shared `view` literal — read them, then add:

```ts
describe('layoutFocusView — the shelf', () => {
  const shelfView = (): FocusView => ({
    ...view,
    externals: [node('cb', 'Container')],
    shelf: [{ node: node('found', 'Container'), count: 3 }],
    edges: [
      ...view.edges,
      { id: 's1', from: 'found', to: 'a1', count: 1, derived: false, realizedBy: ['s1'], shelved: true },
    ],
  });

  it('gives every shelf node a slot', () => {
    const pos = layoutFocusView(shelfView());
    expect(pos['found']).toBeDefined();
  });

  it('puts the shelf below every other placed node', () => {
    const pos = layoutFocusView(shelfView());
    const others = Object.entries(pos).filter(([id]) => id !== 'found').map(([, p]) => p.y + NODE_H);
    expect(pos['found'].y).toBeGreaterThanOrEqual(Math.max(...others) + SHELF_GAP);
  });

  it('does not put a shelf node in an external column', () => {
    const pos = layoutFocusView(shelfView());
    expect(pos['found'].x).not.toBe(pos['cb'].x);
  });

  it('spaces a row of shelf nodes so the boxes cannot overlap', () => {
    const v = shelfView();
    v.shelf = [
      { node: node('f1', 'Container'), count: 1 },
      { node: node('f2', 'Container'), count: 2 },
    ];
    const pos = layoutFocusView(v);
    expect(Math.abs(pos['f1'].x - pos['f2'].x)).toBeGreaterThanOrEqual(NODE_W);
    expect(pos['f1'].y).toBe(pos['f2'].y);
  });

  it('keeps a shelf slot through resolveViewPositions', () => {
    const v = shelfView();
    const pos = resolveViewPositions(v, layoutFocusView(v));
    expect(pos['found']).toBeDefined();
  });

  it('changes nothing when the shelf is empty', () => {
    const before = layoutFocusView(view);
    const after = layoutFocusView({ ...view, shelf: [] });
    expect(after).toEqual(before);
  });
});
```

Add `SHELF_GAP` to the `@/features/canvas/layout` import list at the top of the test file.

- [x] **Step 2: Run them to verify they fail**

Run: `cd C:/projects/hyphae/apps/web && pnpm vitest run test/features/canvas/layout.test.ts -t shelf`
Expected: FAIL — `SHELF_GAP` is not exported (an import error, so the whole file fails to collect).
That is the expected red; fix it in Step 3.

- [x] **Step 3: Add the constant and place the band**

In `apps/web/src/features/canvas/layout.ts`, next to `ROW_GAP` / `MEMBER_PITCH`:

```ts
/**
 * The empty band between the graph and the shelf. Derived from ROW_GAP, and deliberately LARGER than
 * it: at the external columns' own row pitch the shelf would read as one more row of that column
 * rather than as a separate place, which is the whole thing it exists to be.
 */
export const SHELF_GAP = ROW_GAP + PAD;
```

Then, in `layoutFocusView`, after the second pair of `placeColumn` calls and **before** `return pos`:

```ts
  // The shelf: a band along the bottom, under the cluster, the isolated-child grid AND both external
  // columns — left and right are already spoken for. Every other slot is final by now, so `pos` is
  // the true bottom of the drawing. Ordered by id so the band is stable across runs, and wrapped at
  // GRID_COLS like the isolated-child grid so a heavily-marked model does not grow one endless row.
  const shelfIds = (view.shelf ?? []).map((s) => s.node.id).sort(byId);
  if (shelfIds.length) {
    const placed = Object.values(pos);
    const bottom = placed.length ? Math.max(...placed.map((p) => p.y + NODE_H)) : NODE_H;
    const cols = Math.min(GRID_COLS, shelfIds.length);
    const pitchX = NODE_W + NODE_SEP;
    const bandW = (cols - 1) * pitchX + NODE_W;
    const left = (minX + maxX) / 2 - bandW / 2;   // centred on the children cluster, not the whole drawing
    shelfIds.forEach((id, i) => {
      pos[id] = { x: left + (i % cols) * pitchX, y: bottom + SHELF_GAP + Math.floor(i / cols) * ROW_GAP };
    });
  }
```

In `resolveViewPositions`, right after the `view.children` loop, keep the shelf slots as-is — a shelf
node takes no part in the column-stacking machinery below it:

```ts
  // A shelf node keeps its base slot verbatim: it is in no column, so the group-expansion offsets
  // below have nothing to say about it.
  for (const s of view.shelf ?? []) if (base[s.node.id]) pos[s.node.id] = base[s.node.id];
```

`gutterGeometry` reads only `view.children` and `view.externals`, so it already ignores the shelf —
correct, since a wide shelf must not widen a gutter.

- [x] **Step 4: Run the tests to verify they pass**

Run: `cd C:/projects/hyphae/apps/web && pnpm vitest run test/features/canvas/layout.test.ts`
Expected: PASS, whole file green — including `crossings.real.test.ts`'s neighbours under
`test/features/canvas/edges/`, which the next step covers.

- [x] **Step 5: Run the full verification**

```bash
cd C:/projects/hyphae && pnpm -r test
cd C:/projects/hyphae && pnpm --filter @hyphae/web typecheck
```

Expected: 747 green; typecheck at exactly 4 errors.

- [x] **Step 6: Commit**

```bash
cd C:/projects/hyphae && git status --short
git add apps/web/src/features/canvas/layout.ts apps/web/test/features/canvas/layout.test.ts
git commit -m "$(cat <<'EOF'
feat(web): lay the foundational shelf out as a band below the graph

Placed last, from the true bottom of everything already positioned, and
centred on the children cluster. Left and right are the external columns, so
the bottom is the only edge free for a band.

SHELF_GAP is deliberately larger than the external columns' row pitch: at the
same pitch the shelf reads as one more row of a column instead of as a
separate place.
EOF
)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Drawing the shelf — the band, the boxes, the count chip

**Files:**
- Create: `apps/web/src/features/canvas/nodes/ShelfBand.tsx`
- Modify: `apps/web/src/features/canvas/reactflow.ts`
- Modify: `apps/web/src/features/canvas/nodes/GhostNode.tsx`
- Modify: `apps/web/src/features/canvas/canvas.css`
- Modify: `apps/web/src/features/canvas/Canvas.tsx:22` (`nodeTypes`)
- Modify: `apps/web/src/features/canvas/useCanvasView.ts:88-94` (`displayEdges`)
- Test: `apps/web/test/features/canvas/reactflow.test.ts`,
  `apps/web/test/features/canvas/nodes/GhostNode.test.tsx` (create if absent)

**Interfaces:**
- Consumes: `FocusView.shelf`, `FocusEdge.shelved` (Task 3); the shelf slots (Task 4).
- Produces:
  ```ts
  export const SHELF_ID = '__shelf__';        // reactflow.ts — the band's React Flow node id
  // GhostNodeData gains:  shelfCount?: number
  // a shelved edge's FlowEdge carries:  data.shelved === true
  ```

- [x] **Step 1: Write the failing tests**

Add to `apps/web/test/features/canvas/reactflow.test.ts` (it has a `node()` helper cast `as any` and a
shared `view`; read them first):

```ts
describe('focusViewToFlow — the shelf', () => {
  const shelfView = (): FocusView => ({
    ...view,
    shelf: [{ node: node('found', 'Container'), count: 7 }],
    edges: [
      ...view.edges,
      { id: 's1', from: 'found', to: 'a1', count: 1, derived: false, realizedBy: ['s1'], label: 'owns', shelved: true },
    ],
  });
  const pos = { ca: { x: 0, y: 0 }, a1: { x: 0, y: 0 }, a2: { x: 0, y: 200 }, cb: { x: -400, y: 0 }, found: { x: 0, y: 600 } };

  it('draws a shelf node as a ghost carrying its count', () => {
    const { nodes } = focusViewToFlow(shelfView(), pos);
    const n = nodes.find((x) => x.id === 'found')!;
    expect(n.type).toBe('ghost');
    expect((n.data as { shelfCount?: number }).shelfCount).toBe(7);
  });

  it('draws an inert band wrapping the shelf nodes', () => {
    const { nodes } = focusViewToFlow(shelfView(), pos);
    const band = nodes.find((x) => x.id === SHELF_ID)!;
    expect(band.type).toBe('shelf');
    expect(band.selectable).toBe(false);
    expect(band.draggable).toBe(false);
    expect((band.style as { pointerEvents?: string }).pointerEvents).toBe('none');
    expect(band.position.y).toBeLessThan(pos.found.y);   // the band's title strip sits above its members
  });

  it('draws no band when nothing is shelved', () => {
    const { nodes } = focusViewToFlow(view, pos);
    expect(nodes.find((x) => x.id === SHELF_ID)).toBeUndefined();
  });

  it('flags a shelved edge in its data and leaves the others alone', () => {
    const { edges } = focusViewToFlow(shelfView(), pos);
    expect((edges.find((e) => e.id === 's1')!.data as { shelved?: boolean }).shelved).toBe(true);
    expect((edges.find((e) => e.id === 'i')!.data as { shelved?: boolean } | undefined)?.shelved).toBeUndefined();
  });
});
```

Add `SHELF_ID` to the `@/features/canvas/reactflow` import at the top of the file.

Then create `apps/web/test/features/canvas/nodes/GhostNode.test.tsx` (or add to it if it exists — a
component rendering React Flow `Handle`s needs a `ReactFlowProvider` wrapper, as in
`NodeBox.test.tsx`; read that file for the exact wrapper):

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { GhostNode } from '@/features/canvas/nodes/GhostNode';

const draw = (data: Record<string, unknown>) =>
  render(
    <ReactFlowProvider>
      {/* GhostNode reads only `id` and `data` off NodeProps. */}
      <GhostNode {...({ id: 'n1', data } as never)} />
    </ReactFlowProvider>,
  );

describe('GhostNode', () => {
  it('shows a count chip for a shelved node', () => {
    draw({ name: 'Settings', shelfCount: 16 });
    expect(screen.getByText('◂ 16')).toBeTruthy();
  });
  it('shows no chip for an ordinary external', () => {
    draw({ name: 'Beta' });
    expect(screen.queryByText(/^◂/)).toBeNull();
  });
  it('shows a zero count rather than swallowing it', () => {
    draw({ name: 'Settings', shelfCount: 0 });
    expect(screen.getByText('◂ 0')).toBeTruthy();
  });
});
```

- [x] **Step 2: Run them to verify they fail**

```bash
cd C:/projects/hyphae/apps/web && pnpm vitest run test/features/canvas/reactflow.test.ts test/features/canvas/nodes/GhostNode.test.tsx
```
Expected: FAIL — `SHELF_ID` is not exported (collect error) and `◂ 16` is not in the DOM.

- [x] **Step 3: Create the band component**

`apps/web/src/features/canvas/nodes/ShelfBand.tsx`:

```tsx
import type { NodeProps } from '@xyflow/react';

/**
 * The shelf: the band behind the foundational nodes whose edges are not drawn.
 *
 * Completely inert — no handles (no edge ever anchors on the band itself) and no pointer events
 * anywhere, including on its own label. It is furniture, not a participant: if it could become the
 * hovered node it would dim the entire graph on the way past, and it deliberately does NOT reuse
 * `.region__handle`, whose `cursor: grab` would promise a drag that does not exist.
 */
export function ShelfBand({ data }: NodeProps) {
  const d = data as { label?: string };
  return (
    <div className="region region--shelf">
      <div className="shelf__label">{d.label ?? ''}</div>
    </div>
  );
}
```

- [x] **Step 4: Style the band**

In `apps/web/src/features/canvas/canvas.css`, immediately after the `.region--ghost` rule (source
order is the cascade, and both are single-class `.region` modifiers, so a modifier must come after the
class it narrows):

```css
/* The foundational shelf. An outline with NO fill: it needs to read as a tray the graph is resting
 * things on, and it must not paint over the edges revealed inside it when a shelved node is hovered.
 * Distinguished from the graph by FORM and position — a band of its own below everything, dashed
 * like the ghosts it holds — never by a hue (docs/SPEC.md §9). */
.region--shelf { border: 1px dashed var(--rule); background: transparent; }
/* Same metrics as .region__handle so the two title strips line up, minus the grab affordance and the
 * pointer events — nothing on this box is interactive. */
.shelf__label {
  position: absolute; top: 0; left: 0; right: 0; height: 22px;
  padding: var(--s-1) var(--s-5); box-sizing: border-box;
  font-size: var(--t-micro); font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--tx-3);
}
```

`transparent` is a keyword, not a colour literal, so `tokens.test.ts` is satisfied; every `var()` here
already exists in both themes.

- [x] **Step 5: Emit the band and the shelf boxes**

In `apps/web/src/features/canvas/reactflow.ts`, next to `GROUP_GRIP`:

```ts
/** React Flow node id of the shelf band. Not a model id — the band is chrome, and no node in a
 *  Hyphae model has a `__…__` id. */
export const SHELF_ID = '__shelf__';
```

Then in `focusViewToFlow`, after the `view.externalGroups` loop and before the `view.children` loop:

```ts
  const shelf = view.shelf ?? [];
  const shelfPos = shelf.map((s) => pos[s.node.id]).filter(Boolean) as XY[];
  if (shelfPos.length) {
    const minX = Math.min(...shelfPos.map((p) => p.x));
    const minY = Math.min(...shelfPos.map((p) => p.y));
    const maxX = Math.max(...shelfPos.map((p) => p.x + NODE_W));
    const maxY = Math.max(...shelfPos.map((p) => p.y + NODE_H));
    const width = maxX - minX + 2 * PAD;
    const height = maxY - minY + LABEL_H + 2 * PAD;
    nodes.push({
      id: SHELF_ID,
      type: 'shelf',
      position: { x: minX - PAD, y: minY - LABEL_H - PAD },
      data: { label: 'Foundational' },
      style: { width, height, pointerEvents: 'none' as const },
      initialWidth: width,
      initialHeight: height,
      zIndex: BOUNDARY_Z,
      selectable: false,
      draggable: false,
    });
  }
  for (const s of shelf) {
    nodes.push({
      id: s.node.id, type: 'ghost', position: pos[s.node.id] ?? { x: 0, y: 0 },
      // No `expandable`: a shelved node is furniture, not a collapsed group.
      data: { ...nodeVisual(s.node), shelfCount: s.count },
      initialWidth: NODE_W, initialHeight: NODE_H,
    });
  }
```

And carry the flag onto the drawn edges. In `realEdge`, add before the closing brace of the returned
object:

```ts
    ...(e.shelved ? { data: { shelved: true } } : {}),
```

and in `derivedEdge`, change the `data` line to:

```ts
    data: { derived: true, count: e.count, realizedBy: e.realizedBy, ...(e.shelved ? { shelved: true } : {}) },
```

Both use a conditional spread so an unshelved edge's `data` is byte-identical to before — the existing
`reactflow.test.ts` assertions on `data` must keep passing.

- [x] **Step 6: Register the node type and keep shelved edges out of routing**

In `apps/web/src/features/canvas/Canvas.tsx`, import the component and extend `nodeTypes`:

```tsx
import { ShelfBand } from '@/features/canvas/nodes/ShelfBand';
```
```tsx
const nodeTypes = { region: GroupNode, node: NodeBox, ghost: GhostNode, ghostGroup: GhostGroupNode, patternMember: PatternMemberNode, shelf: ShelfBand };
```

In `apps/web/src/features/canvas/useCanvasView.ts`, feed `routeEdges` only the edges that are actually
drawn at rest:

```ts
  const displayEdges = useMemo(() => {
    // Shelved edges are deliberately NOT routed: routing them would spend ports on the in-view nodes
    // and lanes in the gutter on lines nobody can see, which is exactly the space the shelf exists to
    // give back. They fall through to fallbackRoute (edges/routeEdges.ts) — a mid-side anchor on both
    // ends — so a reveal draws as a fan from one point on the shelved box, which reads as "these all
    // come from this one thing".
    const routable = decorated.filter((e) => !(e.data as { shelved?: boolean } | undefined)?.shelved);
    const routes = routeEdges(
      routable.map((e) => ({ id: e.id, source: e.source, target: e.target })),
      positions, kinds, gutterGeometry(view, positions),
    );
    return decorated.map((e) => (routes[e.id] ? { ...e, data: { ...e.data, route: routes[e.id] } } : e));
  }, [decorated, positions, kinds, view]);
```

Also add the shelf ids to `kinds`, so anything that does consult them reads a shelf node as external
rather than defaulting to `'child'`:

```ts
    for (const s of view.shelf ?? []) k[s.node.id] = 'external';
```

- [x] **Step 7: Render the count chip**

In `apps/web/src/features/canvas/nodes/GhostNode.tsx`, extend the data type:

```ts
export type GhostNodeData = NodeBoxData & { expandable?: boolean; shelfCount?: number };
```

and insert, immediately after the `{d.expandable && …}` block:

```tsx
      {typeof d.shelfCount === 'number' && (
        // One mark, on the hub itself, replacing a fan of near-identical lines. The INVERSION of the
        // deleted hub-quieting feature, which put a chip on each of the N dependants instead.
        // fontStyle:normal because the surrounding ghost box is italic and a count is not prose.
        <div
          title={`${d.shelfCount} connections to nodes in this view are not drawn — hover or select to reveal them`}
          style={{
            position: 'absolute', top: 2, left: 4, zIndex: 1,
            fontSize: 9, fontStyle: 'normal', lineHeight: 1.6,
            color: 'var(--tx-2)', background: 'var(--chip)', borderRadius: 3, padding: '0 4px',
          }}
        >
          ◂ {d.shelfCount}
        </div>
      )}
```

Note `typeof … === 'number'`, not truthiness: a shelved node whose every edge was filtered out shows
`◂ 0`, which is information, and `0` would otherwise vanish.

- [x] **Step 8: Run the tests to verify they pass**

```bash
cd C:/projects/hyphae/apps/web && pnpm vitest run test/features/canvas
```
Expected: PASS — including `Canvas.test.tsx` and `reactflow.test.ts`'s pre-existing cases. React Flow
renders zero edges in jsdom, so do **not** try to assert the band or the chip through a rendered
`<Canvas />`; the assertions above are on the pure function and on the component in isolation.

- [x] **Step 9: Run the full verification**

```bash
cd C:/projects/hyphae && pnpm -r test
cd C:/projects/hyphae && pnpm -r build
cd C:/projects/hyphae && pnpm --filter @hyphae/web typecheck
```

Expected: 754 green; build clean; typecheck at exactly 4 errors.

- [x] **Step 10: Commit**

```bash
cd C:/projects/hyphae && git status --short
git add apps/web/src/features/canvas apps/web/test/features/canvas
git commit -m "$(cat <<'EOF'
feat(web): draw the shelf, its boxes and the count chip

A shelved node is a ghost box carrying `◂ n` — one mark on the hub itself
stating how many of this view's edges it holds — inside an inert dashed band
labelled "Foundational". Form and position, no hue: the band is an outline with
no fill so the revealed edges are not painted over, and the chip reuses --chip.

This is the inversion of the deleted hub-quieting feature, which re-encoded
each edge as a chip on the far endpoint and so traded one kind of noise for
another.

Shelved edges are kept out of routeEdges: routing invisible lines would spend
ports and gutter lanes on exactly the space the shelf exists to give back, so
they take fallbackRoute's mid-side anchor and a reveal draws as a fan from one
point.
EOF
)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Hide shelved edges at rest, reveal them on hover or select

**Files:**
- Modify: `apps/web/src/features/canvas/highlight.ts`
- Modify: `apps/web/src/features/canvas/Canvas.tsx:105-128`
- Test: `apps/web/test/features/canvas/highlight.test.ts` (**create**),
  `apps/web/test/features/canvas/Canvas.test.tsx` (one integration case)

**Interfaces:**
- Consumes: `data.shelved` on a `FlowEdge` (Task 5).
- Produces: `HighlightArgs` gains `shelvedEdges?: Set<string>`; `highlightCss` emits an
  `opacity:0` rule for every shelved edge id **not** in `hi.edges`.

**Why CSS and not edge filtering:** the whole reveal mechanism is opacity. `highlightSets` already
returns a hovered/selected node's adjacent edges, so if a shelved edge exists in the graph and is
hidden only by a rule keyed on its id, hovering the shelved node reveals it with no new machinery —
and a flow that traverses one reveals it too, for free.

- [x] **Step 1: Write the failing tests**

Create `apps/web/test/features/canvas/highlight.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { highlightCss } from '@/features/canvas/highlight';

const args = (over: Partial<Parameters<typeof highlightCss>[0]> = {}) => ({
  hi: { nodes: new Set<string>(), edges: new Set<string>() },
  activeId: null as string | null,
  flowActive: false,
  patternActive: false,
  strong: false,
  accent: 'var(--accent-soft)',
  dimEdge: 0.4,
  dimNode: 0.65,
  ...over,
});

describe('highlightCss — shelved edges', () => {
  it('hides a shelved edge when nothing is active', () => {
    const css = highlightCss(args({ shelvedEdges: new Set(['s1']) }));
    expect(css).toContain('.react-flow__edge[data-id="s1"]');
    expect(css).toMatch(/\[data-id="s1"\][^{]*\{opacity:0/);
  });

  it('hides the shelved edge\'s label too', () => {
    const css = highlightCss(args({ shelvedEdges: new Set(['s1']) }));
    expect(css).toContain('[data-edge-id="s1"]');
  });

  it('reveals a shelved edge that is in the highlight set', () => {
    const css = highlightCss(args({
      activeId: 'found',
      hi: { nodes: new Set(['found', 'a1']), edges: new Set(['s1']) },
      shelvedEdges: new Set(['s1']),
    }));
    expect(css).not.toMatch(/\[data-id="s1"\][^{]*\{opacity:0/);
    expect(css).toContain('[data-id="s1"]');
  });

  it('keeps a shelved edge hidden while some OTHER node is active', () => {
    const css = highlightCss(args({
      activeId: 'a1',
      hi: { nodes: new Set(['a1']), edges: new Set(['i']) },
      shelvedEdges: new Set(['s1']),
    }));
    expect(css).toMatch(/\[data-id="s1"\][^{]*\{opacity:0/);
  });

  it('leaves the shelf band undimmed', () => {
    const css = highlightCss(args({ activeId: 'a1', hi: { nodes: new Set(['a1']), edges: new Set() } }));
    expect(css).toContain(':not(.react-flow__node-shelf)');
  });

  it('emits nothing extra when no edge is shelved', () => {
    expect(highlightCss(args())).toBe(highlightCss(args({ shelvedEdges: new Set() })));
  });
});
```

Then add one integration case to `apps/web/test/features/canvas/Canvas.test.tsx`, using the file's
existing `hlCss(container)` helper (which reads the `<style data-hyphae-hl>` element) and its `model()`
fixture. Mark `cb` foundational so `b1`'s cross-boundary edge is shelved:

```tsx
  it('hides a foundational external\'s edges in the generated highlight CSS', async () => {
    const m = model();
    m.nodes.find((n) => n.id === 'cb')!.foundational = true;
    await act(async () => { useStore.setState({ model: m, focusId: 'ca', selectedId: null }); });
    const { container } = render(<Canvas />);
    // 'x' is the a1 -> b1 connection; at focus 'ca' it maps to the external 'cb', which is shelved.
    expect(hlCss(container)).toMatch(/\{opacity:0/);
  });
```

Read the surrounding cases first and match how they seed the store and settle the initial
`loadModel()` (`await new Promise(r => setTimeout(r, 0))` where the existing tests do it) — the store
is a module-level singleton and the async load will otherwise overwrite the seeded model.

- [x] **Step 2: Run them to verify they fail**

```bash
cd C:/projects/hyphae/apps/web && pnpm vitest run test/features/canvas/highlight.test.ts test/features/canvas/Canvas.test.tsx
```
Expected: FAIL — `shelvedEdges` is not a known property of `HighlightArgs` (TS error in the test),
and no `opacity:0` rule is produced.

- [x] **Step 3: Teach `highlightCss` about shelved edges**

In `apps/web/src/features/canvas/highlight.ts`, add to `HighlightArgs`:

```ts
  /** Edges that exist in the graph but are not drawn at rest — a foundational node's fan. Hidden by
   *  id here rather than filtered out of the edge array, because that is what lets the highlight
   *  machinery reveal them: the reveal IS an opacity change, and an edge that was never built could
   *  not be revealed at all. */
  shelvedEdges?: Set<string>;
```

Restructure the body so the hide rules are emitted on **every** path, including the early return.
`esc` has to move above it:

```ts
export function highlightCss({
  hi, activeId, flowActive, patternActive, strong, accent, dimEdge, dimNode, shelvedEdges,
}: HighlightArgs): string {
  const esc = (id: string) => id.replace(/["\\]/g, '\\$&');
  // Always-on transitions so both dimming and un-dimming animate.
  const trans =
    '.hyphae-canvas .react-flow__node{transition:opacity .15s ease,box-shadow .15s ease}'
    + '.hyphae-canvas .react-flow__edge,.hyphae-canvas .react-flow__edge .react-flow__edge-path{transition:opacity .15s ease,stroke-width .15s ease}'
    + `.hyphae-canvas .${EDGE_LABEL_CLASS}{transition:opacity .15s ease}`;

  // A shelved edge is hidden UNLESS it is in the highlight set, so hovering or selecting the shelved
  // node (or a flow stepping through it) reveals it through the same set the rest of this function
  // uses. The two id lists are disjoint by construction, so their equal-specificity rules cannot
  // fight; keyed on [data-id] (0,3,0) it also outranks the generic dim rule below (0,2,0), which
  // would otherwise fade a shelved edge INTO view whenever some other node was active.
  const hidden = [...(shelvedEdges ?? [])].filter((id) => !hi.edges.has(id));
  const hide = hidden.length
    ? `${hidden.map((id) => `.hyphae-canvas .react-flow__edge[data-id="${esc(id)}"]`).join(',')}{opacity:0;pointer-events:none}`
      + `${hidden.map((id) => `.hyphae-canvas .${EDGE_LABEL_CLASS}[data-edge-id="${esc(id)}"]`).join(',')}{opacity:0}`
    : '';

  if (patternActive || (!activeId && !flowActive)) return trans + hide;
```

Leave the rest of the function as it is, with two edits: drop the now-duplicated `const esc = …` line,
add `:not(.react-flow__node-shelf)` to the node dim rule, and push `hide` onto `rules` last:

```ts
    `.hyphae-canvas .react-flow__node:not(.react-flow__node-region):not(.react-flow__node-ghostGroup):not(.react-flow__node-shelf){opacity:${dimNode}}`,
```

```ts
  if (hide) rules.push(hide);
  return rules.join('');
```

The extra `:not()` takes that selector to specificity (0,5,0); the restore rule below already carries
`!important`, so it still wins. The comment on that `!important` mentions (0,4,0) — update the number
to (0,5,0) so it does not go stale.

- [x] **Step 4: Pass the shelved set in from the canvas**

In `apps/web/src/features/canvas/Canvas.tsx`, after the `hi` memo:

```tsx
  // Read from the UNDECORATED `edges`, like `present` and `hi` above — a flow's ephemeral step edges
  // are never shelved, and pulling `displayEdges` in here would change what the highlight is about.
  const shelvedEdges = useMemo(
    () => new Set(edges.filter((e) => (e.data as { shelved?: boolean } | undefined)?.shelved).map((e) => e.id)),
    [edges],
  );
```

and pass it:

```tsx
  const css = highlightCss({
    hi, activeId, flowActive, patternActive: !!patternFlow, strong, accent, dimEdge, dimNode, shelvedEdges,
  });
```

- [x] **Step 5: Run the tests to verify they pass**

```bash
cd C:/projects/hyphae/apps/web && pnpm vitest run test/features/canvas
```
Expected: PASS. If `Canvas.test.tsx > "double-clicking a childless Component drills into it"` fails,
re-run once — it is known-flaky and pre-existing.

- [x] **Step 6: Run the full verification**

```bash
cd C:/projects/hyphae && pnpm -r test
cd C:/projects/hyphae && pnpm --filter @hyphae/web typecheck
```

Expected: 761 green; typecheck at exactly 4 errors.

- [x] **Step 7: Commit**

```bash
cd C:/projects/hyphae && git status --short
git add apps/web/src/features/canvas/highlight.ts apps/web/src/features/canvas/Canvas.tsx apps/web/test/features/canvas/highlight.test.ts apps/web/test/features/canvas/Canvas.test.tsx
git commit -m "$(cat <<'EOF'
fix(web): hide a shelved node's edges at rest and reveal them on hover

highlightCss now emits an opacity:0 rule for every shelved edge that is not in
the highlight set — on every path, including the early return when nothing is
active.

Hiding by id rather than filtering the edge array is what makes the reveal
free: highlightSets already returns a hovered or selected node's adjacent
edges, and a flow stepping through a shelved edge reveals it with no extra
code. Keying on [data-id] also outranks the generic dim rule, which would
otherwise fade a shelved edge INTO view whenever another node was active.

The band is excluded from node dimming, like the region and ghost-group boxes.
EOF
)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: The inspector states the mark

**Files:**
- Modify: `apps/web/src/features/inspector/SidePanel.tsx:39-41` (the node header's chip row)
- Test: `apps/web/test/features/inspector/SidePanel.test.tsx`

**Interfaces:**
- Consumes: `Node.foundational` (Task 1). Produces nothing for later tasks.

`ConnectionList` already lists a node's connections from the model, so a shelved node's edges are
already listed in full — **verify that with the test below rather than assuming it, and change nothing
if it holds.** All this task adds is a statement of the mark itself, next to the existing `role` chip.

- [x] **Step 1: Write the failing tests**

Add to `apps/web/test/features/inspector/SidePanel.test.tsx` (it has an `mk(over)` node fixture and
seeds the store — read the surrounding cases and match them):

```tsx
  it('marks a foundational node in the header chips', async () => {
    // …seed the store with mk({ id: 'f1', name: 'Settings', foundational: true }) and select it,
    // exactly as the neighbouring cases do…
    expect(screen.getByText('foundational')).toBeTruthy();
  });

  it('shows no such chip on an ordinary node', async () => {
    // …seed and select mk({ id: 'n1', name: 'Plain' })…
    expect(screen.queryByText('foundational')).toBeNull();
  });

  it('still lists every connection of a foundational node', async () => {
    // …seed a foundational node with two connections and select it…
    // The shelf changes only the resting picture; the panel is the place that still says everything.
    expect(screen.getAllByText(/→/).length).toBeGreaterThanOrEqual(2);
  });
```

Fill in the seeding from the neighbouring cases — do not invent a new harness.

- [x] **Step 2: Run them to verify they fail**

```bash
cd C:/projects/hyphae/apps/web && pnpm vitest run test/features/inspector/SidePanel.test.tsx
```
Expected: FAIL on the first case — no `foundational` text. The third case may already pass; that is
the point of it.

- [x] **Step 3: Add the chip**

In `apps/web/src/features/inspector/SidePanel.tsx`, in the node header's `panel__chips` row, after the
`role` chip:

```tsx
          {node.foundational && (
            <span className="chip" title="Foundational: this node's edges are not drawn when it appears outside the container being focused — it sits on the shelf with a count instead. Every connection is still listed below.">
              foundational
            </span>
          )}
```

No new CSS: `.chip` already exists in `inspector.css`.

- [x] **Step 4: Run the tests to verify they pass**

```bash
cd C:/projects/hyphae/apps/web && pnpm vitest run test/features/inspector/SidePanel.test.tsx
```
Expected: PASS, whole file green.

- [x] **Step 5: Run the full verification**

```bash
cd C:/projects/hyphae && pnpm -r test
cd C:/projects/hyphae && pnpm --filter @hyphae/web typecheck
```

Expected: 764 green; typecheck at exactly 4 errors.

- [x] **Step 6: Commit**

```bash
cd C:/projects/hyphae && git status --short
git add apps/web/src/features/inspector/SidePanel.tsx apps/web/test/features/inspector/SidePanel.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): state the foundational mark in the inspector

A chip next to `role`, plus a test pinning what the shelf must not break:
ConnectionList still lists every connection of a foundational node. The shelf
changes the resting picture, never the model, and the panel is where that
promise is kept.
EOF
)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: The living docs

**Files:**
- Modify: `docs/MODEL.md:70-75` (the core node-field list)
- Modify: `docs/SPEC.md:127` (Core fields) and §9 (the styling rule — record that the shelf spends
  form, not hue)
- Modify: `README.md:42-64` ("Reading the diagram" / what the panel shows)
- Modify: `skills/building-architecture-models/SKILL.md` (the Components phase, near the existing
  `role` guidance on line 74)
- Modify: `CLAUDE.md` ("Invariants that bite", the test baseline in Commands, the file map)

**Interfaces:** consumes everything above; produces nothing code-side.

`README.md`, `docs/MODEL.md`, `docs/SPEC.md` and the skill are the **living** docs — they change in the
same branch as the behaviour. The dated files under `docs/superpowers/` are historical records: read
them, do not rewrite them (this plan is the exception — tick its boxes).

- [x] **Step 1: Document the field in the model docs**

In `docs/MODEL.md`, add `foundational` to the core node-field list on line 70 and a sentence after the
`role` explanation on line 73, along these lines (match the surrounding prose, do not paste verbatim):

> `foundational` marks a node the rest of the model naturally leans on — a composition root, a
> settings store. It changes no relationship: the viewer stops *drawing* its edges where it appears
> outside the container being focused, and states the count instead. It is authored, deliberately not
> derived from a degree threshold.

In `docs/SPEC.md`, add `foundational` to the Core field list at line 127, and add a line to §9
recording that the shelf and its chip are **form** (a band, a count) with no hue and no luminance-only
distinction — the same rule that made a pattern's kind a chip.

- [x] **Step 2: Document the behaviour in the README**

In `README.md`'s "Reading the diagram" section, describe the shelf: a foundational node appearing
outside the focused container is drawn on a band below the graph with a `◂ n` count instead of its
edges; hovering or selecting it draws them; the inspector always lists them in full; and it is drawn
as an ordinary member inside its own container. Mention that `create_nodes` / `update_nodes` take
`foundational` where the MCP tool list covers node fields.

- [x] **Step 3: Tell the skill when to mark a node**

In `skills/building-architecture-models/SKILL.md`, in the Components phase near the `role` guidance,
add guidance in the skill's voice: after the connection pass, look at what carries a large fan of
edges that all say the same thing; if the node is infrastructure the model leans on rather than a
participant in any particular story, mark it `foundational` instead of deleting its connections. Cap
it at a handful per model, and say why: it is a judgement call, and marking a genuine participant
hides real structure. Cross-reference the connection rule already in the skill — an edge earns its
place by saying something the two node names do not.

- [x] **Step 4: Record the invariants in `CLAUDE.md`**

Add to "Invariants that bite" (match the existing entries' density and voice):

- **A shelved edge is hidden, not removed.** It stays in `view.edges` and in the React Flow array
  carrying `data.shelved`, because the reveal on hover is an *opacity* change — `highlightCss` hides
  it by id and the existing `highlightSets` reveals it. Filter it out of the edge array and hovering a
  foundational node reveals nothing.
- **Shelved edges are excluded from `routeEdges`, on purpose.** They take `fallbackRoute`'s mid-side
  anchor, so a reveal is a fan from one point. Routing them would spend ports and gutter lanes on
  invisible lines — exactly the space the shelf exists to give back.
- **The shelf band is inert chrome.** React Flow node id `SHELF_ID` (`__shelf__`),
  `pointerEvents: 'none'`, not selectable, not draggable, and no `.region__handle` — if it could
  become `hoveredId` it would dim the whole graph, and `cursor: grab` would promise a drag that does
  not exist. It is excluded from `highlightCss`'s node dim rule alongside `region` and `ghostGroup`.
- **`foundational` shelves only where the node is EXTERNAL to the focus** — automatic, since a child
  of the focus never reaches `externals`. The accepted cost is that focusing a container still shows
  its own foundational child pulling lines from its siblings.

Update the `pnpm -r test` baseline in Commands to the number Task 7 finished at, with the per-package
split, and add `nodes/ShelfBand` to the `features/canvas/nodes/` line in the file map.

- [x] **Step 5: Verify nothing contradicts the code**

Re-read each edited passage against the code as shipped. The schema in `packages/schema` wins any
disagreement. Then:

```bash
cd C:/projects/hyphae && pnpm -r test
```
Expected: unchanged from Task 7 (docs only).

- [x] **Step 6: Commit**

```bash
cd C:/projects/hyphae && git status --short
git add README.md docs/MODEL.md docs/SPEC.md skills/building-architecture-models/SKILL.md CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: a foundational node sits on a shelf, not in the graph

Documents the field in MODEL.md and SPEC.md, the shelf's behaviour in the
README, and — the part that matters most — when to reach for the mark, in the
modelling skill. The skill is what produced a model with 24 edges saying one
thing, so a field it does not mention will not get used.

CLAUDE.md records the four invariants that will bite: the edges are hidden and
not removed, they are deliberately unrouted, the band is inert chrome, and the
mark applies only across a boundary.
EOF
)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Mark `Baritone` and `Settings` on the real model

**Files:** none in git. This task edits `apps/server/hyphae-baritone.json` **through the server**, and
that file is permanently untracked — **never `git add` it.**

**Interfaces:** consumes the MCP field (Task 2) and the whole viewer path (Tasks 3-7).

**Initial marks, from the spec: `Baritone` (24 edges) and `Settings` (16). No others** — the census
showed the next-worst fans are 7 and 5, which are not yet worth the treatment.

- [x] **Step 1: Get the server up on the real model**

```bash
cd C:/projects/hyphae && HYPHAE_FILE=$PWD/apps/server/hyphae-baritone.json pnpm server
```

Two traps that cost real time:

- **A local HTTP proxy (`gost`) intercepts `curl` on this machine and returns 503 for localhost.** Use
  `curl --noproxy '*'`, or `NO_PROXY='*'` for node scripts. A 503 is almost certainly the proxy, not
  the server — check the background task's output file before concluding anything.
- **Something may already be squatting :5173** (a stale model-less server answers 503 on everything).
  `netstat -ano | grep ':5173'`, then
  `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter 'ProcessId=<pid>' | Select-Object -ExpandProperty CommandLine"`
  to confirm before killing anything.

- [x] **Step 2: Back the model up before writing to it**

Git is not a safety net for this file.

```bash
cp C:/projects/hyphae/apps/server/hyphae-baritone.json "$SCRATCH/hyphae-baritone.pre-foundational.json"
```
(`$SCRATCH` = this session's scratchpad directory.)

- [x] **Step 3: Find the two node ids**

Use the MCP: `list_nodes` with `query: "Baritone"` and `query: "Settings"`. Ids are UUIDs and
**component names repeat across containers**, so use the parent name in the enriched rows to pick the
right one — `Baritone` is the composition root with 24 outbound edges and `Settings` is the config
store with degree 16. Confirm each with `list_connections` (`nodeId`) before writing.

- [x] **Step 4: Mark them**

```
update_nodes({ updates: [
  { id: '<baritone-id>', foundational: true },
  { id: '<settings-id>', foundational: true },
]})
```

**If `foundational` comes back stripped or rejected:** the MCP process caches its code at spawn time,
so it is running the pre-Task-2 `register.ts` and its Zod param schema drops the unknown key. It
cannot be restarted mid-session. Fall back to the HTTP API directly:

```bash
curl --noproxy '*' -s -X PATCH http://localhost:5173/api/nodes/<id> \
  -H 'content-type: application/json' -d '{"foundational":true}'
```

Check the exact route and method in `apps/server/src/routes.ts` first, and remember the server rejects
a bad write with **422 plus the specific issues** — read them and retry rather than guessing.

- [x] **Step 5: Verify the model and measure the effect**

```
validate_model()    → expect []
get_node(<id>)      → expect foundational: true, for both
```

Then re-measure the fan. The previous session's scripts are at
`C:\Users\qwert\AppData\Local\Temp\claude\C--projects-hyphae\86088045-182c-4965-b4c1-430029fc02ef\scratchpad\`
— copy `fan.mjs` and `policies.mjs` into this session's scratchpad and run them with `NO_PROXY='*'`
and the server up. `fan.mjs` measures per-focus external fan-out; `policies.mjs` reports per-focus
drawn-edge counts.

The numbers the shelf has to remove **from the canvas** without removing them from the model:
`Baritone` fans **10** into Process Layer, **5** into Utilities, **4** into Behavior Layer.
(`Minecraft Client` fans 7 into Mixin Launch Layer and `Event System` 5 — those stay unmarked, by
design.)

- [x] **Step 6: Check the real model through the pure functions**

Synthetic fixtures agreed with the buggy code the last time a focus bug was hunted here; the real
model did not. Write a throwaway probe, print what you need, then **delete it**:

```ts
// apps/web/test/zz-probe.test.ts — read apps/server/hyphae-baritone.json, run buildFocusView +
// layoutFocusView over each container focus, and console.log per focus: the shelf ids and counts,
// the drawn (non-shelved) edge count vs the total, and every shelf node's slot y against the
// maximum y of everything else (the shelf must be strictly below). Delete when done.
```

Confirm: at focus `Process Layer` the shelf holds `Baritone` with a count of 10, ten edges are marked
shelved, and every shelf slot is below every other node. Then delete the file.

- [x] **Step 7: Confirm nothing model-shaped is staged, and report**

```bash
cd C:/projects/hyphae && git status --short
```
Expected: the two `*.json` models still listed as untracked (`??`) and **nothing else** — this task
produces no commit.

Then run the full verification one last time and **show the output**:

```bash
cd C:/projects/hyphae && pnpm -r test
cd C:/projects/hyphae && pnpm -r build
cd C:/projects/hyphae && pnpm --filter @hyphae/web typecheck
```

Report to the user: the marks applied, `validate_model` clean, the measured per-focus drawn-edge
change, and — explicitly — that **the rendered result has not been seen**, since there is no browser
or screenshot tooling in this environment. Hand them the command to look at it themselves:

```bash
HYPHAE_FILE=$PWD/apps/server/hyphae-baritone.json pnpm dev   # viewer on :3000
```

Do not claim any visual outcome. Ask specifically whether the shelf reads as furniture rather than as
a demoted participant, and whether the `◂ n` chip is legible at the default zoom — those are the two
things the design bets on and the two things only they can see.

---

## Self-review

**Spec coverage** — every Part 3 requirement maps to a task:

| Spec requirement | Task |
|---|---|
| `foundational: z.boolean().default(false)` on `NodeSchema`, same tier as `root` | 1 |
| Author-marked, never derived | 1 (comment), 2 (tool description), 8 (skill guidance) |
| Settable/queryable over MCP | 2 |
| Shelved only when external to the focused container | 3 (falls out of `externals`) |
| Edges not drawn | 3 (`shelved`), 5 (`data.shelved`), 6 (the CSS) |
| Count chip `◂ n` of edges to nodes in the current view | 3 (the count), 5 (the chip) |
| Laid out on a shelf, out of the graph flow | 4 |
| Hover/select reveals the edges via `highlight.ts` | 6 |
| `ConnectionList` lists them in full | 7 (verified, not assumed) |
| Form, not hue | 5 (dashed band, no fill, `--chip`), 8 (recorded in §9) |
| Initial marks: `Baritone`, `Settings`, no others | 9 |
| Testing: pure functions first; assert generated highlight CSS, never edge DOM | 3, 4, 5 (pure), 6 (`highlightCss` directly + `hlCss`) |
| Out of scope: router changes, `squared` collinear gap, bundling, re-describing labels | untouched by every task |

**Type consistency** — `ShelfItem = { node: Node; count: number }` is defined in Task 3 and consumed
as `s.node.id` / `s.count` in Tasks 4 and 5. `FocusView.shelf?: ShelfItem[]`, `FocusEdge.shelved?:
boolean`, `SHELF_GAP` (Task 4, consumed by its own tests), `SHELF_ID` (Task 5, consumed by its own
tests), `GhostNodeData.shelfCount?: number` (Task 5), `HighlightArgs.shelvedEdges?: Set<string>`
(Task 6). One name per concept, spelled the same everywhere.

**Known residual risks, stated rather than hidden:**

1. **The reveal is a fan from one mid-side point** (decision 2 above). Deliberate, and the cheap
   alternative — a second routing pass for shelved edges — was rejected as unearned complexity for a
   transient state. If it reads badly, that is a follow-up, not a defect in this plan.
2. **`fitView` will now include the shelf**, so a focus with a shelf zooms out slightly further than
   before. Expected, and visible only to the user.
3. **The MCP may be running stale code** at Task 9, since it caches at spawn. Step 4 has the
   HTTP fallback.

---

## Deviations and findings (written after execution)

All nine tasks landed. Executed **inline** (`superpowers:executing-plans`) rather than
subagent-driven: this session's harness restricts spawning agents to an explicit user request.

**1. The plan's central omission — a marked node was never the node on screen.** Task 9's real-model
probe found the shelf **empty at every container focus**, with the marks correctly set and every unit
test green. Root cause: `mapEndpoint` summarises an endpoint into its *focus-layer* representative, so
a marked **Component** (`Baritone`, in `Core Runtime`) reaching a **Container** focus was drawn as the
`Core Runtime` ghost. The mark sat on a node that never appeared, and the ten lines it was meant to
remove stayed on screen, merely re-attributed to the parent's box. Every task 1–8 test passed
throughout, because the synthetic fixtures marked a node that was *already* the external
representative — exactly the failure mode `CLAUDE.md` warns about, and the reason its guidance says to
drive the pure functions over the real model.

Fixed in `0252afc` by making a foundational node outside the focus represent **itself**, at whatever
layer it lives on (skipped when its representative is *inside* the focus, or a marked descendant would
drop a Component into a Container's cluster). Measured effect, real model:

| focus | drawn before | after | shelf |
|---|---|---|---|
| Process Layer | 38 | **27** | Baritone:10, Settings:1 |
| Behavior Layer | 20 | **12** | Baritone:4, Settings:4 |
| Utilities & Schematics | 23 | **18** | Baritone:5 |
| Command System | 32 | **28** | Settings:3, Baritone:1 |

Those per-node counts (10 / 5 / 4) are exactly what the spec predicted, which is what makes it clear
this was the spec's intent rather than an extension of it.

**2. The MCP could not perform task 9's write.** As the handoff warned, the MCP process caches its code
at spawn time, so its `update_nodes` param schema had no `foundational` and Zod stripped it. Used the
documented fallback — `curl --noproxy '*' -X PATCH http://localhost:5173/nodes/<id>`. Note the API has
**no `/api` prefix**: the routes are `/model`, `/nodes/:id`.

**3. A stale server was squatting :5173** — running the pre-change schema, so it would have stripped
the field too. Confirmed it held the right model and that the file on disk matched it (nothing
pending), backed the model up to the scratchpad, killed PID 15380, restarted on current code.

**4. Test-count arithmetic in the plan was wrong** (it predicted 734→764 by adding test *cases*; several
tasks added more than planned). Real progression: 732 → 734 → 735 → 743 → 749 → 757 → 766 → 769 → **771**.

**5. Task 2's test was rewritten.** The plan's version called the tool handlers, but `fakeApi` does not
parse through `NodeSchema`, so it could not fail for the right reason. Replaced with one that captures
the schemas the tools are *registered* with — the registration is the only place a node field can be
silently stripped.

**6. Two extra fixes taken in passing.** `docs/SPEC.md` §9 still said a connection is a "verb + object"
and that hue "belongs entirely to the verb classes", both left stale by Part 2 on this same branch.
The new `GhostNode` test casts props through `NodeProps` rather than `never`, so it does not add a
fifth error to the typecheck floor the way the older node tests would have.

**7. No visual verification was possible** — there is no browser or screenshot tooling in this
environment. Every claim above is from the test suite and from pure functions run over the real model.

## Open questions for the next round

- **A shelf item with `count: 1`.** At a Component focus the shelf routinely holds one edge behind a
  chip (`◂ 1`), which loses information for no density gain. A *display* threshold (shelve only at
  count ≥ 2 or 3) is not the authorship threshold the spec forbids, but the spec says the edges are
  not drawn unconditionally, so this was left as specced.
- **The reveal is a fan from one mid-side point** (`fallbackRoute`), by the plan's design decision 2.
  Worth re-judging once someone has looked at it.
- **`fitView` now includes the shelf**, so a focus with one zooms out slightly further than before.

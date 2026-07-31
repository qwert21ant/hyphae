# Codebase structure refactor — design

**Date:** 2026-07-31
**Status:** agreed
**Branch:** `refactor/web-structure`

A behaviour-preserving restructure of `apps/web` and `apps/server/src/mcp.ts`. Nothing the viewer
does changes; only where the code lives, how it is grouped, and one new class.

## 1. Why

Three stated pains, in the user's words:

- **Hard to navigate.** `apps/web/src` is flat: 18 `.tsx` + 12 `.ts` in one directory, with no
  signal about what belongs to what.
- **Files too big to work in.** `mcp.ts` (603), `focusView.ts` (378), `chrome.css` (349),
  `Canvas.tsx` (262) are painful to edit, for a human or an agent.
- **Style preference.** A hierarchy, OOP where it fits, CSS near its component.

Explicitly *not* a motivation: preparing for future features. No abstraction is introduced for a
consumer that does not exist yet.

## 2. Principles

These are the rules the refactor follows, and the rules that get written into `CLAUDE.md` at the
end (§9).

1. **A file has one job.** Components render; pure modules compute; hooks bind the two. When a
   component holds a `useMemo` chain longer than its JSX, that chain is a hook or a pure module.
2. **A class earns its place by deleting duplication, not by being a class.** Reach for one when
   several functions share the same derived state and each re-derive it. Otherwise export a
   function. React components stay functions — class components cannot use hooks.
3. **A feature folder owns its components, its pure logic and its CSS.** `core/` holds only what
   two or more features import.

## 3. Target tree — `apps/web/src`

```
src/
  main.tsx
  App.tsx
  app.css
  styles.css                    the ordered CSS index (§7)
  features/
    canvas/
      Canvas.tsx                composition + JSX only
      useCanvasView.ts          the memoized view pipeline
      useDrillNavigation.ts     drill + double-click detection
      highlight.ts              highlightCss() — pure
      flowEdges.ts              displayEdges labelling + ephemeral edges
      layout.ts
      reactflow.ts
      shapes.ts
      patternView.ts
      flowOverlay.ts
      canvas.css
      nodes/
        NodeBox.tsx  NodeShape.tsx  GroupNode.tsx
        GhostNode.tsx  GhostGroupNode.tsx  PatternMemberNode.tsx
      edges/
        FloatingEdge.tsx  floating.ts
      overlay/
        Legend.tsx  FilterPanel.tsx
    outline/
      TreePanel.tsx  outline.css
    inspector/
      SidePanel.tsx  ConnectionList.tsx  FieldRows.tsx
      fieldLayout.ts  inspector.css
    toolbar/
      Toolbar.tsx  Altimeter.tsx  SearchBox.tsx  toolbar.css
  core/
    NodeTree.ts
    focusView/
      index.ts  buildFocusView.ts  edges.ts  types.ts
    stepReveal.ts
    connections.ts
    breadcrumb.ts
    hashRoute.ts
    verbColors.ts
  state/
    store.ts  api.ts  theme.ts
  styles/
    tokens.css  base.css
```

**Path alias.** A `@/` alias mapping to `src/` is added to `apps/web/tsconfig.json` (`paths`),
`vite.config.ts` and `vitest.config.ts` (`resolve.alias`) — all three, or tests and build disagree.
Imports read `@/core/NodeTree`, never `../../../core/NodeTree`.

**`core/verbColors.ts`** exists because `VERB_CLASS_COLOR` currently lives in `reactflow.ts` but is
imported by `ConnectionList`, `FilterPanel` and `Legend` — two of which are not canvas code. The
colour maps (`VERB_CLASS_COLOR`, `LAYER_COLOR`) move to `core/`; the React Flow adapters stay in
`features/canvas/reactflow.ts`.

## 4. The one class — `core/NodeTree.ts`

This is where the OOP ask pays and the only new class in `apps/web`.

Today `representativeWith`, `childOfFocus`, `rootAncestor`, `depthOf` (inside `stepReveal`) and
`breadcrumbPath` each rebuild `new Map(model.nodes.map(n => [n.id, n]))` and each re-implement the
same `seen`-guarded parent walk — five copies of one loop. `buildFocusView` then threads that map
through every helper by hand.

```ts
export class NodeTree {
  constructor(model: HyphaeModel);
  get(id: string): Node | undefined;
  has(id: string): boolean;
  parentOf(node: Node): string | null;     // null when the parent is absent from the model
  ancestors(id: string): Node[];           // the single cycle-guarded walk
  depthOf(node: Node): number;
  rootAncestor(id: string): string;
  childOf(id: string, ancestorId: string): string | null;
  layerOf(id: string): string;
  representativeAt(id: string, focusId: string | null, focusLayer: string): string;
}
```

Constructed once per call site and passed to whatever needs it. Every existing walk is
cycle-guarded today and must remain so — `ancestors()` is the single place that guard now lives.

`representative(model, endpointId, focusLayer)` stays exported as a free function for existing
callers; it constructs a `NodeTree` internally.

## 5. File splits

### 5.1 `focusView.ts` (378) → `core/`

It holds four unrelated jobs. Split by job, not by size:

| Destination | What moves |
|---|---|
| `core/NodeTree.ts` | `representativeWith`, `childOfFocus`, `rootAncestor`, `focusLayerOf`, `depthOf`, `representativeAtFocus` |
| `core/focusView/types.ts` | `FocusView`, `FocusEdge`, `ConnFilter`, `Audience` |
| `core/focusView/buildFocusView.ts` | the pipeline: endpoint mapping, `expanded`/`absorbed` reconciliation, externals, external groups |
| `core/focusView/edges.ts` | `realEdgeOf`, `aggregateEdgeOf`, pair grouping, `matchesFilter` |
| `core/focusView/index.ts` | re-exports, so `@/core/focusView` stays one import site |
| `core/stepReveal.ts` | `stepReveal` + its `StepReveal` type — flow-step navigation, used by `store` and `TreePanel` |
| `core/connections.ts` | `partitionConnections`, `externalConnections` — inspector only |
| `core/breadcrumb.ts` | `breadcrumbPath` + its `Crumb` type — altimeter only |

A type lives with the function that produces it, not in a shared types file — `types.ts` holds only
what `buildFocusView.ts` and `edges.ts` both need.

The long explanatory comments move **with** the code they explain. They are the most valuable thing
in this file — the granularity reconciliation and the `stepReveal` rationale are not re-derivable
from the code.

### 5.2 `Canvas.tsx` (262) → `features/canvas/`

Four tangled concerns:

| Destination | What moves | Lines today |
|---|---|---|
| `useCanvasView.ts` | `baseView` → `basePositions` → `view` → `positions` → `focusViewToFlow`, plus `overlay`, `pattern`, `patternFlow`, and the `setOffViewSteps` effect | 57–89 |
| `flowEdges.ts` | `displayEdges` — step labelling and ephemeral edge construction | 94–124 |
| `highlight.ts` | `highlightCss(...)` as a pure function taking plain values | 126–198 |
| `useDrillNavigation.ts` | `drill`, `onNodeClick`, the double-click-from-click-stream ref | 205–225 |
| `Canvas.tsx` | composition + JSX, ~80 lines | rest |

`highlightCss` is already pure — it is only trapped inside a `useMemo`. Extracting it makes it
directly callable, but **the existing `hlCss(container)` tests in `Canvas.test.tsx` are not
rewritten**; they still pass and still assert the real integration.

The invariants in this file's comments are load-bearing and must survive the move verbatim: the
memo-key rule (`[model, focusId]` only), the `!important` specificity note, the "no border-radius
here" note, and the reason the highlight is injected CSS rather than rebuilt node objects.

### 5.3 `apps/server/src/mcp.ts` (603) → `apps/server/src/mcp/`

```
mcp/
  index.ts        registerAll() + StdioServerTransport wiring
  api.ts          the HyphaeApi interface + CreatedEntity/ApiResult types
  params.ts       shared zod tool params (flowStepSchema, flowItemSchema, patternMemberSchema, …)
  tools/
    nodes.ts  connections.ts  flows.ts  patterns.ts
    query.ts        model_overview, list_*, get_*, get_subgraph, rollup_connections, resolve_refs
    validate.ts     validate_model, model_gaps, describe_profile
```

Each `tools/*.ts` exports a `register<X>(server, api)` function. `index.ts` calls them in order.
The tool names, descriptions and parameter schemas are the MCP contract and change **not at all** —
`apps/server/test/mcp.test.ts` (553 lines) is the guard.

### 5.4 Left alone, deliberately

- **`TreePanel.tsx` (265)** — one cohesive component. Splitting it would be structure for its own
  sake, against principle 1.
- **`packages/schema`** — already one concept per file.
- **`apps/server/src/{store,routes,errors,index}.ts`** — `ModelStore` is already a class; the rest
  are small and single-purpose.

## 6. What stays a function

For the record, so this is not revisited:

- **Every React component.** Class components cannot use hooks.
- **The Zustand store.** It is a function factory by design; its modularity story is slices.
- **`hashRoute`, `shapes`, `floating`, `fieldLayout`, `theme`, `layout`.** Stateless transforms —
  a class would be a hollow namespace wrapper.

## 7. CSS

`chrome.css` (349) splits along the feature seams; `canvas.css` moves into `features/canvas/`.
`tokens.css` and `base.css` stay global in `styles/`.

`styles.css` becomes the ordered index, and **its order is the cascade**:

```css
/* The order of these imports IS the cascade. Rules across these files use equal-specificity
   class selectors, so source order is the only thing deciding which one wins. A modifier that
   must beat a class belongs in a file listed BELOW the file declaring it. */
@import './styles/tokens.css';
@import './styles/base.css';
@import './features/canvas/canvas.css';
@import './features/outline/outline.css';
@import './features/inspector/inspector.css';
@import './features/toolbar/toolbar.css';
@import './app.css';
```

No `.tsx` imports a stylesheet. Per-component CSS imports were rejected: they make the cascade the
module-graph order, which shifts silently when anyone reorders an import, and the suite cannot
catch the resulting visual regression. CSS Modules were rejected as too large a diff for the
benefit — React Flow's classes are global and would stay unscoped anyway, so the model would be
mixed regardless.

**Conventions that survive unchanged:** `base.css` remains the only file allowed element/ID/pseudo
selectors; every other file is class-and-attribute only. A modifier is declared after the class it
narrows — now meaning "in a file listed later in `styles.css`", or later within the same file.

**Test impact:** `tokens.test.ts` already walks `src/` recursively, so the no-colour-literals and
token-reachability assertions keep working with no change. `contrast.test.ts` reads
`src/styles/tokens.css` by fixed path, which does not move. The `rule(css, selector)` assertions in
`TreePanel.test.tsx` need their `readFileSync` path repointed at `outline.css`; the selectors and
the assertions themselves do not change.

## 8. Verification

The refactor is behaviour-preserving. The bar:

- **`pnpm -r test` stays at 662 green** — 147 schema, 107 server, 408 web, across 44 test files.
  Baseline confirmed green on `master` at 20a74f4 before any change.
- **No test's assertions change.** Only import paths, file locations, and the two `readFileSync`
  paths in the CSS tests. **If a test needs its assertions rewritten, behaviour changed — stop and
  investigate rather than adjusting the test.** This is the single most important rule of the
  refactor: the test suite is the only thing standing between a large mechanical diff and a silent
  regression.
- **`pnpm -r build` passes**, and `tsc` is clean under the new alias in all three configs.
- **Test files mirror `src`** — `apps/web/test/` grows the same `features/`/`core/`/`state/` shape.

Roughly 80 pre-existing `act(...)` warnings in the web suite are noise, not a regression.

### Not covered by tests

Two things the suite provably cannot check, which need a human look in the browser before merge:

- **Cascade order after the CSS split.** jsdom loads no external stylesheet, so nothing in
  `src/styles/` is observable in the DOM and nothing is measured. A modifier landing in the wrong
  file is invisible to the suite.
- **Anything React Flow renders.** Zero edges render in jsdom and edge labels portal out, so the
  canvas's actual appearance is unverifiable here.

## 9. `CLAUDE.md` update

The final commit rewrites the affected sections:

- the "Where the documentation lives" area gains a map of the new `apps/web/src` tree;
- the three principles from §2, as the codebase's structural conventions;
- the CSS section: the cascade rule restated as "order in `styles.css`", plus which file owns what;
- "Testing gotchas": paths updated, and the `rule(css, selector)` note repointed;
- "Invariants that bite": the focus-view pipeline and Canvas invariants keep their content but
  reference the new file names.

## 10. Commit sequence

On `refactor/web-structure`, one commit per coherent cluster:

1. `docs:` this spec
2. `docs:` the implementation plan
3. `refactor(web):` path alias + move files into the tree (no content changes)
4. `refactor(web):` extract `NodeTree`, collapse the five duplicated walks
5. `refactor(web):` split `focusView` into its four jobs
6. `refactor(web):` split `Canvas` into hooks + pure modules
7. `refactor(web):` split the CSS, add the ordered index
8. `refactor(server):` split `mcp.ts` into `mcp/`
9. `docs:` update `CLAUDE.md`

Each commit must leave `pnpm -r test` at 662 green. `apps/server/hyphae-baritone.json` is untracked
and stays that way — stage explicit paths, verify with `git status --short` before each commit.

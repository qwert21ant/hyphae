# Hyphae — working notes

Local visual **viewer** for a C4-style architecture model, written by LLM agents over MCP.
pnpm workspaces: `apps/web` (Vite/React/@xyflow), `apps/server` (Hono API + SSE + MCP),
`packages/schema` (Zod — the single source of truth for types, the API, and the MCP tool params).

## Where the documentation lives

| Read this | For |
|---|---|
| `README.md` | how to run it, the viewer's behaviour, the HTTP API, the full MCP tool list |
| `docs/MODEL.md` | the model *concept* — axes, first-class entities, Refs/roots, profiles |
| `docs/SPEC.md` | the *product* — scope, data model per entity, UX principles, phased roadmap |
| `skills/building-architecture-models/SKILL.md` | how a model gets built from a repo (phases + gates) |
| `docs/superpowers/{plans,specs,reviews}/` | **historical records, dated.** Read for context; do not rewrite them |

`README.md`, `docs/MODEL.md`, `docs/SPEC.md` and the skill are the **living** docs — when behaviour
changes, they change in the same branch. Keep the schema, the docs, and the skill consistent: the Zod
schema in `packages/schema` wins any disagreement.

## Where the code lives

    apps/web/src/
      main.tsx  App.tsx  app.css
      styles.css                    the ordered CSS index — its @import order IS the cascade
      features/
        canvas/      Canvas.tsx  useCanvasView.ts  useDrillNavigation.ts
                     highlight.ts  flowEdges.ts  layout.ts  reactflow.ts
                     shapes.ts  patternView.ts  flowOverlay.ts  canvas.css
                     nodes/    NodeBox  NodeShape  GroupNode  GhostNode
                               GhostGroupNode  PatternMemberNode
                     edges/    FloatingEdge.tsx  ports.ts  lanes.ts  paths.ts
                               routeEdges.ts
                     overlay/  Legend.tsx  FilterPanel.tsx
        outline/     TreePanel.tsx  outline.css
        inspector/   SidePanel.tsx  ConnectionList.tsx  FieldRows.tsx
                     fieldLayout.ts  inspector.css
        toolbar/     Toolbar.tsx  Altimeter.tsx  SearchBox.tsx  toolbar.css
      core/          NodeTree.ts  stepReveal.ts  connections.ts  breadcrumb.ts
                     hashRoute.ts  verbColors.ts
                     focusView/  index.ts  buildFocusView.ts  edges.ts  types.ts
      state/         store.ts  api.ts  theme.ts
      styles/        tokens.css  base.css

    apps/server/src/
      index.ts  routes.ts  store.ts  errors.ts
      mcp/         index.ts  api.ts  params.ts  register.ts
                   tools/  index.ts  shared.ts  nodes.ts  connections.ts
                           flows.ts  patterns.ts  query.ts  validate.ts

`apps/web/test/` **mirrors `src/`** — `test/features/canvas/nodes/NodeBox.test.tsx` sits opposite
`src/features/canvas/nodes/NodeBox.tsx`.

Web imports use the **`@/` alias** (`@/core/NodeTree`, never `../../../core/NodeTree`), with one
exception: a file in the **same directory** is imported as `./Name`. A *child* directory is not a
sibling — `Canvas.tsx` reaches `nodes/NodeBox` through the alias — so `./` in an import always means
"the file next to this one", and nothing else. The alias is declared in **three** files and all
three must agree: `apps/web/tsconfig.json` (`paths`),
`vite.config.ts` and `vitest.config.ts` (`resolve.alias`). The vitest config is standalone — it does
*not* inherit vite's `resolve` — so adding the alias in only two of them leaves tests or the build
resolving nothing, depending on which one you missed.

### The three structural conventions

1. **A file has one job.** Components render; pure modules compute; hooks bind the two. A component
   whose `useMemo` chain is longer than its JSX is hiding a hook or a pure module — that is exactly
   what `Canvas.tsx` was before it became `useCanvasView` + `highlight` + `flowEdges` +
   `useDrillNavigation` + ~80 lines of JSX.
2. **A class earns its place by deleting duplication, not by being a class.** `core/NodeTree.ts` is
   the only class in `apps/web`, and it exists because five functions each rebuilt the same id→node
   map and each re-implemented the same cycle-guarded parent walk. Absent that kind of shared derived
   state, export a function. Components stay functions (class components cannot use hooks); so do the
   Zustand store and the stateless transforms — `hashRoute`, `shapes`, `floating`, `fieldLayout`,
   `theme`, `layout`. A class around any of those is a hollow namespace.
3. **A feature folder owns its components, its pure logic and its CSS.** `core/` is the **model
   layer**: pure logic over the model, independent of any feature's UI. A module earns a place there
   by being readable and testable knowing only `@hyphae/schema` — it must not render, must not import
   a feature's components, hooks or stylesheet, and must not be where a helper lands merely because
   no feature wanted it. Being imported by two features is *not* the test, and never was:
   `breadcrumb.ts` has one caller (the toolbar), `connections.ts` one (the inspector), `hashRoute.ts`
   one (`App.tsx`), and `NodeTree.ts` is used only by its `core/` neighbours. A non-canvas file
   importing `features/canvas/*` internals is a layering bug — that is why `core/verbColors.ts`
   exists: `VERB_CLASS_COLOR`, `LAYER_COLOR` and `layerColorOf` are read by
   `features/inspector/ConnectionList.tsx` as well as by the canvas's own `overlay/FilterPanel.tsx`,
   `overlay/Legend.tsx` and `reactflow.ts`, so they left `reactflow.ts` and the React Flow adapters
   stayed behind. Importing a feature's public *component* (`App.tsx` importing `Canvas`) is fine.

## Commands

    pnpm dev            # server (:5173) + web (:3000) in parallel
    pnpm server         # API + SSE on :5173, owns ./hyphae.json (override with HYPHAE_FILE)
    pnpm web            # viewer on :3000, proxies the API
    pnpm mcp            # MCP server — an HTTP client of the above, so the server must be running
    pnpm -r test        # baseline 693 green: schema 147, server 107, web 439 (29 files)
    pnpm -r build
    pnpm --filter @hyphae/web typecheck   # tsc --noEmit — NOT part of build; see below

## Testing gotchas

These cost real time when rediscovered:

- **Never run bare `pnpm vitest run` from the repo root.** There is no root vitest config, so web
  tests run without jsdom and report dozens of bogus failures. Use `pnpm -r test`, or `cd apps/web`
  first (jsdom lives in `apps/web/vitest.config.ts`).
- **React Flow renders zero edges in jsdom** (nodes are never measured), and edge labels portal into
  `.react-flow__edgelabel-renderer`. You cannot assert edge or label DOM. Assert the **generated
  highlight CSS** instead — see the `hlCss(container)` pattern in
  `apps/web/test/features/canvas/Canvas.test.tsx`, which reads the `<style data-hyphae-hl>` element
  `Canvas.tsx` injects — or test the pure function underneath. `highlightCss` now lives in
  `apps/web/src/features/canvas/highlight.ts` and is **directly callable**, so a new test should call
  it with plain values rather than render the canvas; the existing `hlCss` tests stay as the
  integration guard.
- A component rendering React Flow `Handle`s needs a `ReactFlowProvider` wrapper in tests
  (`NodeBox.test.tsx`, `PatternMemberNode.test.tsx`).
- **The resizable panels need jsdom stubs.** `react-resizable-panels` calls `ResizeObserver`,
  `matchMedia` and `setPointerCapture`, none of which jsdom implements; `apps/web/test/setup.ts`
  provides them. Elements are never measured, so panel *sizes* are untestable — assert the
  `role="separator"` structure (`aria-orientation` is perpendicular to its group) instead.
- **jsdom loads no external stylesheet**, so no stylesheet anywhere in `src/` is observable in the
  DOM, and nothing is ever measured. To pin a CSS invariant, read the file and assert the rule — see
  the `rule(css, selector)` helper in `test/features/outline/TreePanel.test.tsx`, which reads
  `src/features/outline/outline.css`. **Anchor such a regex to the start of a line**
  (`^\.tree-label\s*\{`): unanchored, `.tree-label {` also matches inside
  `.tree-row:hover .tree-label {`, so the assertion silently reads a different block. Assert the
  rule was found at all, too — a renamed selector otherwise passes as an empty string.
- **`process.cwd()` is what makes the mirrored test tree safe.** Fixture and CSS paths resolve from
  the *package* root (`resolve(process.cwd(), 'src/features/outline/outline.css')`), not from the
  test file, so a test can sit at any depth without its `readFileSync` paths changing. Do **not**
  reach for `import.meta.url` here: under jsdom it is an **http** URL, not a file one.
- **A raw NUL byte makes a file invisible to grep.** `features/canvas/reactflow.ts` contained two (a
  literal control character where the `\0` escape was meant). ripgrep and grep classify such a file
  as binary and skip it **with no error at all**, so a mechanical rename sweep misses it silently. If
  a sweep looks like it skipped a file, run `file <path>` and check for `data`.
- **`apps/web`'s `build` script is `vite build`, which does NOT typecheck.** It fails on an
  unresolvable module specifier but happily ships a *wrong named export*. `pnpm typecheck`
  (`tsc --noEmit`) is a separate script and is **not** part of `pnpm -r build`; run it explicitly
  after any import-touching change. It currently has a **pre-existing 4-error floor**, all in test
  files (three `TS2698` spread errors, one `Model` import in `Altimeter.test.tsx`) — 4 errors is
  clean, 5 is yours. `apps/server`'s build is `tsc -p`, so that one does typecheck.
- Roughly 80 `act(...)` warnings in the web suite are **pre-existing noise**, not your change.
- The store is a module-level singleton: reset the slice you touch in `beforeEach`, and let the
  initial `loadModel()` settle (`await new Promise(r => setTimeout(r, 0))`) before seeding a model in
  a test that renders `<App />`, or the async load overwrites it.

## Styling — the rules the suite enforces

The viewer has one design rule: **luminance is state, hue is meaning.** Altitude, selection and focus
are light levels with no hue; the five `--verb-*` tokens own the whole chromatic budget; violet means
only "rolled-up edge", `--accent` only interaction, `--warn` only an invalid flow/pattern. Giving a
structural distinction a hue, or a semantic one only a luminance step, is a design bug — reach for a
difference in **form** instead (this is why a pattern's kind is a chip, not a colour). `docs/SPEC.md`
§9 states the rule; `apps/web/src/styles/tokens.css` is the authoritative value for every colour,
type step and space step.

Four of these are tests, not preferences (`test/styles/tokens.test.ts`, `test/styles/contrast.test.ts`
— `tokens.test.ts` walks `src/` recursively, so the CSS split did not change what it covers):

- **No colour literal anywhere in `apps/web/src` outside `tokens.css`** — no hex, no `rgb()`/`hsl()`.
- **Every token declared in `:root` must be referenced somewhere**, and every `var()` must resolve.
  Both directions fail the suite, so moving a rule's last use of a token kills the token.
- **Every colour token must exist in both themes.**
- **33 foreground/background pairs are measured at 4.5:1, in both themes.** When one fails, retune
  the token — **never** loosen the threshold.

Conventions the suite does *not* enforce — jsdom loads no stylesheet, so nothing below is testable:

- **`base.css` is the reset layer** and is the only file allowed element/ID/pseudo selectors. Every
  other stylesheet is **class and attribute selectors only** — no element types.
- **The `@import` order in `src/styles.css` IS the cascade.** Because every rule outside `base.css`
  is an equal-specificity class selector, source order is the only thing deciding which one wins, and
  source order is that file's list: `styles/tokens.css` → `styles/base.css` →
  `features/canvas/canvas.css` → `features/outline/outline.css` → `features/inspector/inspector.css`
  → `features/toolbar/toolbar.css` → `app.css`. **A modifier belongs in a file listed BELOW the one
  declaring the class it narrows** (or later within the same file). The worked example is
  `.tree-kind`: it is a `.chip` modifier, so it lives in **`inspector.css` next to `.chip`** — *not*
  in `outline.css`, despite the name and despite `TreePanel.tsx` being the only thing that renders
  it. Move it "where it belongs" by name and it stops beating `.chip`.
- No `.tsx` imports a stylesheet. Per-component CSS imports would make the cascade the module-graph
  order, which shifts silently when anyone reorders an import — and the suite cannot see it.

## Invariants that bite

- **Edge geometry is ASSIGNED globally and RESOLVED locally.** `routeEdges` (`edges/routeEdges.ts`)
  picks a side, a port index and a lane per edge, memoized per view in `useCanvasView`; it returns
  no absolute node coordinates. `FloatingEdge` resolves that against `useInternalNode` every render.
  That split is why dragging reads well: positions reach the store only on `onNodeDragStop`, so the
  port and lane stay fixed while the endpoints track the node every frame, and the port snaps on
  release instead of sliding along the border. Compute endpoints in the assignment pass and the
  edges detach from the node mid-drag.
- **Routing runs AFTER `decorateFlowEdges`.** Decoration is what creates a flow's ephemeral step
  edges, so routing first leaves them with no `Route` and they fall back to a mid-side anchor. This
  is why `decorateFlowEdges` lives in `useCanvasView` and not in `Canvas.tsx`. Canvas still uses the
  UNDECORATED `edges` for `present`, `childIds` and `highlightSets` — swap those for `displayEdges`
  and ephemeral flow edges quietly join the highlight sets.
- **A port grid is a preference, not a cap.** A left/right side carries only 3 ports
  (`NODE_H` 92 / `PORT_PITCH` 24) and a hub can want twelve. Clamping the overflow to the last port
  stacked nine edges on one landing point and cost *more* crossings than the free-anchor router it
  replaced. `routeEdges` therefore uses `count = max(portCount, n)`, so a crowded side degrades to a
  continuum and every edge keeps a distinct anchor. Pinned by "never lands two edge ends on the same
  point" in `crossings.real.test.ts`.
- **`COL_GAP` is derived, not constant.** `layoutFocusView` places the external columns twice: lane
  demand depends only on the *y* spans of the runs, and a column's y is fixed by `midY` and
  `ROW_GAP` while `COL_GAP` moves only x — so the provisional placement yields an exact lane count
  and re-placing at the widened gap cannot invalidate it. A test asserting a literal external x will
  break; assert the relationship (gap ≥ 120) instead.
- **`curved` is the default edge style for a measured reason.** An external column feeding a cluster
  is a converging *fan*, and orthogonal runs sweep across one another's lanes going in: on Baritone
  API, free-anchor 476 crossings, curved 530, squared 657. Do not "fix" the default back to squared
  without re-measuring — `crossings.real.test.ts` records the budget. **Squared reads as the more
  structured of the two** and is the better default once the known gap below is closed.

**Known gap — `squared` draws collinear overlapping segments.** Reported after the router shipped;
not yet fixed. Ports are distinct *per node*, but two different nodes can carry ports at the same
`y` — children sharing a dagre rank, or externals on the `ROW_GAP` column pitch — so their
horizontal approach runs into a gutter are collinear and overlap exactly, drawing as one thick line
instead of two edges. Lane-less edges have the same failure at the dogleg, which `squaredPath`
always turns at the midpoint, so two edges between the same pair of ranks turn at the identical `x`.
Neither case is caught by `crossings.real.test.ts`: `countCrossings` counts *proper* intersections
and deliberately ignores collinear overlap, so overlapping runs score zero. Fixing it means
staggering the approach `y` (or the dogleg `x`) per edge — a jog offset, the same idea as the lane
index — and adding an overlap metric next to the crossing one.
- **Focus-view pipeline:** `buildFocusView` (`core/focusView/`) → `layoutFocusView` (on the
  *collapsed, unfiltered* base view) → `applyDragOverrides` → `resolveViewPositions` →
  `applyDragOverrides` again (all three `features/canvas/layout.ts`) → `focusViewToFlow`
  (`features/canvas/reactflow.ts`). Wired in `features/canvas/useCanvasView.ts`; base positions are
  memoized on `[model, focusId]` only, so the connection filter, the audience toggle, and expanding
  an external never reflow the graph.
- **Drag overrides are applied to the BASE SLOTS, not only to the finished positions** — that is
  what the doubled `applyDragOverrides` is for. An expanded external is drawn as a group anchored at
  its *collapsed ghost's base slot*, so overriding only the resolved positions left the group
  anchored where dagre put it: drag an external, expand it, and it teleported back. The second pass
  exists for ids that live only in the resolved view — a group's own members — which have no base
  slot to override. Pinned by "a dragged external survives being expanded" in `Canvas.test.tsx`.
- **A containment box is dragged by its title bar and carries its contents.** `region` and
  `ghostGroup` carry `dragHandle: '.region__handle'` (`GROUP_GRIP` in `reactflow.ts`); the box is
  `pointer-events: none` and only that strip takes pointer events, or the box — which spans the whole
  cluster — would swallow every click meant for the nodes and edges inside it. Neither box is a React
  Flow *parent* (children are absolute siblings), so `Canvas.tsx` moves the members itself: locally
  per frame, committed on drop by **`dragCommit`** (`layout.ts`, pure and unit-tested — the logic
  lived in an event handler and was both wrong and untestable there). A **ghost group commits its own
  id**, since that id IS its collapsed ghost's base slot, so the move survives collapsing; a
  **region commits every child**, since it has no slot of its own.
  `GhostGroupNode`'s collapse caret needs `nodrag` or pressing it starts a drag.
- **A member dragged out of a group stops deriving from that group's slot**, so moving the group
  afterwards must shift the member's own override by the same delta — `dragCommit` does this, and
  only for members that actually carry an override (pinning the others would freeze them). Without
  it the dragged member stays behind while its siblings follow the slot, and the group visibly tears
  apart on release while looking correct throughout the drag.
- **A ghost group is ANCHORED at its base slot but DRAWN wrapping its members**, and the two are
  only equal while member 0 is still the topmost one. Drag member 0 below its siblings and the box
  sits a whole `MEMBER_PITCH` lower than its slot. So a group drag commits `slot + delta`, never the
  box's own position — hence `DragState.slot`, captured from `useCanvasView`'s `slots`. Commit the
  box position instead and every still-derived member is re-placed a row down on release.
- A node with **no base slot gets no position** and renders at the origin, on top of everything else.
  If nodes stack up in a corner, look here first.
- **`expandedExternals` is for nodes OUTSIDE the focus.** Expanded groups are laid out in the
  external columns, so expanding a node that is drawn *inside* the view stacks a group box over the
  cluster. `stepReveal` (`core/stepReveal.ts`) guards this.
- **Pattern member React Flow nodes are keyed by member NAME, not a node id.** Never use one as a
  focus id; navigate via the member's `nodeId` — `drill()` in `features/canvas/useDrillNavigation.ts`
  checks ids against `model.nodes`.
- **URL routes are fully prefixed:** `#node/<id>`, `#flow/<id>`, `#pattern/<id>`. A bare `#<id>` is
  not a route — it rewrites to root. Precedence is pattern > flow > focus.
- The server rejects a bad write with **422 + the specific issues**; there is no whole-model write
  endpoint. This is the MCP tools' contract for a bad write — the issues come back specific enough
  to fix and retry; the browser has no write path of its own left to resync.
- **`TreePanel` is controlled by `App`.** `onResize` → `isCollapsed()` is the only authority on
  `outlineCollapsed`; reintroducing local collapse state in `TreePanel` silently breaks drag-collapse,
  since a drag past the edge never calls the lifted toggle.
- **React Flow paints its edge layer BELOW its node layer** (`GraphView` renders `EdgeRenderer` ahead
  of `NodeRenderer`), and both default to z-index 0 — so any opaque node covers any edge. The two
  containment boxes are opaque and span the whole cluster, so they carry `zIndex: -1`
  (`BOUNDARY_Z` in `features/canvas/reactflow.ts`). Drop that and every edge inside a region
  disappears.
- **A node's DOM must not outgrow its React Flow wrapper.** `.react-flow__node` is `border-box` and
  sized from the inline width/height; a child at `width:100%` *with a border* under the default
  content-box renders wider and taller than it, overflowing right and bottom. `.region` and `NodeBox`
  both set `box-sizing: border-box` for this reason.
- **The selection/hover ring is a `box-shadow` on React Flow's own node wrapper**, built by
  `highlightCss` in `features/canvas/highlight.ts` and injected by `Canvas.tsx` as a
  `<style data-hyphae-hl>` element. It traces the *wrapper's* box and is clipped by the *wrapper's*
  radius, so that radius lives permanently in `features/canvas/canvas.css` per node type — put it in
  the highlight rule and it snaps back to 0 while the shadow is still fading out.
- **The row is the item, in the outline and the altimeter.** The row/band owns the click, the hover
  and the cursor; the label inside stays a `<button>` only so it is keyboard-reachable, and its click
  bubbles. A `:hover` on an inner element makes one item light up in pieces. Anything inside that
  navigates *elsewhere* (a pattern's anchor, the twisty) must `stopPropagation`.

## Working with a built model

`apps/server/hyphae-baritone.json` is a **real model** built from the Baritone repo. It is
**permanently untracked — never `git add` it** (same for any other `*.json` model). Verify with
`git status --short` before every commit.

The server owns exactly one model file at a time, so **which model the MCP answers about is decided
by how the server was started**:

    HYPHAE_FILE=/abs/path/hyphae-baritone.json pnpm server

Under Claude Code you do **not** run `pnpm mcp` yourself — `.mcp.json` launches it (with
`HYPHAE_SERVER=http://localhost:5173`) at project scope; check `/mcp` if the tools are missing. But
the MCP is only an HTTP client, so the Hyphae **server must be running** or every tool call fails.
Run `pnpm mcp` by hand only for a standalone, non-Claude-Code client.

**To answer a question about a built model, query the MCP — do not grep the JSON.** The tools are
listed in full in `README.md`; the ones that answer most questions:

- `model_overview`, `list_nodes` (`parentId` / `type` / `query` / `maxLayer` filters), `get_node`
- `list_connections` (`nodeId`, `containerId`, `crossingBoundary`, `involvingExternal`),
  `rollup_connections`, `get_subgraph`
- `list_flows` / `get_flow`, `list_patterns` / `get_pattern`, `resolve_refs`
- `validate_model` (structure/fields) and `model_gaps` (coverage: orphans, thin descriptions)

Ids are UUIDs and **component names repeat across containers** — `list_nodes` with a `query` returns
the parent name for disambiguation. Flow steps reference nodes by id (`from`/`to`) and a connection
by `via` (often absent); pattern members bind `nodeId` or `ref` or neither.

**To check rendering/behaviour against real data**, drive the pure functions over the real model in a
throwaway test file, print what you need, then delete the file. This is how the flow-step focus bug
was found — synthetic fixtures agreed with the buggy code, the real model did not:

    // apps/web/test/zz-probe.test.ts — read hyphae-baritone.json, run stepReveal/buildFocusView/
    // layout/computeFlowOverlay over every flow step, console.log the outcome. Delete when done.

## Superpowers skills — when

- **`superpowers:brainstorming`** — before designing any feature or new UI surface. Comes *before* planning.
- **`superpowers:writing-plans`** — turn an agreed design into `docs/superpowers/plans/YYYY-MM-DD-<name>.md`
  with checkboxed tasks. Plans are tracked in git; tick the boxes as you implement.
- **`superpowers:subagent-driven-development`** — the default way to implement a written plan: a fresh
  subagent per task, reviewed between tasks. Confirm any "open design decisions" section with the user
  *before* writing code.
- **`superpowers:executing-plans`** — implement a plan inline instead, when the tasks are too coupled to
  hand off one at a time.
- **`superpowers:test-driven-development`** — red first, especially for the pure functions (`focusView`,
  `hashRoute`, `flowOverlay`, `layout`, `patternView`) and for every bugfix.
- **`superpowers:systematic-debugging`** — for **any** bug or test failure, before proposing a fix. Find the root
  cause; symptom fixes are failures. Prefer verifying the hypothesis against the real model.
- **`superpowers:verification-before-completion`** — run `pnpm -r test` and show the output before claiming
  anything is done.
- **`superpowers:requesting-code-review`** / **`superpowers:receiving-code-review`** — on a substantial feature.
- **`superpowers:finishing-a-development-branch`** — when a branch is complete and needs integrating.

Spawn subagents freely — no need to ask first. Plan execution is subagent-driven by default.

**Run the chain without check-ins.** Once the design is agreed and the open questions are answered,
go brainstorm → spec → plan → implementation straight through: write the spec, commit it, write the
plan, commit it, then implement it subagent-driven **without asking which mode to use or whether to
proceed**. Stop mid-chain only for a question that genuinely needs the user's decision — one where
different answers produce materially different work, and no sensible default exists. Reporting
progress between tasks is fine; asking permission to continue is not.

## Git conventions

- **Every new feature gets its own branch off `master`** (`feat/…`, `fix/…`), cut *before* the first
  commit of the work — the spec commit included. One commit per coherent cluster, merged when green.
  Isolated doc/config fixes still go straight to `master`.
- **The spec and the plan are always committed**, each on its own commit as it is finished: the spec
  (`docs/superpowers/specs/…`) before the plan is written, the plan
  (`docs/superpowers/plans/…`) before implementation starts. They are the branch's first two commits.
- Conventional commits with a scope: `feat(web):`, `fix(web):`, `docs:`, `chore:`. Explain *why* in
  the body, not just what.
- **On a feature branch, commit without asking** — the spec, the plan, and each task's commit as the
  plan specifies. **Ask before pushing, before merging to `master`, and before committing directly to
  `master`.** Stage explicit paths — never `git add -A`.
- End commit messages with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

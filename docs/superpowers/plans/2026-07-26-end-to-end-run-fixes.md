# End-to-End Run Fixes — Workflow, UI Bugs, Shapes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the issues found in the first full end-to-end modeling run against a fresh repo
(`apps/server/hyphae-baritone.json`), across three clusters: (A) the modeling skill / MCP
workflow, (B) real UI rendering bugs, (C) role-shape fidelity. Sequenced A → B → C: A is
highest-leverage and also resolves the "full mode is unreadable" complaint by replacing derived
container rollups with authored edges; B is small and high-payoff; C is self-contained.

**Architecture:** Cluster A is mostly skill markdown plus one MCP return-shape change and small
schema/server tweaks — no renderer changes (the container-rollup machinery in `rollup.ts` already
excludes edges claimed via `realizedBy`). Cluster B is web-editor fixes centered on
`FloatingEdge.tsx` / `Canvas.tsx` / `reactflow.ts` / `layout.ts`. Cluster C replaces CSS-div shapes
with SVG archetypes rendered inside the same-sized node div, so floating-edge anchoring and handles
are untouched and the legend reuses the same renderer.

**Tech Stack:** TypeScript (Zod schema, Hono server, Vite/React/@xyflow web), Markdown skill docs.
pnpm workspaces. Verification via `pnpm -r test`, `rg` grep checks, and the `mcp__hyphae__*` tools
against a running Hyphae server.

## Global Constraints

- **Single source of truth is the Zod schema.** Every skill instruction must match
  `packages/schema/src/{connection,node,ref,pattern,flow}.ts`,
  `packages/schema/src/profiles/c4-backend.ts`, and the tool descriptions in `apps/server/src/mcp.ts`.
- **Vocabulary is profile-declared** — teach "call `describe_profile`"; never hardcode
  verbs/roles/pattern kinds as a fixed list.
- **Never `git add` a model `.json`.** `apps/server/hyphae-baritone.json` is untracked — leave it.
  Stage files explicitly; run `git status --short` before every commit.
- **Branch first** (repo default is `master`): suggested `fix/end-to-end-run-fixes`. Do not push —
  ask the user first.
- **Preserve authoritative facts:** `realizedBy` is a plain `string[]` on a connection
  (`connection.ts:19`), default `[]`, authorable via `create_connections`; an authored higher-layer
  edge that lists a lower edge in `realizedBy` causes `rollup.ts:34-35` to drop that lower edge from
  the derived rollup. Node/connection shapes come from the profile `role` → `Shape`
  (`shapes.ts`). Floating edges anchor to the node's rectangular bounding box (`floating.ts` `boxOf`),
  so any shape change must keep the div's box at `NODE_W`×`NODE_H`.

---

## File Structure

| File | Responsibility | Tasks |
|------|----------------|-------|
| `apps/server/src/mcp.ts` | `runCreate` return shape (identity, not bare ids) | A1 |
| `packages/schema/src/validate.ts` | new `dangling-realizedBy` check | A1 |
| `apps/server/src/store.ts` (node create) | coerce empty-string `root` → omit | A3 |
| `packages/schema/src/profiles/c4-backend.ts` | tighten `technology` field description | A3 |
| `skills/building-architecture-models/SKILL.md` | Phase 3 container edges + `realizedBy`; verb/tech notes; create-return note | A2 |
| `skills/building-architecture-models/references/subagent-prompt.md` | self-contained; omit-root; tech guidance | A2 |
| `apps/web/src/FloatingEdge.tsx` | label dimming hook; parallel-edge offset | B1, B2 |
| `apps/web/src/Canvas.tsx` | extend dim CSS to labels; allow drill into childless node | B1, B3 |
| `apps/web/src/reactflow.ts` | assign per-pair offset index to edges | B2 |
| `apps/web/src/layout.ts` / `NodeBox.tsx` | bigger nodes; 2-line summary clamp | B4 |
| `apps/web/src/shapes.ts` / `NodeBox.tsx` / `GhostNode.tsx` / `Legend.tsx` | SVG role archetypes | C1 |
| `apps/web/src/hashRoute.ts` / `App.tsx` | URL route carries focus **+ flow + pattern** | E1 |
| `apps/web/src/PatternPicker.tsx` / `patternView.ts` / `PatternMemberNode.tsx` | show anchor; navigable members | E2 |
| `apps/web/src/FlowPicker.tsx` / `store.ts` | clickable steps → jump to node/connection | E3 |
| `apps/web/src/TreePanel.tsx` (new) / `App.tsx` / `styles.css` | left tree of nodes + flows + patterns | E4 |

Task order is dependency order: **A1 before A2** (the skill's `realizedBy` step relies on creates
echoing identity so the orchestrator can reference component-edge ids). B, C, and E are independent
of A and of each other, except **E1 before E4** (the tree's row clicks should update the URL route)
and **E3 shares the `revealStep` store action the tree may reuse**.

---

## Cluster A — Skill / MCP workflow

### Task A1: Creates return identity; validate `realizedBy`

**Files:**
- Modify: `apps/server/src/mcp.ts` (`runCreate`, ~lines 70-81)
- Modify: `packages/schema/src/validate.ts`
- Modify: MCP tests + validate tests

**Why:** `create_nodes`/`create_connections` currently return `{ids:[...]}` — bare, positional, no
names (`mcp.ts:80`). The agent must rebuild a name→id map, call `list_nodes` after creating, or
(as in the baritone run) write a `nodemap.json` + Python resolver. Echoing identity removes that
toil and is the prerequisite for authoring `realizedBy` (Task A2), where the orchestrator needs the
just-created component-edge ids.

- [x] **Step 1: Echo identity from `runCreate`.** On success, return one object per created item:
  `{ id, name }` when the created entity has a `name` (nodes/flows/patterns), else
  `{ id, from, to, type }` (connections). Keep the failure path (`issues`/`error`) unchanged. Result
  shape becomes `{ created: [...] }` (or keep `ids` alongside for back-compat — decide in review).
  Verify: MCP test asserts `create_nodes` returns names and `create_connections` returns from/to/type.

- [x] **Step 2: `dangling-realizedBy` validation.** In `validateModel`, for every connection, flag
  any `realizedBy` id that is not an existing connection id. New issue kind `dangling-realizedBy`
  (`ref` = the connection id). Verify: unit test with a stale id yields exactly one issue; a valid
  chain yields none.

### Task A2: SKILL Phase 3 — author Container↔Container connections + `realizedBy`

**Files:**
- Modify: `skills/building-architecture-models/SKILL.md`

**Interfaces:** consumes Task A1's identity-echoing creates.

- [x] **Step 1: Add the container-edge step to Phase 3.** After cross-package **component** edges
  are created (they stay — they carry the detail and are the `realizedBy` targets), add: for **every**
  ordered container pair with ≥1 crossing component edge, author **one** `Container→Container`
  connection with a real verb + object, its `realizedBy` set to the ids of those crossing component
  edges. Note that `rollup.ts` then draws the container level as clean solid authored edges instead
  of dashed-purple counts (this is the D1 "full mode" fix). Sequencing: create component edges first,
  read back their ids (Task A1), then create container edges referencing them.

- [x] **Step 2: Verb-vocabulary note.** State plainly that a connection's `verb` must be from the
  profile vocabulary (`describe_profile`); an out-of-vocab verb (`realizes`) is rejected — pick a
  valid one, don't post-process. (Removes the transcript's verb-sanitizing pass.)

- [x] **Step 3: `technology` guidance + create-return note.** One canonical tech name per node — no
  versions, no library laundry-lists (the canvas ellipsizes long values anyway). Add a one-liner that
  creates now echo identity, so no follow-up `list_nodes` is needed to map names→ids.

- [x] **Step 4: New Red flag.** "Leaving the container level as a pure derived rollup when crossing
  edges exist → author Container↔Container connections with `realizedBy`."

Verify: `rg` for the new Phase-3 sub-step, the verb note, and the red flag; read-back for coherence
with existing phase numbering.

### Task A3: Small server/schema/prompt ergonomics

**Files:**
- Modify: `apps/server/src/store.ts` (node create path)
- Modify: `packages/schema/src/profiles/c4-backend.ts`
- Modify: `skills/building-architecture-models/references/subagent-prompt.md`

- [x] **Step 1: Coerce empty `root`.** Treat `root: ""` as absent on node create (don't emit an
  issue for it). Verify: creating a node with `root:""` succeeds and stores no root.
- [x] **Step 2: Tighten `technology` description** in the profile so the editor/LLM tooltip says
  "one canonical technology name; no version numbers or dependency lists."
- [x] **Step 3: Subagent prompt** — declare it self-contained ("do not read the modeling skill; this
  prompt is complete"), add "omit `root` if unknown," and mirror the `technology` guidance.
  Verify: `rg` for the three additions.

---

## Cluster B — UI bugs

### Task B1: Connection labels dim on selection

**Files:** `apps/web/src/FloatingEdge.tsx`, `apps/web/src/Canvas.tsx`

Labels portal into `.react-flow__edgelabel-renderer` (`FloatingEdge.tsx:20`), outside the dimmed
`.react-flow__edge[data-id]` group — so the highlight CSS (`Canvas.tsx:128-152`) never touches them.

- [x] Add a stable hook to the label div (e.g. `data-edge-id={id}` + a class like `hyphae-edge-label`).
- [x] Extend `highlightCss`: dim `.hyphae-edge-label` with the same `dimEdge` value, and restore
  `opacity:1` for the highlighted edge ids (mirror the `edgeSel` rules).
- [x] Verify: selecting a node fades non-neighbor edge **labels**; neighbor labels stay crisp.

### Task B2: Parallel / antiparallel edges don't overlap

**Files:** `apps/web/src/reactflow.ts`, `apps/web/src/FloatingEdge.tsx`

Two connections between the same node pair get the identical bezier and overlap.

- [x] In `focusViewToFlow` (`reactflow.ts`), group edges by **unordered** node pair; give each an
  index and count; pass `data.offsetIndex` / `data.offsetCount`.
- [x] In `FloatingEdge.tsx`, shift the bezier's control/midpoint perpendicular to the source→target
  line by an offset derived from the index (centered around 0). A single edge → offset 0 (unchanged).
- [x] Verify: A→B and B→A render as two distinct curves with separated labels.

### Task B3: Drill into a childless Component

**Files:** `apps/web/src/Canvas.tsx`

`drill()` bails when a node has no children (`Canvas.tsx:157`), but `focusView` already supports a
childless focus node (`reactflow.ts:112-123`).

- [x] Allow drilling into any non-ghost node (drop the has-children guard; keep the ghost branch).
- [x] Verify: double-clicking a leaf Component focuses it, showing it centered with its neighbors as
  externals; breadcrumb/back still works.

### Task B4: Bigger nodes, wrap summary

**Files:** `apps/web/src/layout.ts`, `apps/web/src/NodeBox.tsx`

- [x] Increase `NODE_W`/`NODE_H` (`layout.ts:4-5`) enough to fit a typical summary; dagre, minimap,
  and region sizing follow the constants automatically.
- [x] 2-line-clamp the summary in `NodeBox.tsx:52-56` (`display:-webkit-box; -webkit-line-clamp:2`)
  instead of single-line ellipsis; keep name single-line.
- [x] Verify: representative summaries render without mid-word truncation; layout still fits.

### Deferred (from the Cluster B review) — edge routing & auto-layout

Cluster B fixed the cases it set out to fix, but it also made clear that edge **routing** is the
next real limit. These are deliberately out of scope here and belong with a proper auto-layout
pass, not with B2's per-pair offset:

- **No obstacle avoidance.** Edges are beziers between two border points (`floating.ts`), so a long
  edge happily crosses unrelated node boxes. dagre lays out *nodes* only — edges are never part of
  the layout, and nothing re-routes them afterwards.
- **The fan offset is a fixed constant** (`EDGE_FAN_SPREAD = 22`). It separates 2–3 edges on a pair
  cleanly; beyond that the outer curves bow far off the direct line, because the spread does not
  adapt to edge count, node size, or the distance between the two nodes.
- **Labels are not collision-aware.** Each label sits at its own bezier midpoint; fanned edges no
  longer stack their labels, but a label can still overlap a node box or a third edge's label.
- **Externals are stacked in fixed columns** at a constant `ROW_GAP` pitch, so a focus with many
  externals produces a very tall column rather than a balanced arrangement.

Fixing these properly means introducing real edge routing (orthogonal or spline with obstacle
avoidance) and letting the layout engine own edge geometry — a larger change than any single task
in this plan.

---

## Cluster C — SVG role shapes

**Files:** `apps/web/src/shapes.ts`, `NodeBox.tsx`, `GhostNode.tsx`, `Legend.tsx`

**Root cause (C1 actor + C2 external):** shapes are CSS on a div — `border-radius:%` distorts with
the 190×64 aspect ratio (legend box is ~square, so they disagree), and `clip-path` clips the border
off the diagonal edges of the hexagon.

- [x] **Step 1:** Replace `shapeStyle` with an SVG archetype per non-rectangular `Shape`
  (person, cylinder, bar, hexagon, titled-rectangle), rendered as an absolutely-positioned `<svg>`
  filling the NODE_W×NODE_H div (`preserveAspectRatio="none"` or geometry computed from the box),
  with `stroke` = border color and `fill` = bg. Text sits on top. The div keeps its rectangular box,
  so `floating.ts` anchoring and the invisible handles are untouched. `rectangle` stays a plain div.
- [x] **Step 2:** Point `NodeBox.tsx` and `GhostNode.tsx` at the new renderer.
- [x] **Step 3:** `Legend.tsx` reuses the same renderer at small size → legend and canvas match by
  construction.
- [x] Verify: actor and external system look identical in legend and on canvas, with a visible border
  on every edge including the hexagon's diagonals.

---

## Cluster E — Flow / Pattern navigation & tree panel

Today only `focusId` is in the URL (`#<nodeId>`, `hashRoute.ts`); `selectedFlowId`/`selectedPatternId`
are store-only (`store.ts:87-88`), so a selected flow/pattern is lost on refresh and undeep-linkable.
A pattern's `anchor` and a flow step's endpoints exist in the data but are not navigable in the UI.

### Task E1: Route flows & patterns in the URL

**Files:** `apps/web/src/hashRoute.ts`, `apps/web/src/App.tsx`

**Why:** make a selected flow/pattern behave like a focused node — restored on refresh, shareable.
A **pattern** replaces the canvas (a self-contained view); a **flow** is an overlay on a focus.

- [ ] **Step 1: Generalize the hash route.** Replace the focus-only helpers with a small route model
  `{ focus?: string|null; flow?: string; pattern?: string }`:
  - `#<id>` (bare) → focus a node (back-compat; keep existing deep-links working).
  - `#pattern/<id>` → select a pattern (focus irrelevant while shown).
  - `#flow/<id>` → select a flow; on load, also set focus to the flow's natural altitude so its steps
    light (reuse E3's `revealStep` on the first step, or the LCA of step 1's endpoints).
  - Unknown flow/pattern id coerces to root with `rewrite:true`, exactly like a stale node id today.
- [ ] **Step 2: Two-way sync in `App.tsx`.** Extend the `useStore.subscribe` (`App.tsx:54`) to watch
  `selectedFlowId`/`selectedPatternId` as well as `focusId`, pushing the matching hash; extend
  `applyHashFocus` → `applyHashRoute` to call `selectFlow`/`selectPattern`/`setFocus` from the parsed
  route on `popstate`/`hashchange`.
- [ ] Verify: selecting a pattern or flow updates the URL; refresh restores it; Back walks the history;
  a hand-typed `#pattern/bad` rewrites to root. hashRoute unit tests cover parse/format/stale.

### Task E2: Show a pattern's anchor; make members navigable

**Files:** `apps/web/src/PatternPicker.tsx`, `apps/web/src/patternView.ts`, `apps/web/src/PatternMemberNode.tsx`

**Why:** the pattern view replaces the canvas, so the user loses which node the pattern describes.
`Pattern.anchor` already holds it; `memberData` already knows a member's bound node (`patternView.ts:17-24`).

- [ ] **Step 1: Anchor affordance.** In the `PatternPicker` header for the selected pattern (and/or a
  banner over the pattern view), show `anchor: <node name>` with a button that calls
  `revealNode(anchor)` (which navigates out of the pattern to that node in context).
- [ ] **Step 2: Navigable members.** A member with `binding:'node'` (`patternView.ts:18-21`) gets a
  click handler in `PatternMemberNode.tsx` → `revealNode(nodeId)`. Ref/pure-name members stay static.
- [ ] Verify: selecting a pattern shows its anchor by name; clicking the anchor/member jumps to that
  node's view.

### Task E3: Flow step navigation

**Files:** `apps/web/src/FlowPicker.tsx`, `apps/web/src/store.ts`

**Why:** step rows are plain text (`FlowPicker.tsx:36-42`); the overlay only lights steps whose
endpoints are both visible at the current focus, and `flowOverlay.ts` already computes `offViewSteps`
for the ones that aren't — but nothing lets the user get to them.

- [ ] **Step 1: `revealStep` store action.** Add `revealStep(step)`: focus the LCA-parent of
  `step.from`/`step.to` (so both are visible) and set `selectedId` to `step.via` (the connection) when
  present, else `step.from`. (Compute the LCA from `parentId` chains; a small helper in `focusView`.)
- [ ] **Step 2: Clickable steps.** Each step row in `FlowPicker` calls `revealStep(step)`; render the
  step number and mark rows in `offViewSteps` (e.g. "↗ not in this view"). Add a "jump to first step"
  affordance on the selected flow.
- [ ] **Decision (see open questions):** whether selecting a flow *auto*-jumps to the first step or
  only lights the overlay until the user clicks a step. Default: manual (no surprise focus jump), plus
  the explicit "jump to first step" button.
- [ ] Verify: clicking a step navigates to a view where its edge/nodes are visible and selects the
  right connection; a cross-altitude flow is now reachable step by step.

### Task E4: Left tree-view panel

**Files:** `apps/web/src/TreePanel.tsx` (new), `apps/web/src/App.tsx`, `apps/web/src/styles.css`

**Why:** a persistent outline of the whole model — nodes by containment, plus Flows and Patterns —
for orientation and one-click navigation. Depends on E1 so row clicks update the URL route.

- [ ] **Step 1: Tree component.** Collapsible tree: **Nodes** nested by `parentId`
  (root → System → Containers → Components), then a **Flows** section and a **Patterns** section.
  Row click: node → `revealNode` (single) / `setFocus` drill (double, mirroring canvas); flow →
  `selectFlow`; pattern → `selectPattern`. Highlight the current `focusId`/`selectedId`/selected
  flow/pattern. Reuse the ⚠ invalid markers from the pickers.
- [ ] **Step 2: Mount left of the canvas** in `App.tsx`'s `.body` (`App.tsx:106-109`); add a
  collapsible width in `styles.css`.
- [ ] **Decision (see open questions):** whether the tree *replaces* the floating `FlowPicker`/
  `PatternPicker` (top-left canvas panel) or coexists. Default: fold the Flows/Patterns lists into the
  tree and remove the floating pickers (keeping the canvas overlay/selection behavior).
- [ ] Verify: the tree lists every node/flow/pattern; clicking navigates and updates the URL; the
  active item is highlighted.

### Open design decisions (Cluster E — confirm before building)
1. **Hash scheme:** keep bare `#<id>` = node focus for back-compat and add `#flow/<id>` / `#pattern/<id>`
   (recommended), vs. move everything to prefixed routes `#node/…` (breaks existing deep-links).
2. **Flow selection:** manual step navigation + a "jump to first step" button (recommended), vs.
   auto-jump to the first step on selection.
3. **Tree vs floating pickers:** fold Flows/Patterns into the tree and drop the floating pickers
   (recommended), vs. keep both.

---

## D1 — Full mode (deferred)
Reassess after Task A2. Expectation: authored container edges make the container view readable. If
still dense, add an at-rest cap as a follow-up. No work in this plan.

---

## Verification (whole plan)
- `pnpm -r test` green after each cluster.
- New/updated tests: MCP create return shape + `dangling-realizedBy` (A1); web component tests where
  they exist (B/C); `hashRoute` parse/format/stale-id round-trip (E1); `revealStep` LCA/via selection
  (E3).
- **Dogfood:** a fresh small model run following the updated skill produces solid Container↔Container
  edges (not purple rollups) and requires no post-create `list_nodes` / resolver script.

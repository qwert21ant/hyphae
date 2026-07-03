# Axis 3 — UI/UX clarity & simplicity

How to reduce clutter and improve comprehension in the focus view without dropping
information, grounded in the actual `apps/web/src` components.

## Findings — where the overload actually comes from

Measured against the realistic model (`apps/server/hyphae-cctv-new.json`: 404 nodes,
567 connections, 110 with `realizedBy`). Worst-case boundary-crossing degree per node
(what feeds externals + the side panel list):

| crossing conns | node | type | children |
| --- | --- | --- | --- |
| 32 | SynX Supervision | System | 11 |
| 17 | Full Client (FC) | Container | 14 |
| 14 | Service Integration Layer | Component | 2 |
| 12 | App Shell & Bootstrap | Component | 4 |
| 11 | Media Gateway / Streaming Client / WebApi… | mixed | 6–11 |

So a "big" focus is ~11 children + a double-digit fan of externals and edges. Sources:

1. **Ghost fan-out + rollup edges.** `buildFocusView` (`focusView.ts:96`) rolls every
   external endpoint up to a peer at the focus layer (`representativeWith`, layers
   `['Context','Container','Component','Code']`) and emits one `externals` box per
   distinct representative. Each surviving mapped pair becomes a `FocusEdge`; multi-conn
   and rolled-up pairs are **dashed purple derived edges with a count**
   (`focusView.ts:196-210`, rendered `flow.ts:20-36`). With 11 children each talking to
   several externals you get a dense purple web. The pair-merge is already good (opposite
   directions collapse to one undirected edge) — the clutter is the *number* of pairs, not
   duplicate arrows.
2. **Opaque externals (the headline problem).** An external is a single ghost box
   (`GhostNode.tsx`); you cannot see *which* child of that external a connection actually
   lands on. Every conn to anything under "Media Gateway" collapses onto one ghost + one
   dashed edge labelled with a count. Information is present in `realizedBy` but only
   reachable by drilling away from the current focus.
3. **Everything-or-selection, no hover.** Highlight/dim exists (`highlightSets` in
   `flow.ts:85`, applied in `Canvas.tsx:39-53` — dims edges to 0.12, nodes to 0.4) but
   only fires on **click-select**. At rest the full web is shown at full strength. There
   is no hover-to-preview and no "neighbors only" mode.
4. **Flat side-panel list.** `SidePanel` renders up to 32 rows in one undivided `<ul>`
   (`ConnectionList.tsx`) with no incoming/outgoing split, no grouping by neighbor, no
   type grouping, no search, no virtualization. The `Connections (N)` header
   (`SidePanel.tsx:89`) is the only structure.
5. **Global-only filter.** `FilterPanel` filters `connFilter` by kind + enum fields
   (transport) globally (`FilterPanel.tsx`, `store.ts:61-72`). There is no
   filter-to-selection, no "hide externals below layer X", no type legend, and the panel
   is checkboxes only.
6. **No overview aids.** No minimap, no search-to-focus, no legend explaining
   solid-vs-dashed / arrow semantics. Navigation is breadcrumbs + double-click drill only
   (`Canvas.tsx:56-75`).

## Expandable external nodes

**Goal:** let a user expand a chosen ghost so its edges split out to the specific *children*
that actually participate, turning one opaque box + one counted dashed edge into a small
labelled sub-cluster — without leaving the current focus and without pulling in the
external's irrelevant children.

### Data model / state
- Add `expandedExternals: Set<string>` to the store (`store.ts`), plus
  `toggleExternal(id)` and reset it inside `setFocus` (an expansion is only meaningful for
  the current focus). Do **not** put it in the URL hash (keep hash = focus only).
- Thread it into `buildFocusView(model, focusId, filter, expanded?)` and the `Canvas`
  `useMemo` dependency list (`Canvas.tsx:28`).

### What changes in `focusView.ts`
- **Endpoint mapping.** In `mapEndpoint` (`focusView.ts:117`), after computing the
  representative `rep = representativeWith(...)`, if `rep ∈ expanded` remap one level
  finer: `childOfFocus(nodes, id, rep) ?? rep`. Reusing the existing `childOfFocus` helper
  means an endpoint under an expanded external maps to *its direct child of that external*,
  exactly mirroring how the focus node already expands to its children. Endpoints that are
  the external itself (or a direct child) stay put.
- **No other edge logic changes.** Pair aggregation, the `expanded`/`absorbed`
  `realizedBy` reconciliation (`focusView.ts:146-158`), the `inside` keep-test, and
  `externalIds` collection all key off `mapped`, so they recompute correctly for free: an
  expanded external contributes several finer external ids instead of one, each with its
  own (often solid, count-1) edge to the relevant child. This is symmetric with the
  existing "expanded parent shows its finer children" behaviour already in the code.
- **New return field.** Emit `externalGroups: { id: string; childIds: string[] }[]` so
  `flow.ts`/`layout.ts` know an expanded external must render as a *dashed container* whose
  members are the finer ghost ids that survived into `externals`. Only children that
  actually carry a boundary-crossing edge appear — expanding a 40-child gateway that only
  talks to focus via 3 classes yields a 3-box group, not 40.

### What changes in `layout.ts`
- Today externals are single boxes stacked in incoming/outgoing columns
  (`layout.ts:45-58`). For an expanded external, lay its member children out as a small
  vertical stack, compute a wrapping box (same PAD math as the focus region in
  `flow.ts:41-56`), and treat *that box* as the column item so siblings shift down. This
  reuses the region-wrapping pattern already used for the focus node — no new layout engine.

### What changes in `flow.ts` / node types
- Add a `ghostGroup` node type: a dashed, muted `GroupNode` variant (visually a ghost
  region) positioned/sized to wrap its members, plus the member `ghost` nodes positioned
  inside it (`focusViewToFlow`, `flow.ts:38-77`). Register it in `Canvas.tsx:17`
  `nodeTypes`. Members keep four anchor handles so `FloatingEdge` attaches per-child.

### Interaction (`Canvas.tsx` / `GhostNode.tsx`)
- Add a small caret / `+` affordance on `GhostNode` that calls `toggleExternal(id)`.
  Keep **double-click = drill/refocus** (`Canvas.tsx:56-59`) unchanged; expansion is a
  separate, in-place gesture so the two don't fight. Clicking the caret again collapses.
- Optional: right-click / context menu "Expand connections" as a discoverable alternative.

**Effort:** M (mapping is a ~3-line change; the group rendering + layout is the bulk).
**Risk:** an over-connected external could still expand into many boxes — cap members or
show "+N more" beyond a threshold; guard against an expanded id no longer being an external
after filtering (drop stale ids each build).

## Ideas (strongest first)

### 1. Expandable externals — see the design above **(headline ask; quick-ish win via `childOfFocus` reuse)**
- **What:** in-place expansion of a ghost to its participating children. Detailed above.
- **Why:** directly answers the "opaque peer boxes hide which child is involved" problem;
  replaces one counted dashed edge with precise, mostly-solid edges.
- **Effort:** M. **Tradeoffs:** more nodes when expanded (mitigated by only surfacing
  participating children + a cap). **Where:** `focusView.ts` `mapEndpoint`/return,
  `layout.ts`, `flow.ts`, `GhostNode.tsx`, `Canvas.tsx`, `store.ts`.

### 2. Hover-to-highlight neighborhood **(quick win)**
- **What:** run the existing `highlightSets` on hover, not only on click. Wire
  `onNodeMouseEnter`/`onNodeMouseLeave` (and edge equivalents) in `Canvas.tsx` to a
  transient `hoveredId`; feed it into the same `styledEdges`/`styledNodes` dim logic
  (`Canvas.tsx:39-53`), falling back to `selectedId` when nothing is hovered.
- **Why:** lets a user trace one node's neighborhood instantly without committing a
  selection; the dim-the-rest machinery already exists, so this is almost free.
- **Effort:** S. **Tradeoffs:** hover flicker on dense graphs (debounce). **Where:**
  `Canvas.tsx`, reusing `flow.ts:highlightSets`.

### 3. Legend + clearer rollup-vs-real affordance **(quick win)**
- **What:** a small always-on legend panel (React Flow `Panel`, like `FilterPanel`)
  explaining: solid = one authored connection (label = kind), dashed purple = derived
  rollup (label = count), arrowless = mixed directions. Optionally give the count label a
  pill and a tooltip "N underlying connections — click to list".
- **Why:** solid vs dashed purple and the arrow/`None` semantics
  (`flow.ts:8-14`, `focusView.ts:201-209`) are currently unexplained; new users can't tell
  a rollup from a real edge.
- **Effort:** S. **Tradeoffs:** more chrome. **Where:** new panel in `Canvas.tsx`,
  semantics already in `flow.ts`.

### 4. Side panel: split incoming / outgoing + group by neighbor
- **What:** in `SidePanel`/`ConnectionList`, partition `externalConnections` into
  incoming vs outgoing relative to the selected subtree, and optionally group rows by the
  other endpoint's top-level ancestor with a count header. Add a type/transport chip per
  row (data already shown as trailing `· type · transport`, `ConnectionList.tsx:28`).
- **Why:** a flat 32-row list (finding 4) is hard to scan; direction + grouping matches how
  people read dependencies. `externalConnections` already knows subtree membership
  (`focusView.ts:221-238`), so direction is derivable there.
- **Effort:** M. **Tradeoffs:** grouping logic + more panel states. **Where:**
  `focusView.ts:externalConnections` (return direction), `ConnectionList.tsx`,
  `SidePanel.tsx:87-92`.

### 5. Filter-to-selection / neighbors-only mode
- **What:** a toggle that, when a node is selected, hides all edges and externals not
  adjacent to it (a hard version of the dim). Reuse `highlightSets` to compute the keep
  set and drop the rest from `styledNodes/styledEdges` instead of dimming.
- **Why:** on a 32-degree System even dimmed edges are visual noise; a true focus-context
  mode collapses the view to one node's story. Complements, not replaces, hover.
- **Effort:** S–M. **Tradeoffs:** hides context; needs an obvious "showing neighbors of X"
  banner + escape. **Where:** `Canvas.tsx`, `flow.ts:highlightSets`, a store flag.

### 6. Search-to-focus
- **What:** a search box (toolbar in `App.tsx`) matching `model.nodes` by name/type;
  selecting a result calls `setFocus`/`select`. Fuzzy match, keyboard nav.
- **Why:** with 404 nodes, breadcrumb + double-click drilling is slow; jumping by name is
  the fastest way to reduce time-on-clutter. No graph-render change.
- **Effort:** S–M. **Tradeoffs:** another toolbar control. **Where:** `App.tsx` toolbar,
  `store.ts` `setFocus`.

### 7. Minimap
- **What:** add React Flow's `<MiniMap/>` in `Canvas.tsx` alongside `<Controls/>`, colored
  by node type (region/node/ghost).
- **Why:** cheap orientation aid for large expanded views; near-zero code.
- **Effort:** S. **Tradeoffs:** occupies a corner; low value on small focuses (make it
  toggle). **Where:** `Canvas.tsx:94-97`.

### 8. Counts-before-edges (progressive edge disclosure) for high-degree nodes
- **What:** when a child/external exceeds a degree threshold, collapse its edges into a
  single badge on the node ("→ 9") and only materialize the individual edges on
  hover/select (reusing idea 2's hover set).
- **Why:** attacks finding 1 at the root — fewer lines drawn at rest. Larger because it
  needs a per-node degree pass and edge-visibility state.
- **Effort:** L. **Tradeoffs:** hides edges by default (discoverability); interacts with
  expandable externals — sequence after ideas 1–2. **Where:** `focusView.ts` (degree),
  `flow.ts`/`Canvas.tsx` (conditional edge emit).

### 9. Edge bundling / orthogonal routing (investigate)
- **What:** route parallel child↔external edges through shared channels or bundle them.
- **Why:** would visibly de-noise dense fans. But floating bezier routing
  (`FloatingEdge.tsx`/`floating.ts`) is bespoke; true bundling is a significant rewrite
  with uncertain payoff versus ideas 1/5/8.
- **Effort:** L. **Tradeoffs:** high complexity, risk to the working floating-edge system.
  **Where:** `floating.ts`, `FloatingEdge.tsx`, `layout.ts`. Lower priority.

## Keep as-is
- **Pair merge / undirected collapse** (`focusView.ts:164-210`): already prevents
  duplicate opposing arrows and true parallel edges between the same two nodes — this is
  correct and load-bearing; don't add parallel-edge collapsing on top.
- **Dashed-purple derived styling + count label** (`flow.ts:20-36`): good, distinct signal;
  keep, just add the legend (idea 3).
- **Boundary-crossing side-panel semantics** (`externalConnections`, `focusView.ts:221`):
  the recent decision to list only boundary-crossing, non-`realizedBy`-child connections is
  the right scoping — restructure its *presentation* (idea 4), not its contents.
- **Click-select highlight/dim** (`Canvas.tsx:39-53`): keep; extend to hover (idea 2)
  rather than replace.
- **Focus region wrapping / dagre layout** (`flow.ts:41-56`, `layout.ts`): reuse this exact
  pattern for expanded-external groups (idea 1) instead of inventing new layout.
- **Global `FilterPanel` + `connFilter`** (`FilterPanel.tsx`, `store.ts`): keep as the
  global filter; add filter-to-selection (idea 5) as a separate mode, don't overload it.

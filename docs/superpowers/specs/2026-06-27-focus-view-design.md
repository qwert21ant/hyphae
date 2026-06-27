# Focus View — design

> Replace the global layer-view with a bounded, auto-laid-out **focus view**: navigate the model one
> node at a time (a node + its direct children + aggregated external neighbors), so a large model
> (especially the Code layer) stays readable and React Flow stays fast.

## Problem

Today the canvas is driven by a single global `layer` dropdown (Context / Container / Component /
Code). It renders **every** node on that layer at once, with all their connections, parent regions,
and ghost endpoints, plus full drag/edit. Once the Code layer (Class / Interface / Function / Module
/ UIComponent) is populated, a real model puts potentially thousands of nodes on one canvas:

- Nothing is visually analyzable — it's a hairball of nodes and edges.
- React Flow lags badly with that many interactive nodes/edges.

## Goal

A new **focus view** that, for a chosen node, shows only:

- the focused node (as a framing region),
- its **direct** children,
- the connections among them,
- the external nodes connected to the focus or any child, **aggregated** so the view stays bounded,

with **automatic layout** and a **read-only canvas** (no manual layout editing) in v1.

This is entirely **client-side**: the store already holds the whole model, so the focus view is a
pure filter + aggregation + auto-layout. No server or MCP changes.

## Non-goals (v1)

- Drag-to-move / manual layout and per-view position persistence (auto-layout only).
- Drag-to-connect and reparent-by-drag on the canvas.
- Showing more than one level of descendants at once (drill by re-focusing instead).
- Keeping the old global layer dropdown / flat layer-view (it is retired).

## Navigation model

Navigation is uniform — **everything is a focus view**, including the top:

- **Root** (`focusId === null`): show all top-level nodes (those whose `parentId` is null or points at
  a missing node) and the connections among them. This is the "pick a system" landing.
- **Focused** (`focusId === X`): show X (as a region) + X's direct children + aggregated external
  neighbors.

Movement:

- **Double-click** a node → focus it (`setFocus(id)`) **if it has children**; a leaf node only selects.
- **Click an aggregated external box** → `setFocus(thatId)` (jump there).
- **Breadcrumbs** in the header (Root › System › Container › Component …) — clicking a crumb focuses
  that ancestor. The trail is the ancestor chain of `focusId` derived from `parentId`, plus a Root crumb.
- **Back** = focus the parent of the current focus.

The `layer` dropdown is removed; the header shows breadcrumbs instead.

## Focus-view builder (core transform)

New pure module `apps/web/src/focusView.ts` (replaces the layer logic in `toModel.ts`).

```
buildFocusView(model, focusId | null) → { focus, primary, externals, edges }
```

**Primary (drawn) nodes**

- `focusId === null`: all top-level nodes (`parentId` null or unresolved).
- `focusId === X`: X's direct children (`n.parentId === X`).

**Focus framing**

- When focused, X itself is drawn as a read-only labeled **region** (reuse `GroupNode`) wrapping its
  children. Edges that touch X anchor on this region; child edges anchor on the child boxes.
- At root there is no region (the primary nodes are the top level).

**External aggregation**

For every connection with exactly one endpoint *inside* the view (X or one of its children) and the
other endpoint `E` *outside*:

- Represent `E` by its **ancestor at the focus node's own layer** (a *peer* of X). Walk E's
  `parentId` chain up to that layer.
- If `E` is already at or above X's layer (e.g. an `ExternalSystem` while focusing a `Component`),
  use `E` itself.

So focusing Component C, five Code nodes living in Component E collapse to a single "Component E"
external box. External boxes are styled as secondary (reuse `GhostNode` styling) and are clickable to
re-focus.

**Edges**

- **Inner** (both endpoints among X + children): rendered as real edges, deduped.
- **External** (an inside node ↔ an external box): collapsed per `{insideNodeId, externalBoxId}` pair
  into a single edge that carries a **count** label and uses the existing dashed/tinted `derivedEdge`
  style. Edges touching X directly anchor on the region.

Result: every view is bounded by *direct children + distinct peer-level external boxes* — never the
whole layer. This is what fixes both readability and the React Flow lag.

## Layout (auto, read-only)

- Add dependency **`@dagrejs/dagre`**.
- New `apps/web/src/layout.ts`: `layoutFocusView(view) → positions`. Feed the child nodes + external
  boxes (and a node standing in for the focus region) into a dagre **directed layered** graph (rank
  follows edge direction), get back positions. Size the focus region to enclose its laid-out children
  (existing bbox logic reconciled with dagre's slot for the region node).
- Layout is deterministic for a given `{model, focusId}` so tests and re-renders are stable.

## Rendering

- React Flow with `nodesDraggable={false}`, `nodesConnectable={false}`; remove the `onNodeDrag*`
  handlers and all per-layer viewport persistence. `fitView` runs on each focus change.
- Reuse `NodeBox` for children, `GhostNode` styling for external boxes, `GroupNode` for the focus
  region, `FloatingEdge` for edges.
- Keep selection highlighting (`highlightSets`): selecting a node/edge highlights it + neighbors and
  dims the rest.

## Store changes (`apps/web/src/store.ts`)

- Replace `layer: string` with `focusId: string | null`; drop the per-layer `viewports` concept.
- Add `setFocus(id | null)` (also clears selection).
- `select(id)` unchanged (drives the side panel).
- `breadcrumbs` derived selector: ancestor chain of `focusId` via `parentId` + Root.
- `setNodePosition` and its optimistic view-position writes are removed (no manual layout). The
  `PUT /views/.../positions` API and its store usage are no longer called from the focus view; the
  endpoint may remain server-side but is unused by the web client.
- All other store actions (add/update/delete node & connection, SSE sync, `recover`) are unchanged.

## Editing surface (v1)

- Canvas is **navigate + inspect** only: no drag, no draw-to-connect, no reparent-by-drag.
- The **side panel keeps full model editing** (core fields, profile fields, type, parent select,
  delete) — none of that depends on layout.
- `add <type>` buttons stay and create the node **as a child of the current focus** (auto-laid-out;
  at root they create a top-level node). No manual placement.
- Deferred: drag-to-connect, canvas reparenting, manual layout.

## Files

- `apps/web/src/focusView.ts` — **new**: `buildFocusView` + external aggregation + breadcrumb-path helper.
- `apps/web/src/layout.ts` — **new**: dagre `layoutFocusView`.
- `apps/web/src/toModel.ts` — retire layer/rollup-by-layer rendering; keep/reuse `highlightSets` and
  edge helpers (move into `focusView.ts` if cleaner).
- `apps/web/src/store.ts` — `focusId` + breadcrumbs; remove `layer`, viewports, `setNodePosition`.
- `apps/web/src/Canvas.tsx` — read-only React Flow, focus interactions (double-click, external click),
  fit-on-focus.
- `apps/web/src/App.tsx` — breadcrumb header in place of the layer dropdown; `add` buttons create
  children of the focus.
- `apps/web/package.json` — add `@dagrejs/dagre`.

## Testing

Match the existing `apps/web/test` style (pure-function unit tests + a couple of component tests).

- `buildFocusView`:
  - root case returns top-level nodes + their inter-edges;
  - focused case returns the focus's direct children only;
  - external aggregation collapses deep neighbors to a peer-level box;
  - an `ExternalSystem`-style higher-layer neighbor is shown as itself;
  - external edges collapse per pair with correct counts;
  - missing/unresolved `parentId` handled (treated as top-level).
- breadcrumb-path helper: correct ancestor chain + Root, including at root.
- `layoutFocusView`: positions assigned to every node; deterministic for the same input.
- Canvas/navigation component test: double-click a parent → focus changes to it; click an external
  box → focus changes to that id; leaf double-click only selects.

## Future (out of scope now)

- Re-introduce optional manual layout / position persistence as an explicit "edit layout" mode.
- Server/MCP-computed focus subgraph (Approach C) if shipping the whole model to the client ever
  becomes the bottleneck for very large models.
- Configurable descendant depth (1–2 levels) with inline expand.

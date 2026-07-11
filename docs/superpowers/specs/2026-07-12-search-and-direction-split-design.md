# Wave 2 #8 — Search-to-focus + side-panel direction split (design)

Source: `docs/superpowers/reviews/2026-07-03-improvement-ideas/ROADMAP.md` Wave 2 #8,
detailed in `03-ui-ux.md` ideas #6 (search-to-focus) and #4 (incoming/outgoing split).

Two small, independent web-only features. No graph-render or layout changes; no MCP/schema changes.

## Part A — Search-to-focus

**Problem.** With 404 nodes, breadcrumb + double-click drilling is a slow way to reach a
named node (finding #6). A search box that jumps by name is the fastest way to cut
time-on-clutter.

**Component.** New `apps/web/src/SearchBox.tsx`, mounted in the `App.tsx` toolbar
immediately before the audience toggle.

- Controlled text `<input>` with a results dropdown rendered below it.
- Matching: case-insensitive over node **name** only. Ranking: exact name match first,
  then prefix matches, then substring matches; stable within a rank by model order.
  Capped at 10 results. Empty/whitespace query renders no dropdown.
- Each result row shows the node **name**, its **type**, and its parent name (when it has
  one) for disambiguation.
- Keyboard: `ArrowDown`/`ArrowUp` move the active result (wrapping), `Enter` picks the
  active one (defaults to the first), `Escape` clears the query and closes the dropdown.
  Picking clears the query and closes the dropdown. Blur closes the dropdown.
- Picking a result calls the new store action `revealNode(id)`.

**Store action `revealNode(id)`** (in `store.ts`):

```
revealNode(id):
  n = model.nodes.find(id); if !n: return
  parent = (n.parentId && model has n.parentId) ? n.parentId : null
  set focusId = parent, selectedId = id, expandedExternals = new Set()
```

Rationale: a single atomic action avoids `setFocus`'s reset-of-`selectedId` clobbering a
following `select`, and it reproduces `setFocus`'s `expandedExternals` reset (an expansion
is only meaningful for the current focus). Focusing the node's **parent** (root when
top-level) shows the node as a highlighted child box in the parent's focus view with its
side panel open — uniform for every layer, including leaf/Code nodes (focusing the node
itself would give a leaf an empty view).

The `focusId` change flows through the existing `App.tsx` store→URL subscription, so the
URL hash updates for free; no hashRoute changes.

## Part B — Side-panel incoming/outgoing split

**Problem.** The node panel renders up to ~32 boundary-crossing connections in one flat
`<ul>` with no direction structure (finding #4), hard to scan.

**`focusView.ts` refactor.** Add:

```
partitionConnections(model, nodeId): { outgoing: Connection[]; incoming: Connection[] }
```

Same subtree + boundary + non-`realizedBy`-child scoping as today's `externalConnections`,
but split by direction **relative to the selected subtree**:

- **outgoing**: `from` is inside the subtree, `to` is outside.
- **incoming**: `to` is inside the subtree, `from` is outside.

Re-implement `externalConnections(model, nodeId)` as
`const { outgoing, incoming } = partitionConnections(...); return [...outgoing, ...incoming]`
so existing callers/tests keep working unchanged.

**`SidePanel.tsx` node branch.** Replace the single `Connections (N)` + one `ConnectionList`
with:

- an `<h3>Connections (N)</h3>` header where `N = outgoing.length + incoming.length`
  (shown only when `N > 0`),
- an **Outgoing (n)** subsection (`<h4>` or labeled block) rendering
  `<ConnectionList connections={outgoing} />`, shown only when `n > 0`,
- an **Incoming (m)** subsection rendering `<ConnectionList connections={incoming} />`,
  shown only when `m > 0`.

`ConnectionList` is unchanged (still reused by the rollup and realizedBy panels). No grouping
by neighbor ancestor (YAGNI — direction split only).

## Testing

- `focusView.test.ts`: `partitionConnections` assigns a boundary connection to outgoing vs
  incoming by orientation; a connection with a descendant endpoint counts as inside the
  subtree; a `realizedBy`-child connection is excluded from both; `externalConnections`
  still returns the union.
- `store.test.ts`: `revealNode` on a child sets `focusId` to its parent and `selectedId` to
  the child; on a top-level node sets `focusId` to `null`; resets `expandedExternals`; a
  missing id is a no-op.
- New `SearchBox.test.tsx`: typing filters and ranks results; clicking a result calls
  `revealNode` (assert via resulting store state: focus = parent, selected = node); `Escape`
  clears; `Enter` picks the first result.
- `SidePanel.test.tsx`: selecting a node with both inbound and outbound boundary connections
  renders an Outgoing section and an Incoming section with the right rows; a direction with
  no connections renders no subsection.

## Non-goals

- No fuzzy matching, no type/description search (name substring is enough for 404 nodes).
- No neighbor-ancestor grouping in the panel.
- No changes to `ConnectionList`, layout, flow, MCP, or schema.
```

# Rollup edge detail — design

> Let the user select an aggregated ("rollup") connection in the focus view and see what it
> actually represents: the list of underlying connections, with the ability to drill toward an
> endpoint.

## Problem

In the focus view, connections that live below the children level are aggregated into a single
dashed "derived" edge labelled only with a count (e.g. `[d7]`). Today these edges are
`selectable: false` and carry only their `count` — not even which connections they aggregate. The
user can see that two boxes are related by N connections but cannot find out *what* those
connections are or navigate to them.

## Goal

Selecting a rollup edge shows a read-only detail panel:

- the two endpoints it connects (by name),
- the count,
- the list of underlying connections (`source → target` by node name, with kind + transport),
- each endpoint name is clickable to `setFocus` that node and drill toward the detail.

Real (non-aggregated) edges keep the existing connection editor — only derived edges get the new
panel.

## Non-goals

- Editing or deleting a rollup edge (it is an aggregate, not a stored entity).
- Showing the literal single connection as its own discrete edge on the canvas (an arbitrary
  cross-subtree connection has no single focus that renders both endpoints as one real edge — drilling
  toward an endpoint is the navigation model instead).
- A breakdown-by-kind/transport summary (the per-connection list already shows kind/transport).

## Approach (client-side, reuses existing pieces)

### 1. Carry the underlying connections

`FocusEdge` gains `realizedBy: string[]` — the ids of the model connections it represents. The
per-pair aggregator in `buildFocusView` already visits every kept connection, so it collects the
connection ids alongside the count:

- real edge: `realizedBy = [thatConnectionId]`, `count = 1`;
- derived edge: `realizedBy = [all aggregated ids]`, `count = realizedBy.length`.

No change to which edges are produced or to endpoint mapping.

### 2. Make rollup edges selectable

In `flow.ts` `derivedEdge`:
- `selectable: true`, `focusable: true`, keep `deletable: false`;
- `data: { derived: true, count, realizedBy }`.

In `Canvas.tsx` `onEdgeClick`, remove the `if (!derived)` guard so every edge calls `select(e.id)`.
Selecting a derived edge already highlights its two endpoints through the existing `highlightSets`
edge case (`selectedId` matches the edge → highlight its `source`/`target`). No highlight change.

### 3. Side-panel "Rolled-up connection" view

`SidePanel` recomputes the current view with `buildFocusView(model, focusId, connFilter)` (memoized on
those store values; deterministic and sub-millisecond even on the ~600-connection model). Selection
resolution order:

1. node by id → node editor (existing);
2. model connection by id → connection editor (existing; real edges hit this);
3. a **derived** edge in the recomputed view whose `id === selectedId` → the new rollup panel;
4. otherwise → "No node selected." (existing).

The rollup panel renders, read-only:

- Header: `fromName → toName` using the view's node names (focus region / child / external box), plus
  "N connections".
- A scrollable list, one row per `realizedBy` id resolved against `model.connections`:
  `sourceName (parentName) → targetName (parentName)` with the connection's kind (`type`) and
  `transport` field. `parentName` disambiguates repeated component names.
- Each `sourceName`/`targetName` is a `<button>` calling `setFocus(nodeId)` (which also clears
  selection), letting the user drill toward that endpoint.

### Data flow

```
model + focusId + connFilter ──buildFocusView──▶ FocusView.edges (with realizedBy)
                                   │
Canvas: focusViewToFlow ──▶ derived RF edge (selectable, data.realizedBy)
                                   │ onEdgeClick → select(edge.id)
store.selectedId ──▶ SidePanel ──recompute buildFocusView──▶ find derived edge by id
                                   │ resolve realizedBy → model.connections → names/kind/transport
                                   └ endpoint button → setFocus(nodeId)
```

## Edge cases

- A `realizedBy` id whose connection is missing (filtered out or deleted between renders) is skipped
  defensively; the row is omitted.
- An endpoint id that no longer exists is rendered as its raw id (same fallback the existing panel
  uses for connection endpoints).
- Clicking an endpoint already equal to the current focus is a harmless `setFocus`.
- An empty `realizedBy` (should not happen) renders the header with an empty list.

## Files

- `apps/web/src/focusView.ts` — add `realizedBy` to `FocusEdge`; collect connection ids per pair.
- `apps/web/src/flow.ts` — derived edges selectable/focusable; carry `realizedBy` in `data`.
- `apps/web/src/Canvas.tsx` — `onEdgeClick` selects derived edges too.
- `apps/web/src/SidePanel.tsx` — rollup-edge branch (recompute view, resolve, render, endpoint buttons).
- Tests: `apps/web/test/focusView.test.ts` (realizedBy), `apps/web/test/SidePanel.test.tsx` (rollup
  panel renders the list + endpoint button calls `setFocus`).

## Testing

- `buildFocusView`:
  - a real edge carries `realizedBy` of exactly its one connection id;
  - a derived edge carries all aggregated ids, and `count === realizedBy.length`.
- `SidePanel` (pure render, no canvas):
  - selecting a derived edge id renders the header `from → to`, the count, and one row per underlying
    connection with source/target names and kind/transport;
  - clicking an endpoint name calls `setFocus` with that node id;
  - a missing `realizedBy` connection is skipped without error.
```

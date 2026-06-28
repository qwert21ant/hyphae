# Connection realizedBy detail — design

> Show a real (default) connection's `realizedBy` child connections in the side panel, mirroring the
> rollup-edge detail: each child row focuses its endpoint nodes and is itself selectable to drill the
> realization chain. Extract the shared list into one component used by both panels.

## Problem

A connection can declare `realizedBy` — the lower-level connections that realize it (cross-layer
realization). The CCTV model has 110 such connections. The side-panel connection editor does not
surface them, so the user cannot see or navigate a connection's realization.

The rollup-edge panel already renders a near-identical list (its `realizedBy` underlying
connections), so the rendering should be shared rather than duplicated.

## Goal

- When a real connection with a non-empty `realizedBy` is selected, the connection panel shows a
  read-only **"Realized by (N)"** section listing the child connections.
- Each child row shows `sourceName (parent) → targetName (parent)` with kind + transport.
- Each **endpoint name** is a button that `setFocus`es that node (canvas navigation).
- The **row** is clickable to `select` the child connection — switching the panel to that child's
  detail (its editor + its own `realizedBy`), letting the user walk the realization chain.
- The rollup-edge panel reuses the same list component (its rows become row-selectable too — a
  consistency improvement over the current focus-only rows).

## Non-goals

- Editing `realizedBy` (read-only list; the connection editor above stays editable as today).
- Showing the reverse direction ("realizes / is-realized-by parents").
- Any change to canvas rendering.

## Approach

### Shared `ConnectionList` component

New `apps/web/src/ConnectionList.tsx`:

```
ConnectionList({ connections }: { connections: Connection[] })
```

- Reads `nodes`, `select`, `setFocus` from the store.
- Renders a `<ul className="rollup-list">` with one `<li>` per connection:
  - `<li onClick={() => select(c.id)}>` (row selects the child connection; `cursor: pointer`);
  - endpoint buttons: `<button onClick={(ev) => { ev.stopPropagation(); setFocus(c.from); }}>{nameOf(c.from)}</button>`
    and the same for `c.to` — `stopPropagation` so focusing an endpoint does not also select the row;
  - `(parentName)` small text after each endpoint (disambiguation), via the node's `parentId`;
  - trailing `· {c.type}{transport ? " · " + transport : ""}` small text.
- `nameOf(id)` falls back to the raw id; a node id missing from the model still renders its id.

The component receives already-resolved `Connection[]` (not ids), so each caller resolves once and
uses the same array for both the count and the list — the header count can never disagree with the
rows.

### Side-panel wiring

`SidePanel` resolves a `realizedBy` id list to connections with a small inline helper
(`ids.map((id) => model.connections.find((c) => c.id === id)).filter(Boolean)`):

- **Connection branch (real connections):** after the existing editor + delete button, when
  `conn.realizedBy.length > 0`, render:
  - a heading/label `Realized by ({children.length})`;
  - `<ConnectionList connections={children} />` where `children` is the resolved `conn.realizedBy`.
- **Rollup branch (derived edges):** replace the current inline `<ul>` with the resolved
  `rollup.realizedBy` → `<ConnectionList connections={children} />`; the header keeps showing
  `{children.length} connection(s)`.

Selecting a child calls `select(childConnectionId)`; the connection branch then resolves it from
`model.connections` (children are real connections) and shows its editor + its own `realizedBy` —
recursive chain drilling. This works even when the child is not on the current canvas.

### Data flow

```
selected real connection ──▶ SidePanel connection branch
  conn.realizedBy ──resolve──▶ Connection[] ──▶ "Realized by (N)" + <ConnectionList>
      row click ──▶ select(childId) ──▶ panel re-renders for the child (its editor + its realizedBy)
      endpoint click ──▶ stopPropagation + setFocus(nodeId) ──▶ canvas focus
```

## Edge cases

- A `realizedBy` id whose connection is missing/deleted is skipped (resolve `.filter(Boolean)`); the
  count reflects only resolved children.
- An endpoint node id missing from the model renders its raw id (no crash).
- Endpoint button clicks must `stopPropagation` so they do not also trigger the row's `select`.
- A connection with empty `realizedBy` shows no section (connection branch unchanged from today).

## Files

- `apps/web/src/ConnectionList.tsx` — **new**: shared resolved-connection list (endpoint focus +
  row select).
- `apps/web/src/SidePanel.tsx` — connection branch gains the "Realized by (N)" section; rollup branch
  reuses `ConnectionList`.
- `apps/web/src/styles.css` — reuse the existing `.rollup-list` styles (add a `cursor: pointer` row
  affordance if not already present).
- Tests: `apps/web/test/SidePanel.test.tsx` (realizedBy section renders + row-select + endpoint
  focus; rollup panel still works through the shared component).

## Testing

- A selected real connection with `realizedBy` renders "Realized by (N)" and one row per resolved
  child with source/target names and kind/transport.
- Clicking a child **row** calls `select` with the child connection id (panel would switch to it).
- Clicking a child **endpoint name** calls `setFocus` with that node id and does **not** change the
  selection (stopPropagation).
- A `realizedBy` id with no matching connection is skipped and not counted.
- Regression: the rollup-edge panel still lists its underlying connections and its endpoint buttons
  still `setFocus` (now via the shared component).
```

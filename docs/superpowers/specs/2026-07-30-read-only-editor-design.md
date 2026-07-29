# Make the browser a read-only viewer

**Date:** 2026-07-30
**Status:** agreed, ready for a plan

## Problem

The web app carries a full create/edit/delete surface for nodes and connections, but the model is
authored by LLM agents over MCP. The two write paths are not equal:

- The **MCP path** validates against the profile, writes in batches, and is what the
  `building-architecture-models` skill drives. It is how every real model in this repo was built.
- The **browser path** creates a node named after its own type (`addNode` passes `name: type`), with
  no fields, at whatever the current focus is — then leaves the user to fill a form field by field.
  Each keystroke in `SidePanel` is a `PATCH` (`onChange` → `updateNode`), so typing a description
  writes the model file once per character.

The browser path is also the only thing that can silently corrupt a model in a way nobody notices: a
misclick on `Delete node` removes the node *and* every connection touching it, with no undo and no
confirmation (`store.ts:166-178`).

Nothing depends on it. The canvas has been non-editable for some time already
(`nodesDraggable={false}`, `nodesConnectable={false}`, no `onConnect` — `Canvas.tsx:221-222`), so
"editing" today means the toolbar's `add` buttons plus a form in the inspector. Removing it makes the
product what it actually is: **agents write over MCP, humans read the diagram.**

This change is **not lossy** — no model data or MCP capability is removed. It removes client code.

## Design

### 1. Write surfaces removed (`apps/web`)

- **`App.tsx`** — the `add {t}` button row (`:162-164`), the `addNode` selector (`:50`), the
  `addable` computation (`:148`), and the `allowedChildTypes` / `topLevelTypes` imports that only
  fed it. The toolbar keeps breadcrumbs, `SearchBox`, and the audience toggle.
- **`SidePanel.tsx`** — every `input` / `select` / `textarea`, the `FieldInput` component, the parent
  `<select>` (`reparent`), and both `Delete node` / `Delete connection` buttons. Replaced by the
  read-only renderers of §2.
- **`FloatingConnectionLine.tsx`** — deleted. It is the line drawn while dragging to create a
  connection and is already referenced by nothing (`grep` finds only its own definition).
- **`Canvas.tsx`** — no change. Already read-only.

`TreePanel` needs no change: it has never written.

### 2. The inspector becomes a detail view

`SidePanel` keeps its structure — node panel, connection panel, rollup panel, empty state — and
swaps controls for text. Two local renderers replace `FieldInput`:

- **`Row`** — `<div className="field"><span>{label}</span><span className="field__value">{value}</span></div>`,
  reusing the existing `.field` label/value stack so the panel's rhythm is unchanged.
- **A list variant** — `list`-typed profile fields and `codeRefs` / `docRefs` render as a `<ul
  className="field__list">`, one `<li>` per entry, instead of a newline-joined textarea.

Value formatting: `boolean` renders `yes` / `no`; `number` renders the number; `enum` and `string`
render the raw value.

**Empty values are omitted entirely.** No row for an absent `root`, an empty `codeRefs`, or an
unfilled profile field — a short panel is the signal that a node is thinly described, and
`model_gaps` is the tool for auditing that properly.

**Refs stay navigable.** A `ref`-typed field, and the `parent` row, render the target node's *name*
as a button calling `revealNode(id)` — the read-only counterpart of a `<select>` whose options were
nodes. Losing the ability to *set* a parent should not cost the ability to *follow* one. A ref whose
id no longer resolves renders the raw id, dimmed, rather than vanishing (the same treatment
`TreePanel` gives a dangling pattern anchor).

**Node panel** — `<h2>{node.name}</h2>`, then rows in this order: `type`, `role`, `summary`,
`technology`, `description`, `root`, `codeRefs`, `docRefs`, the remaining profile fields from
`nodeFields(c4Backend, node.type)`, `parent`. Then the existing `Connections (n)` /
`Outgoing` / `Incoming` block with `ConnectionList`, unchanged.

The `On diagram` / `Detail` `<h3>` headings go away. They grouped fields by editing affordance —
"these two show on the canvas, so fill them first" — which means nothing once nothing is filled in.
`role` becomes an ordinary row.

**Connection panel** — `Connection` heading, `from → to`, then rows for `verb`, `object`,
`direction`, `description`, and `connectionFields(c4Backend)`; then `Realized by (n)`, unchanged.

**Rollup panel and the "No node selected" empty state are untouched.**

`styles.css` gains `.field__value` and `.field__list`, and **loses**
`.field input, .field textarea, .field select` plus `.field textarea { min-height }` (`:35-36`) —
`SidePanel` was their only consumer; `FilterPanel` and `SearchBox` style their own controls inline.

### 3. Store and API client

`store.ts` loses:

- `addNode`, `updateNode`, `reparent`, `deleteNode`, `addConnection`, `updateConnection`,
  `deleteConnection` (`:37-43`, `:146-199`) and their entries in the `State` type;
- the `recover()` helper (`:48-56`) — the 422-resync path exists only for writes;
- the **`error`** field (`:18`, `:69`). It is written only by `recover()` and read by nothing: no
  component renders it. It goes rather than lingering as a field that can never become non-null;
- the `newId`, `Node` and `Connection` imports, now unused.

What remains is navigation and view state: `model`, `focusId`, `selectedId`, `selectedFlowId`,
`selectedPatternId`, `connFilter`, `audience`, `expandedExternals`, `offViewStepOrders`,
`setModel`, `syncFromServer`, `setFocus`, `revealNode`, `revealStep`, `select`, `selectFlow`,
`selectPattern`, `setOffViewSteps`, `setAudience`, the three filter togglers, `toggleExternal`.

**`ownVersion` stays.** The SSE handler still guards `version > useStore.getState().ownVersion`
(`App.tsx:114-115`) so the version `loadModel` already returned does not trigger a redundant
resync. It is now only ever set from a load, never from a write.

`api.ts` shrinks to **`loadModel` alone**: `mutate()`, the six write wrappers, and `ApiError` all
go — `loadModel` throws a plain `Error`, so nothing constructs or catches an `ApiError` any more.

`apps/server` and `apps/server/src/mcp.ts` are **untouched**. The HTTP write endpoints and all twelve
MCP write tools keep working exactly as they do now; the browser simply stops calling them.

### 4. Testing

Red first for the new read-only rendering, per repo convention.

Three suites carry the write path. `store.test.ts`, `SidePanel.test.tsx` and `App.test.tsx` each open
with a large `vi.mock('../src/api')` block that stubs `createNode` / `updateNode` / `deleteNode` /
`createConnection` / `updateConnection` / `deleteConnection` / `ApiError` (and a stale
`setNodePosition` that `api.ts` no longer exports). All three mocks collapse to `loadModel`.

**Deleted** — tests of behaviour that no longer exists:

| File | Cases |
|---|---|
| `apps/web/test/store.test.ts` | add / update / delete node, add / update connection, cascade delete, `reparent`, the 422-recovery case (`:87`) |
| `apps/web/test/SidePanel.test.tsx` | every `edits …` case (name, invariants, root/codeRefs/docRefs, verb, object, direction, description, profile fields), the reparent-via-dropdown case (`:69`), both delete cases |

**Rewritten** — tests that used `addNode('Component')` merely to get a node into the store. There are
21 such call sites across `store.test.ts` and `SidePanel.test.tsx` today; those inside a deleted case
go with it, and each survivor seeds with
`setModel({ ...emptyModel(), nodes: [...] })` instead. This is strictly better: the fixture becomes
explicit and the test stops depending on the write path to arrange its own state.

**New coverage:**

- the toolbar renders no `add …` button;
- the node panel renders no form control at all —
  `container.querySelector('input, select, textarea')` is `null` — and no `Delete` button;
- a node's name, description, and profile field values render as text;
- an empty `root` / `codeRefs` / unfilled profile field renders **no row**;
- `codeRefs` renders one `<li>` per ref;
- the `parent` row and a `ref`-typed field render a button that calls `revealNode` with the target
  id; an unresolvable ref renders the raw id;
- the connection panel renders `verb` / `object` / `direction` as text with no controls.

The 508-test baseline will land **lower** — this deletes more assertions than it adds. `pnpm -r test`
green is the gate, and the new number is recorded in `CLAUDE.md`.

### 5. Docs

Living docs, same branch:

- **`README.md:49`** — "**Editing.** Create / edit / delete nodes and connections. The side panel
  renders the core fields…" is rewritten as an inspector description: what the panel shows, that
  refs and the parent are navigable, and that the browser does not write.
- **`README.md:3`** and **`README.md:16`** (the `## Editor` section) — state the split plainly: the
  model is written by agents over MCP and by direct edits to the JSON file; the browser reads it and
  live-updates over SSE.
- **`docs/SPEC.md:3, :19, :45, :77`** — the "visual editor" framing and "the developer maintains
  their project's model by hand through the visual editor" claim. Corrected to read-only viewing plus
  agent authorship. The phase entries that promise "MCP + editor" (`:393, :397, :401`) mean *write*
  editor and need the same correction; `:63` and `:214` ("no editor yet" / "editor later" for the
  reserved axes) become "no viewer yet".
- **`docs/MODEL.md:134, :341-342, :350`** — "has no MCP tool or editor yet", "no editor, MCP tool, or
  reader yet", "moved from reserved to built (MCP + editor)", and the table column "When in the
  editor". Each conflates *writable by MCP* with *visible in the browser*; split into those two words.
  `:26`, `:211` and `:238` describe the LLM editing the graph and tooltips for "the LLM and editor" —
  both still true, left alone.
- **`CLAUDE.md`** — the test baseline number. The listed invariants are all about the focus-view
  pipeline and panel layout; none covers writes, so they stand.

Historical records under `docs/superpowers/{plans,reviews}/` are left alone.

## Out of scope

- **Any server or MCP change.** The write endpoints stay; removing them would break every MCP write
  tool, since the MCP is an HTTP client of the server.
- **Flows and patterns.** The UI has never created or edited them, so there is nothing to remove.
- **Re-adding editing behind a flag.** If human editing is ever wanted back, it returns as a designed
  feature (a proper form, one save, validation surfaced) rather than as this code re-enabled.
- **Node position persistence.** Positions are computed by `layoutFocusView`, not stored; the stale
  `setNodePosition` in the test mocks is removed as dead, not replaced.

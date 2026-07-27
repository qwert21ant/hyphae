# Retire `Connection.type` and `transport`

**Date:** 2026-07-27
**Status:** agreed, ready for a plan

## Problem

A connection currently carries two classification fields on top of `verb` + `object` +
`description`:

- **`type`** — a `ConnectionKind` id from the profile: `Dependency` | `DataFlow` | `Realization` |
  `Trace`.
- **`fields.transport`** — a common connection field: `Sync` | `Async` | `InProcess` | `None`.

Neither earns its place. Measured across the 411 connections of the real Baritone model
(`apps/server/hyphae-baritone.json`):

### `transport` is ill-formed, not merely redundant

The enum conflates two orthogonal axes — **does the caller block** (Sync/Async) and **does the call
cross a process boundary** (InProcess). An in-process call is also synchronous, so whoever fills the
field must pick one axis and silently discard the other. The model shows exactly that:

```
invokes | InProcess   86        reads | InProcess   67
invokes | Sync        20        reads | Sync        10
```

The same verb on the same kind of edge, annotated two ways, in a single build pass. 325/411 (79%)
are `InProcess`, which only restates "both endpoints share a container" — already derivable from
`parentId`. Genuinely informative values: `Async`, 4 occurrences.

### `type` duplicates verb class, and does it worse

The four kinds are not reliably distinguishable by the annotator:

```
reads | Dependency  53         uses | Dependency  58
reads | DataFlow    25         uses | Realization 41
```

`reads` is filed as a data flow 32% of the time and a dependency 68% of the time, effectively at
random. `Realization` is documented as "A implements an interface defined by B" yet appears on
`modifies` and `subscribes`. 315/411 (77%) are `Dependency`, the shrug value.

Meanwhile `verb.class` (`dataAccess` / `messaging` / `control` / `user`) provides the same
categorical axis, is **derived from the verb and therefore cannot go inconsistent**, and is what
actually drives rendering — `reactflow.ts` colours every edge by verb class. Nothing on the canvas
reads `type` or `transport` at all.

### What the fields cost

Their entire footprint is a text suffix in `ConnectionList`, two `FilterPanel` groups, a `<select>`
in `SidePanel`, two MCP filter params, and four places in the docs telling an LLM to fill them in.
Every model build spends tokens on two fields that are then ignored by the renderer.

### Counter-consideration, recorded

`description` is empty on 326/411 connections (79%). "The description covers it" is true in
principle but is not what happens in practice, so this change removes structured data that prose is
not currently replacing. The judgement — accepted — is that the removed data is noise. `object` is
populated on all 411, so verb+object genuinely carries the label.

**This change is lossy.** 50 `Realization` markings, 46 `DataFlow` markings and 41 `Sync` markings
are discarded and do not come back without a model rebuild.

## Design

### 1. Schema (`packages/schema`)

- **Remove `Connection.type`** (`connection.ts:9`). Zod strips unknown keys by default, so a
  `"type"` left in an existing model file disappears on parse — no error, no migration.
- **Remove `Profile.connectionKinds`**, `ConnectionKindSchema`, the `ConnectionKind` type and
  `connectionKindIds()` (`profile.ts:68, 80, 93, 146`). With no `type` to key off, per-kind
  connection fields have nothing to attach to.
- **Split `effectiveFields`** (`profile.ts:150`) into `nodeFields(profile, type)` and
  `connectionFields(profile)`. The `scope` parameter and the kind lookup both disappear.
- **Remove `transport`** from `c4Backend.commonConnectionFields`, leaving the array empty. The
  array itself stays so a custom profile can define connection fields — the same lever the
  configurable-profiles goal needs.
- **Remove `connectionKinds` from `c4Backend`** (`c4-backend.ts:75-80`).
- **Add verb class `traceability`** to `VerbClassSchema` (`profile.ts:28`), with two verbs in
  `c4-backend`:
  - `implements` — this node implements a functional requirement or a declared interface.
  - `satisfies` — this node meets a quality requirement.

  This is where the honest half of `Realization`, and all of the reserved `Trace` kind, now live.
  A traceability link becomes a first-class colour rather than a fourth enum value nobody applied.
- **`validate.ts`:** drop the `connKindById` map (line 95) and the `unknown-connection-kind` issue
  (lines 137-139); line 153 calls `connectionFields(profile)`.

### 2. No migration

Existing model files keep a stale `fields.transport`, and `validate.ts:34` reports `unknown-field`
for any key with no profile definition — so `validate_model` will flag those 411 connections and
`TreePanel` will badge them until the key is stripped.

This is accepted. Handled by a throwaway script over `hyphae-baritone.json`, written and run
outside this change and not committed. `type` needs nothing: Zod strips it on the next parse.

### 3. Rendering (`apps/web`)

- `reactflow.ts:35` — add `traceability: '#0d9488'` (teal) to `VERB_CLASS_COLOR`. Violet is reserved
  for derived rollup edges; green would clash with the Component layer tint.
- `focusView.ts` — remove `FocusEdge.kind` (line 15 area), the `Entry.kind` that feeds it
  (line 188) and `kind: c.type` (line 201). Both are already dead: no renderer reads them.
- `Legend.tsx:53` — the four classes are hardcoded. Derive the list from `c4Backend.verbs` grouped
  by class so the legend cannot drift from the profile again.
- `Legend.tsx:40` — the copy "solid — one authored connection (label = kind)" is already stale; the
  label has been verb+object since Phase A. Corrected in passing.

### 4. UI (`apps/web`)

- **`FilterPanel`** loses both groups, so it needs a replacement axis or it renders an empty box.
  It filters by **verb class**, presented as the same grouping the legend shows: five checkboxes
  (`dataAccess`, `messaging`, `control`, `user`, `traceability`) replacing the current eight (four
  kinds + four transport values). The axis is derived, so a filter can never disagree with the edge
  colour on screen.
  - `ConnFilter` (`focusView.ts:3`) becomes `{ verbClasses: string[]; fields: Record<string, string[]> }`.
  - `store.ts` — `toggleConnKind` → `toggleConnVerbClass`; initial state and `clearConnFilter`
    updated (lines 33, 70, 124-127, 135).
  - `matchesFilter` (`focusView.ts:34`) matches on `verbClassOf(c4Backend, c.verb)`.
  - The generic `FieldGroup` mechanism stays, driven by `commonConnectionFields`; with that array
    empty it renders nothing today.
- **`SidePanel`** — drop the connection-type `<select>` (line 160-161). No replacement: the verb
  dropdown already covers it. Line 170 calls `connectionFields(c4Backend)`.
- **`ConnectionList:28`** — the `· {type} · {transport}` suffix becomes the connection's `object`.

### 5. MCP (`apps/server/src/mcp.ts`)

- `list_connections` (line 145, 186-187, 421-422) — drop the `type` and `transport` params; add
  `verb` (an exact verb id) and `verbClass`. Query power is preserved in the new vocabulary.
- Result objects drop both fields: `list_connections` (line 204), `rollup_connections` (line 264),
  `get_subgraph` (line 76).
- `get_subgraph` (line 454) — drop the `type` traversal filter.
- `rollup_connections` (line 214) — the `type` filter becomes `verbClass`.
- `create_connections` (line 491) — `type` leaves the required input item shape.
- `describe_profile` (lines 378-380) — connection field aggregation no longer loops over kinds;
  it returns `connectionFields(c4Backend)` directly. The removal of `connectionKinds` from its
  output follows from the profile change.

### 6. Docs

Living docs, updated in the same branch:

- `README.md:48-49` — names all four kinds.
- `docs/SPEC.md:143-144` — the core connection field list.
- `docs/MODEL.md:86` — the kind enum.
- `skills/building-architecture-models/references/subagent-prompt.md:84` — the JSON template that
  tells a subagent to emit `type` and `transport`.
- `docs/MODEL.md:52`, `docs/SPEC.md:216`, `docs/SPEC.md:298` — describe the reserved Intent axis in
  terms of `Trace` connections; rewritten to the `traceability` verb class.

Historical records under `docs/superpowers/{plans,reviews}/` are left alone.

## Testing

Red first, per repo convention — especially for the pure functions (`matchesFilter`, `focusView`,
`connectionFields`).

Suites that assert on the removed fields and must change:

| File | What it asserts |
|---|---|
| `packages/schema/test/c4-backend.test.ts` | `connectionKindIds` equals the four kinds (line 35); connection fields equal `['transport']` (line 48); `effectiveFields` signature throughout |
| `packages/schema/test/validate.test.ts` | `unknown-connection-kind`, transport enum validation |
| `apps/server/test/mcp.test.ts` | `describe_profile` returns `connectionKinds` containing `Dependency` (line 184); connection filters |
| `apps/server/test/routes.test.ts` | connection payloads carrying `type` |
| `apps/server/test/store.test.ts` | connection fixtures |
| `apps/web/test/store.test.ts` | `connFilter` shape, `toggleConnKind` |
| `apps/web/test/SidePanel.test.tsx` | the type `<select>` |
| `apps/web/test/ConnectionList.test.tsx` | the `· type · transport` suffix |

New coverage: verb-class filtering in `matchesFilter`, the `traceability` class colouring an edge,
and a legend derived from the profile rather than a literal.

The 490-test baseline will land **lower** — these removals delete real assertions rather than
rewriting all of them. `pnpm -r test` green is the gate; the new number gets recorded in
`CLAUDE.md`.

## Out of scope

- Reintroducing sync/async in any form. The `messaging` verb class already implies asynchrony, and
  only 4 of 411 edges were marked `Async`. If a real question needs it later, it returns as a
  single-axis field.
- Any change to `direction`, `realizedBy`, `codeRefs` or the rollup derivation.
- Building the Intent axis. This change only reserves its vocabulary in the verb list.

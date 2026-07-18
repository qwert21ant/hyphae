# Business-Legible Rethink — Program Plan

> **For agentic workers:** This is a **program-level plan**, not a task-level one. It sequences
> six phases and carries the context a fresh session needs to work on any one of them. Before
> implementing a phase, write a detailed task-level plan for it with
> `superpowers:writing-plans` (output: `docs/superpowers/plans/YYYY-MM-DD-<phase>.md`), then
> execute it with `superpowers:subagent-driven-development` or `superpowers:executing-plans`.
> Do not implement directly from this document — it deliberately stops short of TDD steps.

**Goal:** Turn Hyphae from an LLM-first C4 knowledge graph that happens to render into a
**business-legible architecture diagram** — readable at a glance by a person, still queryable
and writable by an LLM over MCP.

**Architecture:** Keep every existing mechanism (single JSON source of truth, granular
validated writes, SSE, profile-driven meta-schema, focus-view drill-down). Add meaning *to the
canvas*: node role shapes, verb-labeled connections, numbered Flows, Pattern overlays, and a
real Data axis. Remove code-as-nodes, replacing it with anchored Refs plus Pattern members.
Every new vocabulary (roles, verbs, pattern kinds) is **profile-declared**, so a new project
type stays a new profile rather than a new engine.

**Tech Stack:** pnpm workspaces · TypeScript · Zod (`packages/schema`, source of truth) ·
Hono (`apps/server`) · Vite + React 18 + `@xyflow/react` + Zustand (`apps/web`) · Vitest ·
MCP over an HTTP client of the running server.

## Global Constraints

- **Zod schemas in `packages/schema/src` are the single source of truth.** TS types, JSON
  Schema (`json-schema.ts`), the server API, and the MCP tool shapes all derive from them.
  Never hand-write a JSON Schema or duplicate a type.
- **`schemaVersion` is currently `1`.** Any breaking on-disk change bumps it and ships a
  migration in `apps/server/scripts/migrate-model.ts`.
- **No whole-model write endpoint.** All writes stay granular and validated; an invalid write
  returns `422` with specific issues.
- **New vocabulary is profile-declared, never hardcoded.** Roles, verbs, and pattern kinds go
  into `packages/schema/src/profile.ts` + `profiles/c4-backend.ts`, and flow automatically
  into `describe_profile` and the MCP write shapes.
- **Every new field is described.** `FieldDef.description` is required and is what the LLM and
  the editor tooltips read. Enum values are described individually.
- **Optional-by-default.** The measured model shows optional fields get left empty or filled
  with a low-signal default (`intent` is 80% `Use`). Do not mark new fields required without
  evidence they will be filled.
- **Tests:** `pnpm -r test` must pass at the end of every task.
- **Backward compatibility:** `hyphae-cctv-new.json` (404 nodes / 567 connections) is the
  realistic fixture. Every phase must either keep it loading or ship its migration.

---

## Context for a fresh session

**Read these first:** `docs/MODEL.md` (the model concept), `docs/SPEC.md` (product + scope +
roadmap), and `docs/superpowers/specs/2026-07-18-business-legible-rethink-design.md` (the
decision record, D1–D7, with the evidence behind each).

### What Hyphae is today
A local web app: `apps/server` owns `hyphae.json` in memory, validates every write, persists
atomically, and broadcasts over SSE; `apps/web` renders a focus view (one node expanded to its
children, peers as ghost boxes, dashed purple derived rollup edges); an MCP server exposes read
tools (`describe_profile`, `model_overview`, `get_node`, `list_nodes`, `list_connections`,
`rollup_connections`, `get_subgraph`, `validate_model`, `model_gaps`) and write tools
(`create/update/delete_nodes`, `create/update/delete_connections`).

### Codebase map

| Path | Responsibility |
|------|----------------|
| `packages/schema/src/node.ts` | `NodeSchema` — id, name, type, parentId, description, codeRefs, docRefs, timestamps, `fields` |
| `packages/schema/src/connection.ts` | `ConnectionSchema` — id, from, to, type, description, direction, realizedBy, codeRefs, `fields` |
| `packages/schema/src/model.ts` | `HyphaeModelSchema`, `emptyModel()` |
| `packages/schema/src/profile.ts` | `Profile`/`NodeKind`/`ConnectionKind`/`FieldDef` + `effectiveFields`, `layerOfType`, `nodeAtOrAboveLayer` |
| `packages/schema/src/profiles/c4-backend.ts` | the only profile. Layers `['Context','Container','Component','Code']` |
| `packages/schema/src/validate.ts` | `validateModel(model, profile) → Issue[]`, `newIssues`, `resolveProfile` |
| `packages/schema/src/gaps.ts` | `modelGaps(model, profile) → ModelGaps` (orphans, unbound code edges, thin descriptions) |
| `packages/schema/src/rollup.ts` / `overview.ts` | derived higher-layer edges / Context+Container summary |
| `packages/schema/src/reserved.ts` | `Flow`/`StateMachine`/`DataType`/`Requirement`/`Decision` — all `z.unknown()`, **no reader anywhere** |
| `apps/server/src/routes.ts` / `store.ts` / `mcp.ts` | HTTP API / persistence + SSE / MCP tools |
| `apps/server/scripts/migrate-model.ts` | on-disk migrations |
| `apps/web/src/focusView.ts` | builds the focus view (children, ghost externals, edge pair-merge, rollup) |
| `apps/web/src/flow.ts` / `layout.ts` / `floating.ts` | React Flow node/edge mapping, dagre layout, floating-edge geometry |
| `apps/web/src/NodeBox.tsx` / `GhostNode.tsx` / `GroupNode.tsx` / `GhostGroupNode.tsx` | node renderers |
| `apps/web/src/SidePanel.tsx` / `ConnectionList.tsx` / `FilterPanel.tsx` / `Legend.tsx` / `SearchBox.tsx` | panels |
| `apps/web/src/store.ts` | Zustand editor state |

### Measured facts about the real model
These numbers justify several decisions; re-measure rather than trusting them if the fixture changes.

- 404 nodes: Context 13, Container 11, Component 81, **Code 299** (Class 192, Interface 59,
  UIComponent 30, Module 10, Function 8). **74% of nodes are Code-level.**
- 567 connections: 343 touch a Code node (60%); 189 are Component↔Component. 110 carry
  `realizedBy`, **all** on Component↔Component edges.
- Field signal: `technology` 92/92 filled. `intent` 517/567 set but **80% `Use`**.
  `direction` **563/567 Unidirectional**. `transport` InProcess 434 / None 90 / Sync 25 / Async 18.
- **Refs: 399 distinct, zero roots declared.** No System, Container, or Component carries a
  `codeRefs` anchor. Bases drift across four conventions (repo-relative, container-relative,
  app-relative, project-relative). **16 refs are ambiguous** — `src/main.ts` resolves to both
  Full Client and Streaming Client; `WebService/Program.cs#Program` to both Stream Keeper and
  Layout Manager.

---

## Phase sequencing

```
A0 (refs + roots)  ──┬──> C (patterns) ──┐
                     └──> E (code layer removal)
A  (visual language) ────> B (flows) ─────┴──> D (data axis)
```

- **A0 and A are independent** and can run in either order or in parallel; A0 is cheaper and
  unblocks more, so it goes first.
- **C depends on A0** (pattern members carry Refs) and reads better after A (renderers share
  the visual vocabulary).
- **E depends on A0 and C** — code nodes can only be deleted once their refs have an anchor and
  their nameable structure has somewhere to live.
- **D depends on A** (the verb/object edge label is where a data entity surfaces).
- **B depends on A** (flow step captions reuse the edge label machinery).

Ship order: **A0 → A → B → C → E → D.** E lands before D so the model is shrunk before new
entities are added on top.

---

## Phase A0 — Refs and roots (foundation)

**Goal:** Make every ref in the model resolvable, and make unresolvable ones a reported error.

**Why first:** `codeRefs` becomes the *sole* carrier of "where is this implemented" once the
Code layer goes away (Phase E), and Pattern members (Phase C) point at Refs. Both are blocked
until refs have an anchor. It is also the cheapest phase — a string convention, one optional
field, and validation.

**Decisions already made (D7, design doc §9):**
- A **Ref is a plain string**; kind is inferred from syntax. Chosen over a structured object
  because all 399 existing refs already fit `path` or `path#Symbol` (zero migration), it is
  cheap for an LLM to write, and it stays git-diff friendly.

  | Syntax | Kind | Example |
  |--------|------|---------|
  | trailing `/` | directory | `src/views/cctv/` |
  | plain path | file | `src/main.ts` |
  | `path#Symbol` | symbol | `src/main.ts#getRouter` |
  | `path#Lstart-Lend` | line range | `src/main.ts#L10-L40` |
  | contains `*` | glob | `src/views/**/*.vue` |

- **`root` is optional on any node**, resolved against the nearest ancestor that declares one,
  found by walking `parentId`. Roots chain System → Container → Component. This reuses
  containment instead of adding a mechanism, and handles the monorepo case in the fixture
  (`endpoints/media_gateway` alongside a frontend `src/`).

**Scope — in:**
- A `ref.ts` module in `packages/schema/src`: parse/classify a Ref string, and
  `resolveRef(model, nodeId, ref) → resolved path | ambiguity error`.
- `root?: string` added to `NodeSchema` (directory Refs only).
- New `Issue` kinds in `validate.ts`: unanchored ref, ambiguous ref, `root` that is not a
  directory Ref.
- A `refs` section in `modelGaps` for refs that do not exist on disk (drift), behind an
  opt-in flag so `model_gaps` stays filesystem-free by default.
- `root` surfaced in the MCP node write shapes and the web side panel.
- Backfill roots on `hyphae-cctv-new.json` and rewrite its refs to be root-relative.

**Scope — out:** changing the Code layer (Phase E), Pattern members (Phase C), multi-repo roots.

**Files:** create `packages/schema/src/ref.ts` + `test/ref.test.ts`; modify
`packages/schema/src/node.ts`, `validate.ts`, `gaps.ts`, `index.ts`,
`apps/server/src/mcp.ts`, `apps/server/scripts/migrate-model.ts`,
`apps/web/src/SidePanel.tsx`.

**Acceptance criteria:**
- Every one of the 399 refs in the fixture resolves to exactly one path.
- The 16 known ambiguities are gone, and reintroducing one is caught by `validateModel`.
- A ref with no anchoring root in any ancestor is an `Issue`.
- `pnpm -r test` passes; the fixture loads without migration errors.

**Risks:** the backfill must not silently rewrite a ref to the wrong root — diff it and spot-check
the 16 known-ambiguous cases by hand. Filesystem checks must stay optional so the server does not
need repo access to validate a model.

**Decide during phase planning:** whether a missing-on-disk ref is an error, a `model_gaps`
warning, or an auto-repair attempt (SPEC §12). Default to warning.

---

## Phase A — Visual language

**Goal:** Make the diagram legible without opening the side panel.

**Decisions already made (D1, D2, design doc §3, §4.1–4.2):**
- On the canvas a node shows **role shape/icon + name + a one-line purpose + tech chip**; a
  connection shows **verb + object**. Everything else is side-panel.
- `role` on a node kind selects the archetype: actor, service, datastore, queue, external, UI.
- `verb` is profile-declared and colored by class: *data access* (reads / writes / stores /
  modifies / aggregates / deletes / queries), *messaging* (publishes / subscribes / sends /
  notifies), *control* (invokes / triggers / requests), *user* (views / submits / navigates).
- **`intent` is retired** — it is 80% the generic `Use` and carries almost no signal. `verb`
  replaces it.

**Scope — in:** `role` on `NodeKindSchema`; `verb`/`object` on `ConnectionSchema`; a `verbs`
vocabulary on `ProfileSchema`; role-shaped node renderers; edge labels with verb-class color;
`Legend.tsx` updated to explain role shapes and verb classes; side panel restructured into
"on-diagram" vs "detail"; migration mapping existing `intent` values onto verbs.

**Scope — out:** flows, patterns, data entities.

**Files:** `packages/schema/src/profile.ts`, `profiles/c4-backend.ts`, `connection.ts`,
`validate.ts`; `apps/server/src/mcp.ts`, `scripts/migrate-model.ts`;
`apps/web/src/NodeBox.tsx`, `GhostNode.tsx`, `flow.ts`, `Legend.tsx`, `SidePanel.tsx`,
`styles.css`.

**Acceptance criteria:** a reader can name what each node is and what each edge does from the
canvas alone; every fixture connection has a verb after migration; the legend explains every
shape and color used.

**Risks:** label density on a 32-degree node. Mitigate with the existing dim/highlight and a
length cap on the object text — measure before adding new hiding machinery.

**Decide during phase planning:** whether `verb` is required on a connection (leaning yes, with
a neutral default like `uses`, since an unlabeled edge defeats the phase's purpose), and whether
`direction` survives at 563/567 constant.

---

## Phase B — Flows

**Goal:** Build the Behavior axis — numbered scenario overlays.

**Decisions already made (D2, design doc §4.4):** Flows are the temporal counterpart to
Patterns' static shape. Selecting a flow lights its steps in order along the edges with per-step
captions.

**Scope — in:** replace `FlowSchema = z.unknown()` in `reserved.ts` with a real schema —
`id`, `name`, `description`, `scope` (layer), and ordered `steps` of
`{ order, from, to, via?, message, kind: Sync|Async|Return, control?: { type: alt|opt|loop|par, condition } }`;
the invariant that every `from`/`to`/`via` exists, with affected flows marked invalid on
delete; MCP read + write tools; a flow picker and numbered overlay in the web app.

**Scope — out:** a full sequence-diagram view (a stretch goal, not required for the phase).

**Files:** `packages/schema/src/reserved.ts` → new `flow.ts`; `validate.ts`; `model.ts`;
`apps/server/src/mcp.ts`, `routes.ts`; `apps/web/src/store.ts`, `flow.ts`, `Canvas.tsx`,
plus a new flow picker panel.

**Acceptance criteria:** a flow authored over fixture nodes renders as numbered steps; deleting
a referenced node marks it invalid and the UI shows that; MCP can create and read flows.

**Risks:** `flow.ts` in `apps/web` is React Flow mapping and now collides in name with the Flow
entity. Rename one of them during this phase.

---

## Phase C — Patterns

**Goal:** Show architectural shape without a class graph.

**Decisions already made (D4, design doc §4.3, §9.3):**
- `Pattern` is a **profile-driven overlay entity**: `kind`, `members`, optional `order`, plus
  kind-specific detail. `patternKinds` is declared by the profile.
- Kinds and renderers: **pipeline** (ordered stages in a row), **middleware** (onion/stack),
  **state-machine** (state chart), **layered** (stacked bands), **event-bus** (hub).
- **The old `StateMachine` entity folds in** as the `state-machine` kind — do not keep both.
- **A member is `{ name, nodeId? | ref?, description? }`, carrying exactly one of the two.**
  This is load-bearing: code-level pipeline stages have no nodes to point at once Phase E lands,
  so they are named members carrying a Ref into the source. Higher-altitude patterns use `nodeId`.

**Scope — in:** `PatternSchema`; `patternKinds` on `ProfileSchema`; `patterns: []` on the model;
validation (member exclusivity, kind known, refs resolvable via A0, ordering only on ordered
kinds); one renderer per kind; MCP read + write.

**Scope — out:** inferring patterns from code.

**Files:** create `packages/schema/src/pattern.ts` + tests; modify `profile.ts`,
`profiles/c4-backend.ts`, `model.ts`, `reserved.ts` (drop `StateMachineSchema`), `validate.ts`;
`apps/server/src/mcp.ts`; new pattern renderers in `apps/web/src` + registration in
`Canvas.tsx`.

**Acceptance criteria:** a `pipeline` Pattern with ref-only members renders its stages inside a
Component; a `state-machine` Pattern renders states and transitions; a member with both `nodeId`
and `ref`, or neither, is an `Issue`.

**Risks:** five renderers is the bulk of the work. Build `pipeline` and `state-machine` first,
confirm the overlay/layout approach against the existing focus-region wrapping in
`apps/web/src/flow.ts`, and only then add the rest.

**Decide during phase planning:** whether a node may belong to two Patterns (SPEC §12), and how
pipeline ordering is authored in the UI.

---

## Phase E — Retire the Code node layer

**Goal:** Delete 299 nodes and 343 edges of class-level plumbing without losing architectural
information.

**Decisions already made (D3, design doc §5.1, §9.3):** code presence becomes `codeRefs` on the
Component plus an optional Pattern. Profiles drop the Code node kinds.

**Scope — in:** a migration that, for each Code node, folds its `codeRefs` onto its parent
Component and **collapses them into directory/glob Refs where possible** — 328 refs onto 81
Components is unusable as flat lists, and `src/views/cctv/**` replaces thirty class refs;
Code↔Code connections are dropped where a Component↔Component edge already summarizes them via
`realizedBy`, and promoted where it does not; Code kinds removed from `c4-backend`
(`Class`, `Interface`, `Module`, `UIComponent`, `Function`) and `'Code'` removed from `layers`;
`schemaVersion` bump.

**Scope — out:** re-authoring the model by hand.

**Files:** `packages/schema/src/profiles/c4-backend.ts`, `model.ts`, `validate.ts`, `gaps.ts`
(the `unboundCodeEdge` gap loses its meaning — remove or repurpose);
`apps/server/scripts/migrate-model.ts`; `apps/web/src/focusView.ts` (the layer list
`['Context','Container','Component','Code']` in `representativeWith`).

**Acceptance criteria:** the migrated fixture has zero Code-layer nodes; every surviving
Component still resolves to real code through its refs; no Component carries an unreadable flat
ref list; `pnpm -r test` passes.

**Risks:** **this is the only destructive phase.** Migrate to a new file, diff node-by-node
against the original, and keep the pre-migration fixture committed. Structure described on a
Code node's `description`/`responsibilities` (164/299 have responsibilities) is real content —
decide per node whether it becomes a Pattern member description or is dropped, and report what
was dropped rather than discarding silently.

**Decide during phase planning:** whether ref collapsing into globs is automatic (risk:
over-broad globs) or proposed for review. Leaning: propose, human confirms.

---

## Phase D — Data axis

**Goal:** Answer "what data moves where, and who owns it."

**Decisions already made (D5, design doc §4.5):** named `DataEntity` objects that connections
**carry** and nodes **own/store**, plus an ERD-style projection. The connection `object` from
Phase A becomes a `DataEntity` ref when one applies, so "reads → Camera" links the edge into the
data model.

**Scope — in:** `DataEntitySchema` (id, name, kind Entity|Value|Event|DTO, description, optional
fields) replacing `DataTypeSchema = z.unknown()`; `carries` on connections and `owns`/`stores`
on nodes; validation that refs resolve; MCP read + write; a data projection view.

**Scope — out:** entity-to-entity relationships and cardinality unless the phase plan justifies
them (SPEC §12) — start with ownership and carriage only.

**Files:** create `packages/schema/src/data-entity.ts`; modify `reserved.ts`, `model.ts`,
`connection.ts`, `node.ts`, `validate.ts`; `apps/server/src/mcp.ts`; a new data view in
`apps/web/src`.

**Acceptance criteria:** a data entity carried by a connection shows on the edge label; the data
projection lists each entity with its owner and the connections carrying it.

**Risks:** the largest speculative surface — nothing in the fixture uses it yet. Author a
handful of real entities against the cctv model before building the view, to confirm the shape
earns its keep.

---

## Cross-cutting notes

- **Reserved axes.** `requirements` and `decisions` stay `z.unknown()` and out of every tool
  surface. `flows`, `stateMachines`, and `dataTypes` stop being reserved as B, C, and D land —
  `stateMachines` is **deleted**, not implemented, since Patterns absorb it.
- **MCP surface.** Every new entity needs read and write tools built from the profile, the same
  way node/connection write shapes are today (`fieldsShape` in `apps/server/src/mcp.ts`).
  `describe_profile` must expose roles, verbs, and pattern kinds or the LLM cannot author them.
- **The modeling skill.** `plugins/hyphae-modeling/` teaches subagents to build models. It
  encodes the Code layer and the current ref convention, so it needs updating in A0 (roots) and
  E (no Code layer) or newly built models will contradict the schema.
- **README.md** documents the shipped implementation and will drift as phases land; refresh it
  at the end of each phase rather than up front.

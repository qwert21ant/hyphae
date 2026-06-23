# Hyphae — handoff for a fresh agent session

A compact, current snapshot of the project so a new session can be productive without replaying
history. For the why behind the model see `MODEL_RU.md`; for product scope see `SPEC_RU.md`; this
file is the practical "where things are now."

## What Hyphae is

A local, single-process web app + MCP server for editing one JSON model of a software architecture
(C4-style: System → Container → Component, plus Actors/ExternalSystems). The model is readable and
**writable** by LLM agents over MCP and by a human in a React Flow editor. The running server is the
single source of truth; every write is validated; changes broadcast over SSE.

## Repo layout (pnpm workspaces)

```
packages/schema   @hyphae/schema  — Zod schemas (source of truth) → TS types + JSON Schema,
                                    the Profile meta-schema, validation, getContext renderer,
                                    rollupConnections. Pure: no HTTP/React.
apps/server       @hyphae/server  — Hono HTTP API + atomic versioned ModelStore + SSE /events,
                                    and the MCP server (HTTP client of the running server).
apps/web          @hyphae/web     — Vite + React + Zustand + React Flow editor.
```
Run: `pnpm install`; server `pnpm --filter @hyphae/server dev` (:5173, owns the model file);
web `pnpm --filter @hyphae/web dev` (:3000). Tests: `pnpm -r test` (schema 28, server 51, web 35).
Typecheck a package: `npx tsc -p <pkg> --noEmit`. Web build: `pnpm --filter @hyphae/web build`.

## The model & schema (CURRENT — profile-driven)

The **Profile is the meta-schema.** Core Node/Connection are lean; everything domain-specific lives
in a `fields: Record<string, unknown>` bag validated against the active profile.

- **Node (core):** `id, name, type, parentId, description, codeRefs, docRefs, createdAt, updatedAt, fields`.
  - `codeRefs` convention for Code nodes: `path/to/file.ext#SymbolName` (still `string[]`, not
    schema-enforced).
- **Connection (core):** `id, from, to, type, description, direction, realizedBy, codeRefs, fields`.
  - `type` is a **ConnectionKind id** (it replaced the old `relationCategory`).
  - `realizedBy: string[]` is top-down: a higher-layer Component↔Component edge lists the ids of the
    lower-layer (Code↔Code) edges it aggregates. `rollupConnections` excludes any edge claimed by some
    edge's `realizedBy` from the derived rollup, so it isn't double-counted.
- **Profile** (`packages/schema/src/profile.ts`): `{ id, layers[], nodeKinds[], connectionKinds[],
  commonNodeFields[], commonConnectionFields[] }`.
  - `NodeKind = { id, category, layer, allowedParents[], allowedChildren[], fields: FieldDef[] }`.
  - `ConnectionKind = { id, description, allowedFrom?, allowedTo?, fields: FieldDef[] }`.
  - `FieldDef = { key, label?, type: 'text'|'number'|'boolean'|'list'|'enum'|'ref', description,
    required?, values?: {value, description}[], refKind? }`. Every field and every enum value carries
    a `description` (for LLMs + editor tooltips).
  - **Effective fields** of a kind = `common*Fields` then its own `fields`; **common wins on key
    collision**. Helper `effectiveFields(profile, kindId, 'node'|'connection')`.
- **The only profile** is `c4-backend` (`packages/schema/src/profiles/c4-backend.ts`):
  - layers Context → Container → Component → **Code**; node kinds System/Actor/ExternalSystem/
    Container/Component/**Class/Interface/Function/Module/UIComponent** (the Code kinds are all
    children of Component; they add no extra fields — they reuse core + the common
    `responsibilities`/`invariants`).
  - `commonNodeFields`: `responsibilities` (list), `invariants` (list). Container/Component add
    `technology` (text).
  - connection kinds `Dependency`/`DataFlow`/`Realization`/`Trace`; `commonConnectionFields`:
    `transport` (enum Sync/Async/InProcess/None, all described) + `intent` (enum, optional).
- **A node's `layer` and `category` are derived from its `type` via the profile**, never stored.
- **Validation** (`validate.ts`, strict, gated by `newIssues` so only newly-introduced issues block a
  write): unknown-type, missing/bad parent, dangling endpoint, unknown-connection-kind, unknown-field,
  bad-field-type, bad-enum-value, missing-required-field, bad-ref, bad-endpoint.
- Reserved axes `flows/stateMachines/dataTypes/requirements/decisions` exist as `z.unknown()[]` —
  no real shape yet. `schemaVersion` is `1` (no migration framework; see migration note below).

## MCP tools (`apps/server/src/mcp.ts`)

The MCP server is a thin HTTP client of the running server. `buildTools(api)` holds the handlers
(unit-tested directly). Tools register with `server.registerTool(name, { description, inputSchema }, cb)`
(SDK ^1.29). **Restart the MCP process after any code change** to pick up new tools/schemas.

- Read: `describe_profile` (returns the active profile — call first to learn kinds/fields/enum
  values), `get_text_context` (default **summary**; `mode:'full'`, `layer`, `root` subtree, `fields`),
  `get_node`, `list_nodes` (filters + pagination), `search_nodes` (text over name/description/fields),
  `find_connections`, `list_connections` (filters incl. `crossingBoundary`/`involvingExternal`, and
  `rollup:'Container'|'Context'` for derived higher-level edges with `realizedBy` expanded),
  `get_subgraph` (BFS over connections **and** containment; `containment` down/up/both/none).
- Write: `create_node`/`update_node`/`create_connection`/`update_connection`/`delete_*`. Domain
  values go in a `fields` object; the `type` param is a dynamic enum of the profile's kind ids, and
  the `fields` params are generated from the profile's FieldDefs. `create_connection`/
  `update_connection` expose `realizedBy` directly (binding lower-layer Code edges to the
  higher-layer Component edge they realize).

## Web editor (`apps/web/src`)

- `toModel.ts` maps the model to React Flow nodes/edges: layer filter, containment **regions**
  (GroupNode), **floating edges** (`floating.ts` + `FloatingEdge`/`FloatingConnectionLine`, attach to
  nearest border point), **cross-layer rollup** edges (dashed, derived; `crossLayerEdges`) and
  **ghost** nodes (`GhostNode`) for higher-layer endpoints dropped onto lower layers.
- `SidePanel.tsx` renders core fields + `effectiveFields(...)` generically (text/number/boolean/list/
  enum/ref); edits write into the node/connection `.fields` bag.
- `FilterPanel.tsx` is generated from the profile (connection kind + enum common-connection fields).
  Filter state `connFilter = { kinds, fields }` lives in the Zustand `store.ts` (client-only).
- `Canvas.tsx`: double-click drills into the child layer + focuses the region; selection highlights
  the element and its neighbors (`highlightSets`); per-layer viewport persisted to localStorage.
- Store is non-optimistic; re-syncs from the server on SSE version bumps.

## The modeling skill + plugin (for building models of OTHER repos)

- Personal skill installed at `~/.claude/skills/building-architecture-models/` AND versioned in-repo
  as a Claude Code plugin: `.claude-plugin/marketplace.json` (marketplace `hyphae`) +
  `plugins/hyphae-modeling/` (skill copy). Install elsewhere: `/plugin marketplace add <repo>` then
  `/plugin install hyphae-modeling@hyphae`.
- The skill is a resumable top-down flow: discover/verify packages → write System+Containers + a
  `docs/hyphae/model-plan.md` (GATE 1) → parallel per-container subagents write Components
  (subagents own only their subtree) → reconcile cross-package edges + amendments (GATE 2) →
  **Phase 4: the Code-layer pass** — per-container subagents add Class/Interface/Function/Module/
  UIComponent nodes under their Components and bind lower-layer edges to the Component-level edges
  they realize via `realizedBy` (GATE 3) → optional Verify pass. Spec/plan under `docs/superpowers/`.
- gitnexus (when available) is usable in **any** phase, not just Code, as long as its index of the
  target repo is current — use it to ground discovery/components/Code nodes in real symbols.
- The old `relationCategory` drift is fixed: the skill's prompts now use connection `type` + the
  `fields` bag (and call `describe_profile` first), matching the profile-driven schema.

## Migrating model files to the current schema

Old-shape model files no longer parse. Migrate with:
```
pnpm --filter @hyphae/server exec tsx scripts/migrate-model.ts <file.json> [more…]
```
`apps/server/scripts/migrate-model.ts` moves legacy top-level fields into `fields` (keeping only keys
the profile defines), renames `relationCategory`→`type`, validates, writes; idempotent; reports
non-empty dropped fields. Already run on `apps/server/hyphae.json` (gitignored) and
`apps/server/hyphae-cctv.json` (untracked). **Lossy by design:** fields the profile doesn't define
(e.g. `status`, `tags`, `assumptions`, and `technology` on System/External) are dropped — no backups
of those exist for the cctv model.

## Key decisions / gotchas

- Strict validation everywhere; rejected writes return `{issues}` with `422`.
- No migration framework — stay on `schemaVersion: 1`, rewrite/migrate files instead.
- Names are NOT unique; reference nodes by `id`. Component names repeat across containers.
- Rollup edges are **derived, not stored**; `realizedBy` is the authored cross-layer counterpart
  (top-down: higher edge → lower edge ids), and bound lower edges are excluded from rollup.
- The server owns one model file (`HYPHAE_FILE` to choose it). Don't edit the file while the server
  runs — go through the API/MCP.
- Reserved-axis arrays accept anything (`z.unknown()`); don't rely on them.

## State & what's open

- Done this stretch: read/query MCP tools, `update_connection`, `get_text_context` summary/scope,
  the whole web UX set (floating edges, rollup + ghosts, filter panel, selection highlight, drill-down,
  per-layer viewport), and the **profile-driven schema refactor** (committed, monorepo green).
- Open / next candidates (see `docs/mcp-tools-roadmap.md`): `model_stats` MCP tool; a skill step to
  LLM-summarize rollup edges; SidePanel pruning stale `fields` on type change; done: exposing
  `realizedBy` on the MCP connection tools; done: updating the building-architecture-models skill for
  the new schema (Code layer Phase 4); optionally re-introducing `technology`/`assumptions` as
  profile fields if you want them preserved.
- Findings from the first large-repo run live in `docs/feedback/2026-06-15-large-model-findings.md`.

## Doc map

`README.md` (run/usage) · `docs/MODEL_RU.md` (model concept) · `docs/SPEC_RU.md` (product spec) ·
`docs/mcp-tools-roadmap.md` (MCP tool roadmap + status) · `docs/superpowers/specs|plans/` (per-feature
design + implementation records) · `docs/feedback/` (review findings) · `docs/prompts/` (one-shot
modeling prompt — legacy; prefer the building-architecture-models skill).

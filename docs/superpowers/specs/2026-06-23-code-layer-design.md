# Code layer — design

Adds a fourth, code-level layer to the Hyphae `c4-backend` profile (below `Component`) plus the
modeling-skill workflow and edge-binding mechanics to build it. The layer captures the *important*
classes / interfaces / functions / modules / UI components that realize a Component's purpose —
selectively, not every file — anchored to real code via `codeRefs`, with gitnexus used as an
optional accelerator.

## Goals

- Model the code-level structure of a Component: which concrete code elements realize/support it.
- Be **selective** — skip utils, migrations, generated code, tests, trivial DTOs, boilerplate.
- Anchor every code node to real code through `codeRefs` (`path#Symbol` convention).
- Bind fine-grained cross-component code edges to the higher-level Component↔Component edges they
  explain, and keep the rollup mechanism from double-counting them.
- Adapt the `building-architecture-models` skill to build this layer top-down, breadth-first,
  resumably — reusing the existing per-container subagent + gate pattern.

## Non-goals

- Runtime coupling between the Hyphae server and gitnexus (gitnexus stays a skill-time accelerator).
- New per-kind fields for code nodes (lean: core fields + existing common fields only).
- A cap on how many code nodes per Component (model whatever is genuinely important).
- Making profiles configurable per project — that is a separate, later goal; this spec keeps the
  definitions hardcoded in `c4-backend.ts` (but written so it doesn't block configurability later).
- Hard schema/server validation of the "every cross-component edge is bound" rule (skill-enforced).

## Schema / profile changes (`packages/schema`)

### `profiles/c4-backend.ts`
- Add `'Code'` to `layers`: `['Context', 'Container', 'Component', 'Code']`.
- Add five node kinds, all `layer: 'Code'`, `allowedParents: ['Component']`, `allowedChildren: []`,
  `fields: []`:
  - `Class`, `Interface`, `Module`, `UIComponent` → `category: 'Structure'`
  - `Function` → `category: 'Behavior'`
- Update `Component.allowedChildren` to include those five kinds.
- **No new fields.** Code nodes use core fields (`name`, `type`, `parentId`, `description`,
  `codeRefs`, `docRefs`) plus the existing `commonNodeFields` (`responsibilities`, `invariants`).
- **Connection kinds unchanged** — reuse `Dependency` / `DataFlow` / `Realization` / `Trace` at the
  Code layer (intra- and cross-component edges both allowed).

### `connection.ts` — replace `realizes` with `realizedBy`
- Remove the dead `realizes: string[]` field (currently always `[]`, unread, not exposed in MCP).
- Add `realizedBy: z.array(z.string()).default([])` — **top-down**: a higher-layer edge lists the
  ids of the lower-layer connections it **aggregates and describes**.
- General/recursive (a Container↔Container edge could be `realizedBy` Component↔Component edges); the
  immediate use is **Component↔Component edges `realizedBy` Code↔Code edges**.
- Distinct from the `Realization` connection *kind* ("A implements an interface defined by B"):
  `realizedBy` is an aggregation/binding field, not an edge type.

### `rollup.ts` — exclude bound edges
- `rollupConnections` must **exclude any connection whose id appears in some edge's `realizedBy`**.
  A bound code edge is already represented by its authored Component↔Component parent and must not
  also be auto-derived (no duplication). The authored parent edge rolls up normally.
- The derived `RollupConnection.realizedBy` shape is unchanged; authored and derived edges now share
  the `realizedBy` vocabulary.

### Validation (`validate.ts`)
- No code change required. Containment is checked via `allowedParents`, types via the profile's
  `nodeKinds`, and fields via `effectiveFields` — all profile-driven, so the new kinds validate
  automatically. `schemaVersion` stays `1`.
- The "every cross-component code edge is bound" rule is **not** enforced here (see Skill section).

### `codeRefs` convention
- `codeRefs` stays `string[]` (not schema-enforced). Convention for code nodes:
  `path/to/file.ext#SymbolName` (e.g. `apps/server/src/mcp.ts#buildTools`), matching gitnexus's
  `filePath` + symbol name. A bare path is acceptable when no single symbol dominates (e.g. a
  `Module`).

## Server / MCP changes (`apps/server`)

- New node kinds and the `realizedBy` field flow through the profile-driven `create_node` /
  `create_connection` / `update_*` tools automatically (type enum + field generation come from the
  profile). Verify the generated schemas include the new kinds after restart.
- **Expose `realizedBy`** on `create_connection` / `update_connection` (supersedes the previously
  open "expose `realizes` on MCP connection tools" item).
- `migrate-model.ts`: rename `realizes` → `realizedBy` (all current values are `[]`, so trivial and
  lossless). Re-run on `apps/server/hyphae.json` and `apps/server/hyphae-cctv.json`.

## Web changes (`apps/web`)

The editor is layer-generic (reads `c4Backend.layers`, `typesForLayer`, `layerOfType`), so the
`Code` layer appears in the layer switcher, filtering, and Component→Code drill-down with little or
no code change.

- **Verify** drill-down into `Code` and rendering of many small nodes; fix only if something
  layer-specific breaks. The Code layer uses the raw-connections branch (like `Component`), not
  rollup.
- The rollup-exclusion change flows through automatically for Container/Context views.
- Optional: surface a connection's `realizedBy` in the SidePanel (the bound child edges).

## Selectivity rule (drives the skill)

**Include if ANY holds:**
- Realizes a stated responsibility/invariant of the parent Component.
- Is a public entrypoint / API surface of the Component (route handler, exported service, the class
  others construct/inject).
- Carries core domain logic (what the component actually does).
- Has high fan-in — other components/elements depend on it (confirm with gitnexus `impact`/`context`).
- Participates in a documented flow.

**Exclude by default:**
- Generic utils / helpers / constants / config.
- Migrations, generated code, scaffolding, build glue.
- Tests and fixtures.
- Trivial DTOs / plain type definitions with no behavior.
- Framework boilerplate.

**No cap** — model whatever is genuinely important. (If a Component yields an unwieldy number of
core code nodes, that is a signal the Component is too coarse — surface it, don't silently truncate.)

## Skill changes (`plugins/hyphae-modeling/...` + installed `~/.claude/skills/` copy)

### gitnexus available in any phase
gitnexus is a **cross-cutting accelerator, not phase-bound**. Add a single "gitnexus availability"
preamble (referenced from all phases): how to check the index is current (re-index if stale), when
to prefer it (`query`/`context`/`cypher`/`impact` for symbol discovery, file paths → `codeRefs`,
`CALLS`/`IMPORTS`/`IMPLEMENTS`/`EXTENDS` edges → connection kinds), and the **filesystem-reading
fallback** when gitnexus is unavailable or stale.

### Phase 4 promoted to a full, re-runnable "Code layer" pass
Runs after Phase 3 (Components reconciled & approved):
1. Dispatch **per-container** subagents (consistent with existing ownership — a subagent owns only
   its container's subtree). Each drills its Components, applies the selectivity rule, writes `Code`
   nodes + `codeRefs` + **intra-component** connections, and returns a structured report.
2. **GATE 3** (mirrors Phase 3): the orchestrator reconciles **cross-component / cross-container code
   edges** — resolve each endpoint by (container, component, name); dedupe; surface conflicts (never
   last-write-wins); apply after approval.
3. **Binding rule (orchestrator, at GATE 3):** every cross-component code edge MUST be bound to a
   Component↔Component edge. If a suitable Component↔Component edge exists, add the code edge to its
   `realizedBy`; if none exists, **create one** (description = what the child edges collectively
   represent) and bind it. Intra-component code edges need no binding.

### Verify pass extension
Add a check: cross-component code edges that are **not** referenced by any Component↔Component edge's
`realizedBy` are flagged as unbound; the owning container's subagent (or the orchestrator for the
Component↔Component edge) fixes them. Idempotent / re-runnable.

### Pre-existing drift fix (folded in)
While reworking the skill, fix the stale schema references:
- Replace `relationCategory` → connection `type` + the `fields` bag throughout.
- Instruct calling `describe_profile` first to learn kinds/fields/enum values.

### Files touched
`SKILL.md`, `references/subagent-prompt.md`, `references/analysis-loop.md` (gitnexus discovery step),
`references/plan-artifact-template.md` (Code-layer progress markers). Mirror all edits into the
installed `~/.claude/skills/building-architecture-models/` copy.

## Docs

- Update `docs/HANDOFF.md`: layers (now four), the `Code` node kinds, `realizes`→`realizedBy`, rollup
  exclusion, the skill's Code-layer pass + gitnexus-anywhere note.
- Update any layer references in `README.md` / model docs as needed.

## Testing

- `packages/schema`: update existing tests referencing `realizes`; add tests for (a) Code-kind
  containment validation (Code under Component ok; Code under Container/Code rejected), (b) rollup
  excluding `realizedBy`-claimed edges while still rolling up the authored parent.
- `apps/server`: MCP handler tests for `realizedBy` on connection create/update; profile exposes the
  new kinds. Migration test for `realizes`→`realizedBy`.
- `apps/web`: existing layer tests still green; add coverage if web code changes for Code rendering.
- Full monorepo `pnpm -r test` green before completion.

## Open risks / notes

- Rollup edge cases when a code edge's bound Component↔Component edge spans different containers than
  the code endpoints — documented; binding endpoints (the Component edge) determine the lift.
- Many small Code nodes could stress the web canvas; mitigated by per-layer viewport + the selective
  rule. Re-evaluate if a real model gets large.

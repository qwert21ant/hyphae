# Phase E — Retire the Code node layer (design)

> Date: 2026-07-23. Records the decisions for Phase E of the business-legible rethink.
> Parent program plan: [2026-07-18-business-legible-rethink.md](../plans/2026-07-18-business-legible-rethink.md) §"Phase E — Retire the Code node layer".
> Parent design: [2026-07-18-business-legible-rethink-design.md](2026-07-18-business-legible-rethink-design.md) (D3, §5.1, §9.3).
> Model concept: [MODEL.md](../../MODEL.md) §5.1, §7 rule 7 ("code is refs + shape, not nodes").
> Template phase: [2026-07-22-phase-c-patterns-design.md](2026-07-22-phase-c-patterns-design.md). Builds on shipped A0 (refs/roots), A (visual language), B (flows), C (patterns).

---

## 1. Goal

Remove the **Code node layer** from the model. Delete the five Code node kinds
(`Class`, `Interface`, `Module`, `Function`, `UIComponent`) and the `'Code'` layer from the
`c4-backend` profile, and clean up every downstream surface that assumed a Code layer exists
(gap detection, MCP tool descriptions, the web layer palette, hand-built test literals, the
modeling skill). After this phase the deepest modeled altitude is **Component**, and a
Component's internal code presence is expressed by its `codeRefs` (A0) plus an optional
`Pattern` (C) — not by class/interface/module nodes.

## 2. The re-scoping decision that shapes this phase

**No model migration ships in Phase E.** The program plan framed Phase E around a destructive
migration of the realistic fixture (`apps/server/hyphae-cctv-new.json`, 299 Code nodes) —
folding each Code node's `codeRefs` onto its parent Component, collapsing them into
directory/glob refs, and dropping/promoting the 343 Code↔Code edges. **The user has decided to
recreate the model from scratch after Phase E instead.** That removes the entire migration
half of the phase:

- no throwaway migration runner, no ref-collapsing heuristics, no edge drop/promote logic,
  no "what was dropped" report;
- the migration-shaped open questions (automatic vs assisted, edge promotion, responsibilities
  disposition, TDD-on-synthetic-transforms) are all **moot**;
- Phase E authors **no** Patterns and **no** `codeRefs` — the recreated model will.

Phase E is therefore a **pure schema/profile/code change**: drop the Code vocabulary and fix
what depended on it.

### Corrections to the handoff / program plan (verified against the current tree)

Several premises in the handoff were stale; the spec is written against measured reality:

- **The A0 migration script no longer exists.** `apps/server/scripts/migrate-model.ts` was
  deliberately deleted in commit `d40d6fa` ("one-off; not in tsconfig; fixture migrated on
  disk, left untracked"). There is no "same script" for Phase E to extend — and, per §2, none
  is needed.
- **All 343 code-touching edges are Code↔Code.** There are **zero** Component↔Code edges in
  the fixture. (Irrelevant now that no migration ships, but it confirms the Code layer is a
  clean, self-contained sublayer.)
- **`focusView.ts` does not hardcode `'Code'`.** It reads `c4Backend.layers` dynamically
  (`indexOfLayer` → `c4Backend.layers.indexOf`), so it needs **no** change when `'Code'`
  leaves `layers`. The handoff's claim that `representativeWith` hardcodes the layer list is
  wrong.
- **`profile.ts` has no Code references.** The apparent matches are the substring `class` in
  `VerbClass`. No change needed.
- **`validate.ts` has no Code-layer-specific logic.** It is fully profile-driven, so removing
  the Code kinds needs no edit there.

## 3. Fixed constraints for this phase

- **No model-file migration, and no committed model `.json`.** `apps/server/hyphae-cctv-new.json`
  and `apps/server/hyphae.json` are both **untracked**. Never `git add` a model `.json` (stage
  files explicitly; never `git add apps/server`). Run `git status --short` before **every**
  commit. The dev server loads `hyphae.json` (12 nodes, **zero** Code nodes), which stays valid
  after this change; the untracked cctv fixture becomes invalid and is left as-is for the user
  to recreate.
- **`schemaVersion` stays `1`** (D-E2). No migration means the version number would be a marker
  with no migration path; the user, who is recreating the model, chose to leave it. This keeps
  the phase free of `z.literal` and test-literal version churn.
- **Zod schemas in `packages/schema/src` are the single source of truth.** Vocabulary is
  profile-declared; removing a node kind is a profile edit, not a code-path edit. Never
  hand-write a JSON Schema or duplicate a type.
- **`pnpm -r test` does not type-check** (vitest strips types via esbuild). After every task run
  all three: `pnpm --filter @hyphae/schema exec tsc -p tsconfig.json`,
  `pnpm --filter @hyphae/server exec tsc -p tsconfig.json`,
  `pnpm --filter @hyphae/web exec tsc --noEmit -p tsconfig.json`. Removing node kinds and
  removing the `unboundCodeEdges` field from `ModelGaps` ripples into hand-built test literals;
  grep before finishing.

## 4. Decisions

### D-E1 — No migration; the model is recreated

Per §2. Phase E ships schema/profile/code changes only. Acceptance criteria drop every
migration-centric clause (see §11).

### D-E2 — `schemaVersion` stays `1`

The schema's meaning changes (v1 no longer has a Code layer) but the literal is unchanged. No
`1→2` migration would exist to justify a bump, and the model is recreated regardless. Avoids
rippling a version change through every hand-built test literal.

### D-E3 — Remove the `unboundCodeEdge` gap outright (do not repurpose)

`modelGaps` §2 (`unboundCodeEdges`) flags cross-component **Code↔Code** edges not bound via a
`realizedBy`. With no Code layer, both endpoints can never be Code, so the gap can never fire.
There is no natural higher-altitude thing to repurpose it into (a Component↔Component edge is a
first-class modeled edge, not a gap). It is **removed**: the `UnboundCodeEdge` type, the
`unboundCodeEdges` field on `ModelGaps`, the `CODE_LAYER` constant, and the detection loop all
go. This changes the public `ModelGaps` shape (a field disappears) — the `mcp.ts`
`model_gaps`/`validate_model` descriptions and `gaps.test.ts` update accordingly. The other
three gaps (`orphanNodes`, `thinDescriptions`, `missingRefs`) are unaffected.

### D-E4 — `Component.allowedChildren` becomes `[]`

A Component had `allowedChildren: ['Class','Interface','Function','Module','UIComponent']`.
With those kinds gone, it becomes `[]` — Component is the leaf structural altitude. `System`
(→ Container) and `Container` (→ Component) are unchanged.

## 5. Profile — `packages/schema/src/profiles/c4-backend.ts`

- **`layers`**: `['Context','Container','Component','Code']` → `['Context','Container','Component']`.
- **`nodeKinds`**: delete the five Code-layer entries (`Class`, `Interface`, `Module`,
  `UIComponent`, `Function`).
- **`Component.allowedChildren`**: `[...]` → `[]` (D-E4).
- Everything else (roles, verbs, `patternKinds`, `connectionKinds`, `commonNodeFields`,
  `commonConnectionFields`, the Context/Container/Component/Actor/ExternalSystem kinds) is
  unchanged.

Downstream of this single edit, the following recompute automatically (no code change):
`layerOfType`, `nodeAtOrAboveLayer`, `typesForLayer`, the `maxLayer` MCP enum
(`z.enum(c4Backend.layers)`), and the web Legend (`c4Backend.layers.filter(l => LAYER_COLOR[l])`).

## 6. Schema — `packages/schema/src/gaps.ts`

Per D-E3, remove the `unboundCodeEdge` gap: the `UnboundCodeEdge` export, the `CODE_LAYER`
constant, the `unboundCodeEdges` field on the `ModelGaps` type, the `liftToComponent` helper and
`claimed` set **iff** they become unused (they are used only by this gap — verify and remove),
and the detection loop. `modelGaps` returns
`{ orphanNodes, thinDescriptions, missingRefs }`. `model.ts` (`schemaVersion`, `emptyModel`) is
**unchanged** (D-E2). `validate.ts` is unchanged (profile-driven).

## 7. Server / MCP — `apps/server/src/mcp.ts`

The `maxLayer` enum shrinks automatically (`z.enum(c4Backend.layers …)` now yields
`Context|Container|Component`). **Text** edits only:

- Three `maxLayer` tool descriptions (`list_nodes`, `list_connections`/`rollup`,
  `get_subgraph`) that say *"pass 'Code' to include Code-layer nodes (Class/Interface/…)"* —
  reword to describe Component as the deepest layer and drop the `'Code'` example.
- The `model_overview` description mentions *"It never dumps Components or Code."* — drop "or
  Code".
- The `rollup_connections` `realizedBy` description example (*"a Component↔Component edge
  realizedBy the Code↔Code edges…"*) — reword to a Component-altitude example (`realizedBy`
  still exists and is load-bearing between the surviving altitudes; only the Code example goes).
- `model_gaps` / `validate_model` descriptions that enumerate the gap list — drop the
  unbound-code-edge item (D-E3).

No tool is added or removed; no input shape changes beyond the auto-shrunk `maxLayer` enum.

## 8. Web — `apps/web/src/reactflow.ts`

Remove the dead `Code: { bg:'#fefce8', border:'#ca8a04' }` entry from `LAYER_COLOR`. The Legend
(`Legend.tsx`) already iterates `c4Backend.layers.filter(l => LAYER_COLOR[l])`, so it drops the
Code swatch automatically once `'Code'` leaves `layers` **and** the entry is gone.
`focusView.ts`, `flow.ts`, `layout.ts`, and the node renderers read layers/roles dynamically and
need **no** change.

## 9. Test-literal churn

`pnpm -r test` will not catch type breakage; these committed test files reference Code kinds
and/or `unboundCodeEdges` and need mechanical updates (exact edits pinned in the plan):

- `packages/schema/test/c4-backend.test.ts` — asserts on the Code kinds / `'Code'` layer /
  Component `allowedChildren`.
- `packages/schema/test/profile.test.ts`, `validate.test.ts`, `overview.test.ts` — fixtures that
  build Code-kind nodes.
- `packages/schema/test/gaps.test.ts` — the `unboundCodeEdges` assertions (removed per D-E3).
- `apps/server/test/mcp.test.ts` — `maxLayer:'Code'` cases / description assertions.
- `apps/web/test/store.test.ts`, `Canvas.test.tsx`, `focusView.test.ts` — fixtures using Code
  kinds.

Rule: fixtures may be **re-pointed to Component-level nodes** or have Code children dropped, but
no assertion may be weakened to pass. Grep for `Class|Interface|Module|Function|UIComponent`,
`'Code'`, `unboundCodeEdge`, `CODE_LAYER` before declaring done (`Function` matches will include
false positives from the TS keyword — check each).

## 10. Modeling skill + docs

- **`plugins/hyphae-modeling/skills/building-architecture-models/SKILL.md`** — it currently
  teaches the Code layer and instructs agents to create `Class`/`Interface`/etc. nodes. Rewrite
  that guidance to: **code = `codeRefs` + an optional `Pattern` on the Component**; Component is
  the deepest structural node. Remove Code-kind authoring; point at the A0 ref convention and
  the C pattern authoring already documented there.
- **`docs/MODEL.md`** — §5.1 / §7 rule 7 already say "code is refs + shape, not nodes"; refresh
  any prose (e.g. §5 profile layer list, §3.7) that still lists `Code` as a layer or the Code
  kinds. **`README.md`** — update if it enumerates layers/kinds.

## 11. Acceptance criteria

- `c4-backend.layers` is `['Context','Container','Component']`; the five Code node kinds are gone
  from `nodeKinds`; `Component.allowedChildren` is `[]`.
- `ModelGaps` no longer has `unboundCodeEdges`; `modelGaps` returns the three surviving gaps.
- MCP `maxLayer` enum is `Context|Container|Component`; no tool description mentions the Code
  layer or Code kinds.
- The web `LAYER_COLOR` has no `Code` entry; the Legend renders no Code swatch.
- The modeling skill no longer instructs creating Code-kind nodes.
- `pnpm -r test` passes and all three packages type-check.
- No model `.json` is staged in any commit; `schemaVersion` stays `1`.

## 12. Out of scope

Any model migration or fixture rewrite (the user recreates the model); authoring Patterns or
`codeRefs` on any Component; `DataEntity` / `carries` / `owns` (Phase D); `requirements` /
`decisions` (stay reserved); the Phase-A edge-label occlusion carryover (flag only if this phase
worsens it); configurable per-project profiles (standing goal — this phase keeps vocabulary
profile-declared and hardcodes nothing new).

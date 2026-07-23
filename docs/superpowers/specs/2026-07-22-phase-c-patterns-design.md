# Phase C — Patterns (design)

> Date: 2026-07-22. Records the decisions for Phase C of the business-legible rethink.
> Parent program plan: [2026-07-18-business-legible-rethink.md](../plans/2026-07-18-business-legible-rethink.md) §"Phase C — Patterns".
> Parent design: [2026-07-18-business-legible-rethink-design.md](2026-07-18-business-legible-rethink-design.md) (D4, §4.3, §9.3, §10).
> Model concept: [MODEL.md](../../MODEL.md) §3.4 (Pattern), §5 (profile incl. `patternKinds`), §7 rule 4 (Pattern = static shape vs Flow = temporal traversal).
> Template phase: [2026-07-20-phase-b-flows-design.md](2026-07-20-phase-b-flows-design.md) — the spec/plan/MCP shape this mirrors. Builds on shipped A0 (refs/roots), A (visual language), B (flows).

---

## 1. Goal

Build **Patterns**: a profile-driven overlay entity that gives Structure a recognized *shape*
(pipeline, middleware, state-machine, layered, event-bus) with a dedicated renderer per kind. A
reader picks a pattern from a panel and the canvas draws its shape — a pipeline's ordered stages,
a state chart's states + transitions. Patterns are how code-level structure survives **without**
modeling classes as nodes (a Component's internals become a `pipeline` Pattern, not thirty class
boxes), and they **absorb the old `StateMachine` entity** as the `state-machine` kind.

Today the model carries `stateMachines: z.array(StateMachineSchema).default([])` with
`StateMachineSchema = z.unknown()` (`packages/schema/src/reserved.ts:5`) — reserved, no reader.
There is **no** `patterns` array. Phase C adds `patterns`, drops `stateMachines`, and builds the
read/write/render stack around a real `PatternSchema`.

## 2. Fixed constraints for this phase

- **No model-file migration, and no committed model `.json`.** `apps/server/hyphae-cctv-new.json`
  is untracked and migrated-on-disk; `apps/server/hyphae.json` is the tracked working file. Never
  `git add` a model `.json` (stage files explicitly; never `git add apps/server`). Run
  `git status --short` before **every** commit.
- **Zod schemas in `packages/schema/src` are the single source of truth.** Never hand-write a JSON
  Schema or duplicate a type. New vocabulary (`patternKinds`) is profile-declared, never hardcoded
  in a renderer.
- **`schemaVersion` stays `1`.** Patterns are additive (`patterns: []` new); dropping
  `stateMachines` is read-safe — a non-strict Zod object strips the now-unknown `stateMachines`
  key from on-disk files. No migration script. (Confirm by loading the fixture.)
- **`pnpm -r test` does not type-check** (vitest strips types via esbuild). After every task run all
  three: `pnpm --filter @hyphae/schema exec tsc -p tsconfig.json`,
  `pnpm --filter @hyphae/server exec tsc -p tsconfig.json`,
  `pnpm --filter @hyphae/web exec tsc --noEmit -p tsconfig.json`. A Zod `.default(...)` makes the
  field **required** in the inferred output type — hand-built model literals in tests must supply
  every non-defaulted field.
- **`describe_profile` changes this phase.** `patternKinds` is profile vocabulary (like `roles`
  and `verbs` in Phase A), so `describe_profile` must expose it — contrast Phase B, where flow
  `kind`/`control` were core enums and `describe_profile` was untouched.

## 3. Decisions

### D-C1 — Renderers this phase: pipeline + state-machine; the other three fall back

All five kinds are **declared in the profile, authorable over MCP, and validated**. Only
**pipeline** and **state-machine** get bespoke renderers this phase — they are the two most
distinct shapes and de-risk the new "synthesize a shape from members" rendering path.
**middleware**, **layered**, and **event-bus** render through a **generic member-list fallback**
until a later phase. This matches the program plan's "build two first" lean and Phase B's
"ship the core, defer the rest" posture.

### D-C2 — Dedicated pattern rendering (not an in-place overlay)

Selecting a pattern swaps the canvas to a **self-contained diagram of that pattern**. Each member
draws as a box **whether it is a `nodeId` or a `ref`** — uniform treatment, which matters because
a code pipeline's stages are pure refs with **no nodes on the canvas at all**. This is a genuinely
different rendering path from Phase B (which only *relabels and dims existing edges*), and the
dedicated approach was chosen because it (a) treats node-members and ref-members identically, (b)
does not fight the focus-view / dagre layout, and (c) means only one pattern renders at a time, so
member overlap (D-C6) can never cause a rendering conflict.

Rejected — *in-place overlay inside the container node*: must inject synthesized boxes into an
existing dagre layout without collisions, and still needs different handling for ref vs node
members. Rejected — *hybrid by member type* (node-members highlight in place, ref-members open an
inset): two code paths and a UX that changes with how the pattern happens to be authored.

### D-C3 — Member **array order** is the stage order; no `order` field

For ordered kinds (pipeline, middleware) the order of the `members` array **is** the stage order.
There is no per-member `order` integer. This is the simplest authoring affordance (append in
sequence), avoids the duplicate-`order` / React-key gotcha deferred from Phase B, and removes the
program plan's "order present only on ordered kinds" validation rule entirely. The kind's
`ordered?: boolean` tells the renderer to lay members out as a sequence (row / stack) vs
unordered (bands / hub).

### D-C4 — Uniform member; binding is **optional** (at most one of `nodeId`/`ref`)

A member is `{ name, nodeId?, ref?, description? }` carrying **at most one** of `nodeId`/`ref`.
Both set = an Issue. **Neither set = valid** — a pure-named member, which is exactly what a
state-machine **state** is (`Idle`, `Recording`, `Error` bind to no node and no ref).

**This overrides the program plan**, whose acceptance criterion says "a member with both `nodeId`
and `ref`, **or neither**, is an `Issue`." Strict "exactly one" makes state machines impossible,
because states are pure names. The corrected rule keeps one uniform member concept across all
kinds: a pipeline stage typically binds (to a `ref` or `nodeId`) but is not *forced* to; a state
typically does not.

State-machine **transitions** are kind-specific detail on the Pattern:
`transitions: [{ from, to, trigger?, description? }]`, where `from`/`to` reference member `name`s
in the same pattern. This is why member names must be unique within a pattern (§6,
`duplicate-pattern-member-name`).

### D-C5 — `name` is required (`min 1`)

A Pattern's `name` is required, matching Phase B's `Flow.name`. A pattern's identity to a human is
its name ("Ingest pipeline", "Recording state machine"); requiring it keeps the picker legible.
(The program plan wrote `name?`; this phase lands on required, consistent with Flow.)

### D-C6 — Member overlap is allowed; no cross-pattern validation

A node or ref may appear in more than one Pattern. Anti-redundancy (MODEL.md §7 rule 4) forbids
expressing the *same fact* two ways, not a node playing a role in two different shapes; a Component
can legitimately be a pipeline stage in one pattern and referenced by another. With dedicated
rendering (D-C2) only one pattern renders at a time, so overlap never conflicts on the canvas.
`validateModel` adds **no** overlap rule.

### D-C7 — `anchor`: the node a pattern describes (added beyond the source docs)

A Pattern carries an optional `anchor: string | null` — the node id whose internal shape this
pattern describes (the Component a code pipeline lives inside). It is **load-bearing for ref
resolution**: `resolveRef(nodes, nodeId, ref)` anchors a ref against a *node's* `root`, but a
pattern is not a node, so a **ref member resolves against the anchor's root**. It also answers
"what is Component X's internal shape?" (which Phase E depends on) and lets the picker group
patterns under their anchor. It stays **optional** — a pure-name state machine needs no anchor —
but a pattern **with ref members requires an anchor** whose root chain resolves them (else
`unanchored-pattern-ref`). nodeId members and pure-name members need no anchor.

## 4. Schema changes

New file `packages/schema/src/pattern.ts`:

```
PatternMemberSchema = {
  name:        string (min 1)
  nodeId:      string.optional()      // at most one of nodeId / ref (both => Issue)
  ref:         string.optional()
  description: string (default '')
}
PatternTransitionSchema = {           // kind-specific detail (state-machine)
  from:        string                 // a member name in this pattern
  to:          string                 // a member name in this pattern
  trigger:     string (default '')
  description: string (default '')
}
PatternSchema = {
  id:          string
  name:        string (min 1)
  kind:        string                 // a patternKinds id from the profile
  description: string (default '')
  anchor:      string | null (default null)   // optional node id this pattern describes (D-C7)
  members:     PatternMember[]   (default [])
  transitions: PatternTransition[] (default [])
}
```

- `reserved.ts`: **drop** `export const StateMachineSchema = z.unknown();`. `DataTypeSchema`,
  `RequirementSchema`, `DecisionSchema` stay.
- `model.ts`: import `PatternSchema` from `./pattern`; **add** `patterns:
  z.array(PatternSchema).default([])`; **remove** the `stateMachines` field and its
  `StateMachineSchema` import. `emptyModel()` drops `stateMachines: []`, adds `patterns: []`.
- `index.ts`: export the Pattern types/schema and `PatternKindDef`.
- Defaults follow the project convention: `.default(...)` makes a field required in the inferred
  type, so hand-built literals must supply `id`, `name`, `kind`, and per member `name`.

## 5. Profile vocabulary — `profile.ts` + `profiles/c4-backend.ts`

`patternKinds` is **profile vocabulary** (like `roles`/`verbs`), not a core enum. In `profile.ts`:

```
PatternRendererSchema = z.enum(['pipeline','middleware','state-machine','layered','event-bus'])
// closed set — the profile names the renderer, the code owns the geometry (mirrors ShapeSchema).

PatternKindDefSchema = {
  id:          string
  description: string
  renderer:    PatternRendererSchema
  ordered:     boolean (default false)
}

ProfileSchema += patternKinds: z.array(PatternKindDefSchema).default([])
```

Helper `patternKindDefOf(profile, id)` alongside `roleDefOf`/`verbDefOf`. Types exported.

`c4-backend` declares all five kinds (descriptions written for the LLM), `pipeline` and
`middleware` `ordered: true`:

| id | renderer | ordered | gist |
|---|---|---|---|
| pipeline | pipeline | true | ordered stages data flows through (decode → normalize → persist) |
| middleware | middleware | true | a request passes through an ordered interceptor chain |
| state-machine | state-machine | false | states + the transitions between them |
| layered | layered | false | stacked architectural bands (UI / domain / data) |
| event-bus | event-bus | false | a hub with publishers/subscribers around it |

## 6. Validation — `validate.ts` (new `Issue` kinds)

Added to the `Issue` union and checked in `validateModel` after the flow loop. `ref` on each issue
is the **pattern id** (a member/transition problem is reported against its pattern, naming the
member/transition in the message).

| Kind | Condition |
|---|---|
| `unknown-pattern-kind` | `pattern.kind` is not a declared `patternKinds` id |
| `pattern-member-double-bind` | a member has **both** `nodeId` and `ref` |
| `bad-pattern-member-node` | a member's `nodeId` is set but is not an existing node id |
| `bad-pattern-anchor` | `anchor` is set but is not an existing node id |
| `unanchored-pattern-ref` | a member `ref` is set but does not resolve — no `anchor`, or the anchor's root chain does not anchor it (checked via `resolveRef(nodes, anchor, ref)`) |
| `bad-pattern-transition` | a transition's `from` or `to` does not match any member `name` in the pattern |
| `duplicate-pattern-member-name` | two members in one pattern share a `name` (breaks transition resolution and renderer keys) |

No `order`-related rule (D-C3 dropped the field). No overlap rule (D-C6). `kind` enum-membership is
checked here (not by Zod) because valid kinds come from the profile, not a fixed enum. Deleting a
node used as a member `nodeId` or `anchor` therefore makes `validateModel` report the pattern, so
the model — and the UI — mark it invalid.

## 7. Server — persistence + HTTP

- `store.ts`: `addPattern(input)` / `updatePattern(id, patch)` / `deletePattern(id)`, each validated
  through the existing `newIssues` path (an invalid write throws `ValidationError` → `422`),
  persisted atomically, broadcast over SSE — identical to the node/connection/flow methods.
- `routes.ts`: `POST /patterns`, `PATCH /patterns/:id`, `DELETE /patterns/:id`, using the same
  `mapError` handling. `GET /model` already returns `patterns` once the field exists.

## 8. MCP — read + write tools (`apps/server/src/mcp.ts`)

The MCP layer is an HTTP client of the running server; reads go through `await api.getModel()`,
writes through new HTTP methods on `HyphaeApi`.

- **`list_patterns`** — summaries: `id`, `name`, `kind`, member count, whether the pattern
  currently validates (from `validateModel`), and its `anchor`.
- **`get_pattern`** — one pattern with full members + transitions; `{error}` if the id is unknown.
- **`create_patterns` / `update_patterns` / `delete_patterns`** — batch best-effort, mirroring
  `create_flows` / `update_flows` / `delete_flows` (`{ids:[...]}` or `{ok:true}` on full success,
  else `{results:[...]}` aligned to input order).

The pattern input is a **plain Zod object** (patterns carry no profile `fields`). Tool descriptions
are written for the LLM: member `nodeId` vs `ref` vs pure name, when `anchor` is required, the
`transitions` shape for state-machine, the five kinds. **`describe_profile` now returns
`patternKinds`** (id, description, renderer, ordered) — without it the LLM cannot author a pattern.

**Shape assertion (Phase A/B carryover):** `buildTools` forwards the zod input blindly with no CI
check. Copy Phase B Task 5's pattern — export the pattern write shape at module scope and add a
test asserting its fields, so a dropped field is caught.

## 9. Web — dedicated pattern rendering

1. **`store.ts`**: add `selectedPatternId: string | null` + `selectPattern(id)`. Selecting a
   pattern **clears `selectedFlowId`** and selecting a flow clears `selectedPatternId` — they are
   competing canvas modes. Patterns read from `model.patterns`; selecting one does not mutate the
   model.
2. **New pure `patternView.ts`**: `(pattern, profile, nodes) → { nodes, edges }` for
   `@xyflow/react`, unit-tested without React.
   - **pipeline** (`ordered`): member boxes left→right in array order, sequential edges between
     consecutive members.
   - **state-machine**: member boxes as states, one edge per `transition` (labeled with `trigger`),
     laid out with dagre.
   - **middleware / layered / event-bus**: generic fallback — a vertical member list (no bespoke
     geometry this phase).
   - Each box shows the member `name`, its binding (a `nodeId` resolves to the node's name; a `ref`
     shows the ref string; a pure name shows neither) and `description`. Member `name` is the React
     key (unique per D-C validation).
3. **`PatternMemberNode.tsx`** renderer + registration in `Canvas.tsx`'s `nodeTypes`.
4. **`Canvas.tsx`**: when `selectedPatternId` is set, feed the `patternView` nodes/edges to
   `ReactFlow` and skip the focus-view / flow-overlay / highlight machinery; otherwise unchanged.
   Isolated mode switch.
5. **`PatternPicker.tsx`**: mirrors `FlowPicker` — lists patterns (grouped by kind, or by anchor),
   select to render / deselect to clear, shows the member list, flags a pattern that fails
   validation. Stacked in the existing top-left `Panel` under `FilterPanel` + `FlowPicker`.

**Known bounded limitation:** the three fallback-rendered kinds show a plain member list, not their
recognizable shape, until a later phase. If a pattern renderer worsens the pre-existing
edge-label occlusion logged in Phase A, flag it.

## 10. De-risking, skill, docs

- **Author 1–2 real patterns against the cctv model early**, before the renderers, to confirm the
  schema earns its keep: a ref-member `pipeline` anchored to a Component, and a small
  `state-machine` with pure-name states + transitions. The artifacts live as **test fixtures / a
  scratch exercise** — a populated model `.json` is **never committed**.
- **Modeling skill** (`plugins/hyphae-modeling/skills/building-architecture-models/SKILL.md`) — last
  task: a light "Patterns" section teaching `create_patterns`, the member shape (`nodeId` vs `ref`
  vs pure name), `anchor`, `transitions` for state-machine, and the kinds. Mirrors Phase B's
  "Flows" addition.
- Refresh `MODEL.md` §3.4 / `README.md` pattern wording if the shipped shape diverges from the prose.

## 11. Acceptance criteria

- A `pipeline` Pattern with ref-only members (anchored to a Component) renders its stages as an
  ordered row; a `state-machine` Pattern renders its states and transitions.
- A member with both `nodeId` and `ref` is an Issue; a `ref` member with no anchoring root is an
  Issue; an unknown `kind` is an Issue.
- `describe_profile` returns `patternKinds`; MCP can create, read, update, and delete patterns.
- `stateMachines` is gone from the model schema and from hand-built test literals; the fixture loads
  without migration; `schemaVersion` stays `1`.
- `pnpm -r test` passes and all three packages type-check.
- No model `.json` is staged in any commit.

## 12. Out of scope

Bespoke **middleware / layered / event-bus** renderers (generic fallback only this phase);
in-place-in-container rendering; a step-through / animated traversal (that is a Flow); inferring
patterns from code; Phase E code-layer removal (patterns are *where* code structure will land, but
the migration is E); `DataEntity` / `carries` (Phase D); `requirements` / `decisions` (stay
reserved).

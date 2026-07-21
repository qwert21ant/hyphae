# Phase B — Flows (design)

> Date: 2026-07-20. Records the decisions for Phase B of the business-legible rethink.
> Parent program plan: [2026-07-18-business-legible-rethink.md](../plans/2026-07-18-business-legible-rethink.md) §"Phase B — Flows".
> Parent design: [2026-07-18-business-legible-rethink-design.md](2026-07-18-business-legible-rethink-design.md) (D2, §4.4).
> Model concept: [MODEL.md](../../MODEL.md) §3.3 (Flow), §2 (axes), §6 (traceability).
> Builds on shipped Phase A0 (refs and roots) and Phase A (visual language).

---

## 1. Goal

Build the **Behavior axis**: named scenario overlays. A reader picks a flow from a panel and
its ordered steps light up as numbered badges (①②③) along the diagram's edges with per-step
captions; everything else dims. The flow is authorable and readable by an LLM over MCP.

Today `flows` exists in the model as a populated-by-default empty array
(`packages/schema/src/model.ts:24`) whose element type is `FlowSchema = z.unknown()`
(`packages/schema/src/reserved.ts:5`) — reserved, with no reader anywhere. Phase B replaces
that placeholder with a real schema and builds the read/write/render stack around it.

## 2. Fixed constraints for this phase

- **No model-file migration, and no committed model `.json`.** `apps/server/hyphae-cctv-new.json`
  is untracked and migrated-on-disk; `apps/server/hyphae.json` is the tracked working file.
  Never `git add` a model `.json`. Run `git status --short` before every commit.
- **Zod schemas in `packages/schema/src` are the single source of truth.** Never hand-write a
  JSON Schema or duplicate a type.
- **`schemaVersion` stays `1`.** Flows are additive: existing files already carry `flows: []`,
  so populating the element shape breaks nothing on disk. No migration script.
- **`pnpm -r test` does not type-check** (vitest strips types via esbuild). After every task run
  all three: `pnpm --filter @hyphae/schema exec tsc -p tsconfig.json`,
  `pnpm --filter @hyphae/server exec tsc -p tsconfig.json`,
  `pnpm --filter @hyphae/web exec tsc --noEmit -p tsconfig.json`.
- **New vocabulary is profile-declared, never hardcoded** — but Phase B adds **no** new profile
  vocabulary (see §3), so `describe_profile` is unchanged.

## 3. Decisions

### D-B1 — a step carries `from`+`to` (node ids), plus optional `via` (connection id)

The program plan's step shape lists `from`, `to`, **and** `via?`. A step **always** carries
`from`/`to` as node ids — they define the arrow the overlay draws and survive even where no
connection is modeled (a `Return`, an async acknowledgement, an implied hop). `via` is an
**optional connection id** that pins the step to a specific existing connection: it earns the
`Flow.steps ──via──> Connection` traceability that MODEL.md §6 documents, and it disambiguates
when two parallel edges connect the same pair.

**This resolves a contradiction in the source docs.** The program plan (line 42) says
"every `from`/`to`/`via` must reference an existing **node**"; MODEL.md §6 says
`Flow.steps ──via──> Connection`. Phase B lands on MODEL.md's side: `via` is a **connection**
id. The invariant becomes: `from`/`to` reference existing **nodes**; `via`, when set,
references an existing **connection**.

Rejected — *`via` only, derive `from`/`to`*: single source of truth, but a step could then not
exist without a pre-modeled connection (no plain `Return`/async-ack steps). Rejected —
*`from`/`to` only, no `via`*: drops the documented traceability and cannot distinguish parallel
edges.

### D-B2 — `kind` and `control.type` are core enums, not profile vocabulary

`kind` (`Sync`/`Async`/`Return`) and `control.type` (`alt`/`opt`/`loop`/`par`) are **universal
sequence-diagram mechanics**, not domain vocabulary. They are core enums on the Flow schema —
exactly like `direction` (`Unidirectional`/`Bidirectional`) is a core enum today, not a profile
field. Consequently Phase B declares **no** new profile vocabulary and `describe_profile` is
untouched. (Contrast Phase A, which added profiled `roles`/`verbs` because those *are* domain
vocabulary.)

### D-B3 — `scope` is an optional advisory layer

`scope` is an optional layer hint: the picker can group/filter flows by altitude and (as a
possible convenience) offer "focus to this flow." A flow with no `scope` still works — the
overlay lights whatever steps are currently visible. Optional matches the project's measured
optional-by-default reality; nothing in the fixture uses flows yet, so a required field has no
evidence it would be filled. Validated only when present (`bad-flow-scope`).

### D-B4 — static numbered overlay, not a step-through player

The phase deliverable is a **static** overlay: selecting a flow badges every participating edge
with its step number(s) + caption, in order, and dims the rest. All steps are shown at once.
This meets the acceptance criterion ("renders as numbered steps"). A prev/next step-through
player is a deliberate future stretch, not this phase.

### D-B5 — rename the web mapping file to `reactflow.ts`

`apps/web/src/flow.ts` is the React-Flow node/edge mapping (`focusViewToFlow`, `highlightSets`,
`LAYER_COLOR`, `VERB_CLASS_COLOR`, `edgeLabel`, `nodeVisual`); its name collides with the Flow
entity. It is renamed to `apps/web/src/reactflow.ts` (it maps our `FocusView` into
`@xyflow/react` nodes/edges). Only `Canvas.tsx`, `Legend.tsx`, and `test/flow.test.ts` import
it — low churn. This is the first web task, isolated, so the collision is gone before Flow UI
lands.

## 4. Schema changes

New file `packages/schema/src/flow.ts`:

```
FlowStepSchema = {
  order:   number
  from:    string                       // node id (required)
  to:      string                       // node id (required)
  via?:    string                       // connection id (optional)
  message: string  (default '')         // the step caption
  kind:    enum('Sync','Async','Return')  (default 'Sync')
  control?: { type: enum('alt','opt','loop','par'), condition: string (default '') }
}
FlowSchema = {
  id:          string
  name:        string  (min 1)
  description: string  (default '')
  scope:       string | null (default null)   // optional layer hint
  steps:       FlowStep[] (default [])
}
```

- `reserved.ts`: drop `export const FlowSchema = z.unknown();`. `StateMachineSchema`,
  `DataTypeSchema`, `RequirementSchema`, `DecisionSchema` stay.
- `model.ts`: import `FlowSchema` from `./flow` instead of `./reserved`. `flows:
  z.array(FlowSchema).default([])` is otherwise unchanged.
- `index.ts`: export the new Flow types/schema.
- Defaults follow the project convention (a `.default(...)` makes the field required in the
  inferred output type — hand-built literals in tests must supply every non-defaulted field,
  i.e. `id`, `name`, and per step `order`, `from`, `to`).

## 5. Validation — `validate.ts`

New `Issue` kinds, added to the union and checked in `validateModel` after the connection loop:

| Kind | Condition |
|---|---|
| `bad-flow-endpoint` | a step's `from` or `to` is not an existing node id |
| `bad-flow-via` | a step's `via` is set but is not an existing connection id |
| `bad-flow-scope` | a flow's `scope` is set but is not one of the profile's layers |

`ref` on these issues is the flow id (a step problem is reported against its flow, with the
step `order` in the message). This delivers the plan's invariant: deleting a node used by a
step, or a connection used as `via`, makes `validateModel` report the flow — so the model, and
the UI, mark it invalid. `order`/`kind`/`control.type` are enum-checked by Zod at parse and need
no `validateModel` rule.

## 6. Server — persistence + HTTP

- `store.ts`: `addFlow(input)` / `updateFlow(id, patch)` / `deleteFlow(id)`, each validated
  through the existing `newIssues` path (an invalid write throws `ValidationError` → `422`),
  persisted atomically, and broadcast over SSE — identical to the node/connection methods.
- `routes.ts`: `POST /flows`, `PATCH /flows/:id`, `DELETE /flows/:id`, using the same
  `mapError` handling. `GET /model` already returns `flows`.

## 7. MCP — read + write tools (`apps/server/src/mcp.ts`)

The MCP layer is an HTTP client of the running server; reads go through `await api.getModel()`,
writes through new HTTP methods on `HyphaeApi`.

- **`list_flows`** — summaries: `id`, `name`, `scope`, step count, and whether the flow
  currently validates (derived from `validateModel`).
- **`get_flow`** — one flow with its full ordered steps; `{error}` if the id is unknown.
- **`create_flows` / `update_flows` / `delete_flows`** — batch best-effort, mirroring
  `create_nodes` / `update_nodes` / `delete_nodes` (`{ids:[...]}` or `{ok:true}` on full
  success, else `{results:[...]}` aligned to input order).

The flow/step input is a **plain Zod object**, not built from `fieldsShape` — flows carry no
profile fields. Each tool description is written for the LLM (what a step is, when to set `via`
vs leave it, the three `kind` values, `control`). `describe_profile` is unchanged.

**Note (from Phase A carryover):** there is no CI test asserting the MCP zod input shape;
`buildTools` forwards blindly. Since Phase B adds new write shapes, the plan should add a real
shape assertion for the flow tools so a dropped field is caught.

## 8. Web — rename + picker + overlay

1. **Rename** `flow.ts` → `reactflow.ts` (D-B5); update `Canvas.tsx`, `Legend.tsx`, the test
   import. Isolated first task.
2. **`store.ts`**: add `selectedFlowId: string | null` + `selectFlow(id)`. Flows read from
   `model.flows`. Selecting a flow does not mutate the model.
3. **New pure `flowOverlay.ts`**: given the selected `Flow` and the current view's visible node
   ids + drawn edges, return
   - for each drawn edge, the step number(s) + caption(s) it hosts (an edge can host several;
     a step matches an edge when `{from,to}` equals the edge's endpoints in either orientation,
     preferring the edge whose underlying connection id equals the step's `via` when set),
   - the participating vs dimmed node/edge sets,
   - the steps that are **not drawable** in the current view (endpoints not both visible).
   Unit-tested without React.
4. **`FlowPicker` panel**: lists flows (grouped by `scope` when present), select to activate /
   deselect to clear, shows the ordered step list with each step's drawable/off-view state, and
   flags a flow that fails validation.
5. **`Canvas.tsx`**: when a flow is selected, render numbered badges + captions on participating
   edges (`Return` steps dashed), dim the rest — reusing the existing highlight/dim machinery.

**Known bounded limitation:** the overlay lights only steps whose `from`/`to` are both visible
in the current focus view. A flow spanning multiple containers does not fully light up at
Context level; the picker lists all steps and greys the off-view ones. Full cross-view
choreography is deferred with the sequence-diagram stretch. This reuses the focus view rather
than rewriting it. If the numbered badges worsen the pre-existing edge-label occlusion logged in
Phase A, flag it.

## 9. De-risking, skill, docs

- **Author 1–2 real flows against the cctv model early**, before the picker/overlay, to confirm
  the schema earns its keep. The artifacts live as **test fixtures / a scratch exercise** — a
  populated model `.json` is **never committed**.
- **Modeling skill** (`plugins/hyphae-modeling/`) — last task: teach agents the new authorable
  entity (`create_flows`, the step shape, when to set `via`/`control`, the three `kind` values).
  Only a light addition — flows add an entity an agent can author.
- Refresh `MODEL.md` §3.3 / `README.md` flow wording if the shipped shape diverges from the
  prose.

## 10. Acceptance criteria

- A flow authored over fixture nodes renders as numbered steps along the edges.
- Deleting a node referenced by a step (or a connection used as `via`) makes the flow report a
  validation issue, and the UI shows the flow as invalid.
- MCP can create, read, update, and delete flows.
- `pnpm -r test` passes and all three packages type-check.
- No model `.json` is staged in any commit.

## 11. Out of scope

A full sequence-diagram view; step-through playback; cross-view choreography; any migration
script; `DataEntity`/`carries` (Phase D); Patterns / the `state-machine` overlay (Phase C);
`requirements`/`decisions` (stay reserved).

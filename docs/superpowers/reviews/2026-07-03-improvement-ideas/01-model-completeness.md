# Axis 1 — Model completeness / usefulness

Question: is the current level of detail **enough or excess** — separately for (a) a human
exploring the model, and (b) an LLM producing/consuming it via MCP?

## Findings (real model: `apps/server/hyphae-cctv-new.json`)

404 nodes, 567 connections. Stats gathered with a throwaway node script (deleted).

**Node distribution — the Code layer dominates.**

| Layer | Nodes | Kinds |
|---|---|---|
| Context | 13 | System 1, ExternalSystem 12, Actor 0 |
| Container | 11 | Container 11 |
| Component | 81 | Component 81 |
| **Code** | **299** | Class 192, Interface 59, UIComponent 30, Module 10, Function 8 |

- **74% of all nodes are Code-layer** (299/404). Avg 7.4 Components/Container; avg 4 Code
  children/Component; 80/81 Components have Code children.
- **Connections are mostly Code-level plumbing.** 343/567 edges (60%) touch a Code node;
  343 are Code↔Code; only 189 are Component↔Component. So the graph the LLM/user must
  page through is dominated by class-to-class wiring.

**Field fill rates — the core fields pull weight.**

- `technology`: **92/92** eligible (Container+Component) filled — 100%. Strong signal.
- `responsibilities`: 257/404 filled. By layer: Container 11/11, Component 81/81, Code
  164/299, Context 1/13. Fully used at Container/Component; ~half at Code.
- `invariants`: 153/404 filled — the weakest of the three, but non-trivial.
- Node `description`: avg 221 chars, **0 empty**. Connection `description`: avg 81 chars, 0 empty.

**Connection fields — `transport` earns its keep, `intent` and `direction` are low-signal.**

- `transport`: 567/567 set, but distribution is skewed: InProcess 434, None 90, Sync 25,
  Async 18. The interesting values (Sync/Async = the network/boundary edges) are only **43/567 (8%)**.
- `intent`: 517/567 set, but **Use 416 (80%)** — Read 59, Write 24, Trigger 13, Notify 5.
  Dominated by the generic default; low discriminating power.
- `direction`: **563/567 Unidirectional**, 4 Bidirectional. Effectively a constant.
- `realizedBy`: 110 connections carry it — and **all 110 are on Component↔Component edges**,
  aggregating Code-level edges. This is the model's real summarization mechanism.
- Connection `type`: Dependency 471, Realization 61, DataFlow 35.

**`Realization` kind vs `realizedBy` are NOT redundant.** Realization-kind edges (61) are
55× Class→Interface ("implements"), i.e. a code semantic. `realizedBy` (110) is aggregation
(a coarse edge points at the fine edges it summarizes). Different concepts; both used.

**Reserved axes are dead schema.** `flows`, `stateMachines`, `dataTypes`, `requirements`,
`decisions` are `z.unknown()` (`packages/schema/src/reserved.ts`) and appear ONLY in
`model.test.ts` (asserting `[]`) and `apps/server/scripts/migrate-model.ts:86-90` (passthrough).
No editor, no reader, no MCP tool, no view. `docs/MODEL_RU.md:200-202` explicitly labels them
"резерв в MVP". In the real model all are empty.

## Ideas (strongest first)

### 1. Make the Code layer opt-in per Container, not the default resolution

**What.** Keep the Code layer in the profile, but treat it as an on-demand drill-down rather
than something you populate everywhere. Concretely: (a) stop `search_nodes`/`list_connections`
from returning Code-level results unless asked (add a `layer`/`maxLayer` filter or default the
MCP reads to Component and above), and (b) document Code as "only where a container's internal
design is genuinely non-obvious." The rollup machinery already lets a Component↔Component edge
stand in for its Code edges via `realizedBy`.

**Why/rationale.** 74% of nodes and 60% of edges are Code-level, yet the whole point of C4 is
that Context/Container/Component answer most questions. For an **LLM** this is the biggest
drowning risk: `list_connections` with no filter returns 567 rows that are 60% class wiring;
`get_subgraph` on a Container at depth 2 pulls in hundreds of Code nodes. For a **human**, 299
Code nodes across 81 Components is more than a person browses; the value is in the 92
Component/Container summaries. Note responsibilities fill *drops* at Code (164/299) — evidence
the Code layer is being populated structurally but not always described, i.e. partly noise.

**Effort.** M — no schema change; add a `maxLayer`/`layer` filter to `list_connections` and
`search_nodes` in `apps/server/src/mcp.ts`, default reads to Component, teach the tool
descriptions. Optionally add a layer filter to `get_subgraph`.

**Tradeoffs/risks.** Some users *want* class-level maps; must stay reachable (explicit
`layer: 'Code'` / `containerId`). Risk of hiding the one Code detail that mattered — mitigate
by keeping `realizedBy` expansion (already inline in rollup mode).

**Where.** `apps/server/src/mcp.ts` `list_connections`/`search_nodes`/`get_subgraph`;
`packages/schema/src/profiles/c4-backend.ts:39-43` (Code kinds); `rollup.ts`.

### 2. Delete (or truly gate) the reserved axes `flows`/`stateMachines`/`dataTypes`/`requirements`/`decisions`

**What.** These five arrays are `z.unknown()` with zero read/write path. Either (a) remove them
from `HyphaeModelSchema` until a real editor/view lands, or (b) if kept for file-shape
stability, add a one-line `// aspirational: no reader as of 2026-07` and keep them out of every
tool surface (they already are). Do **not** wire them into MCP as opaque blobs — that invites an
LLM to write unschematized junk.

**Why/rationale.** Dead schema is a correctness and comprehension tax: it shows up in
`emptyModel()`, in tests, in the migrate script, and in docs as if it were a feature. For an
**LLM** reading `describe_profile` or the model JSON, five always-empty arrays are pure noise and
an invitation to hallucinate structure. The docs (`MODEL_RU.md:29-31,199-202`) sell a 5-axis
model that doesn't exist in code — a completeness *illusion*, the opposite of this axis's goal.

**Effort.** S to remove; S to annotate.

**Tradeoffs/risks.** Removing changes the on-disk shape (migrate script must drop them);
`.default([])` means old files still parse if fields are re-added later. If behavior/domain
modeling is on the near roadmap, annotate-and-keep is safer than delete.

**Where.** `packages/schema/src/reserved.ts`, `model.ts:24-28,42-46`,
`apps/server/scripts/migrate-model.ts:86-90`, `packages/schema/test/model.test.ts:10-14`.

### 3. Add a small set of "governance" fields that are missing and would earn their keep

**What.** Add optional common node fields for the questions the current model *can't* answer:
`status`/`maturity` (enum: Planned/Active/Deprecated/Legacy), `criticality` (enum:
Low/Medium/High), and `owner` (text/ref). Optionally `dataClassification` on DataFlow
connections (enum: Public/Internal/PII/Secret). Keep them all optional.

**Why/rationale.** Today every node is described (0 empty descriptions) but the model is a flat
"everything exists and is equally important" snapshot. A **human** exploring can't ask "what's
deprecated / who owns this / what's the blast radius of the critical pieces." An **LLM** doing
impact analysis has no criticality/ownership signal to prioritize. These are cheap, high-value,
and orthogonal to the existing text fields (unlike `intent`, which is 80% one value).

**Effort.** M — add to `commonNodeFields` (and one connection field); they flow automatically
into `describe_profile`, `fieldsShape`, `search_nodes` defaults, MCP zod shapes. No engine change.

**Tradeoffs/risks.** More fields = more the LLM *could* leave empty (see `invariants` at 38%).
Mitigate by NOT marking them required and by not adding them to `search_nodes` default fields.
Don't over-add — three is plenty.

**Where.** `packages/schema/src/profiles/c4-backend.ts:8-11` (`commonNodeFields`);
`connectionKinds` for the DataFlow field; auto-consumed by `mcp.ts:253-260 fieldsShape`.

### 4. Drop or downgrade `intent`, and reconsider `direction`

**What.** `intent` is 80% `Use` — a near-constant with a fat enum. Either (a) remove it, (b)
make it Component-and-above only (so it's not asked on every Code edge), or (c) narrow the enum
to Read/Write/Trigger and drop the catch-all `Use`. Separately, `direction` is 563/567
Unidirectional — consider making Bidirectional an explicit rare flag rather than a field the LLM
sets on every edge.

**Why/rationale.** For an **LLM**, every connection write currently prompts for `transport`,
`intent`, `direction` — three fields where two carry almost no information in practice. Fewer,
higher-signal fields mean less to fill wrong and shorter tool schemas. `intent`'s `Use` default
is exactly the low-signal trap. This is "excess" on the LLM-facing side.

**Effort.** S (remove/narrow enum) to M (make layer-scoped).

**Tradeoffs/risks.** `intent` does occasionally carry signal (Read/Write/Notify = 88 edges);
narrowing loses the long tail. `direction` removal would need a migration for the 4 Bidirectional
edges. Low blast radius either way.

**Where.** `packages/schema/src/profiles/c4-backend.ts:22-31` (`intent`);
`packages/schema/src/connection.ts:11` (`direction`).

### 5. Give the LLM/user an explicit "summarize a Container" resolution level

**What.** `model_overview` (Context+Container only) and `list_connections rollup=Container|Context`
are good summarization levels. What's missing is the mid-level: "summarize ONE container's
internals" — its Components, their responsibilities, and Component↔Component edges (with Code
folded into `realizedBy`), without the 4×/Component Code nodes. Add a `container_summary(id)` MCP
tool or a `rollup=Component` + `containerId` mode.

**Why/rationale.** The three natural reading altitudes are whole-model / one-container /
one-component. The first and (via rollup) the aggregate edges exist; the "one container at
Component resolution" view requires the caller to combine `list_nodes(parentId)` +
`get_subgraph` + manual Code filtering. Giving it a name makes the **LLM** reliably stop at the
right resolution instead of drilling to Code. Directly supports "does the model support
summarization levels?" — partially yes, with a gap in the middle.

**Effort.** M — compose existing `rollupConnections` + `list_nodes` in a new handler in
`apps/server/src/mcp.ts`.

**Tradeoffs/risks.** One more tool for the LLM to choose among; mitigate with a crisp
description. Overlaps `get_subgraph` — position it as "the Component-resolution container view."

**Where.** `apps/server/src/mcp.ts` (new tool); `packages/schema/src/rollup.ts`;
`packages/schema/src/overview.ts` (pattern to follow).

## Keep as-is (already right — don't churn)

- **`technology` field.** 100% filled on eligible nodes; clearly load-bearing. Leave it.
- **`transport` enum.** Even though InProcess dominates, the Sync/Async minority *is* exactly the
  boundary-crossing signal you want, and `list_connections` filters on it. Keep.
- **`realizedBy` + rollup mechanism.** The genuine summarization engine (110 edges, all at the
  Component boundary). `rollup.ts` + inline `realizedBy` expansion in `list_connections` is the
  right design. Do not fold it into the `Realization` kind — they're different (Finding above).
- **`Realization` connection kind.** 61 real uses (55 Class→Interface). Not redundant with
  `realizedBy`. Keep.
- **`model_overview` never dumping Components/Code.** Correct instinct for LLM orientation
  (`overview.ts:21`). Keep.
- **Core `responsibilities`/`invariants` at Container/Component.** Fully populated there and
  high-value; the fix is scoping the *Code* layer (Idea 1), not touching these.

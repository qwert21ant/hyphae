# Hyphae improvement roadmap — synthesis (2026-07-03)

Synthesis of the five axis files in this folder (`01`–`05`). Ranked by **impact ÷ effort**,
with an eye to *where independent agents converged* — convergence is the strongest signal.
Each item cites its source axis file(s). Nothing here is built yet; this is the plan.

## Convergence map (what multiple axes independently asked for)

| Theme | Converging ideas | Axes |
|---|---|---|
| **Detail-level control** (hide Code + derived edges for humans; `detail`/`maxLayer` for LLM) | A1·1 "Code opt-in", A3·8 counts-before-edges, A5·3 audience toggle, A1·5 container-summary | 1,3,4,5 |
| **Server-side verify/gaps tooling** (automate Phase 5, feed gates) | A2·2 `model_gaps`, A4·5 `validate_model`, A4·6 `coverage/find_orphans`, A5·5 description/orphan guardrails | 2,4,5 |
| **Kill read-before-write** (upsert) | A4·4 `onConflict:'skip'`, A2·6 scope reads, A2 idempotency-cost | 2,4 |
| **Deterministic pre-compute / rank-by-importance** | A2·1 workspace pre-scan, A2·5 share discovery, A5·2 fan-in ranking, aider repo-map | 2,5 |
| **MCP surface cleanup** (the redundancies you flagged) | A4·1 merge `find_connections`, A4·2 split `rollup`, A4·9 consistent errors | 4 |
| **Large-graph UI legibility** | A3·2 hover, A3·3 legend, A3·7 minimap, A5·6 colour-by-layer, A3·6 search | 3,5 |

## Priority waves

### Wave 1 — Quick wins (S effort, high ROI — ship first)
These are small, mostly independent, and several directly answer your original questions.

1. **MCP surface cleanup** *(A4·1, A4·2, A4·9, A4·10)* — the redundancies you flagged.
   - Merge `find_connections` → `list_connections({nodeId})`; drop the tool + the SKILL.md L107 rule.
   - Split `rollup` out of `list_connections` into `rollup_connections` (it's a mode flag that silently disables other filters — the exact "excess rule" smell).
   - Make "node not found" consistent across `get_node`/`get_subgraph`/`find_connections`.
   - Verdicts on your other two: **keep** `search_nodes` vs `list_nodes` (justified split), **keep** `get_subgraph` (only nodes+edges tool). Effort S each. `apps/server/src/mcp.ts`.
2. **`validate_model` read tool** *(A4·5)* — expose the already-built `validateModel()` (`packages/schema/src/validate.ts:57`) as a read tool. S. Unblocks the Verify automation below.
3. **UI legibility quick wins** *(A3·2, A3·3, A5·6, A3·7)* — hover-to-highlight (reuse `highlightSets`), a legend (solid vs dashed-purple vs arrowless), colour nodes by layer, optional minimap. All S, all in `Canvas.tsx`/`flow.ts`/`NodeBox.tsx`.

### Wave 2 — High-value medium bets
4. **Detail/audience toggle** *(A1·1, A5·3 — top cross-axis convergence)* — the headline answer to "is the detail right for user vs LLM?"
   - **Web:** a "Stakeholder vs Full" switch that hides the Code layer + derived edges.
   - **MCP:** a `maxLayer`/`detail:'overview'|'full'` param on `list_connections`/`search_nodes`/`get_subgraph`, defaulting reads to Component-and-above.
   - Rationale grounded in real data: **74% of nodes and 60% of edges in the cctv model are Code-level** (A1 findings). Effort S–M. `mcp.ts`, `apps/web` + `focusView.ts`.
5. **Create-or-skip upsert** *(A4·4)* — add `onConflict:'skip'` to `create_nodes`/`create_connections`, keyed (name+parentId)/(from+to+type), resolved inside `runCreate` (already re-reads the model). Removes the hand-rolled read-then-dedupe every subagent does. M. Biggest single skill-cost win on the write side.
6. **`model_gaps`/coverage tool + lighten Verify** *(A2·2, A2·3, A4·6, A5·5)* — one server-side read returning orphans, unbound code edges, thin/description≈name hubs. Then fold Phase 5's sweep into the tail of Phase 3 and mechanize the reconcile so gates surface only real conflicts (4 human stops → 3). M. `mcp.ts` + SKILL.md.
7. **Expandable external nodes** *(A3·1 — your explicit ask)* — in-place expand a ghost to just its participating children. Core change is ~3 lines in `mapEndpoint` (reuse `childOfFocus`); the bulk is a `ghostGroup` render + layout reusing the focus-region pattern. M. Detailed design in `03-ui-ux.md`.
8. **Search-to-focus + side-panel incoming/outgoing split** *(A3·6, A3·4)* — jump to any of 404 nodes by name; partition the connection list by direction. S–M.

### Wave 3 — Strategic / larger
9. **Behavior/Flow axis** *(A5·1, A1·2)* — build the schema-reserved `Flow` (domain→flow→step ordered overlay on existing nodes/connections), MCP + data model first (M), renderer later (L). **Biggest model-completeness lever, already blessed by `MODEL_RU.md`.** See the decision note below re: reserved axes.
9b. **Materialize higher-layer connections** *(A6 — new)* — author real Container↔Container / Context edges linked to finer edges via `realizedBy` (keeping `rollupConnections` as proposer + drift verifier), instead of only deriving them. Gives the C4 altitudes that matter most first-class, describable, editable relationships. Slots into the skill as **Phase 3b under GATE 2** + a Phase-5 coverage check; depends on Wave-2 #6 (`model_gaps`/coverage) to stay drift-free. Effort S–M. See `06-materialized-rollups.md`.
10. **Deterministic pre-scan + fan-in ranking for the skill** *(A2·1, A2·5, A5·2)* — a workspace inventory script (Phase 0 → verify-only) and server-side importance ranking to drive Phase-4 selectivity, so subagents judge instead of traverse. M.
11. **Guided tours + saved named Views** *(A5·4, A5·7)* — realize the reserved `View` axis: bookmark focus+filter+layout (ties into `hashRoute.ts`), and a BFS-ordered read-only walkthrough. M.
12. **Adaptive subagent batching + incremental re-runs** *(A2·4, A2·7, A5·6-incremental)* — size-driven dispatch (merge tiny / split huge containers) and `gitCommitHash`-based "only changed containers" re-runs. M–L; most correctness surface — keep ownership fences strict.

### Cleanup / low-risk churn (do alongside)
- **Reserved-axis hygiene** *(A1·2)* — annotate/prune `dataTypes`/`requirements`/`decisions` (dead `z.unknown()`); **keep** `flows`/`stateMachines` since Wave-3 #9 builds on them.
- **Trim low-signal fields** *(A1·4)* — `intent` is 80% the generic `Use`; `direction` is 563/567 Unidirectional. Narrow or scope them. S.
- **Add governance fields** *(A1·3)* — optional `status`/`criticality`/`owner`; auto-flows through `describe_profile`/`fieldsShape`. M.
- **`describe_profile` as an MCP resource** *(A4·11)* — cache the static profile instead of re-fetching per subagent (keep the tool as fallback). M.

## Conflicts & decisions that need you
1. **Reserved axes: prune vs build.** A1 says they're dead schema (annotate/remove); A5 says the `Flow` axis is the #1 completeness win. **Resolution:** keep `flows`+`stateMachines` (Wave-3 #9 target), annotate/prune only `dataTypes`/`requirements`/`decisions`. Confirm you want to invest in Flow before we protect that schema.
2. **`search_nodes`/`list_nodes` merge** — A4's own verdict is *keep both*; listed only for completeness. Default: leave as-is.
3. **Diff-impact & semantic search** — deliberately **out of scope**: they overlap the separately-installed **gitnexus** MCP. Prefer documenting a gitnexus handoff over reimplementing (A5 scope cautions).

## Explicitly NOT recommended (scope cautions — A5)
Embedding/vector search; a bespoke tree-sitter extraction pipeline (duplicates gitnexus); a heavy diff-impact engine; literal multi-persona UI; committing a frozen graph + auto-update hooks; UI localization. All are team/product-scale concerns that don't fit a single-user local tool.

## Suggested first sprint
Wave 1 in full (MCP cleanup + `validate_model` + UI quick wins) — small, independent, and it clears three of the four things you explicitly asked about (tool redundancy, view overload legibility, "excess rules"). Then Wave-2 #4 (detail toggle) and #7 (expandable externals) as the first two features, since they most directly answer "is the level of detail right?" and your expandable-externals request.

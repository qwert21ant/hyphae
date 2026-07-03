# Axis 2 — Skill efficiency

Scope: can the phase/gate flow be reorganized, and subagent tasks split or merged, to cut
orchestrator cost (turns × context), latency, and friction — **without** weakening the correctness
scaffolding (idempotency, gates, single validating writer)?

Grounded in `plugins/hyphae-modeling/skills/building-architecture-models/SKILL.md` and its three
references (`analysis-loop.md`, `subagent-prompt.md`, `plan-artifact-template.md`), the MCP surface in
`apps/server/src/mcp.ts`, and cross-read against the Understand-Anything (UA) agent pipeline
(`project-scanner`, `file-analyzer`, `architecture-analyzer`, `graph-reviewer`, `assemble-reviewer`).

## Findings

Current structure: **6 phases, 3 hard gates + 1 checkpoint.**
- Phase 0 Discover&verify → Phase 1 Map + **GATE 1** → Phase 2 Parallel components (one subagent/container)
  → Phase 3 Reconcile+connections + **GATE 2** → Phase 4 Code layer (one subagent/container) + **GATE 3**
  → Phase 5 Verify + **VERIFY CHECKPOINT**.
- Orchestrator owns shared nodes (System, Containers, ExternalSystems, cross-package edges); subagents
  own only their container subtree. Server is a single validating writer; every run is idempotent
  (create-or-skip by name+parentId); writes are batched; reports go to `.hyphae/reports/*` and agents
  return only a short status.

Where the cost/friction actually is:
1. **Everything discovery is hand-done by the LLM.** Phase 0 reads manifests, finds entrypoints, and
   classifies archetypes package-by-package (`analysis-loop.md` steps 1–3); Phase 2/4 subagents re-read
   the same files. UA offloads *all* of this to deterministic bundled scripts (`scan-project.mjs`,
   `extract-import-map.mjs`, `extract-structure.mjs`) and lets the LLM only do semantic synthesis. Hyphae
   has **no** deterministic tooling here — gitnexus is explicitly "always optional." This is the single
   biggest lever.
2. **Phase 2 and Phase 4 duplicate per-container discovery.** Both are "one subagent per container," both
   run the analysis loop over the *same* package files, both re-read `model_overview`+`list_nodes`. Phase 4
   re-derives from scratch what Phase 2 already had loaded.
3. **Reconciliation is a manual LLM job done twice.** GATE 2 (Phase 3) and GATE 3 (Phase 4) are
   structurally identical: "aggregate reports → resolve each endpoint by (container[,component],name) →
   dedupe → surface conflicts, never last-write-wins." UA does the mechanical 90% of this in
   `merge-batch-graphs.py` (ID normalization, dedupe, dangling-edge drop) and reserves the LLM
   (`assemble-reviewer`) for the semantic remainder. Hyphae makes the orchestrator eyeball the whole
   bundle each time.
4. **Phase 5 verify is a manual sweep** over `list_connections`/`list_nodes` output — exactly the kind of
   deterministic check UA runs as a script (`graph-reviewer`). The server already holds the whole model,
   so these checks are cheap to compute server-side.
5. **Per-subagent round-trip overhead scales with N containers**: each subagent independently calls
   `describe_profile` (returns the entire `c4Backend`) + `model_overview` + an unscoped `list_nodes`.
6. **"One per container" is rigid.** A monorepo of 30 tiny contract/config packages spins 30 subagents;
   a single 50-component container overflows one subagent. UA batches *by size* with split thresholds
   (file-analyzer: split at >60 nodes / >120 edges) rather than one-agent-per-unit.
7. **No incrementality.** A re-run re-analyzes every container even if unchanged; idempotency prevents
   duplicates but not the wasted read/analysis work.

The safety scaffolding itself is sound and should be preserved — see **Keep as-is**.

## Ideas (strongest first)

### 1. Add a deterministic workspace pre-scan (Phase 0 becomes verify-only)
**What.** Ship a bundled script (Node, run once by the orchestrator) that enumerates workspace packages
from the manifests (pnpm/yarn/npm workspaces, turbo/nx/lerna/go/cargo), and for each emits path,
technology/deps, declared entrypoint, and a rough archetype guess + size (file/LOC count) — writing
`.hyphae/scan.json`. Phase 0 then shrinks to: run the script, and have the LLM only **verify drift and
decide drill/skip** on top of the deterministic inventory (which is what Phase 0 uniquely needs a human/LLM
for anyway).
**Why/rationale.** Directly mirrors UA's `project-scanner` split: "deterministic file enumeration/import
resolution handled by scripts; LLM contributes only the narrative." Today `analysis-loop.md` steps 1–3
are LLM file-reads repeated per package in Phase 0 *and* again inside every Phase 2 subagent. A script
makes the container map near-free and consistent, and the same `scan.json` feeds every downstream
subagent (fewer re-reads).
**Effort.** M (one script + wire Phase 0 + reference edit).
**Tradeoffs/risks.** Another artifact to maintain; must degrade gracefully to the current LLM loop when a
manifest is missing/exotic (keep the loop as the documented fallback, as UA keeps "read files if unsure").
Don't let the script guess *architecture* — only inventory; drift/drill judgment stays with GATE 1.
**Where.** Phase 0 + `references/analysis-loop.md` (steps 1–3).

### 2. Server-side `model_gaps` tool to automate Phase 5 (and feed the gates)
**What.** Add one read-only MCP tool (e.g. `model_gaps`) that computes, from the live model in one
size-independent call: Component orphans (zero connections), "hub" claims with no inbound edges,
cross-component code edges not present in any `realizedBy` (unbound), and containment violations. Phase 5's
"Coverage sweep" (SKILL.md lines 100–107) becomes: call the tool → show flags at the checkpoint → dispatch
owning subagents for confirmed gaps.
**Why/rationale.** This is UA's `graph-reviewer` pattern (deterministic validation script → LLM decision)
but *cheaper*, because the server already has the whole graph — no batch files to re-read. It replaces an
LLM reasoning-over-dumps sweep with a single tool call, and the same output can pre-populate GATE 2/3
conflict lists.
**Effort.** M (server compute + tool registration in `mcp.ts`; logic is small, mirrors the existing
`list_connections` container/rollup helpers).
**Tradeoffs/risks.** Keep it read-only and advisory (gaps are still filled by the owning subagent, never
by the orchestrator inventing edges — SKILL.md line 99). Semantic "is this really a gap" judgment stays
human at the checkpoint.
**Where.** Phase 5 + `apps/server/src/mcp.ts`.

### 3. Fold Phase 5 into the tail of Phase 3; lighten GATE 2/GATE 3 with a mechanical reconcile step
**What.** (a) Run the Verify sweep (idea #2) as the **default tail of Phase 3**, before the context reset —
the orchestrator already holds all reports and just-written edges, so reusing that context avoids a whole
reload cycle. Fold the VERIFY CHECKPOINT into GATE 2. Phase 5 remains available as a standalone re-run, but
is no longer a separate mandatory pass. (b) Extract the shared reconcile logic (resolve endpoint by
(container[,component],name), dedupe, detect conflicting amendments) into a documented sub-procedure so the
gate surfaces **only** genuine conflicts + new external systems, not the entire edge bundle.
**Why/rationale.** SKILL.md already says Verify "can run right after Phase 3… independent of Phase 4" — so
the separation is optional, not load-bearing. GATE 2 and GATE 3 are the same procedure at two layers
(SKILL.md lines 59–64 vs 88–90); a shared mechanical reconcile (UA's `merge-batch-graphs.py` idea) keeps
the human gate but shrinks what the human/orchestrator must scan. Net: 4 human stops → 3, and one fewer
context-reload cycle.
**Effort.** M.
**Tradeoffs/risks.** Do **not** merge the *human* GATE 2 into GATE 1, and do not drop conflict-surfacing —
those are load-bearing. This only merges the *low-stakes, read-mostly* Verify checkpoint into GATE 2 and
mechanizes the deterministic part of reconciliation.
**Where.** Phase 3 + Phase 5; new `references/reconcile-reports.md` shared by Phase 3 and Phase 4 step 2–3.

### 4. Adaptive subagent batching instead of strict one-per-container
**What.** Replace "one subagent per container" with a size-driven dispatch that the orchestrator computes
from the pre-scan (idea #1):
- **Merge tiny/no-drill containers** into one subagent (like UA's "fused" batches), with the report keyed
  per-container so ownership stays clean. Trivial infra/config containers already model as a single node
  (`analysis-loop.md`) and need no dedicated agent.
- **Split a huge container** by sub-path: dispatch several subagents each scoped to a *Component subtree*,
  with the orchestrator still owning the Container node. An "unwieldy count is a signal the Component is
  too coarse" (SKILL.md line 78) — batching makes that splittable instead of overflowing one agent.
**Why/rationale.** Orchestrator cost scales with number of dispatches; UA deliberately batches by size
with explicit split thresholds rather than one-agent-per-file. Fewer spin-ups for small repos, no context
overflow for large ones.
**Effort.** M (dispatch logic + a careful ownership-rule amendment in `subagent-prompt.md`).
**Tradeoffs/risks.** The ownership invariant ("subagent owns only its container subtree") must be
preserved when splitting — scope a split subagent to explicit Component ids and forbid touching siblings,
exactly as containers are fenced today. Merged-container subagents must still resolve cross-package deps by
(container,name). This is the change with the most correctness surface — keep the fences strict.
**Where.** Phase 2 & Phase 4 dispatch + `references/subagent-prompt.md`.

### 5. Share discovery between Phase 2 and Phase 4
**What.** Have the Phase 2 subagent — which already has the package files loaded — emit a **candidate
code-element list** (important classes/functions/modules per Component, with `codeRefs`) into its report.
The Phase 4 subagent then reads that candidate list from the report and validates/writes it, instead of
re-running the full analysis loop over the same files.
**Why/rationale.** Removes the biggest duplicated read/analysis in the flow (finding #2). It does **not**
break the Phase 3→Phase 4 ordering (code edges still bind to Component↔Component edges created in Phase 3);
it only moves the *discovery* earlier and caches it, keeping the write/bind in Phase 4.
**Effort.** S–M (extend the Phase 2 report schema + Phase 4 prompt to consume it).
**Tradeoffs/risks.** Slightly larger Phase 2 reports and subagent context. If the model is being *deepened*
long after Phase 2 ran, the cached candidates may be stale — Phase 4 must treat them as hints and
re-verify against the current tree (cheap, since it has `codeRefs`).
**Where.** `references/subagent-prompt.md` (both sections) + report schemas.

### 6. Cut per-subagent round-trips: inline the profile slice, scope the reads
**What.** (a) Since the orchestrator already builds each subagent prompt, inline the relevant
`describe_profile` slice (valid node/connection kinds + field keys/enums for the layers the subagent
touches) into the prompt, so subagents skip the `describe_profile` call. (b) Change the subagent's first
read from unscoped `list_nodes` to `list_nodes(parentId=containerId)` (Phase 2) / per-Component `parentId`
(Phase 4) — both already supported by the tool.
**Why/rationale.** With N subagents, `describe_profile` (returns the entire `c4Backend`) and an unscoped
`list_nodes` are paid N times. Scoping is free correctness-wise and the profile slice is static per run.
**Effort.** S.
**Tradeoffs/risks.** If profiles become per-project configurable (the standing memory goal), the inlined
slice must be regenerated per run — fine, the orchestrator fetches `describe_profile` once and passes the
slice down. Keep `model_overview` (it's small and size-independent).
**Where.** `references/subagent-prompt.md` steps 0–1.

### 7. Incremental re-runs via per-container freshness markers
**What.** Record in the plan artifact (or `.hyphae/scan.json`) a per-container marker — last-modeled commit
or a content hash of the package's tracked files. On re-run, skip containers whose files are unchanged
(optionally driven by gitnexus `detect_changes`), analyzing only changed/new ones.
**Why/rationale.** Idempotency today prevents *duplicate writes* but not *wasted analysis*: every re-run
re-reads and re-reasons over unchanged packages. A freshness gate turns "re-model the repo" from O(all
containers) into O(changed containers).
**Effort.** M–L (needs a stable per-container hash + resume logic).
**Tradeoffs/risks.** Staleness risk if the marker misses a change (e.g. a moved dependency) — make it
conservative and always allow a `--force` full pass. Don't let it skip the cross-package reconcile, since a
change in one container can invalidate another's edges.
**Where.** Phase 0 resume logic + `references/plan-artifact-template.md` (Progress section).

## Keep as-is (load-bearing — do not "optimize" away)

- **Single validating writer (the running server).** Parents-before-children, both-endpoints-before-edge,
  422-returns-issues. This is what makes idempotency and batched writes safe — do not move to a
  file-then-merge model like UA (UA needs a merge script *because* it has no live validator; Hyphae
  shouldn't inherit that problem).
- **Create-or-skip idempotency by (name + parentId).** Cheap already — one compact `list_nodes` per scope
  (id/name/type/parentId only). Don't trade it away.
- **GATE 1 (container map + drift + drill/skip approval).** Prevents wasted deep analysis on the wrong
  containers; the human decision the pre-scan can't make.
- **Conflict-surfacing at GATE 2/3, never last-write-wins.** The core data-integrity guarantee. Mechanize
  the *dedupe/resolve* (idea #3) but keep the human resolving genuine conflicts.
- **Orchestrator-owns-shared-nodes / subagent-owns-subtree ownership fences.** Any batching (idea #4) must
  preserve this exactly.
- **Reports-to-files + short-status returns; batch every multi-write; reset context between phases.**
  Already the right cost discipline (matches UA's "respond with only a brief summary, write data to file").
- **Configurable profile via `describe_profile`.** Do **not** borrow UA's hardcoded 16 node / 29 edge
  taxonomy — Hyphae's profile-driven types are more flexible and align with the standing
  configurable-profiles goal.
</content>
</invoke>

# Axis 5 — Cross-pollination

Mining the sibling project **Understand-Anything** (UA) and a few C4/codebase-graph
peers for ideas transferable onto Hyphae's four axes: (1) model completeness,
(2) skill / agent-pipeline efficiency, (3) UI/UX for large graphs, (4) MCP/LLM tool
ergonomics. Each borrowed idea below states **where it lands in Hyphae** (file / tool /
skill phase), effort **S/M/L**, and a **worth-it verdict** given Hyphae is a small,
local, single-user tool.

Reference points in Hyphae:
- Model concept & unimplemented axes: `docs/MODEL_RU.md` (§2–§4, §8 — Flow, StateMachine,
  DataType, Requirement, Decision, View are schema-reserved but not yet built).
- Profile: `packages/schema/src/profiles/c4-backend.ts`.
- MCP tools: `apps/server/src/mcp.ts`.
- Focus view + rollups: `apps/web/src/focusView.ts`.
- Modeling skill: `plugins/hyphae-modeling/skills/building-architecture-models/SKILL.md`.

A structural note on the two projects: **UA extracts a graph deterministically and
freezes it to JSON; Hyphae authors a graph interactively into a live server.** So UA
ideas about *deterministic pre-computation* and *"trust the script's output"* transfer
extremely well to Hyphae's cost problem, while UA ideas about *shipping a static
dashboard* mostly do not.

---

## Understand-Anything

Things UA does that Hyphae doesn't, each with a transfer note.

- **Domain view — business processes as domain → flow → step.** UA's `domain-analyzer`
  produces a second graph (`domain:` / `flow:` / `step:` nodes, `contains_flow` /
  `flow_step` / `cross_domain` edges) rendered as a horizontal flow, *derived cheaply
  from the already-built structural graph without re-reading source*.
  **Transfer to Hyphae:** This is almost exactly Hyphae's **Behavior axis (Flow)** which
  `MODEL_RU.md` already designs but leaves "резерв в MVP". UA validates the shape: an
  ordered scenario overlaid on existing Nodes/Connections, authored *after* structure
  from what's already modeled — not a new engine. Land it as (a) a `Flow` collection +
  MCP `create_flows`/`list_flows` in `mcp.ts`, (b) a **Phase 6 "Behavior" pass** in
  SKILL.md that derives flows from existing Components/connections (cheap, no re-scan),
  (c) a horizontal flow renderer in `apps/web`. UA's trick of **encoding step order as a
  monotonic fractional edge weight** is a neat, storage-light ordering idea. Effort **L**
  (new axis end-to-end) — but **high worth-it**: it's the single biggest model-completeness
  lever and it's already blessed by Hyphae's own design doc. Start with just the MCP +
  data model (M) and defer the renderer.

- **Guided tours ordered by dependency.** `tour-builder` runs a deterministic topology
  script (fan-in/fan-out, entry-point scoring, BFS-from-entrypoint depth layering,
  coupled-cluster detection) and then an LLM turns that into a 5–15 step narrated
  walkthrough — "read the codebase in the right order."
  **Transfer to Hyphae:** A tour is a **read-only, ordered View** over existing nodes
  (Presentation axis in `MODEL_RU.md`). Hyphae already has all the graph data server-side;
  a `buildTour(model)` in `packages/schema` could compute fan-in/BFS over `connections`
  + `parentId` and emit an ordered node list, surfaced by a new MCP `get_tour` and a
  "Tour" mode in the web breadcrumb bar that steps focus through nodes. Effort **M**.
  **Worth it for onboarding/LLM-orientation**, but lower priority than Flow — and note
  Hyphae's breadcrumb focus navigation already gives *spatial* orientation, so a tour is
  additive, not filling a hole. IcePanel ships the same feature ("Flows" as guided
  walkthrough) and reviewers single it out as a differentiator, which corroborates value.

- **Persona-adaptive detail level (junior dev / PM / power user).** UA's dashboard varies
  how much it shows per persona; the pipeline also cleanly separates *file-level* nodes
  from *function/class* nodes so consumers (onboard, diff, tour skills) can request "only
  file-level" and skip the fine grain.
  **Transfer to Hyphae:** This maps directly onto the review's central "right level of
  detail for user vs LLM" question. Hyphae's cheap win is the **granularity split**, not
  literal personas: the model already has Context→Container→Component→Code layers, and
  `focusView.ts` already collapses below the focus. Expose a **detail/persona toggle**
  that (web) hides the Code layer and derived edges for a "stakeholder" view vs shows
  everything for a "power" view, and (MCP) a `detail: 'overview'|'full'` param on
  `get_subgraph`/`list_nodes` so an LLM can ask for Container-only. Effort **S–M**.
  **Worth it** — small, and it's the axis-1/axis-3 question stated in the brief. Avoid
  UA's literal 3-persona modelling; a 2-level "audience" toggle is enough for one user.

- **Plain-English node summaries as a first-class, required field.** Every UA node has a
  `summary` that must not just restate the filename; the reviewer *rejects* graphs whose
  summaries equal the node name. Downstream skills (onboard, tour, diff) read summaries,
  never source.
  **Transfer to Hyphae:** Hyphae has `description` but doesn't enforce quality. Add a
  **Phase-5 Verify check** in SKILL.md: flag nodes whose `description` is empty or ≈ the
  `name`, and hub nodes with thin descriptions. Cheap because `list_nodes` already returns
  everything in one call. Effort **S**. **Worth it** — pure guardrail, no new machinery.

- **Deterministic-script + LLM split ("trust the script's output").** UA's defining
  pattern: every agent (scanner, architecture, tour, reviewer) does the mechanical graph
  math in a Node/Python script written to a temp file, then the LLM *only does semantic
  interpretation and never re-derives counts*. Imports are pre-resolved once
  (`extract-import-map.mjs`) and injected, so file-analyzers never re-parse.
  **Transfer to Hyphae:** Hyphae already leans this way (rollups, `model_overview`,
  `get_subgraph` are server-side). The transferable discipline: push **more orientation
  math server-side** so subagents spend tokens on judgement, not traversal. Concretely,
  a Phase-0/Phase-5 helper that returns "candidate important Code elements by fan-in"
  (the SKILL.md Phase-4 selectivity rule currently asks the subagent to eyeball this) —
  compute fan-in in `packages/schema` and expose via an MCP `rank_nodes`/existing
  `get_subgraph`. Effort **M**. **Worth it** for token cost (the skill explicitly worries
  about "cost ≈ turns × context"). This is axis-2's core lever.

- **Incremental / fingerprint-based updates.** UA fingerprints files (tree-sitter) and on
  re-run only re-analyzes changed files, pruning their old nodes/edges first, and stores
  `gitCommitHash` in `meta.json`.
  **Transfer to Hyphae:** Hyphae's skill is already "idempotent, create-or-skip, resumable"
  but re-derives what to touch by re-reading the model each run. A lightweight analogue:
  store the `gitCommitHash` the model was built at (model `metadata`), and let Phase 0
  `git diff <hash>..HEAD --name-only` to tell the orchestrator **which containers actually
  changed**, so it only re-dispatches those subagents. Effort **M**. **Worth it if** models
  are rebuilt often; otherwise low priority — Hyphae is human-in-the-loop, not a commit hook.

- **`.understandignore` + pre-flight scope gate.** UA generates an ignore file from
  `.gitignore` and *stops if >100 files* to force scoping.
  **Transfer to Hyphae:** SKILL.md Phase 0 already verifies workspace globs; adding an
  explicit **"skip generated/vendor/test dirs" default list** and a soft gate ("this repo
  has N packages — confirm the drill/skip list") hardens the existing GATE 1. Effort **S**.
  **Worth it, small** — reduces noise nodes (axis 1: completeness ≠ dumping everything).

- **Explicit layer legend / colour-coded layers with descriptions.** UA assigns every node
  to exactly one named layer (`{id,name,description,nodeIds}`) with a colour legend.
  **Transfer to Hyphae:** Hyphae's layers are *type-derived* (Context/Container/Component/
  Code) not free-form, so the "assign to a layer" agent isn't needed — but the **legend +
  colour-by-layer** UI is missing. Land in `NodeBox.tsx`/`GroupNode.tsx`: colour nodes by
  `layerOfType`, add a small legend. Effort **S**. **Worth it** for axis-3 readability.

- **Diff impact analysis (blast radius).** `understand-diff` maps changed files → nodes →
  1-hop edges → affected layers → a risk assessment, and writes a `diff-overlay.json` the
  dashboard highlights.
  **Transfer to Hyphae:** Hyphae's `codeRefs` (`path#Symbol`) already tie nodes to files,
  so "given these changed paths, which nodes + 1-hop neighbours + flows are affected" is a
  natural MCP tool (`impact({paths})`) reusing `get_subgraph`'s BFS. Effort **M**.
  **Worth it, but** it overlaps heavily with the separately-installed **gitnexus** MCP
  (which already does `impact`/`api_impact` on a live code index). For a small tool, prefer
  *documenting the gitnexus handoff* over reimplementing — flag as a **scope-overlap risk**,
  not a must-build.

- **Semantic / fuzzy search over the graph.** UA offers name + meaning search ("which parts
  handle auth?").
  **Transfer to Hyphae:** `search_nodes` in `mcp.ts` is already case-insensitive substring
  over name/description/fields — good enough for one user + an LLM that can issue several
  queries. True embeddings/semantic search is **not worth it** (infra weight, an index to
  maintain) for a single-user local tool. Cheap improvement only: let `search_nodes` also
  match `codeRefs` and connection descriptions. Effort **S**. **Worth-it: marginal.**

- **Agents write reports to disk, not into context; orchestrator stays cheap.** UA agents
  write intermediate JSON to `.understand-anything/intermediate/` and return only a short
  status; the orchestrator reads files, not chat history.
  **Transfer to Hyphae:** SKILL.md **already does this** (`.hyphae/reports/`, "read reports
  from their files", "reset/compact between phases"). Confirmation that Hyphae's pipeline is
  on the right track; no action beyond keeping it. Worth noting as validation, not a change.

---

## Other tools (brief)

- **Structurizr (C4-as-code / DSL).** Diagrams are *projections of one model* (define
  elements once, render many views) — the same "one model, many diagrams" thesis as
  `MODEL_RU.md`. One idea to steal: **named/saved views as first-class** (Hyphae's reserved
  `View` axis) so a user can bookmark "focus X + this connection filter + this layout" and
  return to it. Lands on the `views` collection + `hashRoute.ts`.
- **IcePanel.** Its differentiators are **guided "Flows"** (step-through walkthrough — same
  idea as UA tours, doubly confirming value) and **tag-based filtering/highlighting** of
  cross-cutting concerns (security, team ownership) across a diagram. Steal: a **tag field
  + "highlight by tag" filter** in `FilterPanel.tsx`, cheap on top of the existing
  connection-filter machinery. Note IcePanel is cloud/GUI-only with *no drift detection* —
  Hyphae's `codeRefs` + gitnexus already beat it there.
- **Sourcegraph / code-graph tools.** Idea worth stealing: **treat the code index as the
  source of ground truth and reconcile the model against it** — Hyphae's SKILL.md already
  says "docs are a hypothesis, verify against the filesystem" and optionally uses gitnexus;
  lean into that (a Verify-phase "does every `codeRef` still resolve?" check). Heavyweight
  indexing infra itself is a **scope mismatch**.
- **aider repo-map.** Idea worth stealing: a **ranked, budget-bounded map** (PageRank-style
  importance so only the most-depended-on symbols are shown within a token budget). Directly
  informs SKILL.md Phase-4 selectivity ("model what matters, not every file") — rank Code
  candidates by fan-in and cut at a budget rather than asking the LLM to judge from scratch.

---

## Top transferable ideas (ranked, tied to the four axes)

1. **Behavior/Flow axis (from UA domain view).** Axis 1. Build the schema-reserved `Flow`
   as an ordered overlay on existing nodes/connections, derived cheaply post-structure;
   MCP + data model first (M), renderer later (L). Biggest completeness win, already in
   Hyphae's design.
2. **Deterministic pre-computation of "what matters" (from UA's script+LLM split & aider
   repo-map).** Axis 2 + Axis 1. Compute fan-in / importance server-side and feed Phase-4
   selectivity, so subagents judge instead of traverse. Cuts token cost (the skill's stated
   worry). Effort M.
3. **Audience/detail toggle + granularity params (from UA persona-adaptive UI).** Axis 3 +
   Axis 4. Web "stakeholder vs full" view (hide Code + derived edges) and an MCP
   `detail:'overview'|'full'` param. Directly answers the review's "right level for user vs
   LLM" question. Effort S–M.
4. **Guided tour / ordered View (from UA tour-builder + IcePanel Flows).** Axis 3. Read-only
   BFS-ordered walkthrough that steps the focus view; realizes the reserved `View` axis.
   Effort M.
5. **Description-quality + orphan/coverage guardrails (from UA graph-reviewer).** Axis 1 +
   Axis 2. Extend SKILL.md Phase-5 Verify with "description ≈ name" and thin-hub checks;
   cheap, one `list_nodes` call. Effort S.
6. **Colour-by-layer legend + tag highlight filter (from UA layers / IcePanel tags).**
   Axis 3. Purely additive UI in `NodeBox`/`GroupNode`/`FilterPanel`. Effort S.
7. **Saved named Views (from Structurizr / IcePanel).** Axis 3. Persist focus+filter+layout
   as the reserved `View` entity, integrate with `hashRoute.ts`. Effort M.

---

## Scope cautions (ideas that DON'T fit a small local tool)

- **Semantic/embedding search & a maintained vector index** — overkill for one user + an
  LLM that can issue several substring queries. Keep `search_nodes` lexical.
- **Full multi-language tree-sitter extraction pipeline** — UA's scanner/file-analyzer/
  import-map machinery exists because UA *auto-builds* the graph from source. Hyphae
  deliberately has an LLM author the model via MCP; re-adding a deterministic extractor
  duplicates gitnexus, which is already an optional dependency. Prefer the **gitnexus
  handoff** over building extraction.
- **Diff/impact analysis as a bespoke Hyphae engine** — worth a thin MCP `impact({paths})`
  over existing BFS, but the heavy version overlaps gitnexus `impact`/`api_impact`. Don't
  reimplement code-level impact.
- **Persona system as literal multi-persona UI** (3+ personas, per-persona layouts) — a
  single-user tool needs at most a 2-level audience toggle. UA's persona breadth is a
  team/onboarding-product concern.
- **Shipping/committing a frozen graph + git-lfs + auto-update commit hook** — UA's
  "commit the JSON so teammates skip the pipeline" is a *sharing* feature for teams.
  Hyphae's model file already lives in the repo and is edited live; a commit hook that
  rebuilds is contrary to Hyphae's human-in-the-loop, gated flow.
- **Multi-platform installers / localization of UI (8 languages)** — pure product-surface
  breadth, irrelevant to a local single-user editor.

Sources: [IcePanel vs Structurizr](https://icepanel.io/blog/2025-11-14-icepanel-vs-structurizr),
[Top 9 C4 tools](https://icepanel.io/blog/2025-08-28-top-9-tools-for-c4-model-diagrams),
[System design with IcePanel — review](https://no-kill-switch.ghost.io/system-design-with-icepanel-brief-and-opinionated-review/).

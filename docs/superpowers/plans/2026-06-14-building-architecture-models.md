# Building-Architecture-Models Skill — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a resumable Claude Code skill, `building-architecture-models`, that drives an agent to build and incrementally deepen a Hyphae model of a large repository through the `hyphae` MCP tools.

**Architecture:** A process/technique skill. One `SKILL.md` holds the rigid top-down breadth-first pipeline (Phase 0 discover/verify → Phase 1 map + GATE 1 → Phase 2 parallel component subagents → Phase 3 reconcile+connections + GATE 2 → Phase 4 deepen) plus the idempotency contract. Three `references/` files hold the bulky reusable parts: the generic analysis loop + archetypes, the Phase-2 subagent prompt/report contract, and the plan-artifact template. The orchestrator owns all shared nodes (System, Containers, ExternalSystems) and cross-package edges; subagents own only their own container's subtree. Built and verified TDD-style per `superpowers:writing-skills`: observe baseline failure, write the skill, verify compliance, refactor.

**Tech Stack:** Markdown skill files under `~/.claude/skills/`; the `hyphae` MCP server (read+write) backed by a running Hyphae HTTP server; subagents via the Agent tool; design spec at `docs/superpowers/specs/2026-06-14-building-architecture-models-design.md`.

**REQUIRED BACKGROUND:** Before writing any skill content, you MUST have read `superpowers:writing-skills` (frontmatter rules, CSO description rules, flowchart usage) — its conventions are assumed throughout.

---

## File structure

Created under `C:/Users/qwert/.claude/skills/building-architecture-models/`:

- `SKILL.md` — pipeline, gates, prerequisites, idempotency contract, red flags. The only always-loaded file.
- `references/analysis-loop.md` — generic manifest→entrypoint→archetype loop and the archetype table. Loaded in Phase 0/2.
- `references/subagent-prompt.md` — the exact prompt the orchestrator fills per container, including the structured report schema. Loaded in Phase 2.
- `references/plan-artifact-template.md` — template for `docs/hyphae/model-plan.md` in the *target* repo. Loaded in Phase 1.

Working/verification artifacts (in the hyphae repo, version-controlled):

- `docs/superpowers/specs/2026-06-14-building-architecture-models-design.md` — the approved design (already committed).
- `docs/superpowers/plans/2026-06-14-building-architecture-models.md` — this plan.
- `docs/superpowers/tests/2026-06-14-building-architecture-models-baseline.md` — captured baseline + verification notes (Task 1, 7, 8).

**Pre-flight (do once before Task 1):** confirm the server is up by calling the `mcp__hyphae__get_text_context` tool. It must return the current model (the populated hyphae model). If it errors, ask the user to run `pnpm --filter @hyphae/server dev` and stop. The hyphae repo's already-built model is the fixture for the idempotency test.

---

## Task 1 (RED): Capture baseline failure — re-running the one-shot prompt duplicates nodes

The single most important property is idempotency: re-running a model build on an already-modeled repo must NOT create duplicates. The existing one-shot prompt (`docs/prompts/analyze-and-model.md`) says "Create the System node Hyphae" with no read-first/skip logic, so it should fail this. Watch it fail before writing the skill.

**Files:**
- Create: `docs/superpowers/tests/2026-06-14-building-architecture-models-baseline.md`

- [ ] **Step 1: Snapshot the current model**

Call `mcp__hyphae__list_nodes`. Record the exact node count and the names (expect the System "Hyphae", three Containers, the Components from the existing model). Save this list under a "Before" heading in the baseline test file.

- [ ] **Step 2: Run the baseline scenario (no skill)**

Dispatch a general-purpose subagent with this exact prompt (it deliberately has NO idempotency guidance — this is the failing test):

```
Use the hyphae MCP tools to model THIS repository (C:/projects/hyphae) as a C4 architecture,
following docs/prompts/analyze-and-model.md. Create the System node, one Container per package,
and Components for the key modules. Report what you created.
```

- [ ] **Step 3: Observe and document the failure**

Call `mcp__hyphae__list_nodes` again. Expected baseline failure — at least one of:
- duplicate nodes (e.g. two "Hyphae" Systems or two "@hyphae/server" Containers), OR
- a burst of `422` rejections the agent had to fight through, OR
- the agent gave up / produced an inconsistent partial graph.

Record verbatim in the baseline file under "Baseline behavior (RED)": the resulting node count, any duplicates, and any rationalizations the agent used. This documents exactly what the skill must prevent.

- [ ] **Step 4: Restore the fixture**

Delete any duplicate nodes the baseline created (via `mcp__hyphae__delete_node`) so the model matches the Step 1 snapshot. Re-run `mcp__hyphae__list_nodes` and confirm the count equals the "Before" count.

- [ ] **Step 5: Commit the baseline notes**

```bash
git add docs/superpowers/tests/2026-06-14-building-architecture-models-baseline.md
git commit -m "test: baseline (RED) for building-architecture-models skill"
```

---

## Task 2 (GREEN): Scaffold the skill and write SKILL.md

**Files:**
- Create: `C:/Users/qwert/.claude/skills/building-architecture-models/SKILL.md`

- [ ] **Step 1: Create `SKILL.md` with this exact content**

````markdown
---
name: building-architecture-models
description: Use when building or deepening a Hyphae C4 architecture model of a large or unfamiliar repository through the hyphae MCP tools — when a single analyze prompt is too big for the repo, when re-running a model build must not create duplicate nodes, or when modeling a multi-package / multi-service codebase.
---

# Building Architecture Models

## Overview

Build a Hyphae model of an arbitrarily large repo **top-down, breadth-first, and resumably**. The running Hyphae server is the single source of truth; mutate it only through the `hyphae` MCP tools, never by editing `hyphae.json`.

Core rules:
- **Docs are a hypothesis, not truth.** Verify every structural claim against the filesystem/manifests; record drift.
- **The orchestrator (you) owns shared nodes** — System, Containers, ExternalSystems, and all cross-package connections. **Subagents own only their own container's subtree.**
- **The server is a single validating writer.** Parents before children; both endpoints before a connection. A `422` returns `issues` — read them and fix the input.
- **Every run is idempotent.** Read before you write; never assume an empty model.

## Prerequisites

The Hyphae server must be running and the `hyphae` MCP connected. Confirm by calling `get_text_context` — it returns the current model (possibly empty). If it errors, stop and ask the user to start the server (`pnpm --filter @hyphae/server dev`).

## When to use

- Modeling a repo too large for the one-shot `docs/prompts/analyze-and-model.md` prompt.
- Deepening or re-running an existing model without creating duplicates.
- Any repo with multiple packages / services / apps.

Not for: trivial single-package repos (the one-shot prompt is fine), or hand-editing a model (use the web editor).

## The flow

Follow the phases in order. Do not skip the gates.

### Phase 0 — Discover & verify
1. Read README / docs / ADRs → form a hypothesis of the structure.
2. Verify it against reality: workspace globs (pnpm/yarn/npm), monorepo tools (turbo/nx/lerna/go/cargo), or top-level source dirs. **Record drift** (doc says X, repo shows Y).
3. For each package run analysis-loop steps 1–3 only (manifest → entrypoint → archetype). REQUIRED REFERENCE: read `references/analysis-loop.md`.

### Phase 1 — Map + GATE 1
1. Call `get_text_context` (idempotent read).
2. Create-or-skip the **System** node, then one **Container** per verified package (with `technology`, `responsibilities`, `invariants`).
3. Write the plan artifact to `docs/hyphae/model-plan.md` in the target repo. REQUIRED REFERENCE: `references/plan-artifact-template.md`.
4. **GATE 1: stop and show the user the container map + drift notes + per-container drill/skip list. Wait for approval/edits before continuing.**

### Phase 2 — Parallel components
Dispatch one subagent per container marked "drill", in parallel. Build each subagent's prompt from `references/subagent-prompt.md` (REQUIRED REFERENCE). Each subagent deeply analyzes its package, writes its own Components and intra-container connections, and returns a structured report. Subagents never touch other packages or shared nodes.

### Phase 3 — Reconcile + connections + GATE 2
1. Aggregate all reports into one review bundle:
   - cross-package connections (resolve name→id, dedupe),
   - proposed amendments to System / Containers (`update_node`),
   - new ExternalSystem nodes + edges to them.
2. **GATE 2: show the bundle. Conflicting amendments from different subagents are surfaced for the user to resolve — never last-write-wins. Wait for approval/trim.**
3. Apply the approved bundle in order: `update_node` amendments → `create_node` ExternalSystems (parent = System) → `create_connection` for all cross-package/external edges last.
4. Tick the plan artifact's progress markers. Call `get_text_context` and summarize the model.

### Phase 4 — Deepen (optional, later passes)
Each is an independent re-runnable pass: code-level nodes via gitnexus (only if connected and indexed), Flows for key scenarios, Data/Intent axes when the editor supports them.

## Idempotency contract (every run, every agent)

- **Read first** (`get_text_context` / `list_nodes`). Never assume empty.
- **Create-or-skip by (`name` + `parentId`).** If a node with that identity exists, reuse its id — do not create a second one.
- **On `422`, read the returned `issues` and fix the input** (almost always a missing parent/endpoint or a containment violation). Never blind-retry.

## Red flags — STOP

- About to `create_node` without having read the current model this run → read first.
- A subagent creating a Container, an ExternalSystem, or a cross-package edge → not allowed; report it upward, that is the orchestrator's job.
- "The docs say the layout is X" treated as fact without checking the filesystem → verify.
- Writing a connection before both endpoints exist → reorder.
- Skipping a gate to "save time" → both gates are mandatory.
````

- [ ] **Step 2: Verify the frontmatter parses and word count is reasonable**

Run:
```bash
head -5 "C:/Users/qwert/.claude/skills/building-architecture-models/SKILL.md"
wc -w "C:/Users/qwert/.claude/skills/building-architecture-models/SKILL.md"
```
Expected: lines 1–4 are the YAML frontmatter (`---`, `name:`, `description:`, `---`); word count well under 800 (process skill, references hold the bulk).

- [ ] **Step 3: Commit**

If `~/.claude` is a git repo, commit there; otherwise the file is simply saved. Run:
```bash
git -C "C:/Users/qwert/.claude" add skills/building-architecture-models/SKILL.md 2>/dev/null \
  && git -C "C:/Users/qwert/.claude" commit -m "feat: building-architecture-models skill (SKILL.md)" \
  || echo "~/.claude not a git repo — file saved, no commit"
```

---

## Task 3 (GREEN): Write `references/analysis-loop.md`

**Files:**
- Create: `C:/Users/qwert/.claude/skills/building-architecture-models/references/analysis-loop.md`

- [ ] **Step 1: Create the file with this exact content**

````markdown
# Generic analysis loop & archetypes

No per-language cheatsheets. For any unit of code run the same loop and let the archetype hint *where the architecture lives*.

1. **Read the manifest** — `package.json`, `go.mod`, `pyproject.toml`/`setup.cfg`, `pom.xml`/`build.gradle`, `Cargo.toml`, `*.csproj`, `Gemfile`, etc. → technology, dependencies, declared entrypoint.
2. **Find the entrypoint** — from the manifest (`main`/`bin`/`scripts`/`module`/packaging config) or convention (`main.*`, `index.*`, `cmd/`, `src/main/...`).
3. **Classify into an archetype** from manifest + entrypoint + directory signals. The archetype is a hint, not a fixed procedure — adapt.

| Archetype | Where the architecture lives |
|-----------|------------------------------|
| web service | routers / controllers / middleware / request handlers |
| CLI | command / subcommand definitions |
| frontend / UI | routes / pages, stores, top-level component tree |
| library | the public export surface |
| worker / job | queue consumers / scheduled handlers |
| desktop | windows / panels / actions |
| infra / config | model as a single node; do not drill |

4. **Extract** components, their responsibilities, and outbound dependencies from the archetype-relevant files.

Phase 0 runs steps 1–3 only (cheap). Phase 2 subagents run all four to full depth.

## Optional code depth (Phase 4 only)

If the `gitnexus` MCP is connected and the repo is indexed, use it to go below component level: `group_list` (packages), `route_map` (entrypoints), `query`/`cypher` (dependency edges), `impact` (blast radius). Never required for phases 0–3 — package- and container-level work must succeed without gitnexus.
````

- [ ] **Step 2: Verify**

Run: `wc -l "C:/Users/qwert/.claude/skills/building-architecture-models/references/analysis-loop.md"`
Expected: ~25 lines, the archetype table present.

- [ ] **Step 3: Commit** (same conditional pattern as Task 2 Step 3, adding this file)

---

## Task 4 (GREEN): Write `references/subagent-prompt.md`

**Files:**
- Create: `C:/Users/qwert/.claude/skills/building-architecture-models/references/subagent-prompt.md`

- [ ] **Step 1: Create the file with this exact content**

````markdown
# Phase 2 subagent prompt template

The orchestrator fills the `{{...}}` placeholders and dispatches one subagent per "drill" container (general-purpose agent, in parallel). The subagent has the `hyphae` MCP tools. Paste everything between the rules as the subagent prompt.

---
You are modeling ONE package of a larger repo into the Hyphae model. Stay strictly within your container.

Container: {{CONTAINER_NAME}}  (id: {{CONTAINER_ID}})
Package path: {{PACKAGE_PATH}}
Detected archetype: {{ARCHETYPE}}

Steps:
1. Call `get_text_context` and `list_nodes` first. Note which Components already exist under your container (match by name + parentId) — reuse them, never duplicate.
2. Analyze {{PACKAGE_PATH}} to full depth using the analysis loop for a {{ARCHETYPE}}: find its key modules/components, their responsibilities, and their dependencies.
3. Write your Components with `create_node`, each `parentId` = {{CONTAINER_ID}}, create-or-skip by name. Fill `description`, `responsibilities`, and `invariants`/`assumptions` where known.
4. Write intra-container connections with `create_connection` ONLY when BOTH endpoints are your own Components. Set `relationCategory` and `transport`.
5. On any `422`, read the returned `issues` and fix the input; never blind-retry.

You MUST NOT: create the Container itself, create nodes under any other container, create ExternalSystem nodes, or create cross-package connections. Report those instead.

Return ONLY this JSON report (no surrounding prose):

{
  "container": "{{CONTAINER_NAME}}",
  "componentsWritten": [ { "name": "...", "id": "..." } ],
  "crossPackageDeps": [
    { "from": "<your component name>", "to": "<node name in another package, or external system>",
      "relationCategory": "Dependency|DataFlow", "transport": "Sync|Async|InProcess", "why": "..." }
  ],
  "upwardFindings": {
    "ownContainer": [ "new responsibility / invariant / tech correction for this container" ],
    "system": [ "amendment to the System node" ],
    "siblingContainers": [ { "container": "<name>", "amendment": "..." } ],
    "newExternalSystems": [ { "name": "...", "description": "...", "interaction": "..." } ]
  }
}
---
````

- [ ] **Step 2: Verify**

Run: `grep -c "MUST NOT" "C:/Users/qwert/.claude/skills/building-architecture-models/references/subagent-prompt.md"`
Expected: `1` (the prohibition block is present). Confirm the report JSON contains `componentsWritten`, `crossPackageDeps`, and `upwardFindings`.

- [ ] **Step 3: Commit** (same conditional pattern, adding this file)

---

## Task 5 (GREEN): Write `references/plan-artifact-template.md`

**Files:**
- Create: `C:/Users/qwert/.claude/skills/building-architecture-models/references/plan-artifact-template.md`

- [ ] **Step 1: Create the file with this exact content**

````markdown
# Plan artifact template

Write this to `docs/hyphae/model-plan.md` in the TARGET repo during Phase 1. It is the GATE 1 approval surface and the cross-run resume checkpoint. Committing it to the target repo is the user's choice.

```markdown
# Hyphae model plan — {{REPO_NAME}}

Generated by the building-architecture-models skill. Working/resume file.

## Drift (docs vs reality)
- <doc claim> → <what the repo actually shows>   (write "none found" if clean)

## Container map
| Container (package) | Path | Technology | Archetype | Drill? |
|---------------------|------|------------|-----------|--------|
| ... | ... | ... | ... | yes / no |

## Progress
- [ ] Phase 1 — System + Containers written
- [ ] GATE 1 approved
- [ ] Phase 2 — components per drilled container:
  - [ ] <container name>
- [ ] GATE 2 approved
- [ ] Phase 3 — connections + amendments + external systems applied
```
````

- [ ] **Step 2: Verify**

Run: `grep -c "GATE" "C:/Users/qwert/.claude/skills/building-architecture-models/references/plan-artifact-template.md"`
Expected: `2` (both gates appear in the progress checklist).

- [ ] **Step 3: Commit** (same conditional pattern, adding this file)

---

## Task 6 (GREEN verify): Idempotency / no-op test — the skill must NOT duplicate nodes

This is the GREEN counterpart to Task 1's RED. With the skill present, an agent told to "ensure this repo is modeled" must read first and skip existing nodes.

**Files:**
- Modify: `docs/superpowers/tests/2026-06-14-building-architecture-models-baseline.md` (append a "GREEN" section)

- [ ] **Step 1: Snapshot the model**

Call `mcp__hyphae__list_nodes`; record the count (should equal Task 1's restored "Before" count).

- [ ] **Step 2: Run the scenario WITH the skill**

Dispatch a general-purpose subagent with this prompt:

```
Invoke the building-architecture-models skill, then use it to ensure C:/projects/hyphae is fully
modeled in Hyphae. The model may already exist. Report what you created vs. skipped, and stop at
GATE 1 by reporting the container map instead of proceeding.
```

- [ ] **Step 3: Verify no duplication**

Call `mcp__hyphae__list_nodes`. Expected PASS: node count is **unchanged** vs Step 1; the agent's report says it read the model first and skipped existing System/Containers (create-or-skip by name+parentId); it stopped at GATE 1. Record the result under "Idempotency (GREEN)" in the test file.

- [ ] **Step 4: If it failed (created duplicates or didn't read first)** — this is the REFACTOR signal

Delete any duplicates created (`mcp__hyphae__delete_node`) to restore the fixture. Then tighten `SKILL.md`: strengthen the "Read first" red flag and the idempotency contract against the exact rationalization the agent used (quote it in the test file). Re-run Steps 2–3 until it passes. Commit the SKILL.md change with `fix: close idempotency loophole in building-architecture-models`.

- [ ] **Step 5: Commit the GREEN notes**

```bash
git add docs/superpowers/tests/2026-06-14-building-architecture-models-baseline.md
git commit -m "test: idempotency (GREEN) for building-architecture-models skill"
```

---

## Task 7 (REFACTOR): End-to-end validation on a real multi-package repo

Exercises Phase 0 detection, GATE 1, parallel Phase 2 subagents, the Phase 3 reconciliation bundle, and GATE 2 — on a repo the skill has not seen. Requires a fresh/empty Hyphae model pointed at that repo.

**Files:**
- Modify: `docs/superpowers/tests/2026-06-14-building-architecture-models-baseline.md` (append an "E2E validation" section)

- [ ] **Step 1: Get the target and a clean model from the user**

Ask the user for (a) the path to a medium/large multi-package repo, and (b) a fresh Hyphae model for it — either set `HYPHAE_FILE` to a new path and restart the server, or run against an empty model. Confirm with `mcp__hyphae__get_text_context` that the model is empty.

- [ ] **Step 2: Run the full skill end-to-end**

In this session (so you can observe the gates), invoke the `building-architecture-models` skill against the target repo. Honor both gates yourself acting for the user (approve the map and the connection bundle), and dispatch the Phase 2 subagents in parallel.

- [ ] **Step 3: Verify the outcome against the spec's success criteria**

Confirm and record in the test file:
- Phase 0 detected the package set and listed any doc↔reality drift.
- `docs/hyphae/model-plan.md` was written in the target repo with the container map.
- GATE 1 and GATE 2 both paused for approval.
- Components exist under their Containers; cross-package connections only reference existing endpoints (no `422` left unresolved).
- Re-running the skill is a no-op (resume/idempotency holds at scale).

- [ ] **Step 4: Patch any gaps found, then re-verify**

For each gap (missed archetype, subagent wrote out of scope, hallucinated edge that slipped past, non-idempotent re-run), fix the relevant skill file and re-run the affected phase. Quote the failure in the test file before fixing. Commit each fix to the skill (conditional pattern from Task 2 Step 3).

- [ ] **Step 5: Commit the E2E notes**

```bash
git add docs/superpowers/tests/2026-06-14-building-architecture-models-baseline.md
git commit -m "test: end-to-end validation for building-architecture-models skill"
```

---

## Task 8: Final commit of plan and design pointer

**Files:**
- Modify: `docs/superpowers/plans/2026-06-14-building-architecture-models.md` (this file, if edited during execution)

- [ ] **Step 1: Ensure plan + spec + test notes are committed in the hyphae repo**

```bash
git add docs/superpowers/
git commit -m "docs: plan + test notes for building-architecture-models skill" || echo "nothing to commit"
git log --oneline -5
```

- [ ] **Step 2: Confirm the skill is discoverable**

In a fresh check, confirm `~/.claude/skills/building-architecture-models/SKILL.md` exists with valid frontmatter so Claude Code lists it as an available skill. Run:
```bash
ls "C:/Users/qwert/.claude/skills/building-architecture-models" "C:/Users/qwert/.claude/skills/building-architecture-models/references"
```
Expected: `SKILL.md` plus `references/` containing `analysis-loop.md`, `subagent-prompt.md`, `plan-artifact-template.md`.

---

## Self-review

**Spec coverage** (against `docs/superpowers/specs/2026-06-14-building-architecture-models-design.md`):
- §2 sensing engine (docs-as-hypothesis, gitnexus optional) → SKILL.md Overview + Phase 0, analysis-loop.md "Optional code depth". ✓
- §3 generic analysis loop + archetypes → analysis-loop.md (Task 3). ✓
- §4 phases incl. two gates → SKILL.md "The flow" (Task 2). ✓
- §5 subagent contract incl. `upwardFindings` → subagent-prompt.md (Task 4). ✓
- §6 idempotency/resume → SKILL.md "Idempotency contract" + Task 1/6 tests. ✓
- §7 error handling (`422` as signal) → idempotency contract + red flags. ✓
- §8 plan artifact at `docs/hyphae/model-plan.md` → plan-artifact-template.md (Task 5) + Phase 1. ✓
- §9 verify on this repo (idempotent no-op) + large repo → Task 6 + Task 7. ✓

**Placeholder scan:** No "TBD"/"implement later". Every skill file's content is given verbatim. The `{{...}}` tokens in `subagent-prompt.md` and the plan template are intentional fill-in slots for runtime, documented as such — not plan placeholders.

**Type/name consistency:** Tool names (`get_text_context`, `list_nodes`, `create_node`, `update_node`, `delete_node`, `create_connection`) match the live `hyphae` MCP surface. Report fields (`componentsWritten`, `crossPackageDeps`, `upwardFindings`) are identical in subagent-prompt.md and referenced consistently in Phase 3. "GATE 1"/"GATE 2" naming is consistent across SKILL.md, the plan template, and the tests. Skill name `building-architecture-models` is identical everywhere.

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

gitnexus MAY be used in any phase when its index is current — see `references/analysis-loop.md`. It is always optional.

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
   - cross-package connections — resolve each endpoint to an id by **(container, name)**, not by bare name (component names repeat across containers); dedupe,
   - proposed amendments to System / Containers (`update_node`),
   - new ExternalSystem nodes + edges to them.
2. **GATE 2: show the bundle. Conflicting amendments from different subagents are surfaced for the user to resolve — never last-write-wins. Wait for approval/trim.**
3. Apply the approved bundle in order: `update_node` amendments → `create_node` ExternalSystems (parent = System) → `create_connection` for all cross-package/external edges last.
4. Tick the plan artifact's progress markers. Call `get_text_context` and summarize the model.

### Phase 4 — Code layer (re-runnable; runs after Phase 3)

Build the code-level layer below Components: the *important* classes/interfaces/functions/modules/UI
components that realize each Component. Selective — NOT every file.

**Selectivity.** Include an element if ANY holds: it realizes a stated responsibility/invariant of the
parent Component; it is a public entrypoint / API surface; it carries core domain logic; it has high
fan-in (other elements depend on it — confirm with gitnexus `impact`/`context`); or it participates in
a documented flow. Exclude by default: generic utils/helpers/constants/config, migrations, generated
code, scaffolding, tests/fixtures, trivial DTOs, framework boilerplate. No cap — model what matters; an
unwieldy count is a signal the Component is too coarse (surface it, don't truncate).

1. Dispatch one **per-container** subagent per container that has Components (parallel). Each owns ONLY
   its container's subtree. Using `references/subagent-prompt.md` (Code-layer section), each subagent:
   reads existing nodes (create-or-skip), finds the important code elements in its Components, and writes
   `Code` nodes (`type` = Class/Interface/Function/Module/UIComponent, `parentId` = the Component id),
   each with a 1–3 sentence purpose-focused `description`, `responsibilities`/`invariants` where known,
   and `codeRefs` as `path#SymbolName`. It writes **intra-component** connections (both endpoints its own
   Code nodes) and reports **cross-component** code edges upward.
2. **GATE 3 (mirrors Phase 3).** The orchestrator aggregates reports, resolves each cross-component code
   edge endpoint by (container, component, name), dedupes, and surfaces conflicts (never last-write-wins).
   Wait for approval.
3. **Binding rule (orchestrator only).** Apply approved cross-component code edges, then bind each one:
   if a Component↔Component edge between the two owning Components exists, add the code edge id to that
   edge's `realizedBy` (via `update_connection`); if none exists, `create_connection` a Component↔Component
   edge (description = what these child edges collectively represent) and set its `realizedBy`. Intra-
   component code edges need no binding. Bound edges are automatically excluded from rollup.
4. Tick the plan artifact's Code-layer markers; call `get_text_context` and summarize.

### Phase 5 — Verify (optional, re-runnable)
A standalone consistency pass over an existing model. Run it right after Phase 3, or any time later — it is independent of Phase 4. Read-mostly: gaps are filled by the owning subagent, never by the orchestrator inventing edges.
1. **Coverage sweep.** With `list_nodes` + `find_connections`, flag: Components with **zero connections** (orphans); and "hub" Components whose `description`/`invariants` claim broad dependence ("all others depend on it", "implements", "used by") but have few or no inbound edges. A Component a subagent listed under `standaloneComponents` is expected — not a flag.
   - **Unbound code edges.** Flag any cross-component code edge whose id is NOT in any Component↔Component
     edge's `realizedBy`. Fix by binding it (orchestrator) or by having the owning subagent confirm it.
2. **VERIFY CHECKPOINT: show the user the flagged gaps**, separating likely-real gaps from legitimately standalone nodes. Wait for confirmation of which to fix.
3. For confirmed gaps, **re-dispatch the owning container's subagent** (same `references/subagent-prompt.md`) to add the missing intra-container edges. The orchestrator must not write intra-container edges itself.
4. Idempotent (create-or-skip), so Verify can be re-run until clean.

> Cost note: this is one `find_connections` per Component — fine at current scale; cheaper once a `list_connections`/summary read tool exists.

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

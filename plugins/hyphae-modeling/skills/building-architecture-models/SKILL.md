---
name: building-architecture-models
description: Use when building or deepening a Hyphae C4 architecture model of a large or unfamiliar repository through the hyphae MCP tools — when a single analyze prompt is too big for the repo, when re-running a model build must not create duplicate nodes, or when modeling a multi-package / multi-service codebase.
---

# Building Architecture Models

## Overview

Build a Hyphae model of an arbitrarily large repo **top-down, breadth-first, and resumably**. The running Hyphae server is the single source of truth; mutate it only through the `hyphae` MCP tools, never by editing the model file on disk.

Core rules:
- **Docs are a hypothesis, not truth.** Verify every structural claim against the filesystem/manifests; record drift.
- **The orchestrator (you) owns shared nodes** — System, Containers, ExternalSystems, and all cross-package connections. **Subagents own only their own container's subtree.**
- **The server is a single validating writer.** Parents before children; both endpoints before a connection. A `422` returns `issues` — read them and fix the input.
- **Every run is idempotent.** Read before you write; never assume an empty model.

## Prerequisites

The Hyphae server must be running and the `hyphae` MCP connected. Confirm by calling `model_overview` — it returns a small overview of the current model (possibly empty). If it errors, stop and ask the user to start the server (`pnpm --filter @hyphae/server dev`).

The hyphae MCP tools are invoked with the `mcp__hyphae__` prefix (e.g. `mcp__hyphae__model_overview`, `mcp__hyphae__create_nodes`). Subagents must use the prefixed names.

gitnexus MAY be used in any phase when its index is current — see `references/analysis-loop.md`. It is always optional.

## When to use

- Modeling a repo too large to capture in a single analyze-and-model prompt.
- Deepening or re-running an existing model without creating duplicates.
- Any repo with multiple packages / services / apps.

Not for: trivial single-package repos (a single analyze-and-model pass is fine), or hand-editing a model (use the web editor).

## The flow

Follow the phases in order. Do not skip the gates.

## Keep the orchestrator cheap

Cost ≈ turns × context size. To avoid carrying a huge context across many turns:
- **Reset/compact context between phases.** The skill is resumable — the server is the source of truth — so after each phase you can clear context and re-orient with `model_overview` + scoped `list_nodes`/`get_subgraph`. Nothing is lost.
- **Batch every multi-write step** (`create_nodes`/`create_connections`/`update_*`) instead of one call per node/edge.
- **Read subagent reports from their files** (see Phase 2/4), not from chat history — they survive a context reset.

### Phase 0 — Discover & verify
1. Read README / docs / ADRs → form a hypothesis of the structure.
2. Verify it against reality: workspace globs (pnpm/yarn/npm), monorepo tools (turbo/nx/lerna/go/cargo), or top-level source dirs. **Record drift** (doc says X, repo shows Y).
3. For each package run analysis-loop steps 1–3 only (manifest → entrypoint → archetype). REQUIRED REFERENCE: read `references/analysis-loop.md`.

### Phase 1 — Map + GATE 1
1. Call `model_overview` (idempotent read).
2. Create the System node and all Containers in one `create_nodes` call (a single write is a one-element array). Domain values (`responsibilities`, `invariants`, `technology` for Containers) go in each item's `fields` bag — call `describe_profile` to see each kind's fields.
3. Write the plan artifact to `.hyphae/model-plan.md` in the target repo. REQUIRED REFERENCE: `references/plan-artifact-template.md`.
4. **GATE 1: stop and show the user the container map + drift notes + per-container drill/skip list. Wait for approval/edits before continuing.**

### Phase 2 — Parallel components
Dispatch one subagent per container marked "drill", in parallel. Build each subagent's prompt from `references/subagent-prompt.md` (REQUIRED REFERENCE). Each subagent deeply analyzes its package, writes its own Components and intra-container connections, and **writes a structured report to its assigned `.hyphae/reports/` file (returning only a short status)**. Subagents never touch other packages or shared nodes.

### Phase 3 — Reconcile + connections + GATE 2
1. Aggregate all reports into one review bundle using the shared **Reconcile procedure** below:
   - cross-package connections — resolve each endpoint to an id by **(container, name)**, not by bare name (component names repeat across containers); dedupe,
   - proposed amendments to System / Containers (`update_nodes`),
   - new ExternalSystem nodes + edges to them.
2. **Coverage sweep (context still hot).** Call `model_gaps` once — it returns orphan Components, unbound cross-component code edges, and thin/name-echoing descriptions (with degree) in a single read. Carry the flags into GATE 2 as *candidates*, separating likely-real gaps from legitimately standalone components (a component a subagent listed under `standaloneComponents` is expected — not a gap).
3. **GATE 2: show the bundle + the coverage flags.** Conflicting amendments from different subagents are surfaced for the user to resolve — never last-write-wins. Confirmed gaps are filled by the **owning container's subagent**, never by the orchestrator inventing edges. Wait for approval/trim.
4. Apply the approved bundle: one `update_nodes` for amendments → one `create_nodes` for ExternalSystems → one `create_connections` for all cross-package/external edges. Re-dispatch owning subagents for any confirmed intra-container gaps.
5. Tick the plan artifact's progress markers. Call `model_overview` and summarize the model.

#### Reconcile procedure (shared by GATE 2 and GATE 3)

Mechanical part (do this before showing the gate, so the human sees only real decisions):
1. **Resolve** each reported endpoint to a node id by **(container[, component], name)** — never bare name.
2. **Dedupe** identical resolved edges (same from/to/type) into one.
3. **Surface only**: amendments that *conflict* between subagents, and new ExternalSystem nodes/edges. Identical or non-overlapping amendments need no human decision — apply them.

Never resolve a conflict by last-write-wins; a genuine disagreement is always a human decision at the gate.

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
   and `codeRefs` as `path#SymbolName`. It writes **intra-component** connections (both endpoints are
   Code nodes under the *same* Component) and reports **cross-component** code edges (endpoints in
   different Components — whether in this container or another) upward.
2. **GATE 3 (mirrors Phase 3).** The orchestrator aggregates reports with the shared **Reconcile procedure**
   (resolve each cross-component code edge endpoint by (container, component, name), dedupe, surface only
   conflicts — never last-write-wins). Wait for approval.
3. **Binding rule (orchestrator only).** Apply approved cross-component code edges, then bind: a single
   `update_connections` call sets `realizedBy` on each existing Component↔Component edge between the two
   owning Components; create any missing Component↔Component parent edges with `create_connections`
   (description = what these child edges collectively represent) and set their `realizedBy`. Intra-
   component code edges need no binding. Bound edges are automatically excluded from rollup.
4. Tick the plan artifact's Code-layer markers; call `model_overview` and summarize.

### Phase 5 — Verify (optional, re-runnable)
A standalone consistency pass over an existing model. The Phase-3 tail already runs this sweep inline (its checkpoint folded into GATE 2), so Phase 5 is only needed as a **re-run** — after Phase 4, or any time later. Read-mostly: gaps are filled by the owning subagent, never by the orchestrator inventing edges.
0. **Structural check.** Call `validate_model` — it returns any structural/field issues (bad containment, dangling/bad endpoints, unknown or missing-required fields, bad enum values, bad refs) in one read. Fix those first. Empty means structurally clean.
1. **Coverage sweep.** Call `model_gaps` — one read returns orphan Components (zero connections), unbound cross-component code edges (id in no `realizedBy`), and thin/name-echoing descriptions (with inbound/outbound degree, so a thin hub — high inbound but an empty/echoing description — stands out). Separate likely-real gaps from legitimately standalone components (`standaloneComponents` are expected).
2. **CHECKPOINT: show the flagged gaps.** Wait for confirmation of which to fix.
3. For confirmed gaps, **re-dispatch the owning container's subagent** (same `references/subagent-prompt.md`) to add the missing intra-container edges or descriptions. The orchestrator must not write intra-container edges itself.
4. Idempotent (create-or-skip), so Verify can be re-run until clean.

> `model_gaps` computes the coverage flags server-side in one call, so the sweep stays cheap even on large models — no need to pull the whole edge set and re-derive orphans/unbound edges in context. To inspect a single flagged node's edges, use `list_connections({nodeId})`.

## Idempotency contract (every run, every agent)

- **Read first** (`model_overview`, then `list_nodes`/`get_subgraph` for the scope you're about to touch). Never assume empty. Reads default to Component-and-above; pass `maxLayer:'Code'` when the scope you are about to touch is the Code layer.
- **Create-or-skip by (`name` + `parentId`).** If a node with that identity exists, reuse its id — do not create a second one.
- **On `422`, read the returned `issues` and fix the input** (almost always a missing parent/endpoint or a containment violation). Never blind-retry.

## Red flags — STOP

- About to `create_nodes` without having read the current model this run → read first.
- A subagent creating a Container, an ExternalSystem, or a cross-package edge → not allowed; report it upward, that is the orchestrator's job.
- "The docs say the layout is X" treated as fact without checking the filesystem → verify.
- Writing a connection before both endpoints exist → reorder.
- The orchestrator writing an intra-container edge to "fix" a model_gaps flag → re-dispatch the owning subagent instead.
- Skipping a gate to "save time" → all three gates (GATE 1, GATE 2, GATE 3) are mandatory.

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

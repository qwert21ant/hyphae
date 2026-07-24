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
- **Code is refs, not nodes.** A Component's internals are its `codeRefs` (directory/glob Refs into the source) plus an optional **Pattern** — never child "Class"/"Interface"/etc. nodes. Component is the deepest node layer.

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
- **Read subagent reports from their files** (see Phase 2), not from chat history — they survive a context reset.
- **Dispatch Phase 2 subagents on `sonnet`.** Per-package analysis is mechanical; reserve the
  strongest model for the orchestrator's reconcile/gate reasoning. Pass the model explicitly when you
  dispatch (the Agent tool takes a `model` override).
- **One subagent per container produces all four Phase 2 outputs** (Components, codeRefs, Patterns,
  connections) from a single analysis — do not split them across agents, which would re-read the
  package to rediscover what the first agent already knew.

### Phase 0 — Discover & verify
1. Read README / docs / ADRs → form a hypothesis of the structure.
2. Verify it against reality: workspace globs (pnpm/yarn/npm), monorepo tools (turbo/nx/lerna/go/cargo), or top-level source dirs. **Record drift** (doc says X, repo shows Y).
3. For each package run analysis-loop steps 1–3 only (manifest → entrypoint → archetype). REQUIRED REFERENCE: read `references/analysis-loop.md`.

### Phase 1 — Map + GATE 1
1. Call `model_overview` (idempotent read).
2. Create the System node and all Containers in one `create_nodes` call (a single write is a one-element array). Every System and Container write MUST include `fields.summary` — a one-line purpose shown on the diagram; see **The visual vocabulary** below. Domain values (`responsibilities`, `invariants`, `technology` for Containers) go in each item's `fields` bag — call `describe_profile` to see each kind's fields.
   **Give every Container a `root`** — its package path from Phase 0, relative to the repo root, with a trailing slash (`apps/server/`, `endpoints/media_gateway/backend/`). This anchors every `codeRef` written beneath it; see **Refs and roots** below. A Container without a root makes every ref in its subtree an `unanchored-ref` issue.
3. Write the plan artifact to `.hyphae/model-plan.md` in the target repo. REQUIRED REFERENCE: `references/plan-artifact-template.md`.
4. **GATE 1: stop and show the user the container map + drift notes + per-container drill/skip list. Wait for approval/edits before continuing.**

### Phase 2 — Parallel components
Dispatch one subagent per container marked "drill", in parallel, **on `sonnet`**. Build each
subagent's prompt from `references/subagent-prompt.md` (REQUIRED REFERENCE). Each subagent deeply
analyzes its package and produces **four outputs of that one analysis**, then writes a structured
report to its assigned `.hyphae/reports/` file (returning only a short status):

1. **Components** — with required `fields.summary`, `role` where it applies, domain `fields`.
2. **codeRefs** — a field on each Component (same `create_nodes` call), chosen with the selectivity
   heuristics in `references/analysis-loop.md` ("Choosing what to ref / make a member"); prefer a
   directory/glob ref over many file refs. See **Refs and roots** below.
3. **Patterns** — *opportunistic*: author one (`create_patterns`) only when a Component's internals
   already showed a recognizable shape (pipeline, state machine); never a separate hunt. See
   **Patterns** below for the shape rules.
4. **Intra-container connections** — both endpoints the subagent's own Components.

Subagents never touch other packages or shared nodes.

### Phase 3 — Reconcile + connections + GATE 2
1. Aggregate all reports into one review bundle using the shared **Reconcile procedure** below:
   - cross-package connections — resolve each endpoint to an id by **(container, name)**, not by bare name (component names repeat across containers); dedupe,
   - proposed amendments to System / Containers (`update_nodes`),
   - new ExternalSystem nodes + edges to them.
2. **Coverage sweep (context still hot).** Call `model_gaps` once — it returns orphan Components and thin/name-echoing descriptions (with degree) in a single read. Carry the flags into GATE 2 as *candidates*, separating likely-real gaps from legitimately standalone components (a component a subagent listed under `standaloneComponents` is expected — not a gap).
3. **GATE 2 (conditional hard-stop).** Always show the reconcile summary. **STOP and wait for the
   user only when there is a genuine decision: a conflicting amendment between subagents, or a new
   ExternalSystem (a trust boundary).** A conflict is never resolved last-write-wins — that is always
   a human decision. With no conflict and no new external system, apply the deduped bundle and
   summarize without blocking (its writes are reversible `update_*`/`delete_*`, and gap candidates
   flow into Phase 5 either way).
4. Apply the approved bundle: one `update_nodes` for amendments → one `create_nodes` for ExternalSystems → one `create_connections` for all cross-package/external edges. Re-dispatch owning subagents for any confirmed intra-container gaps.
5. Tick the plan artifact's progress markers. Call `model_overview` and summarize the model.

#### Reconcile procedure (used by GATE 2)

Mechanical part (do this before showing the gate, so the human sees only real decisions):
1. **Resolve** each reported endpoint to a node id by **(container[, component], name)** — never bare name.
2. **Dedupe** identical resolved edges (same from/to/type) into one.
3. **Surface only**: amendments that *conflict* between subagents, and new ExternalSystem nodes/edges. Identical or non-overlapping amendments need no human decision — apply them.

Never resolve a conflict by last-write-wins; a genuine disagreement is always a human decision at the gate.

### Phase 4 — Flows (the Behavior axis — orchestrator, optional)
Flows span nodes/connections across containers, so the orchestrator authors them here, **after GATE 2
when all endpoints exist** — never a subagent (a subagent sees only its own container). Flows are
optional and additive: a model with zero flows is complete.
1. Author flows with `create_flows` for request paths worth showing end to end ("User views live
   feed"). See **Flows** below for the exact step shape (`describe_profile` does not carry it).
2. **Self-check:** call `list_flows`; every flow should read `valid:true`. Fix or delete any
   `valid:false` (a step endpoint or `via` that did not resolve) with `update_flows`/`delete_flows`.
3. No human gate — flows are reversible overlays with no decision to adjudicate.

### Phase 5 — Verify (optional, re-runnable)
A standalone consistency pass over an existing model. The Phase-3 tail already runs this sweep inline (its checkpoint folded into GATE 2), so Phase 5 is only needed as a **re-run** — any time after the initial build. Read-mostly: gaps are filled by the owning subagent, never by the orchestrator inventing edges.
0. **Structural check.** Call `validate_model` — it returns any structural/field issues (bad containment, dangling/bad endpoints, unknown or missing-required fields, bad enum values, bad refs, unknown roles, unknown verbs) in one read. Fix those first. Empty means structurally clean.
   Two of these are about ref anchoring (see **Refs and roots**): `unanchored-ref` means a node carries relative `codeRefs` but no ancestor declares a `root` — fix by setting `root` on the owning **Container**, not by rewriting every ref to be repo-relative. `bad-root` means a declared `root` is not a directory Ref (needs a trailing `/`, no `*` or `#`). One missing Container root typically accounts for every `unanchored-ref` in its subtree, so fix roots first and re-run before touching anything else.
1. **Coverage sweep.** Call `model_gaps` — one read returns orphan Components (zero connections) and thin/name-echoing descriptions (with inbound/outbound degree, so a thin hub — high inbound but an empty/echoing description — stands out). Separate likely-real gaps from legitimately standalone components (`standaloneComponents` are expected).
   Also call `list_flows` and flag any flow with `valid:false` — a later node/connection deletion
   can leave a flow dangling; fix or delete it with `update_flows`/`delete_flows`.
2. **CHECKPOINT: show the flagged gaps.** Wait for confirmation of which to fix.
3. For confirmed gaps, **re-dispatch the owning container's subagent** (same `references/subagent-prompt.md`) to add the missing intra-container edges or descriptions. The orchestrator must not write intra-container edges itself.
4. Idempotent (create-or-skip), so Verify can be re-run until clean.

> `model_gaps` computes the coverage flags server-side in one call, so the sweep stays cheap even on large models — no need to pull the whole edge set and re-derive orphans/unbound edges in context. To inspect a single flagged node's edges, use `list_connections({nodeId})`.

## Refs and roots

A **Ref** is how the model points at anything outside itself (`codeRefs`, `docRefs`). It is a plain
string; its kind is inferred from syntax:

| Syntax | Kind | Example |
|--------|------|---------|
| trailing `/` | directory | `src/views/cctv/` |
| plain path | file | `src/main.ts` |
| `path#Symbol` | symbol | `src/main.ts#getRouter` |
| `path#Lstart-Lend` | line range | `src/main.ts#L10-L40` |
| contains `*` | glob | `src/views/**/*.vue` |

**Refs are relative, anchored by containment.** A ref resolves against the `root` of the nearest
ancestor that declares one, found by walking `parentId`; roots chain down the tree. So a Component
under a Container with `root: "apps/server/"` writes `src/mcp.ts`, not `apps/server/src/mcp.ts`.

Two rules follow, and both are enforced by `validate_model`:
- **Declare `root` on every Container** (Phase 1). Without an anchoring root somewhere above it, a
  relative ref is genuinely ambiguous — `src/main.ts` means nothing when three packages each have a
  `src/` — and is reported as an `unanchored-ref` issue.
- **A `root` must be a directory Ref**: trailing `/`, no `*`, no `#`. Anything else is a `bad-root`
  issue.

Prefer a directory or glob Ref over a long list of file Refs — one `src/views/cctv/**` says more than
thirty class refs and stays readable.

Use `resolve_refs` to check your work: pass `nodeId` to see a node's effective root and what its refs
resolve to, or `path` to reverse-look-up which nodes claim a file. More than one owner is legitimate
(a genuinely shared file), so treat it as information, not an error.

## The visual vocabulary

The diagram is meant to be readable without opening the side panel, which puts three
obligations on every write. Call `describe_profile` for the exact vocabularies.

- **`fields.summary` is required** on System / Actor / ExternalSystem / Container / Component.
  One line, under ~70 characters, saying what the thing is *for* — it is what the node shows on
  the canvas. `description` is still where the long explanation goes; it is side-panel only.
  Omitting `summary` is a `missing-required-field` issue.
- **Every connection carries a `verb`** from the profile's verb vocabulary, plus a short
  `object` noun where one applies — "reads camera list", "publishes frame". The verb defaults to
  `uses`, which renders but says nothing; a diagram full of `uses` is the failure mode this
  replaces. Pick the specific verb.
- **Set `role`** when a Component is really a datastore, a queue, an external system, or a UI
  surface. Otherwise leave it unset and it inherits its node kind's default shape.

## Flows (Behavior-axis shape detail)

Authored by the orchestrator in **Phase 4** (see above). This section is the exact step shape,
because `describe_profile` does **not** expose flow `kind`/`control` — they are core enums, so this
skill is the only place to learn them. A **Flow** is a named scenario overlaid on existing
nodes/connections — the diagram lights its steps in order.

- A flow is `{ name, description?, scope?, steps: [...] }`. `scope` is an optional layer hint
  (Context/Container/Component) used only to group flows — leave it off unless it helps.
- A **step** is `{ order, from, to, via?, message, kind, control? }`:
  - `from`/`to` are **node ids** that must already exist; `order` is 1-based.
  - `via` is an **optional connection id** — set it to the specific connection the step traverses
    (adds traceability and picks the right edge when two nodes have parallel connections). A
    `Return` or an implied hop may omit it.
  - `message` is the short caption shown on the step ("request stream").
  - `kind` is `Sync` (blocking call), `Async` (fire-and-forget), or `Return` (a response back to
    the caller — drawn dashed). Default `Sync`.
  - `control` (optional) wraps a step in a sequence fragment: `{ type: alt|opt|loop|par, condition }`.
- Read flows back with `list_flows` (summaries + a `valid` flag) and `get_flow` (full steps).
- **The overlay only lights a step when both its endpoints are visible in the current view.** Keep
  a flow's steps at one altitude (all Component-level, or all Container-level) so it lights up as a
  unit; a flow whose steps span containers will only partly render at any single focus.
- Deleting a node or connection a flow references does **not** delete the flow — it leaves the flow
  flagged invalid (`list_flows` returns `valid:false`, the picker marks it ⚠). Fix or delete such
  flows with `update_flows`/`delete_flows`.

## Patterns (architectural shapes)

A **Pattern** gives a Component's internals or a behavior a recognized *shape*, drawn specially —
instead of a wall of class boxes.

Authored by the **Phase 2** container subagent, *opportunistically* — only when a Component's
internals already showed a recognizable shape. Author with `create_patterns` once the Component
(the `anchor`) exists.

Each pattern has:

- `name`, and `kind` — one of the profile's `patternKinds` (see `describe_profile`):
  **pipeline** (ordered stages), **middleware** (interceptor chain), **state-machine**
  (states + transitions), **layered** (bands), **event-bus** (hub). Pipeline and middleware
  render as an ordered row of stages; state-machine lays out states and transitions; layered
  and event-bus fall back to an unordered member list.
- `members: [{ name, nodeId? | ref?, description? }]` — each member binds to **at most one** of a
  node (`nodeId`) or a code Ref (`ref`), or **neither** (a pure name, e.g. a state). For an
  ordered kind the **array order is the stage order** — no separate order field.
- `anchor` — the node the pattern describes (the Component a code pipeline lives in). **Required
  when a member uses a relative `ref`**, because a ref resolves against the anchor's `root`.
- `transitions: [{ from, to, trigger?, description? }]` — for **state-machine** only; `from`/`to`
  are member **names**.

Guidance:
- A code pipeline inside a Component: `anchor` = that Component, members = the stages with `ref`s
  into the source (`decode.ts`, `normalize.ts`), in order.
- A state machine: members = the states (pure names), plus `transitions` between them by name.
- A node may appear in more than one pattern.
- **Member names must be unique within a pattern** — `transitions` reference members by name and the
  renderer keys on the name; a duplicate name breaks both.
- **A member binds at most one of `nodeId`/`ref`** (or neither, for a pure-name state). Setting both
  is an issue.
- **`anchor` is required whenever a member uses a relative `ref`** — the ref resolves against the
  anchor's root; a ref member without an anchor is a `pattern-unanchored-ref` issue.

## Idempotency contract (every run, every agent)

- **Read first** (`model_overview`, then `list_nodes`/`get_subgraph` for the scope you're about to touch). Never assume empty. Reads default to Component-and-above (Component is the deepest layer).
- **Create-or-skip by (`name` + `parentId`).** If a node with that identity exists, reuse its id — do not create a second one.
- **On `422`, read the returned `issues` and fix the input** (almost always a missing parent/endpoint or a containment violation). Never blind-retry.
- **Patterns and Flows are create-or-skip too, by the agent reading first** (the server does not
  dedup): before `create_patterns`, `list_patterns` and skip a matching (`name` + `anchor`); before
  `create_flows`, `list_flows` and skip a matching `name`.

## Red flags — STOP

- About to `create_nodes` without having read the current model this run → read first.
- A subagent creating a Container, an ExternalSystem, or a cross-package edge → not allowed; report it upward, that is the orchestrator's job.
- "The docs say the layout is X" treated as fact without checking the filesystem → verify.
- Writing a connection before both endpoints exist → reorder.
- Creating a Container without a `root` → every `codeRef` beneath it becomes an `unanchored-ref` issue.
- Writing a `codeRef` that repeats its Container's root (`apps/server/src/x.ts` under `root: "apps/server/"`) → make it relative (`src/x.ts`); the root is declared once, never per ref.
- The orchestrator writing an intra-container edge to "fix" a model_gaps flag → re-dispatch the owning subagent instead.
- Skipping a gate to "save time" → all gates (GATE 1, GATE 2) are mandatory.
- Creating a Component / Container / System without `fields.summary` → `missing-required-field`; the node renders as a bare box.
- Leaving every connection on the default `uses` verb → the diagram carries no more meaning than before; pick real verbs.
- The orchestrator authoring a Pattern (it needs a Component's internals) → that is the Phase 2
  subagent's job; the orchestrator owns Flows, not Patterns.
- A subagent authoring a Flow, or a cross-container flow step → Flows are the orchestrator's, Phase 4.
- A Pattern `ref` member with no `anchor` → `pattern-unanchored-ref`; set the anchor to the Component.
- Two members in one Pattern sharing a `name` → breaks transitions and renderer keys; make them unique.
- Leaving a `list_flows` `valid:false` flow unfixed → fix or delete it (Phase 4 self-check / Phase 5).

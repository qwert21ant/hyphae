# Modeling skill — make codeRefs / Patterns / Flows first-class (design)

> Date: 2026-07-24. A **skill-authoring** task, not a code change. Improves the
> `building-architecture-models` skill so an agent following it produces good **codeRefs**,
> **Patterns**, and **Flows** — the three mechanisms that now carry "where/how is this implemented
> and how does it behave" after Phase E retired the Code node layer.
>
> Skill under review: `plugins/hyphae-modeling/skills/building-architecture-models/` (SKILL.md +
> `references/{subagent-prompt,analysis-loop,plan-artifact-template}.md`) and the plugin README.
> Authoritative shape (single source of truth, never re-derived here): `packages/schema/src/{ref,
> pattern,flow}.ts`, the profile `packages/schema/src/profiles/c4-backend.ts`, and the MCP tool
> descriptions in `apps/server/src/mcp.ts`. Design intent cited, not re-litigated:
> `2026-07-20-phase-b-flows-design.md`, `2026-07-22-phase-c-patterns-design.md`.

---

## 1. Goal

Restructure the skill so **codeRefs**, **Patterns**, and **Flows** each have a clear **owner**, a
**phase placement**, and (where warranted) a **check** — instead of the current state where all three
are placement-free prose sections *after* the phases, with only a thin one-clause mention of codeRefs
inside the subagent prompt (the Phase E final-review I1 gap, patched minimally).

The problem is not missing information — the shape prose is mostly correct against the schema. The
problem is **integration**: a by-the-book run does not reliably *produce* refs, Patterns, or Flows,
because no phase owns authoring them. This spec gives each mechanism a home.

## 2. Constraints (carried from the user — non-negotiable)

- **Single source of truth is the Zod schema.** Every codeRef/Pattern/Flow instruction must match
  `packages/schema/src/*.ts` and the `mcp.ts` tool descriptions. Never invent shape.
- **Vocabulary is profile-declared.** Pattern `kinds`, `verbs`, `roles` come from
  `describe_profile`; the skill teaches "call `describe_profile`," it does not hardcode a fixed
  vocabulary. (Flow `kind`/`control` are the exception — core enums *not* in `describe_profile`, so
  the skill must carry their complete shape; see D5.)
- **Skill edits are markdown only** — files under `plugins/hyphae-modeling/`. No `.ts`/`.tsx`, no
  `docs/MODEL.md`/`docs/SPEC.md` (product docs, out of scope). A genuine schema/MCP defect found
  while reviewing is surfaced to the user, not fixed under cover of a skill change.
- **Never `git add` a model `.json`.** Stage skill files explicitly; `git status --short` before
  every commit. Any model built to dogfood is a throwaway written to the untracked working file.

## 3. Decisions

### D1 — Ownership follows context: internals → subagent, cross-container behavior → orchestrator

The organizing principle for the whole restructure: **an artifact is authored by whoever already
holds the context it needs.**

- **codeRefs and Patterns** need a Component's *internals*, and a Pattern's `anchor` is a Component —
  so the **Phase 2 container subagent** (which owns the subtree and just analyzed the package) is the
  only actor with the context to author them. The orchestrator cannot: it never sees package
  internals.
- **Flows** span nodes/connections *across* containers and require the endpoints to already exist —
  so they are **orchestrator territory, after GATE 2**, exactly like cross-package connections.

### D2 — codeRefs + Patterns become explicit, ordered Phase 2 sub-steps (one subagent, one analysis)

Phase 2 is rewritten from one paragraph into **four explicit ordered outputs of a single package
analysis**, all authored by the same container subagent:

  a. **Components** (with required `fields.summary`, `role` where it applies, domain `fields`)
  b. **codeRefs** — a field on each Component, written in the *same* `create_nodes` call; selectivity
     per the heuristics in D4; prefer one directory/glob ref over many file refs
  c. **Patterns** — *opportunistic*, authored after Components exist (a Pattern needs its anchor to
     exist first); see D3
  d. **intra-container connections**

**Why one subagent, not a split.** All four are products of the *same* expensive package read. codeRefs
add no second pass (they ride the Component write). A Pattern reuses the shape the subagent already
saw. Handing Patterns to a separate subagent would force a cold re-read of the whole package to
rediscover what the first agent already knew — paying the expensive step twice to save the cheap one.

**Cost lever (the one that actually matters).** The skill instructs the orchestrator to **dispatch
Phase 2 subagents on `sonnet`** — per-package analysis is mechanical; the strongest model is reserved
for the orchestrator's reconcile/gate reasoning. This is added to *Keep the orchestrator cheap*.

### D3 — Patterns are opportunistic, not a hunt; author with the schema's guard rails

The subagent authors a Pattern **only when a recognizable shape already surfaced** during its analysis
(a multi-stage pipeline, a state machine) — never as a separate "go find patterns" pass. Patterns are
optional and additive (the schema defaults every pattern field to empty). The skill states the
guard rails crisply, matching `pattern.ts` + the `create_patterns` MCP description exactly:

- `kind` from `describe_profile.patternKinds` (do not hardcode the list as fixed).
- A member is `{ name, nodeId? | ref? | neither, description? }` — **at most one** binding. Neither =
  a pure name (a state).
- **Member array order is the stage order** for ordered kinds (`pipeline`, `middleware`); there is no
  `order` field.
- **`anchor` is required when any member uses a relative `ref`** (the ref resolves against the
  anchor's root). nodeId-only and pure-name patterns need no anchor.
- **Member names must be unique within a pattern** — load-bearing for `transitions` (which reference
  members by name) and for renderer keys. This is the mitigation for the two Phase C deferred minors
  (duplicate-member-name still selectable; a both-bound member double-reports), so it is stated
  prominently, not buried.
- `transitions: [{ from, to, trigger?, description? }]` — **state-machine only**, `from`/`to` are
  member *names*.

**Renderer expectation-setting (verified against `apps/web/src/patternView.ts`, not guessed).**
Coverage is three-way: **`pipeline` + `middleware`** (both `ordered`) → a row of stages with
sequential arrows; **`state-machine`** → a dagre chart of states + transitions; **`layered` +
`event-bus`** → a plain vertical member list with **no edges** (bespoke renderers deferred). The skill
tells the author that choosing `layered`/`event-bus` today yields a list, not the named shape — so the
value is in the members, and a `pipeline`/`state-machine` is the higher-payoff choice when either fits.

### D4 — Reintroduce the deleted selectivity heuristics, reframed for ref/member choice

The Code layer that Phase E deleted carried genuinely useful selectivity heuristics. They still apply —
now to *which codeRefs and which Pattern members matter*. They go into `references/analysis-loop.md`
(shared by Phase 0 and every Phase 2 subagent) as a new **"Choosing what to ref / make a member"**
section, cited from the Phase 2 refs sub-step and the subagent prompt:

- **Include** an element when it realizes a documented responsibility, is a public entrypoint, has
  high fan-in (an importance signal — gitnexus `impact` surfaces it), or participates in a documented
  flow.
- **Exclude** utilities, generated code, and tests.
- Prefer a directory/glob ref that captures a cohesive area over an enumerated list of files.

### D5 — Flows get a dedicated Phase 4 (orchestrator, optional, self-checked — no new gate)

A new **Phase 4 — Flows** is inserted after GATE 2 (Verify renumbers to Phase 5):

1. Author flows with `create_flows` for request paths worth showing end-to-end. Optional and
   additive — a model with zero flows is complete.
2. **Self-check:** call `list_flows`; every flow should read `valid:true` (all step endpoints + any
   `via` resolve). Fix or delete any `valid:false` with `update_flows`/`delete_flows`.
3. No new **human** gate — flows are additive overlays, reversible, and carry no
   decision the user must adjudicate. (Contrast GATE 1's pre-fan-out irreversibility.)

Because `describe_profile` does **not** expose flow `kind`/`control` (they are core enums, per Phase
B D-B2), the skill's Flow section is the *only* place an agent can learn the step shape — so it must
be complete and correct against `flow.ts`: `step = { order (1-based), from, to (node ids), via?
(connection id), message, kind (Sync|Async|Return, default Sync), control? ({type: alt|opt|loop|par,
condition}) }`; keep flow steps at one altitude so the overlay lights as a unit.

**Phase 5 — Verify** additionally surfaces `list_flows` `valid:false` alongside `model_gaps`, so a
re-run catches a flow left dangling by a later node/connection deletion.

### D6 — GATE 2 becomes a conditional hard-stop; GATE 1 stays unconditional

A gate earns its place only if it sits before expensive/irreversible work **and** surfaces a decision
the agent cannot make alone.

- **GATE 1 stays an unconditional hard-stop.** It is before the expensive parallel fan-out and owns
  two decisions the agent must not make alone: container decomposition, and drill/skip (direct cost
  control). Load-bearing.
- **GATE 2 becomes conditional.** The mechanical reconcile (dedup, endpoint resolution) already runs
  before the gate, so GATE 2's only genuine human decisions are a **subagent conflict** (never
  auto-resolved last-write-wins) or a **new external system** (a trust boundary). The rule: always
  show a reconcile summary, but **STOP-and-wait only when there is a conflict or a new external
  system**; otherwise apply the deduped bundle and summarize. Its writes are reversible/additive
  (`update_*`/`delete_*` exist), and gap candidates flow into the optional Phase 5 either way. This
  removes rubber-stamp stops (which train approve-without-looking and erode GATE 1) while keeping the
  one guarantee that matters.

No new gate is added anywhere. GATE 3 does not return.

## 4. File-by-file change plan (all markdown under `plugins/hyphae-modeling/`)

**`skills/building-architecture-models/SKILL.md`**
- *Keep the orchestrator cheap*: add the sonnet-dispatch line and "one subagent per container
  produces all four outputs."
- *Phase 2*: rewrite the single paragraph into the four ordered sub-steps a–d (D2), with refs
  selectivity citing `analysis-loop.md` and Patterns as the opportunistic step (D3).
- *Phase 3 / GATE 2*: rewrite GATE 2 as the conditional hard-stop (D6); the Reconcile procedure keeps
  its no-last-write-wins rule.
- Insert **Phase 4 — Flows** (D5); renumber the current *Phase 4 — Verify* to **Phase 5** and add the
  `list_flows valid:false` sweep to it.
- The trailing **Flows** and **Patterns** sections stay (they are the authoritative shape detail) but
  their intros are reframed from "optional, after connections" to name the owner/phase, and are
  cross-linked from the phases. Tighten the Patterns section on member-name uniqueness and
  anchor-required-for-ref (D3).
- *Red flags*: add — orchestrator authoring a Pattern (needs internals → subagent's job); a Pattern
  ref member with no anchor; duplicate member names within a pattern; a subagent authoring a Flow
  that spans containers (→ orchestrator's job); leaving a `valid:false` flow unfixed.
- *Idempotency contract*: note read-first create-or-skip identity for the new entities (an agent
  rule, like nodes — the server does not dedup) — Patterns by (`name` + `anchor`) via
  `list_patterns`, Flows by `name` via `list_flows` — so a re-run does not duplicate them.

**`references/subagent-prompt.md`**
- Strengthen step 3: split into explicit Components → codeRefs (selectivity, cite analysis-loop) →
  opportunistic Patterns (with the D3 guard rails) authoring, keeping the "not a hunt" framing.
- Add a `patternsWritten` array to the report JSON so the orchestrator's summary can note them.

**`references/analysis-loop.md`**
- Add the **"Choosing what to ref / make a member"** section (D4). The existing gitnexus `codeRefs`
  bullet already teaches root-relative stripping — cross-link it.

**`references/plan-artifact-template.md`**
- Progress markers: add a Phase 4 — Flows item; renumber Verify to Phase 5. (Refs/Patterns are part
  of the per-container Phase 2 line, not separate markers.)

**`README.md`** (plugin root)
- Update any phase list/overview prose to match the new Phase 2 sub-steps, Phase 4 Flows, and Phase 5
  Verify. (Verify only — check for stale phase numbering.)

## 5. Acceptance criteria

- Every codeRef/Pattern/Flow instruction in the skill matches `ref.ts`/`pattern.ts`/`flow.ts` and the
  `create_patterns`/`create_flows`/`resolve_refs` descriptions in `mcp.ts`; no invented shape.
- Phase 2 spells out four ordered outputs; a subagent following the prompt writes Components **with
  codeRefs** and an **opportunistic Pattern** where a shape surfaced.
- Phase 4 exists, is owned by the orchestrator, is optional, and self-checks with `list_flows`;
  Phase 5 Verify surfaces `valid:false` flows.
- GATE 2 reads as a conditional hard-stop; GATE 1 unchanged; no GATE 3.
- Selectivity heuristics live in `analysis-loop.md` and are cited from Phase 2.
- The skill says "dispatch Phase 2 subagents on sonnet."
- **Dogfood:** against a live server (`pnpm --filter @hyphae/server dev`, writing to the untracked
  working file, never committed), an agent following the improved skill produces a small model whose
  Components carry codeRefs, at least one anchored Pattern, and at least one valid Flow — verified via
  `resolve_refs`, `list_patterns`, and `list_flows`. Throwaway artifact.
- No `.ts`/`.tsx` changed; no model `.json` staged (`git status --short` before every commit).

## 6. Out of scope

Schema/MCP/renderer changes (surface defects to the user instead); bespoke `middleware`/`layered`/
`event-bus` renderers; adding flow `kind`/`control` to `describe_profile`; editing `docs/MODEL.md` or
`docs/SPEC.md`; committing any model `.json`; the configurable-profiles goal (keep vocabulary
profile-driven, but do not build profile configuration here).

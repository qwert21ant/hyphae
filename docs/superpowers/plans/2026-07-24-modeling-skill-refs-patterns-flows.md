# Modeling Skill — codeRefs / Patterns / Flows First-Class — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the `building-architecture-models` skill so codeRefs, Patterns, and Flows each have an owner, a phase placement, and (where warranted) a check — matching the schema exactly.

**Architecture:** All edits are markdown under `plugins/hyphae-modeling/`. Ownership follows context: Component internals (codeRefs, Patterns) are authored by the Phase 2 container subagent; cross-container Flows by the orchestrator after GATE 2. No code, schema, or renderer changes. This is a **docs task**, so the cycle per step is edit → verify (grep / read-back with expected output) → commit — not red-green TDD. The integration test is a live-server dogfood (final task).

**Tech Stack:** Markdown. Verification via `rg` (ripgrep) grep checks and the `mcp__hyphae__*` tools against a running Hyphae server.

## Global Constraints

- Single source of truth is the Zod schema — every codeRef/Pattern/Flow instruction must match `packages/schema/src/{ref,pattern,flow}.ts`, `packages/schema/src/profiles/c4-backend.ts`, and the tool descriptions in `apps/server/src/mcp.ts`. Never invent shape.
- Vocabulary is profile-declared — teach "call `describe_profile`"; never hardcode pattern `kinds`/`verbs`/`roles` as a fixed list. Exception: flow `kind`/`control` are core enums absent from `describe_profile`, so the skill carries their full shape.
- Markdown only, under `plugins/hyphae-modeling/`. No `.ts`/`.tsx`; no `docs/MODEL.md`/`docs/SPEC.md`; a real schema/MCP defect is surfaced to the user, not fixed here.
- **Never `git add` a model `.json`.** `apps/server/hyphae-cctv-new.json` is untracked and stale — leave it. Stage skill files explicitly; run `git status --short` before every commit.
- Branch is `docs/modeling-skill-refs-patterns-flows` (already created; spec committed at `c5293cf`). Do not push — ask the user first.
- Authoritative facts to preserve (do not contradict): a member binds **at most one** of `nodeId`/`ref` (neither = pure name); ordered kinds (`pipeline`, `middleware`) use **array order** as stage order, no `order` field; `anchor` is **required when any member uses a relative `ref`**; member names **unique within a pattern**; `transitions` are **state-machine only**, `from`/`to` are member names. Flow `step = { order (1-based), from, to (node ids), via? (connection id), message, kind (Sync|Async|Return, default Sync), control? ({type: alt|opt|loop|par, condition}) }`. Renderer coverage is three-way: `pipeline`+`middleware` → ordered row; `state-machine` → dagre chart; `layered`+`event-bus` → plain member list, no edges.

---

## File Structure

| File | Responsibility | Tasks |
|------|----------------|-------|
| `references/analysis-loop.md` | Generic analysis loop; **new**: selectivity heuristics for refs/members | 1 |
| `references/subagent-prompt.md` | Phase 2 container-subagent prompt; strengthen refs + opportunistic Patterns | 2 |
| `skills/building-architecture-models/SKILL.md` | The skill body: phases, gates, Flows/Patterns detail, red flags, idempotency | 3 |
| `references/plan-artifact-template.md` | GATE 1 / resume checkpoint template — phase numbering ripple | 4 |
| `README.md` (plugin root) | Plugin overview prose — phase list ripple | 4 |
| *(live server, throwaway model)* | Dogfood: prove an agent following the skill produces refs/Patterns/Flows | 5 |

Task order is dependency order: Task 1 (heuristics) is cited by Tasks 2 and 3; Task 3 (SKILL spine) fixes phase numbers that Task 4 mirrors; Task 5 validates the whole. Tasks 1–4 all touch different files, but Task 2 and Task 3 both cite the heuristics from Task 1, so run 1 first. **SKILL.md is one task (Task 3)** because phase numbering is a whole-document invariant — splitting it risks one edit renumbering phases while another still references the old numbers.

---

### Task 1: Selectivity heuristics in `analysis-loop.md`

**Files:**
- Modify: `plugins/hyphae-modeling/skills/building-architecture-models/references/analysis-loop.md`

**Interfaces:**
- Produces: a section headed **"Choosing what to ref / make a member"** that Task 2 (subagent-prompt step 3) and Task 3 (SKILL Phase 2 refs sub-step) cite by that name.

- [ ] **Step 1: Add the heuristics section**

Append a new section after the archetype extract step (step 4) and before the `## gitnexus` section. Required content — the reframed heuristics from the deleted Code layer, now about ref/member choice:

```markdown
## Choosing what to ref / make a member

The same judgment picks a Component's `codeRefs` and a Pattern's members: model what carries
architectural meaning, skip the noise.

- **Include** an element when it: realizes a documented responsibility, is a public entrypoint
  (an exported/registered surface others call), has high fan-in (an importance signal — gitnexus
  `impact` surfaces it), or participates in a documented flow.
- **Exclude** utilities, generated code, and tests — they inflate the model without adding shape.
- **Prefer one directory or glob ref** that captures a cohesive area (`src/views/cctv/`,
  `src/pipeline/**`) over an enumerated list of files — it says more and stays readable in a diff.

This is selectivity, not completeness: a Component with three meaningful refs beats one with thirty.
```

- [ ] **Step 2: Verify the section exists and cross-references gitnexus**

Run: `rg -n "Choosing what to ref / make a member|high fan-in|Exclude utilities" plugins/hyphae-modeling/skills/building-architecture-models/references/analysis-loop.md`
Expected: three matches (heading, fan-in bullet, exclude bullet).

- [ ] **Step 3: Verify the gitnexus codeRefs bullet still follows**

Run: `rg -n "codeRefs.*repo-relative|strip the container" plugins/hyphae-modeling/skills/building-architecture-models/references/analysis-loop.md`
Expected: the existing gitnexus root-stripping guidance is still present (untouched).

- [ ] **Step 4: Commit**

```bash
git add plugins/hyphae-modeling/skills/building-architecture-models/references/analysis-loop.md
git status --short   # confirm ONLY that file is staged; no .json
git commit -m "docs(skill): add ref/member selectivity heuristics to analysis-loop"
```

---

### Task 2: Strengthen the Phase 2 subagent prompt (`subagent-prompt.md`)

**Files:**
- Modify: `plugins/hyphae-modeling/skills/building-architecture-models/references/subagent-prompt.md`

**Interfaces:**
- Consumes: the "Choosing what to ref / make a member" section from Task 1 (cite it).
- Produces: a report JSON that now includes `patternsWritten`, which Task 3's Phase 2 / GATE 2 summary prose refers to.

The current step 3 is one dense paragraph mixing Components, codeRefs, and a thin Pattern clause. Split it so refs selectivity and opportunistic Patterns are explicit.

- [ ] **Step 1: Replace step 3 with three clear parts**

Replace the current step 3 (the paragraph beginning "Create all your Components in one …" through "… once the Component exists.") with:

```markdown
3. **Components.** Create all your Components in one `mcp__hyphae__create_nodes` call (domain values
   in each item's `fields`), each `parentId` = {{CONTAINER_ID}}, create-or-skip by name.
   `fields.summary` is REQUIRED — one line under ~70 characters saying what the component is for; it
   is what the diagram shows. Put the long form in `description`. Set `role` only when the component
   is really a datastore, queue, or UI surface. Put other domain values (`responsibilities`,
   `invariants`, `technology`) in the `fields` bag where known — `describe_profile` (step 0) lists
   the valid keys.
3a. **codeRefs.** In that SAME `create_nodes` call, give each Component its `codeRefs` — source
   locations relative to the container's `root`. Choose them with the selectivity heuristics in
   `analysis-loop.md` ("Choosing what to ref / make a member"): ref what realizes a responsibility /
   is a public entrypoint / has high fan-in / is in a flow; skip utils, generated, tests. Prefer one
   directory or glob ref (`src/views/cctv/`, `src/views/**/*.vue`) over a long list of file refs.
   Write refs relative to the root — `src/api/Client.ts`, never `{{CONTAINER_ROOT}}src/api/Client.ts`.
3b. **Patterns (opportunistic — only if a shape already surfaced).** If, while analyzing, you saw a
   Component whose internals have a recognizable shape — a multi-stage pipeline, a request/interceptor
   chain, a state machine — author it with `mcp__hyphae__create_patterns` AFTER that Component exists.
   Do NOT go hunting for patterns; a package with none is fine. Rules (match `describe_profile` +
   the tool description): `kind` from `describe_profile.patternKinds`; each member is
   `{ name, and either nodeId OR ref OR neither }`; for `pipeline`/`middleware` the member ARRAY ORDER
   is the stage order (no order field); set `anchor` to the Component when any member uses a relative
   `ref` (the ref resolves against the anchor's root); member names must be UNIQUE within the pattern;
   for `state-machine`, members are the states (pure names) and `transitions:[{from,to,trigger?}]`
   connect them by member name. Ordered kinds render as a row; state-machine as a chart; `layered`/
   `event-bus` render as a plain member list (no bespoke shape yet), so reach for `pipeline`/
   `state-machine` when one genuinely fits.
```

- [ ] **Step 2: Add `patternsWritten` to the report JSON**

In the report JSON block, after the `componentsWritten` line, add:

```json
  "patternsWritten": [ { "name": "...", "kind": "...", "anchor": "<component name>" } ],
```

- [ ] **Step 3: Verify the three parts and the report field**

Run: `rg -n "3a\. \*\*codeRefs|3b\. \*\*Patterns|opportunistic|patternsWritten|UNIQUE within the pattern" plugins/hyphae-modeling/skills/building-architecture-models/references/subagent-prompt.md`
Expected: five matches (3a, 3b, opportunistic, patternsWritten, uniqueness rule).

- [ ] **Step 4: Verify no invented shape**

Run: `rg -n "order field|ARRAY ORDER|nodeId OR ref OR neither" plugins/hyphae-modeling/skills/building-architecture-models/references/subagent-prompt.md`
Expected: matches confirming array-order-is-stage-order and the at-most-one-binding rule (consistent with `pattern.ts`).

- [ ] **Step 5: Commit**

```bash
git add plugins/hyphae-modeling/skills/building-architecture-models/references/subagent-prompt.md
git status --short
git commit -m "docs(skill): make Phase 2 subagent author codeRefs + opportunistic Patterns explicitly"
```

---

### Task 3: Restructure `SKILL.md` — phase spine, gates, Flows/Patterns, red flags, idempotency

**Files:**
- Modify: `plugins/hyphae-modeling/skills/building-architecture-models/SKILL.md`

**Interfaces:**
- Consumes: the heuristics section name from Task 1; `patternsWritten` from Task 2.
- Produces: the final phase numbering (Phase 0–5) and gate structure (GATE 1 unconditional, GATE 2 conditional, no GATE 3) that Task 4 mirrors.

This is one task because phase numbering is a whole-document invariant. Do the edits in order, then run the consistency greps in the final steps.

- [ ] **Step 1: Add sonnet dispatch + one-subagent guidance to "Keep the orchestrator cheap"**

In the `## Keep the orchestrator cheap` bullet list, add two bullets:

```markdown
- **Dispatch Phase 2 subagents on `sonnet`.** Per-package analysis is mechanical; reserve the
  strongest model for the orchestrator's reconcile/gate reasoning. Pass the model explicitly when you
  dispatch (the Agent tool takes a `model` override).
- **One subagent per container produces all four Phase 2 outputs** (Components, codeRefs, Patterns,
  connections) from a single analysis — do not split them across agents, which would re-read the
  package to rediscover what the first agent already knew.
```

- [ ] **Step 2: Rewrite Phase 2 as four ordered sub-steps**

Replace the `### Phase 2 — Parallel components` body paragraph with:

```markdown
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
```

- [ ] **Step 3: Rewrite GATE 2 as a conditional hard-stop**

Replace the Phase 3 step 3 (`3. **GATE 2: show the bundle + the coverage flags.** …`) with:

```markdown
3. **GATE 2 (conditional hard-stop).** Always show the reconcile summary. **STOP and wait for the
   user only when there is a genuine decision: a conflicting amendment between subagents, or a new
   ExternalSystem (a trust boundary).** A conflict is never resolved last-write-wins — that is always
   a human decision. With no conflict and no new external system, apply the deduped bundle and
   summarize without blocking (its writes are reversible `update_*`/`delete_*`, and gap candidates
   flow into Phase 5 either way).
```

- [ ] **Step 4: Insert Phase 4 — Flows and renumber Verify to Phase 5**

After the Phase 3 block (ending with the Reconcile procedure) and before the current `### Phase 4 — Verify`, insert:

```markdown
### Phase 4 — Flows (the Behavior axis — orchestrator, optional)
Flows span nodes/connections across containers, so the orchestrator authors them here, **after GATE 2
when all endpoints exist** — never a subagent (a subagent sees only its own container). Flows are
optional and additive: a model with zero flows is complete.
1. Author flows with `create_flows` for request paths worth showing end to end ("User views live
   feed"). See **Flows** below for the exact step shape (`describe_profile` does not carry it).
2. **Self-check:** call `list_flows`; every flow should read `valid:true`. Fix or delete any
   `valid:false` (a step endpoint or `via` that did not resolve) with `update_flows`/`delete_flows`.
3. No human gate — flows are reversible overlays with no decision to adjudicate.
```

Then change the heading `### Phase 4 — Verify (optional, re-runnable)` to `### Phase 5 — Verify (optional, re-runnable)`.

- [ ] **Step 5: Add the invalid-flow sweep to Phase 5 Verify**

In the Phase 5 Verify "Coverage sweep" step (step 1, the `model_gaps` call), append a sentence:

```markdown
   Also call `list_flows` and flag any flow with `valid:false` — a later node/connection deletion
   can leave a flow dangling; fix or delete it with `update_flows`/`delete_flows`.
```

Also fix the Verify preamble's self-reference: the current sentence "The Phase-3 tail already runs this sweep inline (its checkpoint folded into GATE 2), so **Phase 4** is only needed as a **re-run**" must become "… so **Phase 5** is only needed as a re-run" (the Verify phase is now 5). Leave "Phase-3 tail" and "GATE 2" as-is.

- [ ] **Step 6: Reframe the Flows section intro (owner/phase, not "after connections")**

Change the `## Flows (the Behavior axis — optional, after connections)` heading and its first paragraph so the owner/when lives in the phase and this section is the shape detail. New heading + intro:

```markdown
## Flows (Behavior-axis shape detail)

Authored by the orchestrator in **Phase 4** (see above). This section is the exact step shape,
because `describe_profile` does **not** expose flow `kind`/`control` — they are core enums, so this
skill is the only place to learn them. A **Flow** is a named scenario overlaid on existing
nodes/connections — the diagram lights its steps in order.
```

Keep the existing bullet list (`{ name, description?, scope?, steps }`, the step shape, `kind`, `control`, `list_flows`/`get_flow`, the visibility/altitude note, the invalid-flow note) — it is correct against `flow.ts`; verify it still reads `Sync|Async|Return` and `alt|opt|loop|par`.

- [ ] **Step 7: Reframe the Patterns section intro and tighten the guard rails**

Change the `## Patterns (architectural shapes)` intro to name the owner/phase, and make the two Phase-C deferred-minor mitigations prominent. New intro line after the first paragraph:

```markdown
Authored by the **Phase 2** container subagent, *opportunistically* — only when a Component's
internals already showed a recognizable shape. Author with `create_patterns` once the Component
(the `anchor`) exists.
```

In the Guidance bullets, ensure these appear verbatim as their own bullets (mitigations for the deferred minors):

```markdown
- **Member names must be unique within a pattern** — `transitions` reference members by name and the
  renderer keys on the name; a duplicate name breaks both.
- **A member binds at most one of `nodeId`/`ref`** (or neither, for a pure-name state). Setting both
  is an issue.
- **`anchor` is required whenever a member uses a relative `ref`** — the ref resolves against the
  anchor's root; a ref member without an anchor is an `unanchored-pattern-ref` issue.
```

Verify the kinds paragraph still teaches "see `describe_profile`" and the three-way renderer reality (ordered row / state-machine chart / plain list for layered+event-bus).

- [ ] **Step 8: Add Flow/Pattern red flags**

In `## Red flags — STOP`, add:

```markdown
- The orchestrator authoring a Pattern (it needs a Component's internals) → that is the Phase 2
  subagent's job; the orchestrator owns Flows, not Patterns.
- A subagent authoring a Flow, or a cross-container flow step → Flows are the orchestrator's, Phase 4.
- A Pattern `ref` member with no `anchor` → `unanchored-pattern-ref`; set the anchor to the Component.
- Two members in one Pattern sharing a `name` → breaks transitions and renderer keys; make them unique.
- Leaving a `list_flows` `valid:false` flow unfixed → fix or delete it (Phase 4 self-check / Phase 5).
```

- [ ] **Step 9: Add Pattern/Flow idempotency to the Idempotency contract**

In `## Idempotency contract`, add a bullet:

```markdown
- **Patterns and Flows are create-or-skip too, by the agent reading first** (the server does not
  dedup): before `create_patterns`, `list_patterns` and skip a matching (`name` + `anchor`); before
  `create_flows`, `list_flows` and skip a matching `name`.
```

- [ ] **Step 10: Verify no stale phase numbering or gate references**

Run: `rg -n "Phase 4 — Verify|Phase 4 Verify|Phase 4 is only needed|GATE 3|three gates|Phase 4 — Parallel" plugins/hyphae-modeling/skills/building-architecture-models/SKILL.md`
Expected: **zero matches** (Verify is now Phase 5, including its "only needed as a re-run" self-reference; Flows is Phase 4; no GATE 3).

- [ ] **Step 11: Verify the new structure is present and consistent**

Run: `rg -n "Phase 4 — Flows|Phase 5 — Verify|conditional hard-stop|Dispatch Phase 2 subagents on .sonnet|Behavior-axis shape detail" plugins/hyphae-modeling/skills/building-architecture-models/SKILL.md`
Expected: five matches — the new Phase 4, renumbered Phase 5, GATE 2 wording, sonnet line, Flows section heading.

- [ ] **Step 12: Verify no invented shape survived**

Run: `rg -n "Sync.*Async.*Return|alt.*opt.*loop.*par|array order|at most one|patternKinds" plugins/hyphae-modeling/skills/building-architecture-models/SKILL.md`
Expected: matches confirming flow enums, ordered-kind array order, at-most-one binding, and "see `describe_profile`" for kinds — all consistent with `flow.ts`/`pattern.ts`.

- [ ] **Step 13: Commit**

```bash
git add plugins/hyphae-modeling/skills/building-architecture-models/SKILL.md
git status --short
git commit -m "docs(skill): give codeRefs/Patterns/Flows owners, phases, and gates in SKILL.md"
```

---

### Task 4: Ripple phase numbering into template + README

**Files:**
- Modify: `plugins/hyphae-modeling/skills/building-architecture-models/references/plan-artifact-template.md`
- Modify: `plugins/hyphae-modeling/README.md`

**Interfaces:**
- Consumes: the final phase numbering from Task 3 (Phase 4 Flows, Phase 5 Verify).

- [ ] **Step 1: Update the plan-artifact template Progress list**

In `plan-artifact-template.md`, replace the Progress block's tail so it reads:

```markdown
- [ ] GATE 2 approved
- [ ] Phase 3 — connections + amendments + external systems applied
- [ ] Phase 4 — Flows authored + self-checked (optional)
- [ ] Phase 5 — Verify pass (orphans + hubs + invalid flows)
```

- [ ] **Step 2: Verify the template**

Run: `rg -n "Phase 4 — Flows|Phase 5 — Verify|Phase 4 — Verify" plugins/hyphae-modeling/skills/building-architecture-models/references/plan-artifact-template.md`
Expected: matches for Phase 4 — Flows and Phase 5 — Verify; **no** match for "Phase 4 — Verify".

- [ ] **Step 3: Update the plugin README phase overview**

Read `plugins/hyphae-modeling/README.md`; find any phase list / overview prose. Update it to the new spine: Phase 0 Discover, Phase 1 Map + GATE 1, Phase 2 Components (Components/codeRefs/Patterns/connections), Phase 3 Reconcile + GATE 2, Phase 4 Flows, Phase 5 Verify. If the README does not enumerate phases, add nothing — only fix stale numbering.

- [ ] **Step 4: Verify the README has no stale numbering**

Run: `rg -n "Phase 4 — Verify|GATE 3|Code layer|Phase 4 — Code" plugins/hyphae-modeling/README.md`
Expected: **zero matches**.

- [ ] **Step 5: Commit**

```bash
git add plugins/hyphae-modeling/skills/building-architecture-models/references/plan-artifact-template.md plugins/hyphae-modeling/README.md
git status --short
git commit -m "docs(skill): ripple Phase 4 Flows / Phase 5 Verify numbering into template + README"
```

---

### Task 5: Dogfood against a live server

**Files:**
- None committed. A throwaway model written to the untracked working file, verified via MCP tools, never staged.

**Interfaces:**
- Consumes: the full skill as edited in Tasks 1–4.

This is the integration test: prove an agent following the improved skill produces good codeRefs, at least one anchored Pattern, and at least one valid Flow. Requires a running server.

- [ ] **Step 1: Confirm the server is up**

Call `mcp__hyphae__model_overview`. Expected: a small overview (possibly empty), no error. If it errors, ask the user to run `pnpm --filter @hyphae/server dev` (suggest they type `! pnpm --filter @hyphae/server dev` in the prompt) and stop until it is up.

- [ ] **Step 2: Follow the skill to build a tiny slice**

Pick a small, well-understood package in this repo (e.g. `packages/schema`). Following the edited SKILL.md and subagent-prompt.md, create a System + one Container with a `root`, 2–3 Components each with `codeRefs`, one anchored `pipeline` or `state-machine` Pattern, and one Flow across two Components. Write to the untracked working file only. (You may do this inline rather than dispatching a subagent — the point is to exercise the instructions.)

- [ ] **Step 3: Verify codeRefs resolve**

Call `mcp__hyphae__resolve_refs({ nodeId })` for one Component. Expected: its `codeRefs` resolve through the Container's `root` to repo-relative paths (no `unanchored-ref`).

- [ ] **Step 4: Verify the Pattern**

Call `mcp__hyphae__list_patterns`. Expected: the pattern appears with `valid:true`, correct `kind` and `anchor`; unique member names.

- [ ] **Step 5: Verify the Flow**

Call `mcp__hyphae__list_flows`. Expected: the flow appears with `valid:true`. Then `mcp__hyphae__validate_model` — expected: no `unanchored-ref`, `unanchored-pattern-ref`, `bad-flow-endpoint`, or `duplicate-pattern-member-name` issues.

- [ ] **Step 6: Confirm nothing is staged**

Run: `git status --short`
Expected: the throwaway model `.json` shows as untracked (`??`) or unchanged — **never staged**. Do not commit anything in this task.

- [ ] **Step 7: Record the dogfood outcome**

Note in the branch's summary which checks passed and any wording the run exposed as unclear. If the dogfood reveals a skill wording gap, loop back to the owning task, fix, and re-verify. Otherwise the plan is complete.

---

## Self-Review

**Spec coverage** (each spec §3 decision → task):
- D1 ownership → Tasks 2 (subagent refs/Patterns), 3 (Phase 4 Flows orchestrator, red flags).
- D2 Phase 2 four sub-steps + sonnet → Task 3 steps 1–2, Task 2.
- D3 opportunistic Patterns + guard rails + renderer reality → Task 2 step 1 (3b), Task 3 step 7.
- D4 selectivity heuristics in analysis-loop → Task 1, cited in Tasks 2 & 3.
- D5 Phase 4 Flows + self-check + Phase 5 invalid-flow sweep → Task 3 steps 4–6.
- D6 GATE 2 conditional / GATE 1 unchanged / no GATE 3 → Task 3 step 3 + step 10 grep.
- §4 file plan → Tasks 1–4 (SKILL, subagent-prompt, analysis-loop, template, README).
- §5 dogfood → Task 5.
- Idempotency for new entities → Task 3 step 9.

**Placeholder scan:** every SKILL/prompt edit gives the exact replacement prose; no "add appropriate guidance." Task 4 step 3 says "add nothing if the README doesn't enumerate phases" — a definite instruction, not a placeholder.

**Type/name consistency:** section name "Choosing what to ref / make a member" is identical in Tasks 1, 2, 3. `patternsWritten` identical in Tasks 2 and referenced in 3. Phase names ("Phase 4 — Flows", "Phase 5 — Verify") identical across Tasks 3 and 4. Enum spellings (`Sync|Async|Return`, `alt|opt|loop|par`) match `flow.ts`. "conditional hard-stop" identical in spec D6 and Task 3.

# Axis 6 — Materialize higher-layer connections (author, don't derive)

## The idea (restated precisely)

Today Hyphae **derives** higher-layer connections at read time:
- Authored edges live at the fine layers: `Code↔Code`, and `Component↔Component` (the latter carry
  `realizedBy` → the Code edges they aggregate — 110 such edges in the cctv model).
- **There are zero authored `Container↔Container` or Context-level edges.** Those exist only as
  ephemeral aggregations: `rollupConnections(model, 'Container'|'Context')` (`packages/schema/src/rollup.ts`,
  exposed via `list_connections rollup=`), and independently as the dashed "derived" count edges the
  focus view computes per focus (`focusView.ts` pair-aggregation).

The proposal: have the LLM **author real, persisted connections at every layer** (Container↔Container,
System/Context ↔ ExternalSystem), each linked to the finer edges it summarizes via `realizedBy` — the
same pattern already used at the Component↔Code boundary, extended upward. Optionally then retire dynamic
rollup entirely.

## Verdict

**Good idea — in a targeted form. Do NOT "get rid of all rollups" wholesale.**

- ✅ **Materialize `Container↔Container` and Context-level edges** as first-class, described,
  `realizedBy`-linked connections. This is the valuable 80%.
- ❌ **Don't delete `rollupConnections`.** Keep it, repurposed as (a) the **proposer** that drafts the
  higher-layer edges for the LLM to describe/confirm, and (b) a **verification** oracle that checks
  authored parents still match their children. Deleting it removes the very thing that keeps the
  materialized edges honest.
- Don't re-materialize what already works: `Component↔Component` (+`realizedBy`→Code) is already the
  authored+linked pattern. This idea just pushes it up 1–2 layers, not a rewrite of the model.

## Why it's worth doing (pros)

1. **First-class relationships at the C4 altitudes that matter most.** The Context and Container diagrams
   are *the* diagrams stakeholders read, yet today they have no describable edges — only a mechanical count
   ("7 underlying connections"). A materialized `Container↔Container` edge can carry its own `description`,
   `type`, `transport`, `intent` ("Web app calls the API gateway over REST/Sync") — real meaning a rollup
   can't synthesize. This is the single biggest thing the flat model can't express (echoes A1's "the value
   is in the summaries").
2. **Editable in the web editor.** Derived edges aren't editable (they're computed). Authored higher-layer
   edges can be selected and described in `SidePanel`, closing a real UX gap.
3. **Reuses machinery that already exists.** The focus view's `realizedBy` reconciliation
   (`focusView.ts` `expanded`/`absorbed` sets) already does "parent authored ⇒ absorb its finer children."
   Extending `realizedBy` up a layer makes that logic light up at the Container/System focus for free —
   the authored `Container↔Container` edge shows, its `Component↔Component` children are absorbed. Little
   new view code.
4. **Simplifies the query surface.** If higher-layer edges are authored, `list_connections` filtered by
   layer answers "give me the Container view" — and the awkward `rollup` **mode flag that silently disables
   the other filters** (flagged in `04-mcp-tools.md` idea 2) is no longer the primary path. Rollup becomes
   the bootstrap, not the interface.
5. **Aligns with the project's own thesis.** `MODEL_RU.md` (and Structurizr, per `05-cross-pollination.md`)
   frame this as "one model, first-class relationships at each altitude." Materializing is that thesis.

## Why not go all the way (cons / risks — and mitigations)

1. **Denormalization / drift — the core risk.** The same relationship is now stored at multiple layers.
   Add/remove a `Component↔Component` edge and the parent `Container↔Container` edge's `realizedBy` (and
   possibly its existence) must be kept in sync. Derived rollups are *always* correct by construction;
   materialized ones can go stale.
   **Mitigation:** the server is the single validating writer — lean on it. Extend the Verify phase / a
   `model_gaps` tool (A2·2, A4·6) with an **"unbound boundary edge" check one layer up**: every
   `Component↔Component` edge that crosses a container boundary must appear in some `Container↔Container`
   edge's `realizedBy`; flag orphans and parents whose `realizedBy` no longer matches the actual crossings.
   This is the *same* check the skill already does at the Code→Component boundary (SKILL.md Phase 5 step 1),
   just applied at the next layer. Keep `rollupConnections` as the "what it *should* be" oracle to diff against.
2. **More authoring cost / tokens.** The LLM authors edges at 3–4 layers instead of 2. Contradicts the
   token-cost worry in `02-skill-efficiency.md`.
   **Mitigation:** make it *mostly mechanical* — `rollupConnections` proposes the exact set of parent edges
   and their `realizedBy` membership; the LLM only adds `description`/`type`/`transport` to each proposed
   edge (and can batch-accept the plumbing). One `create_connections` call for the layer.
3. **Double-counting in the focus view if `realizedBy` is wrong.** At a System focus, an authored
   `Container↔Container` edge AND the mapped `Component↔Component` children aggregate onto the same pair;
   only correct `realizedBy` (absorption) prevents a doubled/mislabeled edge. Correctness hinges on the
   `realizedBy` linkage being accurate — which reinforces mitigation #1. `buildFocusView` may need a small
   tweak so an authored parent always wins over a derived aggregation of the same pair.
4. **Aggregation ambiguity is now the LLM's job.** Five `Component↔Component` edges between two containers
   collapse to one `Container↔Container` edge — which `type`/`transport` wins? That synthesis is the *value*,
   but it's judgment that can be inconsistent. Acceptable, and gate-reviewed (below).

## Interaction with other review items
- **Complements** A4·2 (split `rollup` out of `list_connections`): once higher edges are authored, `rollup`
  becomes a proposer tool used by the skill, not the everyday query path.
- **Complements** A2·2 / A4·6 (`model_gaps`/coverage): the boundary-coverage check is the drift guard this
  idea needs — build them together.
- **Orthogonal** to A1·1 (Code opt-in) and the detail toggle — both still apply.
- **Slightly reduces** the need for the focus view's bespoke derived-edge path, but does not remove it
  (per-focus mapping is still needed for cross-layer external neighbours).

## Where it goes in the skill

The clean placement follows Hyphae's ownership rule: **cross-container and Context edges are shared nodes,
so they are the orchestrator's job, never a subagent's** (SKILL.md "orchestrator owns … all cross-package
connections"). Higher-layer materialization is therefore a **pure orchestrator step, no new subagents**, and
it can only run once all `Component↔Component` edges exist — i.e. **after Phase 3**. It is independent of
Phase 4 (Code), which is below the Component layer.

**Recommended: add "Phase 3b — Materialize higher-layer edges" as the tail of Phase 3, under GATE 2.**

1. After the approved Phase-3 bundle is applied (cross-package Component edges + externals exist), the
   orchestrator calls `rollupConnections(model, 'Container')` then `'Context'` to get the candidate parent
   edges and their `realizedBy` membership (already computed by the tool).
2. The orchestrator (LLM) writes a `description` + `type`/`transport`/`intent` for each candidate — this is
   the only real reasoning; the endpoints and `realizedBy` come from the rollup.
3. **Fold into GATE 2** (don't add a 4th gate): the same human review that approves cross-package edges also
   approves the synthesized higher-layer edges (they're derived from those very edges, so the reviewer is
   already in context). Conflicts (an existing authored parent whose children changed) are surfaced, never
   last-write-wins — consistent with the existing gate discipline.
4. Apply as **one `create_connections`** for Container-level, **one** for Context-level, each item with its
   `realizedBy`. Idempotent create-or-skip by (from,to,type) as everywhere else.
5. **Phase 5 Verify** gains the boundary-coverage check (mitigation #1) so re-runs keep parents and children
   in sync.

Rationale for "tail of Phase 3, not a new phase": it's shared-node work (orchestrator), it's cheap
(mechanical proposer + light description), it reuses GATE 2's context, and it must sequence after Component
edges but has no dependency on the Code layer — so bolting it onto Phase 3 avoids a whole extra
context-reset/gate cycle (consistent with `02-skill-efficiency.md` idea 3).

## Effort
- Schema/tool: **S–M** — `rollupConnections` already produces the candidates; add the boundary-coverage
  check to the gaps/verify tool; a small `buildFocusView` "authored parent wins" tweak.
- Skill: **S** — one new sub-step in Phase 3 + one Verify check; no new subagents, no new ownership rules.
- The bulk of the ongoing cost is the LLM writing good higher-layer descriptions — which is the point.

## Recommendation
Adopt the **targeted** version: materialize Container- and Context-level edges via `realizedBy`, keep
`rollupConnections` as proposer + verifier, and slot it into **Phase 3b under GATE 2** with a Phase-5
coverage check. Sequence it *after* the Wave-1 MCP cleanup and the `model_gaps`/coverage tool (Wave 2),
since it depends on that verification to stay drift-free. Fits the roadmap as a **Wave 2–3 item** bridging
Axis 1 (model completeness) and Axis 2 (skill).

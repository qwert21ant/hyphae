# Design — `model_gaps` coverage read + lighter Verify (Wave 2 #6)

**Date:** 2026-07-16
**Roadmap item:** Wave 2 #6 (`docs/superpowers/reviews/2026-07-03-improvement-ideas/ROADMAP.md`, line 37).
**Backing axes:** `02-skill-efficiency.md` (A2·2, A2·3), `04-mcp-tools.md` (A4·6), `05-cross-pollination.md` (A5·5).
**Touches:** `packages/schema` (new pure fn + tests), `apps/server/src/mcp.ts` (thin tool wrapper + test),
`plugins/hyphae-modeling/skills/building-architecture-models/SKILL.md`.

## Problem

The modeling skill's Phase 5 "Verify" is a manual, in-context sweep: the orchestrator pulls
`list_connections({ maxLayer:'Code' })` + `list_nodes` and reasons over the whole set to find orphan
Components, unbound cross-component code edges, and thin/name-echoing descriptions. On the 404-node /
567-edge cctv model that is a large read plus a lot of in-context reasoning on **every** Verify run.
The server already holds the whole graph, so these checks are cheap to compute server-side — exactly the
`validate_model` pattern, but for *coverage/quality* gaps rather than *structural* validity.

Separately, Verify is a whole extra phase with its own human checkpoint. The roadmap wants the sweep
folded into the tail of Phase 3 and the reconcile mechanized, so gates surface only real conflicts
(4 human stops → 3).

## Goals / Non-goals

**Goals**
- One server-side read that returns coverage/quality gaps in a single, size-independent call.
- Fold the Verify sweep into the tail of Phase 3; demote Phase 5 to an optional standalone re-run;
  reduce human gate stops from 4 → 3.
- Keep the safety scaffolding intact: gaps are **advisory candidates**; they are filled by the owning
  subagent, never invented by the orchestrator. Idempotency and ownership fences unchanged.

**Non-goals**
- Not structural validation — that is `validate_model` (kept, cross-referenced).
- No auto-fix. No brittle server-side NLP of descriptions.
- No `containerId` scoping in v1 (whole-model call is already compact; deferred).
- No changes to the write surface, the gate-1/gate-3 human decisions, or conflict-surfacing.

## Architecture — logic in schema, thin wrapper in mcp.ts

Mirrors `validateModel`: a pure function `modelGaps(model, profile)` in
`packages/schema/src/gaps.ts`, exported from `packages/schema/src/index.ts`, unit-tested in isolation.
`apps/server/src/mcp.ts` adds a `model_gaps` handler in `buildTools` and registers it next to
`validate_model` — read-only, whole-model, no required input.

### Return shape

```ts
export type OrphanNode = { id: string; name: string; type: string; parentId: string | null };

export type UnboundCodeEdge = {
  id: string; from: string; to: string;
  fromName: string; toName: string;
  fromComponent: string | null; toComponent: string | null;
  type: string;
};

export type ThinDescription = {
  id: string; name: string; type: string; parentId: string | null;
  reason: 'empty' | 'echoes-name';
  inbound: number; outbound: number;
};

export type ModelGaps = {
  orphanNodes: OrphanNode[];
  unboundCodeEdges: UnboundCodeEdge[];
  thinDescriptions: ThinDescription[];
};
```

### Heuristics (deterministic; layer names are parameters/defaults, not literals baked into logic)

The default orphan layer and the thin-description floor are both `Component`, expressed via
`layerOfType` / `nodeAtOrAboveLayer` so the logic stays profile-driven (honours the standing
configurable-profiles goal — no `n.type === 'Component'` string comparisons in the algorithm).

1. **orphanNodes** — nodes whose layer is the orphan layer (default `Component`) that have **zero**
   connections touching them (no connection with `from === id` or `to === id`). The server flags
   candidates only; the checkpoint separates true orphans from legitimately standalone components.

2. **unboundCodeEdges** — for each connection whose **both** endpoints are Code-layer nodes, lift each
   endpoint to its Component-layer ancestor (reusing the ancestor-walk from `rollup.ts`). Flag the edge
   when both endpoints lift to **distinct** Component ancestors (cross-component) **and** the edge id is
   in **no** connection's `realizedBy` (the same `claimed` set `rollupConnections` builds). Intra-
   component code edges (same Component ancestor) are excluded — they need no binding. An endpoint that
   has no Component ancestor is skipped (cannot be confidently called cross-component).

3. **thinDescriptions** — nodes at Component-and-above (`nodeAtOrAboveLayer(profile, type, 'Component')`)
   whose `description` is empty (`reason: 'empty'`) or whose normalised description equals the normalised
   name (`reason: 'echoes-name'`). Normalisation: lowercase, keep alphanumerics only, collapse
   whitespace. Each entry carries **inbound/outbound degree** (count of connections with `to === id` /
   `from === id`). This is the hub signal: a node with high inbound degree but a name-echoing/empty
   description is the "thin hub" — the LLM judges from the counts at the checkpoint; the server does no
   claim-phrase NLP.

## MCP tool

`model_gaps` — no input (`inputSchema: {}`), returns `ModelGaps`. Description states it is an advisory,
read-only **coverage/quality** read (orphans, unbound cross-component code edges, thin/name-echoing
descriptions with degree), and contrasts it with `validate_model` (structure/fields). `validate_model`'s
own description is updated: its current "does NOT find semantic gaps like orphan components or unbound
code edges" line points the reader at `model_gaps`.

## Skill changes (`SKILL.md`) — 4 human stops → 3

- **Phase 3 coverage-sweep tail.** After applying the approved bundle (edges just written, context still
  hot), call `model_gaps`; carry its flags into GATE 2. No separate reload cycle.
- **VERIFY CHECKPOINT folds into GATE 2.** The former Phase 5 human stop disappears as a distinct gate.
  Human stops become: GATE 1, GATE 2 (now includes the coverage flags), GATE 3.
- **Phase 5 demoted** to an *optional, standalone, re-runnable* consistency pass: call `validate_model`
  then `model_gaps`, show flags, and — for confirmed gaps — re-dispatch the **owning container's
  subagent** (orchestrator never writes intra-container edges or invents gaps). Idempotent; re-runnable
  until clean.
- **Shared "Reconcile" sub-procedure.** A short procedure — resolve each endpoint by
  `(container[, component], name)` → dedupe → surface **only** genuine conflicting amendments and new
  external systems — written once and referenced by both GATE 2 (Phase 3) and GATE 3 (Phase 4), so the
  gate shows conflicts rather than the entire bundle. Placement (inline section vs
  `references/reconcile-reports.md`) decided during planning; keep it concise.
- **Preserve unchanged:** the idempotency contract (read-first, create-or-skip by name+parentId, fix on
  422), ownership fences (orchestrator owns shared nodes; subagent owns its subtree), conflict-surfacing
  (never last-write-wins), and the "gaps filled by owning subagent, never orchestrator-invented" rule.
- Update the closing `list_connections` note and Red flags to reference `model_gaps` where relevant.

## Testing

- `packages/schema/test/gaps.test.ts` (`pnpm --filter @hyphae/schema test`):
  - orphan Component with zero edges flagged; a connected Component not flagged.
  - unbound cross-component code edge flagged; an edge bound via `realizedBy` excluded; an intra-component
    code edge excluded.
  - thin `empty` vs `echoes-name` classification; a good description not flagged.
  - inbound/outbound degree counts correct on a thin hub.
- Server test for the `model_gaps` wrapper mirroring the existing `validate_model` wrapper test
  (`pnpm --filter @hyphae/server test`).

## Risks

- **False positives** (legit standalone components, terse-but-fine Code descriptions): mitigated by
  flagging candidates only and keeping the human checkpoint; thin check floored at Component-and-above to
  avoid drowning in Code-layer noise on Code-heavy models.
- **Profile coupling:** default layer names are parameters resolved via profile helpers, not literals in
  the algorithm, so a future non-c4 profile can adjust them.
- **Skill regression:** the gate restructure must not drop conflict-surfacing or ownership fences — the
  plan verifies those clauses survive verbatim in intent.

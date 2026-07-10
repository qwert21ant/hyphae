# Detail / audience toggle — design (2026-07-10)

Wave 2 feature #4 from `docs/superpowers/reviews/2026-07-03-improvement-ideas/ROADMAP.md`.
The headline answer to the review's central question: *is the level of detail right for a
human vs an LLM?* One idea, two coordinated surfaces: **default reads to Component-and-above;
let power users opt into the Code layer.**

Grounding data (from axis 1, real `apps/server/hyphae-cctv-new.json`): 74% of nodes and 60%
of edges are Code-level. That is the noise this feature lets both audiences shed by default.

## Goals

- MCP reads default to the Component altitude, with an explicit opt-in back to Code.
- A web "Stakeholder ⇄ Full" toggle that shows the clean architectural picture (no Code, no
  derived/aggregated edges) vs everything.
- The "what layer counts as below X" rule lives in exactly one profile-aware place.

## Non-goals (YAGNI)

- No schema changes, no new node/connection kinds, no new fields.
- No persona modelling beyond the 2-state audience toggle (per axis 5: avoid literal personas).
- `maxLayer` is **not** added to `get_node`, `rollup_connections`, or `model_overview`.
- The audience toggle does **not** go in the URL hash (hash stays focus-only).

## Design

### 1. Shared schema helper (`packages/schema`)

Add one pure, unit-tested helper alongside `layerOfType` (`packages/schema/src/profile.ts`):

```ts
// true when `type`'s layer is at or above (index <=) `maxLayer` in the profile's layer order
nodeAtOrAboveLayer(profile: Profile, type: string, maxLayer: string): boolean
```

Both surfaces reuse it so the altitude rule is defined once and stays profile-aware (supports
the configurable-profiles goal — no hardcoded `'Code'`/`'Component'` string tests scattered
around).

### 2. MCP: `maxLayer` param (`apps/server/src/mcp.ts`)

Add `maxLayer?: enum(profile.layers)` with **default `'Component'`** to the three reads that
can surface Code:

- **`list_nodes`** — after existing filters, drop nodes whose layer is below `maxLayer`.
- **`list_connections`** — drop edges where *either* endpoint node is below `maxLayer`. This is
  the cut that removes the ~60% Code-to-Code / Code-touching plumbing by default.
- **`get_subgraph`** — during BFS, do not visit or return nodes below `maxLayer`; return only
  edges among surviving nodes.

Untouched: `get_node` (explicit single fetch — you asked for that exact node), `rollup_connections`
(already lifts to Container/Context), `model_overview` (never dumps Components/Code).

Explicit `maxLayer: 'Code'` restores today's full behavior. Tool descriptions updated to state
the default altitude and the opt-in.

**Ripple — SKILL.md / subagent prompts.** Because the default flips to Component, the modeling
workflow must pass `maxLayer: 'Code'` wherever it genuinely needs the Code layer (e.g. reading
back Code children it just created, Code-edge binding/verify steps). Grep
`plugins/hyphae-modeling/skills/building-architecture-models/` for `list_nodes` / `list_connections`
/ `get_subgraph` call-sites and patch the ones that operate at Code so the default change does not
silently starve the builder. Document the new default in the tool-usage notes.

### 3. Web: "Stakeholder ⇄ Full" toggle

- **`store.ts`** — add `audience: 'stakeholder' | 'full'` (default `'full'`) and `setAudience`.
  Persist to `localStorage` so it sticks across refresh; do not put it in the URL hash.
- **`focusView.ts`** — `buildFocusView(model, focusId, filter, audience)`:
  - *Stakeholder:* exclude Code-layer nodes from `children`; drop `derived` edges
    (`e.derived === true`); **recompute `externals` from the surviving edges** so no orphan
    ghost boxes remain. Today `externalIds` is collected inside the pair-aggregation loop; move
    that collection to after the (possibly filtered) edge list is final, so a ghost that only
    appeared via a now-hidden derived edge disappears too.
  - *Full:* unchanged from today.
- **`Canvas.tsx`** — `drill()` blocks drilling into a Component-layer node when `audience ===
  'stakeholder'` (Components are leaves in that mode). Thread `audience` into the
  `buildFocusView` `useMemo` dependency list.
- **`App.tsx`** — a small segmented "Stakeholder | Full" control in the toolbar.

Rationale for hiding derived edges (product decision): once Wave 3 (#9b, materialized rollups)
authors real higher-layer edges bound to finer ones via `realizedBy`, the dashed aggregated
edges become redundant. Stakeholder mode previews that clean, authored-only picture now.

Edge case: if the focus is already on a Component (via deep link) when stakeholder mode is on,
its Code children are hidden and the Component renders as a plain node showing only its
boundary-crossing edges. Acceptable.

### 4. Testing

- `packages/schema/test` — unit-test `nodeAtOrAboveLayer` across the layer order and unknown types.
- `apps/server/test/mcp.test.ts` — `maxLayer` filtering and the Component **default** on
  `list_nodes`, `list_connections`, `get_subgraph`; plus `maxLayer: 'Code'` restoring Code rows.
- `apps/web/test/focusView.test.ts` — stakeholder mode hides Code children, drops derived edges,
  and leaves no orphan externals; full mode is unchanged.
- `apps/web/test/store.test.ts` — audience toggle flips state and round-trips through localStorage.

## Files touched

- `packages/schema/src/profile.ts` (+ export), `packages/schema/test/profile.test.ts`
- `apps/server/src/mcp.ts`, `apps/server/test/mcp.test.ts`
- `apps/web/src/store.ts`, `apps/web/src/focusView.ts`, `apps/web/src/Canvas.tsx`,
  `apps/web/src/App.tsx`; `apps/web/test/focusView.test.ts`, `apps/web/test/store.test.ts`
- `plugins/hyphae-modeling/skills/building-architecture-models/SKILL.md` (+ subagent prompts)
```

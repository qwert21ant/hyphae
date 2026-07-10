# Expandable external nodes — design (2026-07-10)

Wave 2 feature #7 from `docs/superpowers/reviews/2026-07-03-improvement-ideas/ROADMAP.md`
(detailed source design in `03-ui-ux.md`). The user's explicit original ask.

Turn one opaque external ghost + one counted dashed edge into a small labelled sub-cluster
showing exactly *which* children of that external participate in connections to the current
focus — expanded in place, without leaving the focus and without pulling in the external's
irrelevant children. Web-only; no schema/MCP changes.

## Goals

- Expand a chosen external ghost so its boundary-crossing edges split out to the specific
  participating child nodes, rendered as a small dashed sub-cluster.
- A per-ghost caret affordance (＋ to expand, − to collapse); double-click still drills.
- Only externals that actually aggregate participating descendants get the affordance.

## Non-goals (YAGNI)

- No member cap / "+N more" (participating-children-only already bounds the count).
- No context menu, no single-click-toggle.
- No URL-hash persistence of expansion state (hash stays focus-only).
- No schema or MCP changes.

## Design

### 1. Store state (`apps/web/src/store.ts`)

- Add `expandedExternals: Set<string>` (default empty).
- `toggleExternal(id)`: add if absent, remove if present (return a new Set for Zustand change detection).
- **Reset `expandedExternals` to empty inside `setFocus`** — an expansion is only meaningful for
  the current focus. Not written to the URL hash.

### 2. `apps/web/src/focusView.ts` — the core change

- Signature gains a 5th param: `buildFocusView(model, focusId, filter?, audience: Audience = 'full', expandedExternals: Set<string> = new Set())`.
  Named `expandedExternals` (not `expanded`) deliberately — `buildFocusView` already has an
  internal `const expanded = new Set<string>()` for the `realizedBy` reconciliation, so a param
  named `expanded` would be an illegal redeclaration.
- **Endpoint remap.** In `mapEndpoint`, the external branch currently returns
  `representativeWith(nodes, id, focusLayer)`. Change to compute `rep = representativeWith(...)`
  and, when `expandedExternals.has(rep)`, return `childOfFocus(nodes, id, rep) ?? rep`. This drops one
  level finer for endpoints under an expanded external, reusing the existing `childOfFocus`
  helper (the direct child of `rep` that contains `id`, or `rep` itself when `id` is `rep` or a
  direct child). Endpoints not under an expanded external are unaffected.
- **Downstream logic is unchanged.** Pair aggregation, the `expanded`/`absorbed` `realizedBy`
  reconciliation, the `inside` keep-test, and the externals-from-`shownEdges` derivation all key
  off the mapped endpoints, so an expanded external simply contributes several finer external ids
  (each with its own, usually solid count-1, edge) instead of one aggregated box.
- **New return fields on `FocusView`:**
  - `externalGroups: { id: string; childIds: string[] }[]` — for each id in `expandedExternals` that
    actually produced ≥1 finer child in the shown externals, the group-box id (= the external's
    own id) and the member ghost ids that belong to it. An expanded id that yields no finer
    child (e.g. a leaf external) produces no group (and no phantom box).
  - `expandableExternalIds: Set<string>` — the subset of *currently shown, collapsed* externals
    that could expand: an external `extId` is expandable when some shown connection has an
    endpoint that is a strict descendant of `extId` (i.e. `childOfFocus(endpoint, extId)` is
    non-null). Computed from the actually-shown externals so leaf `ExternalSystem`s (0 children)
    and higher-layer externals never get a caret.

  Naming note: the new param `expandedExternals` and the local `expanded`/`absorbed` Sets already
  inside `buildFocusView` (for `realizedBy`) are different concepts and must keep different names —
  the implementer must not conflate them.

### 3. `apps/web/src/layout.ts`

- A collapsed external stays a single box in its incoming/outgoing column (today's behavior).
- An **expanded group** (an entry in `externalGroups`) becomes one taller column item: its member
  children are laid out as a vertical stack at the column x, and the item reserves
  `members.length` rows of height so sibling column items shift down. Members get absolute
  positions; the wrapping box itself is sized/positioned in `flow.ts` (mirroring how the focus
  region wraps its children), so no new layout logic is needed beyond reserving the space and
  placing the members.
- Incoming vs outgoing classification for a group: incoming (left) if any member is the source of
  a shown edge, else outgoing (right) — same rule as single externals, applied to the members.

### 4. `apps/web/src/flow.ts` + node types

- Add a `ghostGroup` node type: a dashed, muted region variant (visually a ghost boundary),
  sized/positioned to wrap its members — computed from member positions the same way the focus
  region is (`focusViewToFlow`). Member `ghost` nodes render at their positions inside it.
- Register `ghostGroup` in `Canvas.tsx` `nodeTypes`.
- `ghost` node `data` carries `expandable: boolean` (from `expandableExternalIds`). The
  `ghostGroup` node carries the collapse affordance (it is always an expanded external).
- Members keep their four anchor handles (existing `GhostNode` behavior) so `FloatingEdge`
  attaches per-child.

### 5. Interaction (`apps/web/src/GhostNode.tsx` + new `GhostGroupNode`)

- A small **＋ caret** button in the corner of *expandable* collapsed ghosts calls
  `toggleExternal(id)` with `stopPropagation` (so it does not trigger select/drill). The
  `ghostGroup` box shows a **− caret** to collapse. Double-click = drill/refocus is unchanged.
- The node components read `toggleExternal` from the store directly (`useStore`), taking their id
  from `NodeProps.id` — no callbacks threaded through node data (keeps node objects referentially
  stable except when expansion actually changes, which is the correct time to rebuild them).

### 6. `apps/web/src/Canvas.tsx`

- Read `expandedExternals` from the store; pass it into the `buildFocusView` `useMemo` and add it
  to that memo's dependency list.
- Register the `ghostGroup` node type.
- Treat `ghostGroup` like `region` for the highlight/dim backdrop rule (the
  `:not(.react-flow__node-region)` dim selector) so an expanded group box is not dimmed as a
  plain node. `drill()` is unchanged.

### 7. Audience interplay

Expansion is not special-cased for stakeholder mode: the stakeholder Code-hiding filters (from
the detail/audience feature) run *after* the endpoint remap, so an expansion in stakeholder mode
naturally stays Component-level (Code members and their edges are filtered out). Carets only
appear on externals actually shown, so a stakeholder-hidden external never offers one.

### 8. Testing

- `apps/web/test/focusView.test.ts` — expanding an external remaps its edges to the finer
  participating children and emits the corresponding `externalGroups` entry; `expandableExternalIds`
  flags an aggregating external (e.g. a peer Container) but NOT a leaf `ExternalSystem`; the
  default (nothing expanded) view is unchanged.
- `apps/web/test/store.test.ts` — `toggleExternal` adds then removes an id; `setFocus` clears
  `expandedExternals`.
- `apps/web/test/layout.test.ts` — an expanded group's members share one column x and are stacked
  (distinct, ordered y), reserving vertical space.
- `apps/web/test/flow.test.ts` — `focusViewToFlow` emits a `ghostGroup` node wrapping the members
  plus the member `ghost` nodes, and sets `expandable: true` on an expandable collapsed ghost.
- `apps/web/test/Canvas.test.tsx` — clicking the ＋ caret toggles expansion (store
  `expandedExternals` changes and the group renders); double-click on a ghost still drills.

## Files touched

- `apps/web/src/store.ts`, `apps/web/src/focusView.ts`, `apps/web/src/layout.ts`,
  `apps/web/src/flow.ts`, `apps/web/src/Canvas.tsx`, `apps/web/src/GhostNode.tsx`,
  new `apps/web/src/GhostGroupNode.tsx`
- Tests: `focusView.test.ts`, `store.test.ts`, `layout.test.ts`, `flow.test.ts`, `Canvas.test.tsx`

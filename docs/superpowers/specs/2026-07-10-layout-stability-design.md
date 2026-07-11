# Layout stability fixes — design (2026-07-10)

Fixes four canvas layout bugs, rooted in `apps/web/src/layout.ts` + `apps/web/src/Canvas.tsx`.

## Bugs & confirmed root causes

1. **Applying a connection filter moves node positions.** `layoutFocusView` lays children out
   with dagre using `view.edges` (which the filter shrinks) and places external columns from
   `view.edges`; `positions` is memoized on `view`, which changes with `connFilter`. Fewer edges →
   dagre re-ranks children → the whole graph reflows.
2. **Full/Stakeholder switch moves node positions.** Same mechanism: stakeholder hides derived
   inner edges (and Code children), changing `view.edges`/`view.children` → dagre re-lays out.
3. **Expanding an external reflows everything and the group can jump to the other side.** Full
   relayout on expansion; the expanded group's incoming/outgoing side is recomputed from its
   members' edge directions (which can differ from the collapsed ghost's aggregated direction), so
   it lands on a different side, and re-sort/re-centering move it further. Nothing anchors the group
   to the collapsed ghost's slot.
4. **Members overlap inside an expanded group.** The member vertical pitch is `NODE_H + MEMBER_GAP
   = 60`, tighter than the standalone-external pitch `ROW_GAP = 70`, and both underestimate the real
   rendered node height. Long (wrapping) member labels then overlap. (A computational probe showed
   the layout *coordinates* don't overlap at pitch 60 — the deficit is real DOM height vs the
   assumed `NODE_H`.)

## Approach

**One stable base layout; derive every rendered view from it.**

- **Stable base positions.** Compute positions from a structural view that ignores the filter and
  audience and is collapsed: `layoutFocusView(buildFocusView(model, focusId, undefined, 'full',
  emptySet))`. Memoized on `[model, focusId]` only. This yields stable slots for every child and
  every collapsed external. The full/unfiltered/collapsed view is a **superset** of any filtered,
  stakeholder, or expanded view's collapsed nodes, so nothing a narrower view shows is ever missing.
- **Filter / audience (#1, #2).** The rendered view reuses base positions verbatim — it only hides
  nodes/edges, never moves them.
- **Anchored in-place expansion (#3).** A new `resolveViewPositions(view, basePositions)` maps the
  current view onto the base slots: children and collapsed externals keep their base position; an
  **expanded group is anchored at its collapsed ghost's base slot** (same base `x` ⇒ same column ⇒
  same side), its members stacked downward from there. Only the *same column* reflows: items below a
  group in that column are pushed down by the group's extra height (cumulative for multiple groups).
  Children and the opposite column never move. Under filter/audience alone (no expansion) there is
  no push, so the base slots are reproduced exactly.
- **Member pitch (#4).** Stack members at `MEMBER_PITCH = ROW_GAP`, the same pitch standalone
  externals already use (which does not visibly overlap), replacing the tighter `NODE_H +
  MEMBER_GAP` pitch.

## Design

### `apps/web/src/layout.ts`

- Keep `layoutFocusView(view)` as the **base** layout: dagre children + external **single-box**
  columns (sorted by id, `ROW_GAP` pitch). Remove the expanded-group branch/`Item.group` handling
  from it — the base view never contains groups, and group placement now lives in
  `resolveViewPositions`. Drop `MEMBER_GAP`/`ITEM_GAP` group machinery no longer needed (keep the
  single-box column placement equivalent to today's ungrouped path).
- Add `export const MEMBER_PITCH = ROW_GAP;` and a `groupBoxHeight(memberCount)` helper:
  `LABEL_H + 2*PAD + (memberCount - 1) * MEMBER_PITCH + NODE_H`.
- Add `export function resolveViewPositions(view: FocusView, base: Record<string, XY>):
  Record<string, XY>`:
  - Children (and a childless focus node) → their `base` position (skip any missing).
  - Build external "items": each collapsed external (in `view.externals`, not a group member) and
    each `view.externalGroups` entry (carrying its `childIds`).
  - Group items into columns by `base[itemId].x` (collapsed externals in one column share an x;
    a group's column x is its collapsed ghost's base x). Skip items with no base slot.
  - Per column: sort by `base.y`; walk top→down with a cumulative `offset`. A collapsed external is
    placed at `{ x: base.x, y: base.y + offset }`. A group's members are placed at
    `{ x: base.x + PAD, y: base.y + offset + LABEL_H + PAD + i * MEMBER_PITCH }`, then
    `offset += groupBoxHeight(n) - NODE_H` (making room below it). This anchors the group's top-left
    at the collapsed ghost's base slot and pushes only lower same-column items down.

### `apps/web/src/Canvas.tsx`

Replace the single `positions` memo with:

```ts
const EMPTY_EXPANDED = useMemo(() => new Set<string>(), []);
const baseView = useMemo(() => buildFocusView(model, focusId, undefined, 'full', EMPTY_EXPANDED), [model, focusId]);
const basePositions = useMemo(() => layoutFocusView(baseView), [baseView]);
const view = useMemo(() => buildFocusView(model, focusId, connFilter, audience, expandedExternals), [model, focusId, connFilter, audience, expandedExternals]);
const positions = useMemo(() => resolveViewPositions(view, basePositions), [view, basePositions]);
```

`focusViewToFlow(view, positions)` is unchanged — it already computes the `ghostGroup` box from the
member positions it is handed, which now come from `resolveViewPositions`.

## Non-goals (YAGNI)

- No change to `buildFocusView`, `focusView.ts` semantics, or `flow.ts` rendering.
- No dynamic/measured node sizing (still uses the `NODE_H` approximation, now with `ROW_GAP` member
  pitch that empirically clears).
- No schema/MCP changes; web-only.

## Testing

- `apps/web/test/layout.test.ts`:
  - `resolveViewPositions`: children/collapsed-externals reuse base positions unchanged; a
    filtered view (subset) leaves remaining nodes at their base slots (stability); an expanded group
    anchors at the collapsed ghost's base x (same column/side) with members stacked at `MEMBER_PITCH`
    (no overlap); a group pushes only lower same-column items down, leaving the other column and
    children fixed.
  - `layoutFocusView`: existing children/external/sort/pitch assertions still hold (single-box
    externals). Relocate the old expanded-group layout tests to `resolveViewPositions`.
- `apps/web/test/Canvas.test.tsx`: base positions are memoized on `[model, focusId]` — toggling the
  filter/audience does not change a child's rendered position (assert a node's `transform`/position
  is unchanged across a filter toggle); expanding an external keeps other nodes' positions and
  renders the group on the same side.

## Files touched

- `apps/web/src/layout.ts`, `apps/web/src/Canvas.tsx`
- `apps/web/test/layout.test.ts`, `apps/web/test/Canvas.test.tsx`

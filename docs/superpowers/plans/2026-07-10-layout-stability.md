# Layout Stability Fixes — Implementation Plan

**Goal:** Node positions stay stable across connection-filter and audience toggles; expanding an external anchors its group at the collapsed ghost's slot (same side); expanded-group members don't overlap.

**Architecture:** Compute a stable base layout from the unfiltered/full-audience/collapsed view (memoized on `[model, focusId]`); a new `resolveViewPositions(view, base)` maps the actual view onto those base slots, overlaying expanded groups anchored in place with a `ROW_GAP` member pitch.

**Tech Stack:** TypeScript, React + Zustand + @xyflow/react, dagre, Vitest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-10-layout-stability-design.md`.
- Web-only; no `buildFocusView`/`focusView.ts`/`flow.ts`/schema/MCP changes.
- Member pitch = `ROW_GAP` (the existing standalone-external pitch).
- Base view is the superset: filtered/stakeholder/collapsed nodes are always a subset of the
  unfiltered/full/collapsed base, so base positions always exist for rendered collapsed nodes.
- Test: `pnpm --filter @hyphae/web test [file]`; build: `pnpm --filter @hyphae/web build`.

---

### Task 1: `resolveViewPositions` + simplify `layoutFocusView` (layout.ts)

**Files:** `apps/web/src/layout.ts`, `apps/web/test/layout.test.ts`

**Steps (TDD):**
1. Write failing `resolveViewPositions` tests: (a) children + a collapsed external reuse their base
   positions verbatim; (b) a filtered subset leaves remaining nodes at base slots; (c) an expanded
   group anchors at the collapsed ghost's base x, members stacked at `MEMBER_PITCH` (assert pitch ==
   `ROW_GAP`, no vertical overlap); (d) a group pushes only lower same-column items down, the other
   column + children unchanged.
2. Run → fail (function absent).
3. Implement `MEMBER_PITCH = ROW_GAP`, `groupBoxHeight(n)`, `resolveViewPositions`; simplify
   `layoutFocusView` to lay out children + single-box external columns (remove the group branch).
   Relocate the old expanded-group `layoutFocusView` tests into `resolveViewPositions` tests.
4. Run `pnpm --filter @hyphae/web test layout` → green.
5. Commit.

### Task 2: Wire stable base + resolve into Canvas (Canvas.tsx)

**Files:** `apps/web/src/Canvas.tsx`, `apps/web/test/Canvas.test.tsx`

**Steps (TDD):**
1. Write failing Canvas tests: toggling `connFilter` (and `audience`) does not move a child node's
   rendered position; expanding an external keeps other nodes' positions and renders the group's
   member on the same side (same-sign x offset) as the collapsed ghost.
2. Run → fail.
3. Implement the `baseView`/`basePositions`/`view`/`positions` memo chain from the spec (base
   memoized on `[model, focusId]`; `resolveViewPositions` for render positions). Import
   `resolveViewPositions`.
4. Run `pnpm --filter @hyphae/web test Canvas` → green.
5. Commit.

### Task 3: Full suite + build + manual verification

1. `pnpm --filter @hyphae/web test` and `pnpm -r test` → green.
2. `pnpm --filter @hyphae/web build` → clean.
3. Manual: filter/audience toggles don't move nodes; expand keeps layout stable + group on the same
   side + members not overlapping.

## Self-Review

- #1/#2 (filter/audience stability) → base memoized on `[model, focusId]`, view reuses base (Tasks 1–2).
- #3 (anchored expansion, no side-flip) → `resolveViewPositions` anchors group at base x, pushes only
  same column (Task 1).
- #4 (member overlap) → `MEMBER_PITCH = ROW_GAP` (Task 1).
- Base = superset guarantees base slots exist for rendered collapsed nodes (Global Constraints).

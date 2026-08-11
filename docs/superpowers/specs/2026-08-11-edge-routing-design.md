# Edge routing: discrete ports, gutter lanes, two path styles

**Date:** 2026-08-11
**Branch:** `feat/edge-routing`
**Status:** agreed, ready to plan

## The problem

An edge is drawn today as a plain bezier between the two points where the straight line joining
two node centres crosses their borders (`edges/floating.ts`, `intersection` → `getEdgeParams` →
`getBezierPath`). Nothing else is consulted. Three consequences, all visible on the Baritone model:

1. **Crossings are unreadable.** Anchors land anywhere on a perimeter, so edges leave at arbitrary
   angles and no two runs are parallel. Two lines meeting at a shallow angle are the hardest case
   for the eye to separate, and that is the common case. The problem concentrates in the long runs
   between the dagre cluster and the external columns — at Process Layer **61 of 68 edges touch an
   external**.
2. **Labels collide.** Every edge puts its verb label at its own path midpoint, with no awareness of
   any other label.
3. **The bezier reads as organic** where an architecture diagram wants an engineered grain.

Explicitly *not* the problem being solved: edges passing underneath node boxes. Confirmed with the
user as the least damaging of the four symptoms, and it is the only one whose fix (visibility graph
or grid A\*) is expensive. See Out of scope.

## The shape of the fix

Three independent mechanisms, in dependency order:

- **Ports** — an edge attaches to one of a fixed, evenly spaced set of points per side, not to an
  arbitrary border point.
- **Lanes** — the gap between an external column and the cluster becomes a set of vertical channels;
  each edge crossing that gap takes one.
- **Path style** — `squared` (orthogonal, uses lanes) or `curved` (bezier, ignores lanes), sharing
  one port assignment. `squared` is the default.

All three ship. Lanes in particular are not conditional on the measurement in §8 — that measurement
sizes the gutter, it does not decide whether lanes exist.

## 1. Assignment and resolution

Edge geometry splits into two halves that today are one.

**Assignment** is global, abstract and memoized. A new pure pass

```ts
routeEdges(edges, positions, view): Record<string, Route>
type Route = {
  sourceSide: Side; sourcePort: number; sourceShare?: { index: number; count: number };
  targetSide: Side; targetPort: number; targetShare?: { index: number; count: number };
  lane?: number;   // absolute x of the gutter channel; absent when the edge needs no vertical run
}
```

runs once per view in `useCanvasView` and reaches each edge through `edge.data.route`. It contains
**no absolute node coordinates** — sides, port indices and a gutter x only.

**Resolution** is local, concrete and live. `FloatingEdge` keeps reading `useInternalNode` and turns
its `Route` into two points against whatever geometry the node has *right now*.

This split is what makes dragging correct. Node positions commit to the store only on
`onNodeDragStop`, so during a drag the route is frozen while the resolved endpoints track the node
every frame: the edge follows the box, but *which* port and *which* lane it uses does not change
until the drag ends. Ports therefore snap rather than slide — the behaviour we want, arrived at by
construction rather than by special-casing.

## 2. Ports — `edges/ports.ts`

One constant governs the grid:

```ts
export const PORT_PITCH = 24;
```

A side of length `L` carries `max(1, Math.floor(L / PORT_PITCH))` ports, evenly spaced and centred
on the side. At `NODE_W 220 × NODE_H 92` that is **9 ports** on top and bottom, **3** on left and
right. Deriving from a pitch rather than hardcoding counts means a node box that changes size keeps
a consistent port rhythm.

### Side selection

Rule-based, not nearest-point:

| Edge | Sides used |
|---|---|
| external ↔ cluster | the external's face pointing at the cluster; the cluster node's left or right face |
| sibling ↔ sibling (both children) | top and bottom, matching dagre's `TB` rank direction |
| anything else | the pair of faces whose centres are closest, preferring left/right on a tie |

### Ordering within a side

Edges on a side are ordered by the **barycentre of their other endpoint** — the mean position of
what they connect to — then assigned ports in that order. This is the same sort `layout.ts` already
uses to order the external columns, reused rather than invented. It is what prevents two edges
inverting their order at the box and crossing in the last 30px.

### Overflow

Ports quantise; they never refuse an edge. When a side carries more edges than it has ports, the
excess share the nearest port and fan apart by a few px. This is the only surviving job of
`fanEdgeParams`, which today exists solely because two edges between the same pair resolve to the
identical curve — a case ports handle naturally.

## 3. Lanes — `edges/lanes.ts`

Each gutter (the `COL_GAP` between a column and the cluster) becomes vertical channels.

**One lane per edge does not fit.** Process Layer sends ~61 external-touching edges across a
`COL_GAP` of 120px. So lanes are assigned by **interval-graph colouring over the vertical spans**
(the left-edge channel-routing algorithm): two edges whose vertical runs are disjoint in *y* share a
lane safely. The number of lanes needed is the channel **density** — the maximum number of
simultaneously overlapping spans — not the edge count.

An edge whose source and target ports sit at the same *y* needs no vertical run at all. It is drawn
as a straight horizontal and consumes no lane. Barycentre ordering in both the column and the port
assignment makes this common.

Lane pitch must clear a rotated label's line height (see §5), so `LANE_PITCH = 18`.

**The gutter is sized to fit its lanes, always.** `COL_GAP` stops being a constant and becomes a
per-gutter value derived in `layout.ts`:

```
colGap(lanes) = max(120, lanes * LANE_PITCH + 2 * LANE_MARGIN)
```

The two gutters are sized independently — an incoming column with heavy traffic must not push the
outgoing column out for nothing. This runs inside `layoutFocusView`, so it is part of the base slots
memoized on `[model, focusId]` and does not reflow when the connection filter or the audience toggle
changes.

**The cost, stated plainly.** Lane count is bounded by channel density, not edge count, but a dense
focus can still demand a wide gutter: 30 lanes is a 588px gap, which would take Process Layer's
canvas from ~2088px to roughly 3000px wide. That is accepted. A wider canvas is a zoom-out; the
alternative — squeezing *n* runs through 120px — is the illegible fan this work exists to remove.
Lane sharing between *y*-disjoint edges is the only compaction applied; no pitch shrinking, because
pitch is what keeps the labels readable.

## 4. Path styles — `edges/paths.ts`

Two generators with identical signatures, differing only in the `d` string they return:

- `squaredPath` — horizontal out of the source port, vertical down the lane, horizontal into the
  target port, corners rounded with a fixed radius. With no lane, a straight line.
- `curvedPath` — a bezier leaving and arriving horizontally through the same ports. Ignores lanes.

Mode lives in the store as `edgeStyle: 'curved' | 'squared'`, defaulting to `squared`, and is
toggled in the filter panel's existing **Layout** section beside `reset layout`.

Free-anchor bezier is **deleted**, not kept as a third mode: it is strictly worse than
curved-through-ports and keeping it would freeze the fan hack and a second geometry path in place.

Nothing about dashes, stroke colours or markers changes. The `6 4` (derived / flow Return) and
`2 5` (ephemeral step) patterns and the `hyphae-pulse` offset of 84 are untouched.

## 5. Labels

A lane label rotates −90° and rides its lane, centred on the vertical run — one extra
`rotate(-90deg)` on the transform `FloatingEdge` already applies when portalling into
`EdgeLabelRenderer`.

Two properties make this cheap:

- A rotated label's **horizontal footprint is its line height (~13px), not its text width**, so
  `LANE_PITCH = 18` clears it. This is why the crowded gutter can carry labels at all.
- **Non-collision is inherited, not enforced.** Lanes occupy distinct *x*; edges share a lane only
  when their *y* spans are disjoint; so their labels, each centred on its own span, are disjoint
  too. There is no collision pass to write.

Edges with no lane keep a horizontal label at the midpoint of their longest straight segment.
`curved` mode has no lanes and keeps today's midpoint labels.

## 6. Module layout

```
features/canvas/edges/
  ports.ts          Box, boxOf, port geometry, side selection, fanEdgeParams   ← renamed floating.ts
  lanes.ts          channel assignment by interval colouring
  paths.ts          curvedPath, squaredPath, labelAnchor
  routeEdges.ts     the per-view pass: ports + lanes → Record<string, Route>
  FloatingEdge.tsx  resolves a Route against live geometry and renders
```

`floating.ts` is renamed to `ports.ts` because after the deletions its one job is "where an edge
touches a node". `test/features/canvas/edges/floating.test.ts` moves to `ports.test.ts` with it.

Deleted: `intersection`, `side`, `getEdgeParams`, and the same-pair fanning block in
`focusViewToFlow` (`offsetIndex` / `offsetCount`).

Touched: `useCanvasView.ts` (the new memo), `reactflow.ts` (loses fanning, passes `data.route`),
`state/store.ts` (`edgeStyle`), `overlay/FilterPanel.tsx` (the toggle).

**Wiring invariant:** routing runs **after** `decorateFlowEdges`. A flow's ephemeral step edges are
created there, after `focusViewToFlow`; route them in the same pass or they arrive with no `Route`
and fall back to origin-anchored paths.

## 7. Testing

Every new module is pure. That matters more here than it usually would: React Flow renders zero
edges under jsdom and portals labels out of the edge's `<g>`, so pure functions are the only part of
edge rendering that is testable at all. Red-first per the project's TDD rule.

One new piece of test infrastructure: a **crossing counter** that, given routes and positions,
counts segment intersections. It supports a regression test asserting the new router beats the old
across the four real focuses (Baritone API, Process Layer, Utilities & Schematics, Command System),
which makes "better" a number rather than a matter of taste.

Measurement uses a throwaway `apps/web/test/zz-probe.test.ts` over
`apps/server/hyphae-baritone.json`, deleted when done. That file is permanently untracked — verify
with `git status --short` before every commit.

Baseline `pnpm -r test` stays at 693 green plus the new tests; the
`pnpm --filter @hyphae/web typecheck` floor stays at 4 errors.

## 8. The measurement

**Channel density per gutter on the real model** is the one number nobody has yet, and the plan's
first task measures it across the four reference focuses before any rendering work. It is a *sizing*
input, not a gate: lanes ship either way, and the number tells us what `colGap` will return and how
wide the four canvases become.

Two things it should flush out early, while they are still cheap to absorb:

- **A `COL_GAP` far above 120px** — expected on Process Layer, and the reason `colGap` is derived
  rather than constant. Worth eyeballing in the running app before the rest is built on top of it.
- **A pathological focus** where density approaches the edge count, meaning almost no *y*-disjoint
  sharing is happening. That would point at the barycentre ordering rather than at lanes, and is
  better found in a probe than in a finished renderer.

## Documentation to update in-branch

- `README.md` § Viewer — routing behaviour and the curved/squared toggle.
- `CLAUDE.md` "Invariants that bite" — the assignment/resolution split and its drag consequence; the
  route-after-flow-decoration ordering.
- `docs/SPEC.md` § 9 — only if the "difference in form, not hue" rule needs a line about edge style.

## Out of scope

- **Obstacle avoidance.** Edges may still pass underneath a node box. Lanes reduce this incidentally
  by pulling long runs into empty gutters; they do not guarantee it. Ruled out with the user: it is
  the least damaging symptom and by far the most expensive to fix.
- elkjs or any new dependency. Rejected for layout on 2026-08-01; the same ~1MB and async-pipeline
  costs apply here.
- Keeping today's free-anchor bezier as a third mode.
- Persisting an edge style, a port assignment or anything else beyond the session.
- Rendering ports visibly, at rest or on hover.
- Changes to the pattern view. The flow overlay is routed like any other edge; its semantics do not
  change.
- Any dagre change other than deriving `COL_GAP` from lane count.

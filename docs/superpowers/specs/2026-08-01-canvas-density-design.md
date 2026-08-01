# Canvas density: hub quieting, layout tuning, draggable nodes

**Date:** 2026-08-01
**Status:** agreed, ready to plan
**Branch:** `feat/canvas-density`

## The problem

At a Container focus the viewer draws a hairball. Measured on the real Baritone model
(`apps/server/hyphae-baritone.json`) by running `buildFocusView` + `layoutFocusView` over every
focus that has children:

| focus | children | externals | edges (touching an external) | canvas |
|---|---|---|---|---|
| Baritone API | 14 | 10 | 85 (40) | 2520×1640 |
| Process Layer | 12 | 11 | 68 (**61**) | 2530×716 |
| Utilities & Schematics | 16 | 10 | 53 (42) | 2610×716 |
| Command System | 9 | 8 | 46 (29) | 2080×780 |
| Mixin Launch Layer | 8 | 7 | 33 (26) | 2460×612 |
| Behavior Layer | 6 | 9 | 29 (23) | 1520×612 |

Three distinct causes, and they are not equally weighted.

1. **External fan-out dominates.** At Process Layer, 61 of 68 edges touch an external — only 7 run
   between the children. The picture is not a graph, it is a bipartite tangle between a wide row and
   two side columns.
2. **dagre has almost nothing to work with.** With 7 intra-cluster edges among 12 children, most
   children get no rank at all and land together in rank 0 — one ~2530px row. An edge from the
   rightmost child to the left external column then crosses the entire diagram, and every such edge
   crosses every other. External columns compound it: they are ordered **by UUID**
   (`layout.ts`'s `byId` sort), which is to say, randomly with respect to the graph.
3. **Hub nodes.** The top five nodes carry 20+ connections each (`Baritone` 38, `PathingBehavior` 23,
   `Player & World Utilities` 22, `BuilderProcess` 22, `Minecraft Client` 21). `Settings` — the node
   that prompted this work — carries 16, of which **14 use the verb `reads`**, and 10 of those are
   labelled exactly `reads settings` or `reads runtime settings`. As drawn lines those 10 carry no
   information: identical verb, identical target, differing only in where they start.

Dropping every edge that touches an **external** of in-view degree ≥ 5 gives an upper bound on what
hub handling can buy: Process Layer 68 → 20, Utilities & Schematics 53 → 21, Mixin Launch 33 → 15,
Core Runtime 34 → 19, Baritone API 85 → 62. (Quieting will apply to children too, so the real
reduction at a given threshold differs; this measures the headroom, not the design.)

## Scope

One branch, three coupled changes to the canvas pipeline. Everything is **session-only**: no schema
change, no server write path, no MCP surface, no `localStorage`. Auto-layout remains the authority on
the durable picture; manual positions exist to nudge a diagram you are reading right now.

The pipeline gains one step and one override layer:

    buildFocusView → quietHubs → layoutFocusView → resolveViewPositions → applyDragOverrides → focusViewToFlow
       core/focusView   core/hubs        features/canvas/layout.ts          features/canvas       features/canvas/reactflow.ts

## 1. Hub quieting — `core/hubs.ts`

A new pure module. It earns its place in `core/` under the layering rule: it reads a `FocusView` and
`@hyphae/schema` and nothing else — it does not render, does not import a feature, and is not a
helper that landed there because no feature wanted it.

```ts
export type HubBadge = { hubId: string; hubName: string; verb: string; verbClass: string };

export function detectHubs(view: FocusView, threshold: number): Set<string>;
export function quietHubs(view: FocusView, hubs: Set<string>):
  { view: FocusView; badges: Map<string, HubBadge[]> };
```

### Detection

- **Rule: in-view degree ≥ `threshold`.** Degree counts drawn `FocusView` edges, so an aggregated
  rolled-up edge counts once, not once per underlying connection.
- **Default threshold 8**, adjustable from the `FilterPanel`.
- Verb *uniformity* as an additional criterion (so a genuinely central node like `PathingBehavior`
  is never quieted while `Settings` always is) was considered and **rejected as YAGNI**. Making the
  set correctable by hand is simpler and covers more cases than any automatic rule.
- **Detection runs on the base view** — the unfiltered, full-audience, collapsed view that
  `useCanvasView` already builds for the stable layout. Running it on the rendered view would mean
  that filtering out `dataAccess` un-hubs `Settings`, which would reflow the entire graph on a
  filter toggle. That directly contradicts the existing layout-stability invariant.

### Rendering

- **A quieted node stays on the canvas**, inside its own container box, dimmed, carrying a
  `hub ×11` chip. It simply stops attracting lines. Parking hubs in an off-graph strip was rejected:
  removing a child from its own region box makes the containment read false — "Baritone API" would
  show 12 of its 14 children with no indication why.
- **Its edges are re-encoded as badges on the other endpoint** — a small `↳ Settings` chip on each
  neighbour, carrying the **verb-class colour of the edge it replaces**. This follows the styling
  rule rather than excepting itself from it: the badge *is* the edge, re-encoded in a different form,
  and it keeps the same hue-means-meaning mapping the line had.
- A node with several hub badges shows them in one row, capped, with a `+2` overflow chip.
- **Nothing becomes unreachable.** Clicking a hub's chip un-quiets it and it rejoins the graph;
  selecting any node still lists every connection in the inspector's `ConnectionList`. A
  hover-restores-the-edges overlay was **cut from v1** — mutating the drawn edge set on hover is the
  expensive, fiddly part of the idea, and click-to-unquiet covers the need.

### The cost, stated plainly

A badge row does not fit in `NODE_H = 92`, which is sized for exactly a name line, two summary lines
and the technology chip. Therefore:

- `NODE_W` / `NODE_H` stop being bare constants read by every consumer and become **parameters**
  threaded through `layoutFocusView`, `resolveViewPositions`, `groupBoxHeight` and `focusViewToFlow`.
  The exported constants remain as the defaults.
- While quieting is on, every node box grows by one chip row — uniformly, so no layout maths has to
  cope with mixed heights.
- Consequently **toggling quieting reflows the graph**, and the base-layout memo key in
  `useCanvasView` becomes `[model, focusId, hubIds]` rather than `[model, focusId]`. This is correct:
  quieting changes *what is drawn*, unlike the connection filter and the audience toggle, which only
  change what is *shown* of a fixed drawing. The existing invariant is preserved in substance — the
  filter and the audience toggle still never reflow.

## 2. Layout tuning — `features/canvas/layout.ts`

Two changes inside `layoutFocusView`, plus parameter tuning. `COL_GAP`, the column-keyed logic in
`resolveViewPositions`, and the "expanded externals live in the external columns" invariant are all
untouched.

- **Externals ordered by barycentre.** Replace the `byId` UUID sort with the mean `y` of each
  external's in-view neighbours' base positions. Children are already placed when the columns are
  built, so a single pass suffices — no iterative sweep. Ties and externals with no placed neighbour
  fall back to the id sort, so the result stays fully deterministic. This is where most of the
  crossing reduction comes from.
- **Isolated children go in a grid, not a rank.** Partition `view.children` into those with at least
  one intra-cluster edge (laid out by dagre exactly as today) and those with none. The isolated set
  is packed into a grid block of **4 columns**, ordered by id for determinism, placed below the
  dagre core and horizontally centred on it. This targets the actual
  cause of the 2530px row — dagre gives an unranked node no useful position, so a grid is strictly
  better than a row — and unlike post-hoc rank wrapping it cannot disturb the rank ordering of a
  node that dagre *did* rank.
- **`nodesep` 40 → 56, `ranksep` 80 → 104.** The grid packing buys back the width this costs.

## 3. Dragging

- `nodesDraggable` becomes true for the `node` and `ghost` types only. `region` and `ghostGroup` stay
  `draggable: false` — both are derived from the positions of their contents. The pattern view stays
  entirely static.
- **Store:** `nodePositions: Record<string, XY>`, cleared by `setFocus`, `revealNode` and
  `revealStep` on exactly the same terms as `expandedExternals` — a new focus opens on the
  auto-layout.
- **Applied last**, as an override on top of `resolveViewPositions`, so a dragged node keeps its
  place while the filter and audience toggles continue to leave the rest of the graph alone.
- **Commit on `onNodeDragStop`, not per frame.** `Canvas` keeps React Flow's `useNodesState` synced
  from the derived nodes (React Flow will not move a fully controlled node without an
  `onNodesChange` handler) and writes to the store only on drop. Writing every drag frame would
  re-run `focusViewToFlow` at frame rate. Accepted consequence: **the region box resizes on drop,
  not continuously** during the drag.
- **Edge paths need no work.** `FloatingEdge` reads live geometry via `useInternalNode`, so anchors
  and beziers recompute as the node moves.
- A **Reset layout** control in the `FilterPanel` clears the overrides for the current focus.

## Testing

Red-first for the pure modules, per the project's TDD convention.

- **`core/hubs.ts`** — threshold boundary behaviour; the badge map pairs each neighbour with the
  right verb and verb class; quieted edges leave `view.edges`; a node quieted from the base view
  stays quieted when a connection filter is applied.
- **`features/canvas/layout.ts`** — barycentre ordering measurably lowers a crossing count on a
  fixture built for it; isolated children land in a grid, connected children keep their dagre ranks;
  output stays deterministic across runs; `groupBoxHeight` and the column maths still hold when a
  non-default `NODE_H` is passed.
- **Store** — `nodePositions` set, override and reset-on-focus-change.
- **Not a simulated drag.** jsdom measures nothing and React Flow renders no edges under it. Test the
  position-override merge as a pure function and the store directly. The existing `hlCss` integration
  guard in `Canvas.test.tsx` stays as-is.
- **Styling** — badges and the hub chip reuse the existing `--verb-*` and surface tokens, so no new
  entry is needed in the 33-pair contrast suite and no token is left unreferenced. `tokens.test.ts`
  walks `src/` recursively, so a new stylesheet rule is covered automatically.
- `pnpm --filter @hyphae/web typecheck` after the `NODE_W`/`NODE_H` signature change — the 4-error
  floor must not move.

## Documentation to update in-branch

- `README.md` — the viewer's behaviour: dragging, reset, the quieting toggle and threshold.
- `docs/SPEC.md` — §9, recording the hub badge as a *form* distinction carrying the verb-class hue.
- `CLAUDE.md` — the new `core/hubs.ts` in the file map; the base-layout memo key now including the
  hub set; `NODE_W`/`NODE_H` as parameters rather than bare constants.

## Out of scope

- Persisting positions to the model, to the server, or to `localStorage`.
- A hover overlay that temporarily restores a quieted hub's edges.
- Replacing dagre with elkjs, or a three-band layered layout that ranks children and externals in a
  single pass. Both were considered; the first is a ~1MB dependency plus an async rewrite of the
  memo pipeline, the second breaks the column keying in `resolveViewPositions` and the expanded-
  external invariant.
- Any change to the pattern view or the flow overlay.

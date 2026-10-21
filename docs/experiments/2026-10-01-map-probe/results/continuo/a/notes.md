# Variant A (factory floor) — notes

Target: `/mnt/c/projects/continuo` at commit `a2142f1` (2026-09-04). Read: tracked files only.
Nothing was built or run, so every status on the map rests on what the repository itself records
(tests that exist, dated in-game runs in the specs and the smoke checklist), not on anything I
observed running.

## The information architecture, and why

One screen, three linked views.

- **Floor (centre).** 9 districts, 31 machines, inputs docked on the left and top edges, outputs on
  the right edge. Position carries meaning: left to right is game-in to game-out; the top two rows
  are the running bot (read the game, understand blocks, plan, gate, walk, drive); the two strips
  underneath are what does not run in a normal walk (not built yet; proof and guard rails). The
  left edge holds live inputs (owner, game, repository pushes), the top edge holds static inputs
  shipped with the mod (block rule tables, move plug-ins).
- **Use-case board (left rail).** 19 use cases grouped by status (7 work, 7 partly there, 5
  planned). Choosing one expands its steps in place in the rail, lights its belts on the floor with
  step numbers, and dims the rest. The steps expand in the rail rather than in a drawer so the floor
  is never covered while a route is being read.
- **Things map (bottom strip).** 20 nouns in a fixed 5x4 grid, each with either its states or its
  fields on one line, and 22 relations.

Three zoom levels, all in place, positions never change:

1. **Districts** (home): 9 labelled areas, machine footprints without names, only the 28
   district-to-district belts, each labelled with what it carries.
2. **Machines**: same picture, footprints become named machines, the 64 machine-level belts appear;
   cargo labels show on hover, on selection, or for the current route step.
3. **District focus**: the stage scales up around one district; machines list the smaller machines
   inside them and every belt touching the district shows its cargo.

Vocabulary of form, kept to a handful: rectangle = machine (a job); stacked rectangle = one
implementation per game version; dark dock = input or output; pill = a thing, and therefore also
every cargo label on a belt; dashed = not built; dotted = "checks". Colour is spent on only three
things: the status lamp (green disc / amber half-disc / dashed ring, so form carries it too), one
accent blue for whatever is currently selected or lit, and ink.

Detail (drawer on click): one sentence, status and the evidence for it, smaller machines inside,
takes in / puts out, **must always hold**, **change it here** (the real constants with their values
and files), **known gaps** (including where the docs and the code disagree), use cases passing
through, code paths. A header button lists the 8 places where docs and code differ.

Why this shape: the project is a pipeline that runs once per game tick, with one real loop (walker
asks planner, planner answers). A floor with belts shows that directly. The districts are jobs, not
modules: "Reading the game" and "Driving the game" are the same two adapter modules split by what
they do; "Inspection tools" and "Safety gate" are both the `runtime` module; "Planning a route"
spans three modules.

## What I tried that did not work

- **Cargo labels on the belts to the edge docks.** The gap between a dock and a district is 14 px,
  so the labels sat on top of the dock names. They moved inside the docks as pills.
- **District names inside the district layer.** Footprints and belts covered them. They are now a
  separate layer above the tiles, with a background so belts pass behind the text.
- **One lane per tool belt.** Eleven parallel lines 3 px apart between the two main rows were
  unreadable. Tool-key clicks, player position and blocks-for-tools are now three shared trunks that
  split at the tools, like a real splitter; a selection or a route still lights only its own belt.
- **A drawer that shrinks the floor.** It rescaled every label below legibility. The drawer overlays
  the right side and the floor pans just enough to keep what the selection lit clear of it.
- **Hairlines under zoom.** Borders thinner than 1 px are rounded up before the zoom transform, so
  focused tiles got 3 px outlines. In focus mode outlines are drawn as box-shadows.
- **Twin belts** (search and chained-route machines talk both ways) put two labels on one spot;
  vertical twins now label left and right of the pair.
- **Zooming into the two wide strips** would have meant zooming *out* once the drawer was open. A
  strip that cannot be enlarged stays where it is and only gains its labels. This is the weakest
  zoom state: tiles stay 140x40, so the smaller machines inside them are not shown there (they are
  in the drawer).
- **Belts styled by status** (long dashes for "partly there") read as a fourth line style next to
  solid, dashed and dotted. Dropped; status is on the lamps only.

## What I could not verify

- **Real hover and real mouse clicks.** Screenshots cannot hover. I drove the page in headless
  Chrome through an iframe harness with synthetic events: district click, machine click, belt
  click, thing click, use-case click, step click, close, Escape, three `history.back()` calls, the
  header buttons, and a synthetic `mousemove` for the hover card. All produced the expected hash and
  DOM state, with zero JS errors. Hit areas on thin belts, hover card placement near screen edges,
  and how the zoom transition feels have not been seen by anyone.
- **Other screen sizes.** Looked at only at 1440x900. The floor scales to fit, so on a smaller
  window tile text shrinks with it; nothing reflows.
- **Fonts.** The page asks for Bahnschrift (present in the Windows Chrome used for the screenshots)
  and falls back to DIN Alternate, then Segoe UI or the system face. The fallbacks are wider; tile
  labels may wrap to three lines and clip. Not checked.
- **Content I am less sure of:**
  - "Works" means the repository *records* tests or a dated in-game run. I did not run the 592
    `@Test` methods I counted, nor the build.
  - The walker (`PathExecutor`) is marked "partly there" because `docs/smoke-checklist.md` says its
    in-game steps 13 to 22 have never been run and its seven constants are "extrapolated". If the
    owner has run them since without committing a record, the map is too pessimistic.
  - "Keep walking through menus" and "Stop on leaving the world" were verified in game with the
    older 40-tick straight walk, before the route walker replaced it. I marked the first partial and
    the second works (its mechanism lives in the safety gate, which did not change). That split is a
    judgement.
  - The route steps for "Walk to a marked block" flatten a per-tick loop into 22 ordered steps.
    Steps 8 to 15 really repeat thousands of times inside one search; the order shown is the order
    in which each belt is first used.
  - The path-probe's first in-game run (2026-08-31) does not say which game version it was on.
- **District-level routes are coarser than they look.** A district lights if any machine in it is on
  the route, but a district-level belt only lights if I drew one for that pair. Two real machine
  belts have no district belt ("forget blocks on stop", "blocks to draw and dump"), so in
  `#route=uc.leave` the "Understanding blocks" district lights with no belt leading to it.
- `map.html` carries an inline copy of `map.json`. They were written by one script and are
  identical now; editing `map.json` alone will not change the page.

## Where docs and code disagree (code wins)

Also in `map.json` under `docsVsCode` and in the page header.

1. The architecture document plans A* on a worker pool over a frozen copy; the code searches on the
   game's main thread, 2,000 positions per tick.
2. The architecture document and `docs/injection-strategy.md` plan a "server moved you back" event
   via bytecode injection; `IGameEvents` has only `onClientTick`, and the walker re-finds its place
   on the route every tick.
3. Per-movement executors are described; one walker derives the move kind from each step.
4. Capability negotiation is described as three-way; there is one caller-granted permission.
5. The actuator is described with hotbar, item use and block breaking; it has key input and look.
6. Move costs are priced at sprint speed "because the executor sprints"; the executor never sprints.
7. The module tree in the architecture document is not the module tree in the repository.
8. The D2 spec still says "design, for review" although the walker is merged.

## What breaks first at ten times the size

In order:

1. **Hand-placed geometry.** Every position, and the waypoints of 38 long belts, were placed
   by eye over about eight screenshot rounds. At 300 machines that is not a task, it is a job. Positions
   would have to come from a constrained layout run once and then frozen into `map.json` (so they
   stay stable), with hand edits as overrides.
2. **The lanes between rows.** The floor has three horizontal lanes and they are already shared by
   trunks. Ten times the belts needs real edge bundling by district pair, and machine-level belts
   drawn only inside the focused district plus its neighbours.
3. **One level of districts.** 90 districts do not fit a home screen either. It needs districts of
   districts (a third zoom tier), which the current two-flag zoom (`z=`, `d=`) does not model.
4. **The use-case rail.** 19 rows fit; 190 need search, grouping by actor, and probably the board as
   its own zoomable view rather than a rail.
5. **The things grid.** 20 nouns in 5x4 with every relation drawn is at its limit now; the relation
   lines already run through the field text. At 200 it has to become per-district (show the things
   that travel in the lit area) rather than one global strip.
6. **Honest statuses.** Each "works / partly there" here cost a read of a spec or a checklist. That
   does not scale by hand; it would need the repository to carry machine-readable evidence
   (test-to-feature tags, dated verification records) for a map to quote.
7. **Reading cost.** This repository is about 10,600 lines of main code and 9,900 lines of docs, and
   was read almost whole. Ten times that needs a per-district pass with a merge step, and the
   doc-versus-code checks become the expensive part.

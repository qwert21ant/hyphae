# Variant C (wildcard) — notes

Target: `/mnt/c/projects/continuo` at commit `a2142f1`. Only git-tracked files were read. Nothing
was built or run.

## What the project turned out to be

A Minecraft client mod. You mark a block (H), press K, and the bot searches for a route and walks
the player there by pressing the game's own movement keys. Two developer keys (L, J) test a route
and dump block readings. The same bot code runs on Minecraft 1.21.11 (Fabric) and 1.7.10 (Forge)
behind a thin translator per version. Five of ten planned milestones are unbuilt (remote control,
web UI, scripts, more versions, flight) and the fifth is two-thirds done.

## The representation, and why

**A 2×2 square of the four modes the bot can be in, on a heartbeat.**

- The walker's whole state is two facts: *does it have a route* and *is a search running*. That
  gives exactly four modes: Idle, Searching, Walking, Walking-and-planning. Position on the page
  carries those two facts (rows: standing still / walking; columns: not searching / searching).
  The transitions between them, with the exact log line each produces, are what the owner
  actually experiences when using the mod.
- Inside each mode are the **jobs** done there, named by what they do ("Decides where feet fit",
  "Turns gently, not instantly"). Each job links to its files. This is where the content rule
  (jobs, not code units) is discharged: one job often spans three modules, one file serves
  several jobs.
- Around the square: the keys you press (left), the five doors to the game and the versions
  behind them (right), the build plan as a ten-stop track (top), and **one tick** as a
  twelve-step strip (bottom). The strip is tied to the square: pick a mode and the steps that run
  in it light up; each step carries a miniature 2×2 showing which modes run it.
- **Four lenses over the same picture**, one per question in the brief:
  *What happens* (status + eleven stories you can step through),
  *What can I tune* (18 dials shown as chips on the thing they govern, each with file:line),
  *How sure are we* (every mark recoloured by evidence: seen in a real game / tests only /
  reasoned / not built), *What must hold* (15 rules pinned to what they constrain, each saying
  whether the build, a test, or only a human keeps it).

I chose it after reading the code because three things about this project are not pipeline-shaped
and not use-case-shaped:

1. **It is a loop, not a line.** Everything happens 20 times a second in a fixed order, and the
   interesting behaviour (retry, give up, plan ahead, self-heal after a screen opens) is *which
   mode the loop is in*. A factory floor shows the search as a conveyor and loses the retries; a
   use-case board shows "walk to goal" as one flow and loses that the other ten things that can
   happen all share the same four modes.
2. **The repo is unusually explicit about what is proven.** The headline fact for the owner is
   that the walker has 65 tests and no recorded in-game run, and all seven of its tuning numbers
   are extrapolated. That is a property of every element, so it became a lens rather than a
   paragraph. `#/proof/level/tests` shows it in one picture: the walking half of the square.
3. **"Where would I change this" is mostly numbers.** The behaviour-changing knobs are constants
   with a file and a line. They are first-class elements (kind `dial`), not buried in detail.

## Alternatives considered and rejected

- **Pipeline / factory floor** (game → block facts → named blocks → search → route → keys). True
  for one search, and it is another agent's stance. It has no place for "off route", "stuck",
  "gave up", the gatekeeper, or the crash state, which is most of what the owner will see in the
  log. Kept only as the job list inside the Searching mode.
- **Use-case board.** There are only four keys; nearly every scenario is the K key meeting a
  different circumstance. A board would be one big card and three small ones. Kept as "stories"
  that replay over the one picture instead of each opening its own.
- **Layer cake (game / translators / contract / core).** This is what the architecture doc draws
  and it is exactly the code-structure map the brief rules out. It survives as one dashed line
  ("only this side knows Minecraft") and three build-enforced rules.
- **Timeline of the build as the main view.** The project has a clean dated history (17 merges
  in five weeks), but it answers "how did we get here", not "what does it do". Reduced to the
  ten-stop track.
- **A literal state chart with eight or nine states** (separate "repathing", "first search",
  one node per ending). I started there. "Repathing" and "first search" are the same state in the
  code, and drawing the endings as states produced seven arrows converging on Idle. Folding to
  2×2 and drawing endings as pills on two return arrows removed the tangle.
- **A map of the Minecraft world with the route on it.** Appealing, but it would be an
  illustration of one walk, not a map of the project, and every number on it would be invented.

## What I tried that did not work

- A global `position:absolute` rule for everything on the stage: it stacked every status dot on
  top of its own label. Fixed with explicit static islands; a less clever layout would have been
  quicker.
- Status as CSS selector chains (`.s-partial > .flow > .dot`): broke as soon as marks were nested
  one level deeper, so the proof lens left keys and versions green. Replaced by CSS variables set
  on the element and read by the mark.
- Two dial chips on one job row ellipsised the job name. Moved the search budget onto the mode
  title and shortened chip texts; it is still tight (`dials.png`).
- First drawer design covered the mode square. The drawer now sits over whichever side column the
  selection is *not* in, so the square is never hidden; the cost is a narrow (318 px) drawer that
  scrolls for the longest parts.
- Long resting labels crept in ("Inside a loaded world: one bot, the same code on both game
  versions"). Cut back to five words or fewer after the second screenshot round.

## What I could not verify

- **Hover.** Tooltips (one-sentence summary on any part) and all click handlers exist but were
  never exercised; headless screenshots only prove hash-driven states. Back-button behaviour
  relies on plain hash navigation and was not driven.
- **Fonts.** The page uses Bahnschrift (ships with Windows) with fallbacks. Only the Windows
  rendering was looked at. On macOS/Linux widths will differ and some chips may crowd.
- **Other viewport sizes.** The stage is a fixed 1440×900 drawing scaled to fit. Only 1440×900
  was screenshotted.
- **Drawer scrolling.** Long drawers (Searching, Walking) overflow and scroll; a screenshot shows
  only the top.
- **Test counts** are counted `@Test` annotations in tracked files (592 total, 65 in the walker's
  module, 28 conformance cases). Tests were not run.
- **Status `works`** means "implemented, with tests or an in-game record in the repo", not "I saw
  it work". The separate `proof` field carries the difference. Assignments of `proof` are my
  reading of the specs' verification sections and `docs/smoke-checklist.md`'s records table.

## Where the code contradicts the docs (code wins)

- `mc-automation-architecture.md` describes an SPI with inventory, capabilities, block breaking,
  position-correction events, a task manager, scripts and a bridge. The real contract is five
  small interfaces: ticks, blocks, player position, seven keys plus a look direction, and a
  version name. The map shows the real one.
- `MovementCosts` says "the executor sprints wherever it can" and prices every step at sprint
  speed. `PathExecutor` holds SPRINT up on every tick. Shown as a gap on two jobs.
- `docs/smoke-checklist.md` step 21 says multi-segment searches happen while walking on any
  100-block route. In `Run`/`PathExecutor`, segments chain inside one search *before* the walk
  starts; planning ahead only fires when the adopted route stops short of the goal, i.e. when the
  search ran out of budget. The story is named "Goal beyond the search budget" for that reason.
- `docs/injection-strategy.md` says a position-correction hook via mixins lands at milestone 5.
  The D1 spec dissolved that hook and the walker replaced it by looking at the player's position
  each tick. Nothing in the repo uses mixins.
- `BlockTag` computes "slow", "falling" and "climbable"; no production code reads them. `GoalXZ`
  and `SealedSnapshot.covers` exist with no production caller. The gap-jump movement is searched
  only by the developer route test and refused by the walker.
- The roadmap never marks milestone 4 as done in its own text, though all five of its
  sub-projects are merged. Shown as "works" with that noted.

Left out as unsure: how the two versions' "on ground" flags compare (the repo itself says
unaudited); whether the start-of-tick call really precedes the game's input read (the repo says
no test can show it).

## What breaks first at ten times this size

1. **The 2×2.** It works because this bot has one actor with two independent facts. Ten times the
   project (task manager, scripts, bridge, UI, flight) means several actors, each with its own
   modes. The square does not grow to 4×4. I would keep one square per actor and add a level
   above: a board of actors, each drawn as its own small square with the active mode lit, zooming
   into the current view.
2. **Jobs inside a mode.** Searching already holds eight rows in 234 px. At thirty it becomes a
   list again. Jobs would need grouping into three or four named stages with their own drill-in,
   which is where a pipeline view legitimately earns its place, one level down.
3. **Hand-placed coordinates.** Every box, pill and wire is positioned by hand in a 1440×900
   canvas. That is why it reads as a picture, and it does not survive regeneration. At 10× the
   layout has to be computed from the model (grid slots per actor, routed wires), accepting a
   less composed result.
4. **Dial chips and rule pins.** 18 dials and 15 rules fit on the picture. 180 would not; the
   lenses would need to filter (by story, by mode, by proof level) before drawing, and the left
   panel would become the primary index rather than a legend.
5. **Stories.** Eleven fit in a column. A hundred need grouping by actor/goal and search.
6. **The drawer.** A 318 px side drawer is already cramped for the biggest parts. Larger parts
   need a wider sheet that pushes the picture aside rather than overlaying a column.
7. **Authoring.** The honest status/proof/gap fields came from reading the verification sections of the specs by hand. At 10× that only
   stays truthful if each claim records its source (file, section, date) so it can be re-checked
   mechanically; `evidence` here is free text.

## Files

- `map.html` — the page (single file, no network).
- `map.json` — 100 elements, 26 links, 11 routes; plus `proof`, `gaps`, `facts`, `log`, `evidence`,
  and for dials `value`/`on`, for rules `pins`/`enforced`, for jobs `in`, for modes `beats`.
- `shots/` — 14 screenshots, all looked at:
  `home` (`#/flow`), `dials`, `proof`, `rules`, `el-walking` (`#/flow/el/m-walk`),
  `el-door-keys` (drawer on the left), `link-repath` (`#/flow/el/t-repath`),
  `milestone-5` (`#/flow/el/ms5`), `dial-offpath` (`#/dials/el/dial-offpath`),
  `rules-keys-every-tick` (`#/rules/el/r-restate`), `proof-tests-only` (`#/proof/level/tests`),
  `story-walk-8`, `story-teleport-3`, `story-far-6` (`#/flow/story/<id>/<step>`).

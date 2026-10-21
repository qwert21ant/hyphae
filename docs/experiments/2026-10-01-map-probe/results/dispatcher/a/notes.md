# Variant A (factory floor) on Dispatcher: notes

Read at commit `db051fa` of `/home/qwert21/projects/Dispatcher`. Tracked files only; nothing was
built, installed or run. Every source file under `apps/` and `packages/` was read in full, plus
the README, compose files, playbooks and monitoring configs.

## The information architecture, and why

One stage, three linked views, all driven by one `map.json`.

- **Floor** (home). Six districts, 12 machines, 4 stores, 8 edge terminals, 33 belts. Jobs flow
  left to right in two lanes: *catch new orders* on top, *collect assigned transfers* below. The
  operator sits on the right edge and the operator's say flows back leftwards in a second hue, so
  "what the operator controls" reads as a different current from "what happens to an order".
  Machines are named by the job, in the words the Telegram bots show the operator (worker, order,
  transfer, filter, time exclusion, service, compliant). Code names appear only in the detail.
- **Use-case board** is the left panel and is always on screen next to the floor: 21 use cases in
  five groups, each with a status mark. Choosing one lights its machines and belts with numbered
  step badges and dims the rest; the row opens in place into a short step list.
- **Things map** takes the stage on demand: 16 nouns with their fields, state strips and
  relations. The bottom strip shows the same 16 nouns as chips in every view, so a chosen use case
  shows what it carries without leaving the floor, and a chosen thing lights the belts carrying it.

Decisions worth recording:

- **Detail replaces the board in the left panel, it never covers the floor.** The reader's place
  on the picture is never hidden. A chosen use case stays visible as a strip of step numbers.
- **Zoom is real zoom, with three levels of detail** (districts, machines, inside machines).
  Sub-machines have fixed positions inside their machine in world coordinates and simply become
  visible past 200%. 49 parts live there, including the 12 services with their own status marks.
- **Hue is cargo, shape is kind.** Blue: orders and transfers. Plum: the operator's say. Dashed
  slate: site access. Ochre: running it. Dotted grey: timers. Box with a bar: does a job. Drum:
  keeps things. Pill: outside the floor (filled for people, outlined for systems). Yellow means
  only "chosen".
- **Only exceptions carry a status mark on the floor.** A machine that works has no mark; a gap
  shows a half disc, with a count when the gap is in a part inside. The board shows every status.
- **Positions are stored**, not computed: every element has `pos`, every belt has `path` waypoints
  and `labelPos` in `map.json`. The page draws exactly that.

Hash grammar: `#floor` or `#things`, then any of `/r=<use case>`, `/e=<element or belt>`,
`/v=<zoom>,<cx>,<cy>`, `/tip=<id>` (forces a tooltip, for screenshots). Selections push history;
pan and zoom replace the current entry.

## What I tried that did not work

- Running the non-compliant belt over the top of the district. It crossed the accept belt, both
  blue, and the crossing read as a junction. It now leaves the judge downwards.
- A right-hand drawer for detail. It would have covered the operator desk, the very thing most
  selections point at.
- A clock belt for every timer. Two were enough; the exclusion clean-up and Transfeero's
  three-minute refresh are stated on the parts instead.
- Things map as a free 4 by 4 grid: the command-to-filter relation ran under two cards and crossed
  another. Reordering the middle row into a chain removed it.
- State strips with arrow glyphs and guessed pill widths overflowed the cards. Arrows are now
  drawn and rows are laid out before placing.
- District labels at a fixed corner collided with belts twice; label positions are now stored per
  district.
- The districts-only level is the weakest part. Belts simply stop where their hidden machine
  would be, and at 70% everything is small. On this project the level is not needed.

## What I could not verify

Interaction:

- Hover tooltips, wheel zoom, drag to pan, clicks, double click to zoom, Escape and the back
  button were never exercised: screenshots only reach states by hash. The script was
  syntax-checked with node and about 30 hash states rendered with an empty error box.
- Fonts: the page asks for Bahnschrift (Windows) with DIN and condensed fallbacks. Only the
  Windows rendering was seen. Label wrapping uses estimated character widths, so another font may
  wrap differently.

Content:

- "Works" means implemented end to end in the code I read. Nothing was run.
- The private package `@qwert21ant/dispatcher-commons` is not in the repository. Retry counts
  (taken as "5 attempts"), the storage folder layout and the Telegram bot base class are inferred
  from how they are called.
- Both bots add the local-time offset to an order's pickup time on the order object itself, and
  the same object is what gets posted to the controller. Whether shifted times actually reach the
  controller, or grow on a repeated `/collect_all` within a minute, is flagged as not verified on
  *Publish orders* and *Report collected transfers*.
- `/reboot_host` runs `reboot` from a process that now lives in a container. Not verified that it
  reaches the server.
- How many workers and which services actually run is decided by config files that are not in
  git. The map shows what the code can do; three Transfeero Chrome containers suggest three
  Transfeero workers, and that is all the repository says.
- The state strips on the things map are my reading of each noun's life from the flow. Only
  compliant or not, and running or stopped, exist as fields in the code.
- Code against docs: the README describes `packages/launcher` and lerna; the code has
  `apps/dispatcher` and pnpm workspaces. The root `bundle-*` scripts call a `build` script that
  `package.json` does not define. The role `ansible/roles/docker-stack` is used by no playbook
  and points at a compose file that is not tracked. The code was mapped; each mismatch is a
  stated gap on *Build and ship*.

## What breaks first at ten times the size

1. **Hand-routed belts.** 33 belts needed hand-set waypoints, and 20 label positions were tuned
   against screenshots. Two crossings remain (the publish trunk over two operator belts) and are drawn as over and under. At 300 belts
   this is not a manual job. I would keep machine positions stored but route belts with a channel
   router that assigns fixed tracks between districts and re-routes only belts whose ends changed,
   so the picture stays learnable.
2. **Shared trunks.** Three belts share one track into *Publish orders*. With more use cases a
   lit route on a shared track cannot be told from its neighbours. Tracks need lanes.
3. **The districts level.** Home would have to start there, and belts ending at hidden machines
   will not do. Each pair of districts needs one derived belt with a merged label and a count.
4. **The board.** 21 rows fit one panel. 200 need collapsible groups, a filter by status and a
   search, and the things strip (16 chips fill the width exactly) needs the same.
5. **Two levels of nesting.** Machine and part was enough here. A larger project needs districts
   inside districts and a level of detail per depth, not three fixed thresholds.
6. **Reading everything.** About 10,000 lines were read in full, which is why claims are specific.
   At 100,000 lines that stops, and the honest answer is a pass per district with far more
   elements marked `unknown`, not the same confidence spread thinner.

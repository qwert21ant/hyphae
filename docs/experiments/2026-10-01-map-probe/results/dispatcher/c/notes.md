# Variant C (wildcard) — Dispatcher

Read at commit `db051fa`, tracked files only. Nothing was built or run.

## What I chose: a dispatch board with two wings and a spine

After reading the code, the project turned out to be two programmes doing the same four-step
dance over a list of outside platforms, and meeting in one data shape:

- **Left wing, "Hunt new offers"** (yellow): 3 sources × 4 stages — get in, spot offers, judge,
  take. This programme *acts* on the platforms.
- **Right wing, "Collect what is ours"** (blue): 12 sources × 2 stages — get in, read assigned
  rides. This programme only *reads*.
- **Spine**: every ride becomes one order record, which leaves three ways (announce in Telegram,
  publish to the controller, answer "what is booked"), to two actors (operator, controller).
- **The operator's levers** sit directly under the hunt stage they change, so "where would I
  change this behaviour" is answered by position. Shape says where a lever is set (Telegram /
  config file / saved state only); three small bars say which hunted sources it applies to.
- **"Where it runs"** strip: browsers, storage, config, build, deploy, monitoring, the outside
  library.

Position carries meaning: outside world on the outer edges, the company in the middle, an
order's life running inward. Hue is the programme (yellow acts, blue reads); status is form
(hatch + half-disc = partly done, dashed + "?" = cannot be checked from this repo).

Three overlays, each a hash state: **routes** (10 scenarios as numbered badges on the board),
**what must hold** (12 rules, each highlighting the parts that keep it), **loose ends** (16 stubs,
risks, doc contradictions, with pins on the parts), plus a **rhythm** chart (11 timers on a log
scale).

Why this and not something else: the thing a newcomer cannot get from prose here is the
*coverage* — that only 3 of 12 sources are hunted, that each source is entered and read
differently, and which cells are half-done. A grid shows that at a glance, and the columns double
as the flow.

## Alternatives considered and rejected

- **State machine of one order** (offered → judged → taken → announced → collected). True, but
  it has about six states and hides the twelve sources, which is where all the code and all the
  fragility live. Kept as the column order instead.
- **One 12-row matrix** with hunt and collect columns side by side. First layout sketch. Nine
  rows had four empty hunt cells: a third of the screen said "nothing here", and source names
  ended up far from their collect cells. Split into two wings; the cost is that the three hunted
  sources are drawn twice.
- **Timeline / clock view as the home screen.** The timers matter (20 s polls, 3 min refresh,
  10 min collection) but they explain *when*, not *what*. Demoted to the rhythm drawer.
- **Telegram menu tree as the centre** (the operator's control surface as a state machine). It is
  the only UI the project has, but it is a means; the levers desk keeps the useful part.
- **Factory floor / use-case board**: left to the other two agents. The spine and routes overlap
  with them; the grid, the levers-under-stages and the two overlays are what I expect them to miss.

## What I tried that did not work

- Platform domains as a second line under hunted source names: wrapped mid-word in a 128 px
  cell. Removed; the domain is in the drawer.
- A dotted polyline joining route steps: it zig-zagged across the spine boxes. Removed; numbered
  badges and the step list carry the order.
- Mirroring the collect band header (tag before title) to match its right-to-left flow: read
  backwards. Reverted.
- First rhythm axis had wrong decade spacing; fixed. First key line overflowed the right edge;
  reworded.
- The drawer hides one wing (it opens on the side away from the selection). For a hunted source
  that means its twin on the other wing is covered. Accepted, not solved.

## What I could not verify

Page:
- **Real hover and real pointer clicks.** Headless Chrome cannot do them. I ran synthetic
  events on a scratch copy (click a cell, click a link in the drawer, Back, Esc, arrow keys in a
  route, close, a `mouseover` for the tooltip) and they behaved; real hover feel, tooltip
  placement near edges and the focus ring were not looked at.
- **Fonts.** Labels use Bahnschrift, which exists on the Windows machine that took the
  screenshots. On macOS/Linux the fallback has different widths; wrapping there is untested.
- Checked at 1440×900 and 1280×720 only (the board scales to fit; small screens get small text).

Content (all marked in the map as "not verified" or status `unknown`):
- The **commons library**, the **controller API** and the **Chrome image** are outside the repo.
  Retry/mute semantics, storage persistence, the bot base's chat filtering and where screenshots
  go are read off names and call sites.
- The **config file is untracked**: how many workers run (three Transfeero browsers are deployed),
  and the order in which sources are collected, are unknown.
- **"Pickup time shifted in place"** (loose end) is a finding from reading `formatOrder` and
  `sendConsolidationResult`, not from running anything; it may be intended.
- Whether `/reboot_host` reboots the server from inside a container.
- Whether the Talixo jobs page lists only assigned rides (the file is named "available").
- Source display names are derived from the platforms' domains.

Code vs docs: the README describes `packages/launcher`, lerna and npm; the code has
`apps/dispatcher`, `apps/consolidator` and pnpm. The map follows the code and says so.

## What breaks first at ten times this size

1. **Rows.** Twelve collect rows already use the full height. 120 sources will not fit, and 30
   hunted sources would push the levers desk off the screen. I would collapse rows into counted
   families ("cookies + table read ×40", "replays the page's request ×25"), drawn as one thin
   status strip per source, expanding one family in place by hash.
2. **Hand-written cells.** 36 cells × (label, sentence, facts, code) were written by reading every
   file. At 360 cells that needs extraction from code with a human check, or the "nothing
   invented" rule fails quietly.
3. **Two wings assume two programmes.** With ten programmes the mirror layout is gone; I would
   keep stages as columns and stack programmes as bands, with the spine on the right.
4. **Levers desk.** 17 chips fit; 170 would need grouping per stage with counts, opening in place.
5. The overlays (routes, rules, loose ends) scale fine as lists, but pins on a collapsed board
   would need to aggregate per family.

## Files

- `map.html` — self-contained, no network. Hash states: `#` (home), `#e/<element>`,
  `#r/<route>` and `#r/<route>/<step>`, `#list/routes|guarantees|loose-ends|rhythm`,
  `#g/<guarantee>`, `#x/<loose-end>`.
- `map.json` — the same content the page inlines: 87 elements, 121 links, 10 routes, plus
  `guarantees`, `looseEnds`, `rhythms`. Layout is computed from `wing` / `stage` / `source` /
  `under` hints, not stored.
- `shots/` — home (1440×900 and 1280×720) and 12 other states.

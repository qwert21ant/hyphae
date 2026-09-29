# B — Narrative: what I built and why

`b-narrative.html`, 206 KB, one file, no network. The model JSON is embedded verbatim in a
`<script type="application/json">` block and everything factual on the page is read out of it at
load. Verified: no `http(s)` reference of any kind, no `fetch`/XHR/WebSocket, no `src=`, no
`@import`; the only `url()` in the file is an SVG `url(#marker)` fragment.

## The thesis I built the page around

The model states its own centre of gravity in the System node's first sentence: *"built around the
one decision Baritone did not make: the core knows nothing about Minecraft."* Everything else in the
model is downstream of that — the SPI's minimality, the two adapters, the shared runtime, the
dependency-direction rule, the headless tests.

So the page has exactly one visual idea, used at three scales:

- **The seam.** Cool = Minecraft-free, warm = touches the game. It is *derived*, not authored: a
  module is game-facing iff the model gives it (or a component inside it) an edge to one of the two
  Minecraft clients. Two of nine modules qualify. Every chip on the page is tinted by that one bit.
- The hero renders the seam literally as a partition with the SPI as the wall between the sides.
- Section 01's ladder is the same split with the dependency depth added.

I spent the colour budget there and nowhere else. Container identity is carried by the chip's text
label, not by a ninth hue.

Typography splits along a line that means something: **serif is words** (the model's descriptions,
responsibilities and rules; and my section prose), **mono is structure** (names, kinds, roots, code
refs, counts, step numbers, edge arrows). Both faces are local — no web fonts, by constraint.

## Information architecture

**Reading order is the spine; the index is the back matter; the drawer is how they coexist.**

| § | What | Representation |
|---|---|---|
| 00 | The one decision | Prose + a typographic partition + a numbered "laws" sheet |
| 01 | Nine modules, one direction | A six-band dependency ladder, computed from the model |
| 02 | The walk — 13 steps | Sequence ladder, with a full introduction card the first time each node is touched; two state-machine diagrams interleaved at the points they explain something; then the same walk at container scope |
| 03 | Inside the search | Table + an internal-wiring table + one full card |
| 04 | What a movement is | Cards + table + a two-edge note that answers "can it jump?" |
| 05 | What the search reads | A four-stage chain (the block read path) + cards + a table |
| 06 | The contract | A numbered rule sheet (the model numbers them itself) + table |
| 07 | The second adapter | A Fabric-vs-Forge parity table + a two-column divergence panel |
| 08 | Instruments | Table + two cards |
| 09 | Index | Every node grouped by module; all 124 edges in three groups |
| 10 | Legend | What every mark means, including the ones the model doesn't use |

**Why this order.** The reader meets the decision, then the shape it produces, then one real request
walking through it, then — in the order the walk raised the questions — the search it advanced, the
movements the search asks, the blocks the movements read, the contract underneath all of it, the
second adapter that justifies the whole design, and finally the instruments that exist because none
of this can be tested in a live client.

All 49 nodes appear in a narrative section, not just in the index: 3 in §00, the 9 containers in
§01, the 13 on the spine in §02, and the remaining 24 distributed across §03–§08.

**Random access without losing your place.** Every entity chip opens a right-hand drawer rather than
scrolling anywhere. The drawer is the canonical full entry: every field, root, code ref, doc ref,
children, all outgoing and incoming edges (each itself a link), the flows the node appears in with
step numbers, and any pattern anchored on it. It deep-links via `#e/<id>` and survives back/forward.
Scroll-jumps (index → section, pattern → diagram) leave a "← back to §xx" pill. Search is `/`, with
arrow keys and Enter, over names, summaries, descriptions, code refs and edge labels.

Verified mechanically: 878 entity cross-links in the static page, 0 unresolved, 0 duplicate DOM ids;
all 173 entity drawers (49 nodes + 124 connections) render, and every link inside every one of them
resolves to an element or entity that exists.

## Things I asserted that are computed, not typed

- The six dependency bands (longest path over the 21 module-to-module edges).
- "All 21 module-to-module edges point strictly down the ladder — 21 of 21." That is the System's
  second law made checkable, and the page recomputes it at load rather than claiming it.
- The cool/warm split.
- The connection index's three-way partition: 23 container-level, 73 component edges crossing a
  module boundary (every one of them claimed by a container edge via `realizedBy`), 28 internal to a
  single module and claimed by none — which is correct, because a container edge only ever describes
  traffic leaving the container.

## What I tried that did not work

- **Indenting flow steps by dependency depth**, so the walk would visibly descend into the core and
  climb back out. Traced against the real steps it bounces between band 2 and band 6 five times in
  thirteen steps; it read as noise, and it implied a call-nesting the model does not record. Replaced
  with a flat ladder whose chips are module-qualified.
- **A hue per container.** Nine hues is confetti and it competes with the only distinction that
  matters. Killed.
- **A radial state-machine layout** for Walk Execution (5 states, 10 transitions). The triggers run
  to 34 characters — "remaining steps ≤ PLAN_AHEAD_STEPS" — and will not place around a pentagon.
  Replaced with a linear track, numbered arcs above (forward) and below (backward), and a numbered
  legend carrying the words. The picture shows the shape (Driving is the hub; Idle is both start and
  sink); the legend carries the text.
- **Rendering both patterns twice**, in §02 and again in §09. Duplicate ids and a duplicate SVG
  marker id. The index now carries member and transition tables and links to the diagram.
- A `foundational` encoding, which I built before discovering **no node in this model sets it**. I
  kept it in the legend and said so explicitly, so an absence is not read as an omission.

## Honest weaknesses

- **The page is data-driven for content but hand-wired for structure.** Sections 03–08 name their
  containers as string literals in the JS. Point it at a different model and §00–§02 and §09–§10
  still work; §03–§08 break. That is the single biggest thing separating this from a tool.
- **No JS, no page.** Every section body is generated. A reader with scripting off gets headings and
  empty slots. A real version needs a static fallback.
- **There is no picture of what talks to what.** That was the brief's point, but it is still a real
  cost: cross-container traffic is only available as lists in the drawer and rows in the index.
- **The 28 intra-module edges are the thinnest-covered part.** They appear in §03's wiring table
  (Pathfinder only) and in drawers, and nowhere else in the narrative.
- Several encodings I built are barely exercised by this model: `role` has exactly one instance,
  every connection is `Unidirectional`, no connection has a description, code ref or field, no
  pattern member binds a `nodeId` or a `ref`, and `dataTypes` / `requirements` / `decisions` /
  `views` are all empty. The page renders empty as empty, per the brief — but it means some of the
  vocabulary in the legend is untested.
- **No visual verification was possible** in this environment (no browser, no screenshot). Layout was
  checked by reading the CSS and by rendering in jsdom, which parses and scripts but does not lay
  out. Spacing and the two SVGs are unconfirmed by eye.
- The drawer is excellent for lookup and useless for printing.

## With another hour

1. Derive §03–§08 from the model: order the remaining containers by their distance from the spine's
   nodes, and generate the section per container, so the page regenerates for any model.
2. Generalise §03's wiring table into every container's drawer — "what is inside, and how it is
   wired" — which would close the intra-module-edge gap.
3. A no-JS appendix that inlines every entry, making the file complete when opened cold.
4. Lazy-render §09 so the 10× case stays snappy.
5. A coverage mark: the page already knows which nodes the narrative introduced, so it could show
   the reader what they have and have not met.

## Constraint 6 — what breaks first at 490 nodes / 1,240 connections

Nothing breaks *mechanically* first. Search is a linear substring scan over ~1,700 corpus entries
and stays instant. The 1.35 MB inlined JSON parses in well under a second. The ladder, the
cool/warm derivation and the state-machine renderer are all generic.

**What breaks first is editorial, and it breaks around 20 containers, not 90.** Sections 03–08 are
one hand-written section per module. Nine is authorable — and, more importantly, nine is *readable*
in one sitting. Twenty is a slog and ninety is a directory. At that size the narrative has to stop
being "the walk, then every module" and become "the walk, then the modules the walk touched, then a
generated directory for the rest" — which is a different page.

Close behind, in order:

1. **The index's connection block.** 1,240 rows in three groups with no facet beyond
   container-level / cross-boundary / internal is a dump, not an index. It needs filtering by module
   pair at minimum, and it needs incremental rendering — the current code builds all of it into one
   `innerHTML` string at load, which at 10× is roughly 40,000 DOM nodes up front.
2. **The ladder's bands.** The band computation is generic and would still be right, but each band
   becomes a wall of fifteen-plus chips. Bands would need a second grouping axis, and the model does
   not carry one — there is no "subsystem" between Container and System in this profile.
3. **The spine's uniqueness.** This model has exactly one behaviour, so one flow is genuinely the
   spine. A 490-node model has a dozen flows and no single one is the way in. The page would need a
   flow chooser at the top of §02 and a way to say which flow is the canonical first read — and that
   is a judgement the model does not currently record anywhere.
4. **The state-machine track layout**, at about eight states, where the arcs start colliding.

The parts that scale cleanly: the drawer (renders one entity on demand), the cool/warm split, the
band computation, the `realizedBy` partition, and the search.

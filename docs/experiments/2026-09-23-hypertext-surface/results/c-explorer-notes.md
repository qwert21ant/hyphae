# C — Explorer: notes

One file, `c-explorer.html` (189 KB). Model inlined as `<script type="application/json">`; no
network access of any kind, no fonts, no `fetch`, no `src=`, no `url()`. Everything visible is
computed in the page from `apps/server/hyphae.json` at load.

---

## The overview problem, and what I did about it

The stance says: show the whole system at once, without a global node-link diagram. I read the
model first and let the numbers pick the device.

The decisive fact is how the 124 connections are actually distributed:

| | count |
|---|---|
| written between **modules** (Container↔Container, Container↔External) | **23** |
| written between **components** | **101** |
| …of which stay **inside** one module | 28 |
| …of which **cross** a module boundary | **73** |

and those 73 crossing edges are *exactly* the set claimed by the 23 module-level connections'
`realizedBy` arrays. Not approximately — exactly. Every cross-boundary component edge is accounted
for by a module-level edge, and no module-level edge claims an internal one. The model has a clean
two-altitude structure with a lossless rollup between them.

That means the coupling of the whole system is **23 numbers**, not 124. Twenty-three numbers over
eleven units is a grid you can print, so the overview is a **dependency matrix**: 11 rows × 11
columns, rows = "depends on →", columns = "← depended on by", cell = how many component edges make
that dependency real (1–6). Row/column ordering is computed: longest path to a sink, i.e. distance
from the bare metal, so `01` is the Fabric adapter and `11` is a Minecraft client.

The payoff, and the reason I'd defend this over the alternatives:

```
X . 1 4 . . . 2 4 2 .   01 Fabric 1.21.11 Adapter      out 13
. X 1 4 . . . 2 4 . 2   02 Forge 1.7.10 Adapter        out 13
. . X . 2 . 2 4 6 . .   03 Engine                      out 14
. . . X 2 . 2 3 5 . .   04 Adapter Runtime             out 12
. . . . X . 6 4 . . .   05 Pathfinder                  out 10
. . . . . X 4 . . . .   06 Parkour Movement            out  4
. . . . . . X 3 . . .   07 Movement API                out  3
. . . . . . . X 4 . .   08 Core                        out  4
. . . . . . . . X . .   09 Platform SPI                out  ·
. . . . . . . . . X .   10 Minecraft 1.21.11 (Fabric)  out  ·
. . . . . . . . . . X   11 Minecraft 1.7.10 (Forge)    out  ·
```

**Every mark falls above the diagonal.** The System node's own `rules` list says "Module
dependencies point one way only; nothing depends on an adapter" — the matrix is that sentence
rendered as a shape, and a cycle would show up as an ink mark below the line. The two adapter rows
are near-identical, which is the whole architectural thesis (one core, thin per-version adapters)
visible in ten seconds without reading a word. The page does not hardcode any of this: it computes
the ordering and checks the triangularity, and the lede sentence changes if the check fails.

The matrix is the page's **signature device**, and it gets used twice: the two patterns are state
machines, and they are rendered as transition matrices too (from-state × to-state, trigger in the
cell). One idea, two altitudes.

The matrix shows 11 things, not 49, so a second overview sits under it: **the block map** — the
same eleven boxes opened up, one tile per component, tile shade and its number being the
component's connection count. All 49 nodes on one screen, with weight visible, and it doubles as
the index. It is deliberately in the subject's own idiom: Continuo debugs itself by rendering the
world as an ASCII map with a legend (`Text Renderer`, `BlockLegend`, `Block Dump Walker`), so the
architecture overview is presented as the system's own kind of artifact — a monospace field with a
legend beneath it — rather than as a dashboard.

**What I rejected.** A sortable adjacency table of all 124 edges (shows coupling, destroys shape —
you cannot see a cycle in a sorted list). A grid of containers each with its own miniature
node-link drawing (11 hairballs is still 11 hairballs, and it hides the cross-module edges, which
are the interesting ones). An indented tree with degree bars alone (containment without coupling —
the prompt's own warning: half the architecture).

## Information architecture

Five sections, descending in altitude, which is a real axis in this model (the profile's layers are
Context → Container → Component):

1. **Masthead** — the System node: name, `summary`, `description`, responsibilities, rules.
2. **The grid** — the matrix + a readout panel. Hover a cell: crosshair + the module connection's
   label + the component edges beneath it, each a live link. Click: pins it.
3. **The block map** — all 49 nodes, shaded by degree.
4. **The modules** — 11 collapsible blocks in the matrix's order. Collapsed, a module still shows
   name, tech, component count, out/in bars and its summary, so the section is readable without
   clicking anything. Expanded: description, responsibilities, rules, resolved `codeRefs`/`docRefs`,
   flows and patterns it appears in, its own "depends on / depended on by" lists, and its
   components as nested collapsible entries with the same anatomy.
5. **Flows** then **Patterns**.

**Every entity has exactly one canonical place**, and every mention anywhere is a link to it.
Nodes: their entry in §4. Connections: the row in the *source* node's "Depends on" list carries the
`id` — a connection lives where it is stated, and the mirrored row on the target node links back
("stated on X →"). Flows and patterns: their own blocks. Verified mechanically: 673 internal links,
zero broken; all 49 nodes, all 124 connections, both flows and both patterns have a resolvable
anchor; zero duplicate ids.

**Not losing the reader** is handled in three layers, in order of cheapness:

- **Peek.** Hovering or keyboard-focusing any entity link pops a small card — name, altitude,
  parent, in/out degree, technology, summary. Most lookups end here with no navigation at all. This
  is the single highest-value affordance on the page and the one I'd keep if I could keep only one.
- **Expand in place.** Almost nothing is a separate view. Following a link auto-opens the target's
  ancestors, scrolls, and flashes a ring around it.
- **A trail.** Every link-follow pushes your scroll position; a "← back to <section>" button appears
  in the sticky bar, and Escape does the same. Multiple hops stack.

## Representations, chosen per thing

- **Matrix** for module coupling and for state-machine transitions — the only places where the data
  is a small dense relation over a small set.
- **Tile field** for "all 49 parts with their weight".
- **Serif prose** for `description` — the author wrote paragraphs; they are set as paragraphs.
- **Bulleted lists** for `responsibilities` (dash) and `rules` (diamond) — two different marks
  because they are two different kinds of claim: what it is relied on to do vs. what is always true.
  `**bold**` and `` `code` `` are rendered, since the profile says those fields support them.
- **Definition-style rows** for connections: the other endpoint, the label in serif, and the
  `realizedBy` edges as links.
- **Numbered step lists with bracketed control fragments** for flows. Numbering is used here and in
  the matrix *only* because order genuinely carries information (step order; dependency rank).
- **Monospace everywhere else.** The type rule is the schema: anything the author wrote as prose is
  serif; anything that is a name, an id, a count or a coordinate is mono.

## Shape, colour, tags

Two accents, one job each. **Copper** = the boundary — the two Minecraft clients, their matrix
cells, their map boxes, their links, and the `opt`/`loop` fragment rails (conditions are where
control crosses out of the straight line). **Mineral teal** = coupling weight and interaction.
Everything else is a slate/stone luminance ladder. Layer is carried by nesting depth, a type tag and
luminance, never by hue; `role` (only `datastore`, on Block Tables) and `technology` are tags of
different border style. The `foundational` mark is implemented — and **no node in this model carries
it**, so the legend says so in words rather than showing an unused swatch. Empty fields print
nothing: connections here have no `description` and no `codeRefs`, so those rows simply do not
appear.

## Controls

Three, all labelled, all in the sticky bar, none discoverable-only:

- **Find** — dims non-matching nodes across the matrix, the map and the module list, with a live
  "N of 49" count. It searches names, summaries, descriptions, responsibilities, rules, code refs
  *and the labels of every connection touching the node*, which is how you find "octile" (2 hits).
- **Edges: All / Cross-module / Touching the game** — this is the model's own `crossingBoundary` and
  `involvingExternal` filters, applied to every connection list on the page, with the header count
  changing to "96 of 124 shown".
- **Expand all / Collapse all.**

## What I tried that did not work

- **A proper sequence diagram for the flows** — participant lanes as columns, steps as rows. The
  main flow has 13 steps across **14 participants**. At laptop width that is ~70px per lane, which
  is narrower than "Humanized Actuator". I cut it for a numbered step list with a participant cast
  strip above it and real nested brackets for the `loop`/`opt` fragments. The brackets are the part
  worth keeping: they are the only thing in the flow that a list alone cannot say.
- **A node-link drawing for the two state machines** (5 states, 10 transitions). Any honest layout
  of a near-complete digraph on 5 nodes is a hairball, and hand-placing coordinates would have meant
  hardcoding a layout the model can invalidate. The transition matrix is complete, compact, scales,
  and reuses the page's own device.
- **Rotated column labels on the matrix.** Diagonal text at 11px is unreadable and made the header
  120px tall. Numbering the columns and putting the key in the row labels is better, at the cost of
  one extra eye movement — which the hover crosshair and the readout mostly pay back.
- **Hiding non-matching nodes on search** rather than dimming. It destroys the matrix's shape, which
  is the one thing the overview exists to show.

## Honest weaknesses

- **The matrix hides direction *within* a seam.** A cell says "Engine depends on Platform SPI, 6
  edges". If two modules depended on each other it would be two cells, which is correct but visually
  separated. Here it never happens (the graph is acyclic), so the cost is theoretical — but in a
  cyclic model this would be the first thing a reader misreads.
- **Numbered columns are a real tax.** You learn the mapping or you hover. I accepted it; a reader
  who skims may not.
- **The 49-tile map has no ordering within a box.** Tiles are in model order, not degree order, so
  the eye has to scan rather than read down a ranking. Sorting them by degree would have made the
  brightest tile always first — I ran out of time to decide whether that helps or whether it breaks
  the reader's ability to find a component they already know the name of.
- **"Depended on by" duplicates every connection.** Each connection is rendered twice (once
  canonical on the source, once mirrored on the target) — 248 rows for 124 connections. It is what
  makes a node readable in isolation, but it doubles the page's edge text and the mirrored copy is
  slightly less informative.
- **The trail is scroll-position based, not target based.** If you expand something large after
  jumping, "back" returns you to the right offset but the content there may have shifted. It never
  loses you badly, but it is not exact.
- **The peek card does not fire on touch.** It is hover/focus only. On a phone the page still works
  — links navigate, everything expands — but the cheapest lookup layer is desktop-only.
- **No visual verification.** There is no browser or screenshot tool in this environment, so the
  layout is reasoned about and verified structurally (in jsdom: zero JS errors, all controls driven
  programmatically, all links resolved), but nobody has actually *looked* at it. Type sizes, the
  matrix's column widths and the block map's wrapping are the things most likely to be off.

## Scaling: 49 → 500

What breaks, in order:

1. **The block map, first and worst.** 370 component tiles at ~130px is ~8 screens of chips, and the
   "all the parts on one screen" claim dies around 150 nodes. Fix: collapse it to per-module
   density bars by default, with a module's tiles revealed on click — the section already has the
   right structure for that, it just needs a gate.
2. **The matrix, next — but later than you'd think.** It scales with the number of *modules*, not
   nodes. A 500-node model in this shape is maybe 30–60 modules: 60×60 at 30px is 1800px, which
   still fits with horizontal scroll and is still the clearest thing on the page. Past ~80 modules
   you need to cluster rows (by parent system, or by a computed community) and show the matrix
   hierarchically — which the profile already supports, since a 500-node model would have a real
   System layer with several Systems rather than one.
3. **The "Expand all" button.** It already builds every one of 49 entries eagerly at load (fine at
   189 KB); at 500 nodes the DOM is ~10× and expand-all becomes a visible stall. Fix: render entry
   bodies lazily on first open. The link-following path already opens ancestors one at a time, so
   this is a small change.
4. **The search** is a linear scan over a prebuilt haystack per node — fine at 500, fine at 5000.
5. **The sections that would not break at all:** flows, patterns, the readout panel, the peek card,
   the trail, the canonical-anchor scheme. They are all per-entity.

What would *not* break but would start to mislead: the "01 = furthest from the metal" ordering. With
60 modules the longest-path depth has many ties, and the tie-break (out-degree, then in-degree, then
name) is arbitrary. At that size the row order needs to be a real grouping, not a total order.

## With another hour

1. Lazy entry bodies + a module-level density summary in the block map (items 1 and 3 above).
2. Sort tiles within a module box by degree, and put a small "top 10 by degree" list beside the map
   — the one ranking the page currently makes you assemble yourself.
3. Make the matrix keyboard-navigable as a grid (arrow keys, readout follows focus). Right now cells
   are buttons in tab order, which is correct but tedious across 121 of them.
4. A "show only what touches this module" mode: clicking a row label filters every connection list
   on the page to that module's seams. The plumbing (`inScope`) is already there; it just needs a
   fourth scope value.
5. Touch support for the peek card (tap-to-peek, tap-again-to-follow).

# A — Reference: notes

One file, `a-reference.html`, 186 KB, no network of any kind. The model is inlined verbatim
as JSON in a `<script type="application/json">` and the whole page is built from it at load.

## What the data turned out to be, and why that decided the page

I read the model before designing, and two facts about it drove almost every choice.

**1. The connections are cleanly stratified, and nobody had noticed.** Of 124 connections, 23
are container-to-container and carry a `realizedBy` list; 101 are component-to-component. Of
those 101, exactly 73 cross a container boundary and *every single one of them* is claimed by
exactly one of the 23. No double-claims, no orphan crossings. The remaining 28 are wholly
inside one container. So the model is a perfect two-level partition:

    23 named boundary crossings  ─claims→  73 realizing component edges
    28 internal edges, each owned by exactly one container

That is the answer to the prompt's "how does a reader ask *what crosses this boundary?*". The
23 crossings became a first-class section, each one an entry with the component edges it claims
listed underneath. Every one of the 124 connections has exactly one definitive place on the
page: a crossing entry, a row inside a crossing entry, or a row in its container's internal
wiring table. All 124 are anchored, once each.

**2. The system's whole thesis is one binary distinction**, stated in the System node's own
rules: *"Nothing outside an adapter references Minecraft or a mod loader"* and *"Module
dependencies point one way only; nothing depends on an adapter."* So colour carries exactly
that and nothing else — three hues, derived from `technology` (inherited down the containment
tree) and `type`:

- blue = version-independent, plain Java
- ochre = bound to one Minecraft version (Fabric / Forge adapter code)
- moss = outside the boundary (the two game clients)

Nothing else on the page is coloured. Altitude is a three-cell meter, not a hue; state is
luminance.

## The signature: the boundary matrix

The one thing I'd want a reader to remember. An 11×11 design-structure matrix over the 9
containers and 2 external systems, rows depending on columns, ordered by a topological sort so
that nothing can depend on anything listed after it. Result: **the upper triangle is empty, and
all 23 marks fall below the diagonal.** The system's own dependency rule, drawn, with no prose
needed. Each mark is a link to that crossing's entry; hovering gives a row/column crosshair and
a peek card with the crossing's label.

It is a matrix, not a node-link drawing, which is deliberate — constraint 2 rules out the
whole-graph box-and-arrow, and the matrix is the representation that actually answers "does
anything depend on the adapters?" in one glance. It also scales far better than a graph (see
below).

The other visuals are all scoped: a small layered SVG of each container's internal wiring
(longest-path layering; components with no internal edge are excluded from the picture and
named underneath instead), the two state machines drawn on an ellipse, and the flows as ordered
step ladders. All three use the same interaction vocabulary — **hover the picture, the matching
table row lights up, and vice versa** — so the diagram is never the only carrier of a label.
Labels are the meaning of an edge and they always exist in text form.

## Information architecture

    orientation  System entry (its own prose, verbatim) + a real stat strip
    contract     the Platform SPI's four numbered global rules, pulled out as a grid.
                 The numbering is the model's own — the conformance suite depends on it —
                 which is the only place a numbered device is earned on this page.
    matrix       the boundary matrix + key
    key          what a node / connection / flow / pattern is, what the colours mean
    containers   9 sections in dependency order. Each: container entry (responsibilities,
                 rules, notes, its crossing ledger) → internal wiring diagram + table →
                 every component inside it, as a dense two-column card
    outside      the 2 external systems
    crossings    23 entries grouped by source container, each with its realizing edges
    flows        2, as step ladders with participants, control chips and `via` links
    patterns     2 state machines, diagram + authoritative transition table

The rhythm is **9 container sections, not 49 node sections** — that's the main defence against
the "one long uniform list" failure. Within a container, a component card is two columns: prose
on the left (responsibilities / rules / notes), data rail on the right (touches / code / docs /
appears-in). A reader gets what it is, where it sits, what it's for, what it touches with the
label, and where the code is, without scrolling.

**Code refs are resolved.** `root` chains down the containment tree, so `BlockTable.java` on a
node inside `Core` (`root: "core/"`) renders as `core/BlockTable.java`, with the basename
emphasised and `#Symbol` / `#L39-L129` fragments distinguished. That is derived, not authored.

## The two things the prompt said usually collapse

**High-degree hubs.** The worst is Path Probe with 11 edges (then Path Executor 9, Core Entry
Point 8, Platform Context 8). A flat list of 11 rows is noise. Instead a node's touches table is
**grouped by the crossing that claims each edge**, so Path Probe reads as *"inside Adapter
Runtime: 0 — across Adapter Runtime → Pathfinder: 2 — across Adapter Runtime → Core: 1 —
across Adapter Runtime → Movement API: 2 — …"*. Eleven edges become six named relationships,
each a link. The rollup that the model already encodes does the work.

**`foundational`.** Nothing in this model is marked foundational — zero nodes. The page renders
the tag when present and says "None marked foundational" in the stat strip, because that is a
fact about the model a reference should state. So the mechanism is built and untested against
real data; if the model gained foundational nodes I'd also want them pulled out of the touches
tables into a separate "leaned on by everything" band, which I have not built.

## What I tried that did not work

- **A container-altitude node-link diagram** as the orientation visual. 11 nodes, 23 edges —
  small enough to draw. I dropped it: it's still a whole-graph box-and-arrow, which is the thing
  the brief says failed, and it answers "what depends on what" *worse* than the matrix, because
  a fan of 5 arrows out of each adapter reads as clutter while five marks in a row read as a
  pattern. The matrix also makes the empty upper triangle visible, which a graph cannot.
- **A lane-based sequence diagram for the flows.** Flow 1 has 14 participants over 13 steps. At
  laptop width each lane gets ~70px, so participants become initials or rotated labels, and the
  names are the content. Replaced with a step ladder: right-aligned caller, arrow, left-aligned
  callee, message beneath, `via` connection linked. Legible, dense, and no name is abbreviated.
- **Transition labels on the state-machine arcs.** Ten transitions over five states on an
  ellipse; the trigger text collided in every layout I tried. The arcs are now unlabelled and
  cross-highlight with the transition table, which carries every trigger in full.
- **Putting the flow's `control` as a band above the step.** It implied a block span the data
  does not encode (`control` is per-step, with no end marker). It's now an inline chip on the
  step it actually belongs to.
- **A 49-item sidebar.** The spine lists 11 top-level units with a twisty per container;
  components appear on demand. Search is the real way to reach a component.

## Honest weaknesses

- **No visual verification.** There is no browser or screenshot tool in this environment. I
  rendered the page under jsdom to prove it parses, that the script runs without error, that
  all 206 anchors are unique and all 1129 cross-links resolve, and I checked contrast ratios
  arithmetically — but **nobody has looked at it**. Spacing, the rotated matrix column headers,
  and the internal-wiring SVG box widths are all unseen. Core's internal chain is 894px wide and
  will need a horizontal scroll on a narrow laptop; the container is `overflow-x: auto`, so it
  degrades rather than breaks, but I haven't watched it do so.
- **Everything renders eagerly at load.** 49 node entries, 124 connections, 10 SVGs, ~1100
  links. Fine here; see the scaling answer.
- **The spine has no filter of its own.** Search is a dropdown, not a tree filter. A reader who
  wants "show me only datastores" cannot get it; there is no faceted filtering at all.
- **The `role` axis is nearly dead.** Exactly one node (`Block Tables`) carries a role
  (`datastore`). I render it as a tag and no more — no shape vocabulary, no filter. With one
  instance, anything more would be decoration.
- **Connection `description` and `codeRefs` are empty across all 124 connections**, so a
  crossing entry is thinner than I designed it to be. It renders as nothing, correctly, but the
  block I built for it has never had content in it.
- **The back-chip is a scroll-position stack of depth one**, not real history. The browser's own
  Back button works too, and is better, but I didn't want to rely on a reader remembering it.
- **Two mouseover/mouseout listeners on `document`** do the cross-highlighting. It's fine at
  this size and would need delegation-with-index at ten times the size.
- Hover-peek has no touch equivalent. On a tablet, you tap and navigate.

## Scaling: what breaks first at 500 nodes

Ordered by when it actually hurts.

1. **The boundary matrix, around 60–80 units.** With 500 nodes you'd have roughly 90 containers,
   so a 90×90 grid: 8100 cells at 26px is 2340px square — past a laptop viewport, and the
   rotated column labels stop being readable long before that. It stays *correct* (the
   triangularity argument is unaffected), it stops being *glanceable*. The fix is real: the
   matrix is already a rollup, so roll it up once more — cluster by top-level subsystem, show a
   subsystem×subsystem matrix, and drill into one block. That is a change to the aggregation
   level, not to the idea, which is the main reason I chose a matrix over a graph.
2. **Eager rendering, around 300–400 nodes.** Every entry, every table, every SVG is built on
   load. At 500 nodes that is ~1500 entries and perhaps 12000 cross-links; first paint becomes
   seconds and the DOM gets heavy enough that the delegated hover handlers stutter. Fixes are
   ordinary: render container sections lazily on scroll or on spine click, and build the search
   index as plain data instead of walking the DOM.
3. **The containers spine, around 40 containers.** 11 twisties is a list; 90 is a scroll problem
   of its own and needs grouping by subsystem or a filter box.
4. **The single-page premise itself, somewhere past 1000 nodes.** At 500 the page is one long
   document you can Ctrl-F; at several thousand it wants to be a set of documents with a shared
   index, and "one self-contained file" stops being the right container.

What does *not* break: the per-container internal diagrams (they are scoped by construction and
grow in count, not in size), the crossing entries (they grow linearly and are grouped by
source), the touches grouping (it is what keeps a hub readable at any degree), and the search.

## Rules I held to

Every fact on the page is the model's. The connective tissue is: section headings, the field
captions ("Responsibilities", "Touches", "Realized by"), the definitions of node / connection /
flow / pattern, the colour key, the matrix reading instruction, and the "start here" sentence.
Derived-but-not-invented: the dependency ordering, the pure/bound/outside classification, the
rollup partition counts, the resolved code-ref paths, and the degree counts. Numbers quoted in
prose (the adapter row totals, the rule count) are computed at render time rather than typed,
so they cannot go stale against a changed model.

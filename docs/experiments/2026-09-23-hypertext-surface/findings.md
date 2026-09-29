# Findings — 2026-09-23

Three agents, same model, no contact with each other, three different structural stances.
The verdict on *which page reads best* is still open — nobody has looked at them yet (there is
no browser or screenshot tool in this environment; all three agents flagged this themselves).
What follows is what can be concluded without looking.

## 1. All three independently found the same structure in the data

Unprompted, and stated in three different vocabularies, every agent partitioned the 124
connections identically:

| | count | what it is |
|---|---|---|
| Container-level | **23** | of which 21 run module→module down the dependency ladder, 2 leave the system into the Minecraft clients |
| Component-level, crossing a module boundary | **73** | each claimed by exactly one container edge via `realizedBy` — no double-claims, no orphans |
| Component-level, internal to one module | **28** | claimed by none, which is *correct*: a container edge only describes traffic **leaving** the container |

The consequence: **the system's entire inter-module coupling is 23 numbers over 11 units, not
124 edges.** The canvas has been spending 124 edges to draw something that is really 23.

That framing of the 28 is B's, and it is the precise one. A and C both described the rollup as
"lossless", which is true of the 73 but glosses the intra-module remainder.

## 2. Two of three independently reached for the same instrument

A and C, with no contact and different stances, both built an **11×11 matrix** over the 9
containers + 2 external systems, topologically ordered so that every mark falls on one side of
the diagonal — rendering the System node's own rule (*"module dependencies point one way only;
nothing depends on an adapter"*) as a **shape**, with no prose. A puts the marks below the
diagonal, C above; identical fact, opposite convention. Both compute the triangularity check at
load rather than asserting it.

B did not build a matrix, but arrived at the same fact by another route — a computed six-band
dependency ladder, with 21 of 21 module edges verified as pointing downward at page load.

Two independent agents choosing the same device is the strongest signal this probe could have
produced: the matrix is not one agent's taste, it is what this model's structure affords.

## 3. All three converged on the same answer to "don't lose the reader"

Complaint #1 against the viewer was that navigating costs you your orientation. Every agent
solved it the same way, unprompted: **detail opens in place or in a drawer, never by replacing
the screen.** Peek-on-hover cards (A, C), a right-hand entity drawer with deep links and working
back/forward (B), expand-in-place with ancestor-opening and a back-trail (C). None of the three
built a page where following a link navigates away.

## 4. The model is thinner than the surface — a separate, actionable finding

Withholding repo access worked as intended. All three reported the same gaps, from the data
alone:

- **No node in the model is marked `foundational`** (zero of 49). All three built the mechanism;
  none could test it against real data.
- **All 124 connections have empty `description` and empty `codeRefs`.** Every agent reports its
  connection entries came out thinner than designed.
- **Only one node sets a `role`** (`Block Tables` → datastore).
- `dataTypes`, `requirements`, `decisions`, `views` are all empty.

This is a gap in the model (and possibly in the building skill that produces models), not in the
rendering, and it is worth acting on independently of which page wins.

## 5. Scaling: two of the three are mechanical, one is editorial

- **A** — breaks at the matrix, ~60–80 units; fix is one more level of rollup. Then eager
  rendering at ~300–400 nodes.
- **C** — block map breaks first at ~150 nodes; the matrix scales with *module* count, not node
  count, and survives to ~80 modules.
- **B** — nothing breaks mechanically; what breaks is **editorial**, at ~20 containers. B hand-wires
  its section structure with container names as string literals, so it is data-driven for content
  but **would not regenerate for a different model.**

B therefore cannot be the exporter design as built. Its *techniques* port fine; its spine does
not, unless a model records which flow is "the way in" — which is a plausible small schema
addition rather than a blocker.

## 6. Verification status

Each agent rendered its own page under jsdom: zero script errors, zero duplicate ids, model
re-parsed out of the inline JSON at 49/124/2/2, and all cross-links resolving (A: 1129, B: 878
plus every link inside all 173 drawers, C: 673). Independently re-checked from the parent
session: all three files contain **zero** external references — no `http(s)://`, no `<link>`, no
`src=`, no `@import`, no `fetch(`.

jsdom scripts but does not lay out. **Layout, contrast and the wider SVGs are unseen by anyone.**

## Open

Which page reads best, and whether this becomes a deterministic exporter (model → static HTML),
a new viewer mode, or nothing.

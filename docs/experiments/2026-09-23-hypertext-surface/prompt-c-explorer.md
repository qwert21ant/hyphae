# Prompt C — Explorer

Shared brief: [brief-shared.md](brief-shared.md) (pasted in full into the agent's prompt).

## Your stance: **overview first, then progressive disclosure**

Build the page that answers the complaint the canvas viewer could not: **the whole system is
never on screen at once.** Its centre of gravity is the **overview** — one screen that shows
every part of the system and how it is wired, from which the reader descends into detail
without ever losing their place.

The catch, and the whole difficulty of your stance: constraint 2 forbids a global node-link
diagram, because that is precisely what failed. So you must find another way to show
49 nodes and 124 connections at once. There are several — a dependency matrix, a grid of
containers each with its own miniature, a sortable adjacency table, an indented map with
degree bars, layered bands. Pick one you can defend, and defend it in your notes.

What that implies, as a starting point you are free to argue with:

- **Detail expands in place** wherever it can. Every navigation that replaces the screen
  costs the reader their orientation — that is the viewer's core failure, and reproducing it
  in HTML wins nothing.
- **The overview must carry real information, not just labels.** Size, degree, layer,
  `foundational`, how heavily two containers talk to each other — the reader should be able
  to see where the weight of the system sits before they click anything.
- **Cross-boundary connections are the interesting ones.** The model's own tooling filters on
  exactly this (`crossingBoundary`, `involvingExternal`). An overview that shows containment
  but not coupling has shown half the architecture.
- Interaction is allowed and encouraged — filtering, highlighting related entities, expanding
  a container in place. Keep it vanilla JS and keep it obvious; a control the reader has to
  discover is a control that does not exist.
- Make sure it is still **readable**, not just navigable. A reader who lands on one component
  needs its responsibilities and its edges in prose, not just a cell in a grid.

## Output paths

- `C:/projects/hyphae/docs/experiments/2026-09-23-hypertext-surface/results/c-explorer.html`
- `C:/projects/hyphae/docs/experiments/2026-09-23-hypertext-surface/results/c-explorer-notes.md`

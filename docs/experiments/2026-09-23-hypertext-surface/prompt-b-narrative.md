# Prompt B — Narrative

Shared brief: [brief-shared.md](brief-shared.md) (pasted in full into the agent's prompt).

## Your stance: **a guided read**

Build the page you would hand a new engineer on their first day. Its centre of gravity is
**reading order**: the page decides what the reader meets first, second, third, and each
thing arrives when there is already a reason to care about it.

The model contains two flows — *Walk to the marked block* at Component scope (13 steps) and
its Container-scope counterpart (9 steps). That is the system's spine: the single path that
traverses adapter, runtime, core, pathfinder and movement. Use it. Explaining a system by
walking one real request through it is usually the fastest way in.

What that implies, as a starting point you are free to argue with:

- **Open with the shape**, briefly — what Continuo is, the one architectural decision it is
  built around (the model says it plainly), the containers and how they stack. Then walk the
  flow, and let each step introduce the components it touches.
- **Entities get introduced, then linked.** The first time a node appears it is explained in
  place; later mentions are links back. The reader should never meet an unexplained name.
- A narrative still has to be **look-up-able afterwards** — day two, they want to find one
  component. Reading order and random access are both required; work out how they coexist.
- Not everything fits the narrative. 37 components and 124 connections will not all appear on
  the path. Decide deliberately what is on the spine, what hangs off it, and what is in the
  back matter — and make sure the back matter is still reachable and complete.
- The two **patterns** (both state machines, anchored at real nodes) are natural set pieces:
  a small scoped diagram earns its place there if anywhere.

Resist the pull toward a wall of prose. Constraint 4 in the brief is binding: representations
are mixed and chosen per thing. A narrative page is still hypertext, not an essay.

## Output paths

- `C:/projects/hyphae/docs/experiments/2026-09-23-hypertext-surface/results/b-narrative.html`
- `C:/projects/hyphae/docs/experiments/2026-09-23-hypertext-surface/results/b-narrative-notes.md`

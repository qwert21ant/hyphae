# Prompt A — Reference

Shared brief: [brief-shared.md](brief-shared.md) (pasted in full into the agent's prompt).

## Your stance: **a reference work**

Build the page an engineer keeps open in a tab for a week. Its centre of gravity is the
**entity**: every node, connection, flow and pattern has a definitive place on the page where
everything known about it is gathered, and every mention of it anywhere else points there.

Think API reference, man page, well-made wiki. What that implies, as a starting point you
are free to argue with:

- A **persistent way to get anywhere** — the containment tree is the natural spine, but a
  49-item sidebar is not automatically the answer; consider what a reader actually reaches
  for. Instant filter/search over every entity is table stakes.
- **Density is a feature, not a flaw.** A reference that makes you scroll to learn one fact
  has failed. Tables, chips, tight vertical rhythm.
- A node's entry should answer, without scrolling: what it is, where it sits, what it is
  responsible for, what it touches (both directions, with the connection's label — the label
  is the meaning of the edge and must never be dropped), and where the code is.
- **Connections deserve real treatment**, not just a list under each endpoint. 124 of them
  carry most of the actual architecture. Think about how a reader asks "what crosses this
  boundary?" and answer it.
- `foundational` nodes and high-degree hubs are where a reference usually collapses into
  noise. Solve that explicitly.

Do not let it become 49 identical sections stacked vertically — constraint 4 in the brief.
A reference still needs an orientation surface at the top that gets a newcomer to the shape
of the system before they start looking things up.

## Output paths

- `C:/projects/hyphae/docs/experiments/2026-09-23-hypertext-surface/results/a-reference.html`
- `C:/projects/hyphae/docs/experiments/2026-09-23-hypertext-surface/results/a-reference-notes.md`

# Shared brief (identical in all three agent prompts)

## The task

Make the architecture described by a Hyphae model **legible as a single rich hypertext
page**. Your reader has never seen this system. They should understand its shape in about
ten minutes of reading, and afterwards be able to look any individual thing up quickly.

## The data

`C:/projects/hyphae/apps/server/hyphae.json` — a real, hand-built architecture model of a
Minecraft automation mod called **Continuo**. 49 nodes (3 Context / 9 Container / 37
Component), 124 connections, 2 flows, 2 patterns. **Read it first, in full.** It is ~135KB.

The shape of the data is defined by the Zod schema in `C:/projects/hyphae/packages/schema/src/`
— read `node.ts`, `connection.ts`, `flow.ts`, `pattern.ts`, `model.ts`, `profile.ts`, and the
active profile under `profiles/`. Notes on what the fields mean:

- Nodes form a **containment tree** via `parentId`, across three C4 layers
  (`type`: System / Container / Component / ExternalSystem / Actor).
- `role` is a profile-defined archetype (service, datastore, queue, …). It may be null.
- `foundational: true` marks infrastructure the rest of the model leans on — a composition
  root, a settings store. These are high-degree and drown a diagram; the canvas viewer
  shelves them.
- `fields` is a profile-validated bag of domain fields — `responsibilities`, `rules`, and so
  on. Which fields are legal for which node kind comes from the profile.
- `root`, `codeRefs`, `docRefs` anchor a node to real files.
- A **connection** carries a `label` — one free-text phrase saying what the edge does — plus
  an optional longer `description`. `realizedBy` on a higher-layer connection claims the
  component-level edges beneath it.
- A **flow** is an ordered list of steps; each step names `from`/`to` node ids and optionally
  a connection `via`.
- A **pattern** describes a shape anchored at a node (`anchor`); its members bind `nodeId` or
  `ref` or neither. `kind` is e.g. `state-machine` or `pipeline`.

**Everything on the page comes from the model.** Do not invent architecture, do not infer
facts from the name of the mod, do not consult the internet. If a field is empty, it renders
as nothing — a thin node should *look* thin. You may write connective tissue (section
headings, a one-line explanation of what a "flow" is), but never new facts about Continuo.

## Hard constraints

1. **One self-contained `.html` file.** Inline the model data, the CSS and the JS. It must
   work opened from `file://` with **no network access at all** — no CDN, no web fonts, no
   `fetch`. Vanilla JS; no framework, no build step.
2. **No single global node-link diagram.** A whole-graph box-and-arrow drawing is the thing
   that failed. Small, *scoped* visuals are welcome — a container's internals, a flow's
   sequence, a pattern's states — where the visual genuinely beats text.
3. **Entities are first-class and linkable.** Every reference to a node, connection, flow or
   pattern anywhere on the page should be a live cross-link to that thing's own place, and
   getting there should not lose the reader.
4. **Mixed representations, chosen per thing.** A table where a table fits, a list where a
   list fits, prose where prose fits, a small diagram where one earns its place. A page that
   is one long uniform list of 49 sections has failed the brief just as surely as one big
   diagram has.
5. **Use shape, colour and tags to carry meaning** — layer, kind, role, the `foundational`
   mark. Be deliberate: a distinction worth drawing is worth drawing consistently.
6. **It must work at 49 nodes and at 500.** Say in your notes what breaks first if the model
   were ten times the size.
7. Must be readable on a laptop screen. Dark or light, your call — pick one and commit.

## Deliverables

Write exactly two files, both paths given in your specific prompt:

- the HTML page
- a short `.md` rationale: the information architecture you chose and why, what you tried
  that did not work, what you would do with another hour, and the scaling answer from
  constraint 6. Be honest about weaknesses — this is a probe, not a pitch.

Do not modify anything else in the repository. Do not run the project's build or tests. Do
not commit.

A `frontend-design` skill is available in this environment and is worth invoking before you
write the page.

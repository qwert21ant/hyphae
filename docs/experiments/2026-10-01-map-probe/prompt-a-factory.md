# Variant A — Factory floor

Target repo: `<REPO>` · Output directory: `<OUT>`

The shared brief ([brief-shared.md](brief-shared.md)) is appended below this prompt when it is
launched; everything in it applies. This file adds your stance.

## Your stance: the project as one factory floor

The home screen is a **floor** — the whole project in one picture:

- **Inputs at the edges** — who or what feeds the system: people, other systems, schedules,
  files, the game, the network.
- **Machines** — the jobs the project does, named by what they do. A machine takes things in and
  puts things out.
- **Belts** — the things that move between machines: requests, orders, paths, events, commands.
  A belt is labelled with *what it carries*, not with a verb about code. Direction is visible.
- **Outputs at the edges** — what leaves the system, and where it goes.

Two views hang off the floor, and all three are linked — selecting something in one highlights it
in the others:

- **Use-case board** — every use case, with its status (works / partial / planned). Each use case
  is a **route**: choosing it lights up its machines and belts on the floor, in order, and dims
  the rest.
- **Things map** — what the belts carry and what is stored: the project's nouns, how they relate,
  and what states they go through.

## Scaling: districts, zoom in place, stable positions

At most about 7–12 machines are visible on the floor at rest. When the project has more:

- Group machines into **districts**. Zoomed out, a district is one labelled area and only the
  main belts between districts show — like a city map with neighbourhoods and highways.
- **Detail appears in place when zooming in**: a district shows its machines, a machine can show
  the smaller machines inside it. Nothing opens a new screen. A selected route stays drawn at every
  zoom level.
- **Positions are stable.** The layout is stored in `map.json` (a position per element) and the
  page draws from it — no layout that reshuffles on reload. The reader should be able to learn
  where things are and find them there next time.

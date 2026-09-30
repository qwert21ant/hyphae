# Variant B — Use cases first

Target repo: `<REPO>` · Output directory: `<OUT>`

The shared brief ([brief-shared.md](brief-shared.md)) is appended below this prompt when it is
launched; everything in it applies. This file adds your stance.

## Your stance: start from what people can do with it

The home screen is a **use-case board**:

- **Who** uses the project or feeds it — people, other systems, schedules.
- **What they can do** with it — every use case, grouped into a handful of groups, each with its
  status (works / partial / planned) visible at a glance.
- Enough shape that the board itself is a picture: the reader should see from the board alone
  how big the project is, where most of it lives, and what is unfinished.

## One floor per group of use cases

Each group opens its own **floor**: a flow picture of that group's use cases.

- **Parts** on a floor are jobs, named by what they do. Between them, **what moves** — requests,
  orders, paths, events — labelled with what it carries. Direction is visible.
- A use case on a floor is a **route**: choosing it lights up its steps in order.
- **Parts shared between floors are marked as shared** and say where else they appear; following
  that mark takes the reader to the same part on the other floor.
- Moving between the board and the floors never loses the reader's place.

A reader should be able to go board → floor → part → its code, and back, in a few clicks.

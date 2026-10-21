# Experiment — a project map built from scratch, rated by a strict test

**Date:** 2026-10-01 · **Status:** round 1 built (six maps, both question sets); rating not started

## Why

The 2026-09-23 hypertext experiment ([../2026-09-23-hypertext-surface/](../2026-09-23-hypertext-surface/))
did not help. Asked what was wrong, the owner answered: **the content is wrong, and it is a wall
of text.** It showed modules and their dependencies, named after code, in formatted prose. What
was wanted was what the project *does* and how an action moves through it, as a picture.

The diagnosis behind this round:

1. **The Hyphae model answers the wrong question first.** It describes what the code is made of
   (C4 containers and components, named after code) — the third question a newcomer asks, not the
   first. The axes a newcomer needs were empty or thin in the Continuo model: no actor at all (the
   player does not appear), one use case, no data entities, no requirements or decisions. Its one
   flow starts at `Mod Entrypoint → Path Probe`.
2. **It is a summary of the code, written after the code.** That makes it a lossy copy, not a
   thing to think in — and it is why "edit the diagram, the agent changes the code" never started:
   nothing in the model is a decision the code could follow.

So this round **does not use the Hyphae model at all.** Each map is built by an agent from the
target repository alone.

## What the map is for

In the owner's priority order:

1. **Understand what is going on in a vibe-coded project** — code an agent wrote and the owner
   never fully read.
2. **Tell the agent what to do** through the map (steering). Tested in round 2, not here.
3. Map someone else's project.

The feel wanted (the owner's "Factorio vibe", meant as a feel, not a spec): *I can see a lot on
one screen, and it is structured and clear.*

## The design being tested

Agreed before any map exists, and still open to being overturned by the results:

- **The home screen is a factory floor.** Inputs at the edges (who or what feeds the system),
  **machines = jobs, named by what they do in the project's own language** (not by code module —
  one machine may span several modules, and one module may serve several machines), **belts = the
  things that move** between machines, outputs at the edges.
- **Secondary views, linked to the floor:** a **use-case board** (the use cases, each a *route*
  across the floor) and a **things map** (what the belts carry, and how those things relate).
  Selecting something in one view highlights it in the others.
- **Scaling** is not decided. The candidate is one continuous map with **districts**, detail that
  appears **in place on zoom**, and **stable positions** so the map can be learned once and survive
  changes. The alternative is several floors, one per group of use cases. Round 1 tests both.

## Round 1

### Subjects

| Project | Path | Why |
|---|---|---|
| **Continuo** | `/mnt/c/projects/continuo` | Java, algorithmic, vibe-coded; the owner does not know its internals. The main subject. |
| **Dispatcher** | `~/projects/Dispatcher` | TypeScript, a business process (orders scraped from platforms, published, notified). Hand-written and known to the owner, so it is mostly a **correctness** check. |

The **exam** comes after round 1: the owner's large vibe-coded work repos (krafteq), for the one or
two approaches that survive. Not cloned yet. A Linux kernel subsystem is parked as a stretch test.

### Three variants per project

Each is built end to end (content *and* drawing) by one agent that sees only the target repo.

| Variant | Stance | Prompt |
|---|---|---|
| **A — Factory floor** | The design above, with districts + zoom + stable positions for scale | [prompt-a-factory.md](prompt-a-factory.md) |
| **B — Use cases first** | The use-case board is home; each group of use cases gets its own floor | [prompt-b-usecases.md](prompt-b-usecases.md) |
| **C — Wildcard** | Same goal and rules; the agent picks the representation | [prompt-c-wildcard.md](prompt-c-wildcard.md) |

The shared half of every prompt is [brief-shared.md](brief-shared.md). Its hard rules: labels of
about five words, anything longer only on hover or click, the home screen fits one laptop screen,
every claim backed by code, and **the agent screenshots its own map and iterates** (possible since
2026-10-01 via headless Windows Chrome — the last experiment's layout was seen by nobody).

Each variant also writes its content as `map.json`, so when a variant wins it is possible to tell
whether its **content** or its **drawing** won, and to redraw good content another way.

### The test

A strict, timed test — not "rate by feel", which lets a pretty map beat a useful one.

- **Questions.** A separate agent per project ([prompt-questions.md](prompt-questions.md)) reads
  the repo and writes **24 questions** — three for each of eight themes — each with an answer key
  and the code that proves it. It never builds a map.
- **Themes:** purpose and users · features (and what is half-done or planned) · a flow · things and
  state · boundaries · rules and decisions · failure · change location ("to make it do Y, what
  changes?" — a first taste of steering).
- **Sealed.** Questions and keys live in `~/map-probe-keys/<project>/`, outside every repo the
  builders touch. The builders never see the questions or the themes.
- **No repeats.** The 24 are split into three sets of eight (one per theme). Each map gets one set.
- **Rotated order**, so no variant is always seen first (the owner learns the project as they go):

  | Project | 1st map (set 1) | 2nd map (set 2) | 3rd map (set 3) |
  |---|---|---|---|
  | Continuo | A | B | C |
  | Dispatcher | C | A | B |

- **Answering.** Only the map; no code, no docs. A timer. One sheet per map
  ([answer-sheet-template.md](answer-sheet-template.md)), in `ratings/`. "Not found on the map" is
  a valid answer and a data point.
- **Grading.** An agent ([prompt-grader.md](prompt-grader.md)) marks each answer against the key.
  For Dispatcher, the owner may overrule the key — they know the project better than the agent.
- **Head-to-head.** After a project's three maps: *which would you open tomorrow, and why?*

**Scores per map:** answers correct (primary) · minutes taken · a 1–5 "would I open it again".
The head-to-head breaks ties. Known bias that remains: one reader, two projects, learning between
maps. The exam is the real tiebreaker.

### Procedure

1. Run the two question writers (parallel) → `~/map-probe-keys/{continuo,dispatcher}/`.
2. Run the six builders (parallel) → `results/<project>/<variant>/`. Each builder's prompt is its
   stance file with `<REPO>` and `<OUT>` filled in, followed by the full text of
   `brief-shared.md` — pasted, not linked, since builders may read nothing outside the target
   repo (this folder included: it names the test themes).
3. The parent session checks each output mechanically — files present, `map.json` parses, no
   network references, screenshots exist and were looked at — and **does not judge quality**.
4. Prepare the six answer sheets in `ratings/` with their question set filled in.
5. The owner rates, in the order above.
6. Grade; write `findings.md`; copy the keys into this folder.

## Afterwards

- **Round 2 — steering.** A new project built map-first in the winning format: sketch the map,
  the agent writes the code, change the map, the agent changes the code. The measure is whether map
  and code still agree after several changes.
- **Hyphae itself** (the C4 schema and the canvas viewer) is paused, not deleted. Whether the
  winning format replaces its schema or becomes a new repo is decided after round 2.

## Round 1 — what was built

All six maps were built on 2026-10-01 from Continuo `a2142f1` and Dispatcher `db051fa`, and all
passed the mechanical check. Each `results/<project>/<variant>/` holds `map.html`, `map.json` and
`notes.md`. The builders' screenshots (`shots/`, ~20 MB) are **not committed**; regenerate one with
the command in [brief-shared.md](brief-shared.md). Answer sheets are in `ratings/`; the question
keys stay sealed in `~/map-probe-keys/` until rating is done.

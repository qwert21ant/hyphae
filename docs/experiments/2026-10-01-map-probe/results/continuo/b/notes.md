# Variant B notes: use cases first

Target: `/mnt/c/projects/continuo` at `a2142f1` (2026-09-04). Only git-tracked files were read;
nothing was built or run.

## Information architecture

- **Board (home, `#board`)**: seven floors as rows. Each row is a big floor number, the group's
  name, a status bar, the use cases as tiles (fill = status, right-hand icon = who), and a
  "lines behind it" bar. Above: a *Who* strip that filters the tiles. Below: an *Always holds*
  strip of 16 rules (solid lock = build or tests enforce it, dashed lock = convention only).
- **Floor (`#floor/<id>`)**: a flow picture on a 3 or 4 column grid. Parts are jobs; arrows point
  the way the labelled thing travels. People sit on a strip along the top, the game on a strip
  down the left, so "who touches the game" is a column, not a legend entry.
- **Route (`#floor/<id>/uc/<id>`)**: the use case's arrows are numbered in order and everything
  else is dimmed; the side panel lists the same steps in words.
- **Part (`.../part/<id>`)**: the side panel shows what it does, the evidence for its status,
  *Change it here* (named constants with file and line), code, known gaps, where the docs
  disagree with the code, rules that hold there, what comes in and goes out, tests.
- **Shared parts**: a stacked shadow plus small floor-number chips on the box; a chip jumps to
  the same part on that floor (`#floor/<other>/part/<id>`).
- **Back to the board** keeps the place: the crumb goes to `#board/uc/<id>` (tile ringed,
  popover pinned) or `#board/floor/<id>` (row marked).

Why: the reader's first question is "what can I do with it and does it work", so status lives
on the home screen per use case. Rules got their own strip because "what must always hold" is
not a use case and would otherwise only be found by opening parts. Constants are listed per part
because "where would I change this" is nearly always a number in this project.

Status vocabulary: `works` = built with evidence in the repo (tests or a recorded in-game run);
`partial` = built with a stated gap; `planned` = roadmap only. The headline finding the board
shows: floor 1 is almost all `partial`, because the walker (D2) is merged and unit-tested but the
repo's own checklist says steps 13-22 have never been run in a game.

## What I tried that did not work

- A part and a floor shared the id `walk`; the lookup table silently kept one and every
  `#floor/walk` hash fell back to the board. The build script now rejects duplicate ids.
- Actors as a left column with connectors to tiles: no room, and the lines said less than a
  filter. Became the *Who* strip.
- A "Builds every module" hub wired to every check did not lay out (lines through boxes). Split
  into build, a tests hub, and one guard part holding three build checks.
- "Names each step of the path" as a part would not place without crossings; it is now a thing
  that moves ("Path with named steps") plus a rule ("Every step has one name").
- A planned "Mixin hooks" part had no honest arrow to draw (its first intended use was dissolved
  in D1), so it is a gap on "Plugs into the game" instead.
- Arrow labels in the 96 px column gaps overlapped the boxes; they now wrap and take the gap
  width. Opposite-direction arrow pairs crossed until both ends used the same port order.
  Step-number badges inside labels re-wrapped them; badges are now pinned to the label corner.
- Five-word use-case names did not fit five tiles across; names were cut to about 24 characters.
- "Lines behind it" first used the first-listed floor as a part's home and made floor 4 look
  nearly empty; homes were reassigned. Floor 6 still dwarfs the rest because test code and
  recorded terrain count there (19k lines against about 11k of main code). That is true, but the
  bar says "lines in linked files", not "importance".

## What I could not verify

Interaction (headless screenshots only, by hash):
- Hover popovers and their 160 ms grace timer, Escape to close, the light-up animation on route
  change, keyboard focus order.
- That `file:///C:/projects/continuo/...` code links open from wherever the page is opened.
- Any viewport other than 1440x900; any machine without the Bahnschrift font (labels would be
  wider and tiles would truncate with an ellipsis).

Content:
- Every "seen in game" claim rests on the repo's own records (smoke checklist, D1 and C5 specs,
  roadmap). I ran nothing.
- CI's run history is not in the repo; "Runs every check on push" is `works` on the strength of
  the workflow file alone.
- Routes are my reading of the code, simplified: one arrow per thing that moves, request and
  answer collapsed into the answer's direction. Step order inside one tick is approximate where
  the code interleaves (for example search slice, then re-anchor, then drive).
- Floor 7 is drawn from the roadmap and the architecture doc; its arrows are intent, not design.
- "Sprint and jump gaps" and "Account for slippery ice" are marked `planned` because the specs
  list them as carried forward, not because a milestone promises them.
- Test counts come from counting `@Test` in tracked sources (592), not from a test run.
- Machine-checked by the generator: every code path is tracked by git, every constant's token is
  on its stated line, ids are unique, every route step is a real arrow on that floor.

Where the code contradicts the docs (code wins; shown on the parts concerned): the architecture
doc's game events, player state, capability negotiation, background-thread search and
per-movement executors are not what was built; the price table says the walker sprints and it
does not.

## What breaks first at ten times the size

1. **The board's tile grid.** 70 tiles fill it; 700 will not fit one screen, and short names
   stop being unique. Fix: rows become status bars with counts, and a floor opens a sub-board of
   sub-groups before any flow picture.
2. **Hand-placed floors.** I placed 75 boxes by hand and nudged labels after looking at
   screenshots. At 100+ parts per floor that fails: straight arrows cross, labels collide, and
   shared parts carry a dozen floor chips. Fix: sub-floors ("rooms") capped at about twelve
   parts, or a layered auto-layout with routed arrows.
3. **Hand-written routes.** 70 routes of about six steps each were written and checked by
   reading code. That is the real bottleneck and the first place errors would hide. Fix: derive
   candidate routes from tests or call traces and keep the hand step for naming only.
4. **One flat rule strip.** 16 rules fit two lines; 160 need grouping by what enforces them.

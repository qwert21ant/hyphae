# Dispatcher map, variant B (use cases first) — notes

Read at commit `db051fa` of `/home/qwert21/projects/Dispatcher`, tracked files only. Nothing was built or run.

## Information architecture, and why

- **Board (home).** Four bands, one per group of use cases, each band a row of tiles. 41 use cases:
  catch new offers (7), steer the workers (8), collect the booked schedule (4 + 12 per-platform
  reads), run it on a server (10). Left column: the six actors (who uses, feeds, starts, receives).
  - Size and weight are drawn, not written: a bar per band shows how many lines of code its parts own
    (each tracked file counted once), the 12 platform reads are small chips so floor 3 visibly "is
    twelve of the same thing", and unfinished tiles are hatched / dashed / dotted.
  - A tile click pins a card (summary, who, steps, one button to the floor). A band head goes
    straight to the floor.
- **Floor.** One flow picture per group. Left rail lists the floor's use cases; picking one lights
  its steps in yellow with numbers, and each step can be focused for a one-paragraph explanation
  (click or arrow keys). Parts open a drawer on the right with: what it does, what must hold,
  where to change it, things to watch out for, its code paths.
- **Three shapes, one hue per floor, one colour for "lit".** Pill = outside the apps, card = a job,
  ticket = something stored or passed on. Hue only says which floor. Yellow only says "on the
  selected route". Status is a fill pattern, never a hue.
- **Shared parts** carry numbered tabs in the other floors' hues; a tab jumps to the same part on
  that floor with its drawer open. 11 elements live on more than one floor (five jobs and things, six actors and platforms).
- **Links have two loudness levels.** What moves is always drawn. Actions back onto a platform,
  replies to the chat, and "leans on" relations are drawn only while a route that uses them is lit
  or one of their ends is selected. Without this, floor 1 was unreadable.
- Everything is in the hash: `#board`, `#board/uc/<id>`, `#board/who/<actor>`, `#board/at/<floor>`,
  `#floor/<floor>[/route/<id>[/step/<n>]][/part/<id>]`. "Back to the board" returns to the tile you
  left from.

Why this shape: the reader's first question is "what can I do with it and does it work", which a
tile board answers without any arrows. The flow picture only appears once a group is chosen, so
it never has to carry more than ~20 nodes.

## What I tried that did not work

- Edge labels centred in the gap between neighbouring columns: clipped by the nodes. Now they wrap
  to the gap width, and lit labels on short edges sit above the line.
- Drawing every return arrow (accept → platform, reply → chat) all the time: spaghetti. They became
  the "quiet" links above, routed in explicit lanes over or under the row.
- A curve from each of the 12 platform chips to "reads booked transfers": it ran across the other
  chips. All twelve now share one trunk; the chip itself lights up.
- Monitoring edges from both apps and Chrome into one node crossed the Chrome box; one of the
  three is quiet now.
- Positioning the pinned card from measured viewport coordinates: wrong after a resize. It is now
  anchored to its tile in CSS.
- A fade-in on the lit route froze at frame 0 in headless screenshots when a resize re-rendered
  the page; resize-triggered renders skip the animation.
- First cut attributed shared files to whichever element listed them first, which put the manage
  bot's 245 lines on floor 1. Jobs now claim files before actors, with four explicit overrides.

## What I could not verify

Interaction (screenshots cannot hover, click or type):
- hover states and native tooltips (every tile, node and tab has a `title` with its summary);
- clicks as such — every state I looked at was reached by hash, which is the same code path;
- Esc / arrow keys, the "Its code" jump button in the drawer, the canvas sliding when the drawer
  would cover the selected part (seen only in its end state), the step-by-step reveal animation;
- any viewport other than 1440×900.

Content:
- **"works" means the path is complete in the code with no stub markers. Nothing was run.**
- The shared package `@qwert21ant/dispatcher-commons` is not in the repo. Unverified because of
  that: exact retry semantics of `tryPerform`, what the stand-in `LoggerEx` does with screenshots,
  whether the base Telegram bot filters button presses by chat, whether anything serves `/health`.
- The config files are git-ignored, so which workers and platforms are actually configured is
  unknown. "Three Transfeero workers" is inferred from the three Chrome containers in the compose
  files. "12 platforms" is what the code can read, not what is switched on.
- `/reboot_host` runs `reboot` inside the app; the shipped app runs in a container. Marked `unknown`.
- How built images reach the private registry: no tracked script pushes. Marked on the link.
- Two "watch out" items are findings from reading, flagged as such on the map: order formatting
  shifts `pickupDate` in place before the same objects are published (dispatcher), and the schedule
  message shifts pickup times inside the cached schedule (consolidator).

Where the code contradicts the docs (code wins, shown on "Builds the app images"):
- README describes `packages/launcher`, `packages/consolidator` and lerna; the code is
  `apps/dispatcher`, `apps/consolidator` and pnpm.
- README says `bundle-dispatcher` builds, bundles and pushes; the root script calls `npm run build`,
  which the root `package.json` does not define, and nothing pushes.

## What breaks first at ten times the size

1. **The board.** 41 tiles fit; 400 will not. Band heights are equal and tiles are fixed-size, so
   the home screen would scroll or shrink below legibility. Fix: a second level — bands show one
   status dot per use case (the way the 12 platform reads are chips today) and expand in place;
   groups of groups above that.
2. **Hand placement.** Every node position and every lane on the four floors was placed by hand and
   tuned from screenshots. That took several screenshot rounds per floor and does not survive a floor
   with 60 parts. Fix: layered auto-layout seeded by route order, with the manual grid kept only as
   overrides; or show only the lit route's parts by default and the full floor on demand.
3. **Step notes.** 41 routes × ~6 steps were written and checked by hand against the code. At ten
   times that, they drift. Fix: keep each note next to the code path it describes and have the
   build fail when that path changes.
4. **The rail.** A floor with 80 use cases needs search or grouping, not a list.
5. **Shared tabs.** A part on six floors has five tabs; past three they should collapse into one
   "also on…" tab.

## How the files were made

`map.json` is the content. `map.html` is one hand-written template with that JSON inlined by a
throwaway script (which also checks that every code path is tracked and every route step exists).
The delivered page needs no build step and no network. `layout` in `map.json` holds drawing hints
only (grid positions, edge lanes); everything else is independent of the drawing.

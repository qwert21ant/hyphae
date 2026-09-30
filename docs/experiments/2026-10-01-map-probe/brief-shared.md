# Shared brief (identical in all three builder prompts)

## The task

Build a **map of one software project** for a reader who has never read its code — and does not
want to. The project was largely written by an AI agent; its owner uses it but does not know what
is inside. After some time with your map, the reader should understand **what the project does,
for whom, and how**: what happens when someone uses it, what moves between the parts, what
must always hold, and where they would have to change things to make it behave differently.

The feel to aim for: *I can see a lot on one screen, and it is structured and clear.*

## What failed before — do not rebuild either

1. **A code-structure map.** Boxes for modules and components named after the code, arrows for
   dependencies. The reader learned the code's layout, not what the project does. Names like
   `Core Lifecycle Seam` or `Path Probe` mean nothing to someone who has not read the code.
2. **A hypertext page of prose.** Formatted, cross-linked, and still a wall of text. The reader
   did not read it.

## Your input — and only your input

- The target repository, at the path given in your prompt. Read **only files tracked by git**
  (`git -C <repo> ls-files`). That rule excludes, on purpose, an untracked `.hyphae/` folder and
  `.mcp.json` (left over from an earlier, unrelated model of this project) and ignored secrets.
- You may read everything tracked, including the project's own docs, and run read-only commands
  (`git log`, `grep`, `find`). **Do not build or run the project** and do not modify it.
- Do not read anything outside the target repo: no other projects, no other folders in your home
  directory, no internet.

## The one content rule

**Name things by what they do, in the project's own domain language.** A part of your map is a
*job* ("plans a path", "publishes an order"), not a code unit. One part may span several
modules; one module may serve several parts. The code names belong in the detail, not on the map.

**Every part links to its code.** Each element records the files (or directories) that implement
it. The reader will use this to answer "where would I change this?".

**Nothing invented.** Every claim on the map must be backed by the code or the repo's docs. If
the code contradicts the docs, the code wins, and say so. Where you are unsure, leave it out or mark
it `unverified`. Where something is stubbed, half-done or only planned, show that — it is part of
what the reader needs.

## Hard rules for the page

1. **Labels are short** — about five words at most. Anything longer than one line appears only
   on hover or click (a popover or a drawer), never on the resting screen.
2. **The home screen fits a 1440×900 laptop screen** without scrolling, and reads as a picture,
   not a page. No paragraphs on it.
3. **Detail opens in place** — a drawer, a popover, zoom — and never loses the reader's place.
4. **Every view state is addressable by URL hash** (`map.html#...`), and the back button works.
   This is also how you screenshot a state other than the home screen.
5. **One self-contained file**, opened from `file://` with no network at all: CSS, JS and data
   inline, no CDN, no web fonts, no `fetch`. Vanilla JS; no framework, no build step.
6. **Shape, colour and position carry meaning deliberately.** A distinction worth drawing is worth
   drawing consistently. Pick a light or dark theme and commit to it.

## Look at what you built

You can take a real screenshot. Do it, look at the PNG with your Read tool, and fix what you see.
Iterate **at least twice** on the home screen, and check at least three other states by hash.

    CHROME="/mnt/c/Program Files/Google/Chrome/Application/chrome.exe"
    "$CHROME" --headless=new --disable-gpu --window-size=1440,900 \
      --screenshot="$(wslpath -w "$OUT")\\shots\\home.png" \
      "file:///$(wslpath -w "$OUT/map.html" | tr '\\' /)#<state>"

(`$OUT` is your output directory; it must be an absolute path. The screenshot captures one
viewport and runs your JS, but cannot hover or click — hence rule 4.) Keep the final screenshots
in `shots/`.

## Deliverables — write exactly these, all inside your output directory

- `map.html` — the page.
- `map.json` — the content of your map, independent of how it is drawn. At minimum:
  - `elements[]`: `{ id, kind, name, summary, code: [paths], status }` — `kind` is your own
    vocabulary (machine, actor, thing, district, …); `name` ≤ ~5 words; `summary` one sentence;
    `status` one of `works` / `partial` / `planned` / `unknown`.
  - `links[]`: `{ from, to, kind, label }` — what moves or what happens between two elements.
  - `routes[]`: `{ id, name, steps: [element or link ids, in order] }` — use cases or scenarios.
  - `repo`: `{ path, commit }` — the commit you read (`git rev-parse --short HEAD`).
  - Add any other fields you need.
- `notes.md` — short and honest:
  - the information architecture you chose, and why
  - what you tried that did not work
  - what you could not verify (hover, interaction, content you were unsure of)
  - **what breaks first on a project ten times this size**, and what you would do about it
- `shots/*.png` — the final screenshots you looked at.

Do not write anywhere else. Do not commit. A `frontend-design` skill is available and worth
invoking before you design the page.

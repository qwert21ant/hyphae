# Question writer

Target repo: `<REPO>` · Output directory: `~/map-probe-keys/<PROJECT>/`

## The task

Write a **test of understanding** for one software project. Someone who has never read its code
will study a map of it — a diagram, not the code — and then answer your questions from the map
alone. Their answers are graded against your key. The scores decide which kind of map is best, so
the test has to measure **understanding of what the project does and how**, not recall of names.

You never see the maps and must not guess what they will contain. Write the questions a person
who truly understands this project could answer, and one who does not, could not.

## Your input

The target repository only. Read **only files tracked by git** (`git -C <repo> ls-files`) — that
excludes an untracked `.hyphae/` folder and ignored secrets on purpose. You may read everything
tracked, including docs, and run read-only commands. Do not build or run the project, do not modify
it, and do not read anything outside it. If the code and the docs disagree, the code wins.

## The eight themes — three questions each, 24 in total

| # | Theme | What it probes |
|---|---|---|
| 1 | Purpose and users | Who or what uses it, and what for |
| 2 | Features | What it can do; what is half-done, stubbed or only planned |
| 3 | A flow | When X happens, what happens, step by step |
| 4 | Things and state | What moves between the steps; what is stored; what states it goes through |
| 5 | Boundaries | What it talks to outside itself, and in which direction |
| 6 | Rules and decisions | What must always hold; which design choice shapes everything else |
| 7 | Failure | What happens when something fails, times out or is missing |
| 8 | Change location | "To make it do Y, which part changes, and what else is affected?" |

## Rules for a good question

- **Behaviour, not identifiers.** Ask what the project does, not what a class is called. Grade on
  meaning: a correct answer in the reader's own words must count.
- **Checkable.** Each answer is a short list of **key points**. Say how many are needed for
  *correct* and for *partial*.
- **True today.** Every answer is proven by the code at the current commit, with evidence as
  `path:line`. Where docs describe something the code does not do, that gap can itself be a question
  (theme 2).
- **Theme 8 is graded on area, not on file names.** "The part that plans paths — its cost for
  moving across a block" is correct; exact paths are a bonus, not required. Still list the real
  files in the evidence.
- **Spread and balance.** Cover the whole project, not the part you read first. Within each theme,
  make one question easy, one medium, one hard.
- **Independent.** No question should give away another's answer — the three sets are shown to the
  reader on different maps, and a question from one set must not answer one in another.

## Deliverables — write exactly these two files

`questions.md` — questions only, no answers, grouped into three sets. Each set has one question
per theme (8 questions). Spread each theme's easy, medium and hard question across the three sets
so that every set gets a mix and no set is harder overall than another:

    ## Set 1
    1. [Purpose] …
    2. [Features] …
    …
    8. [Change] …
    ## Set 2
    …

`key.md` — for every question, keyed the same way (`S1.1` … `S3.8`):

    ### S1.3 — [Flow] <the question>
    **Difficulty:** medium
    **Key points:** (a) … (b) … (c) …
    **Correct:** all of (a)–(c) · **Partial:** any two
    **Evidence:** `path/File.java:120`, `path/Other.java:44`
    **Notes for the grader:** acceptable wordings, common wrong answers.

Also record the commit you read at the top of `key.md` (`git rev-parse --short HEAD`).

Do not write anywhere else. Do not commit.

# Model legibility: earned edges, free-text labels, foundational nodes

**Date:** 2026-08-12
**Branch:** `feat/model-legibility`
**Status:** agreed, ready to plan

## The problem

The Baritone model was unreadable, and every previous attempt fixed it in the renderer. Hub quieting
was designed, built and deleted (`a0574b3`) because "re-encoding an edge as a chip on the other
endpoint traded one kind of noise for another". The edge router shipped and the verdict was "it
looks more structurized in squared mode" but "it doesn't help much with density". Rendering has been
pushed as far as it goes at this edge count.

A census of the model showed why. **112 nodes, 411 connections, median node degree 7.**

1. **It was never a hub problem.** `Settings` — the canonical example — carried 16 edges, 4% of the
   model. The top five hubs together accounted for 29%. Thirty nodes had degree ≥ 10 and twenty-one
   had ≥ 6 distinct inbound sources. There was no small set of nodes to quiet, which is exactly why
   an automatic degree threshold guessed wrong.
2. **The same relationship was drawn 4.5× over.** 281 of 411 edges crossed a container boundary, and
   they collapsed into 63 container→container pairs: 26 edges for *Utilities & Schematics → Process
   Layer*, 15 for *Command System → Baritone API*. `Process Layer` had 7 internal edges against 106
   crossing ones.
3. **Half the edges used a verb that says nothing.** `invokes` (108) + `uses` (99) = 50%, and **79%
   of all connections had no description at all** (326 of 411). Of Process Layer's 106 crossing
   edges, zero were described.
4. **The `object` slot frequently restated an endpoint's name.** All 24 of `Baritone`'s outbound
   edges read `triggers / <name> process → <Name>Process` — twenty-four edges encoding one fact that
   is already the first sentence of `Baritone`'s own description.
5. **The aggregation machinery already existed and was 100% unused.** `realizedBy`, `codeRefs` and
   `fields` were empty on all 411 connections.

The model was a component-level graph being asked to do a container-level job.

## The rule

> **An edge earns its place by saying something a reader cannot infer from the two node names.**

Containment already implies that things inside a container depend on each other. A bare `uses`,
`invokes` or `reads` with a generic object adds nothing on top of that; an `object` that paraphrases
the target's name adds less than nothing, because it looks like information.

Everything below is that one sentence applied at three levels: to the existing edges, to what an
edge is allowed to carry, and to the nodes that attract edges by their nature.

## Part 1 — the cut (done)

Deleted every connection matching `no description AND verb ∈ {uses, invokes, reads}` — **231
connections, 411 → 180**, via `delete_connections`. `validate_model` clean afterwards, and the
predicate is now idempotent.

Measured effect (drawn edges per focus, by a proxy that counts each child↔external pair rather than
collapsing them into the viewer's ghost, so it reads roughly a third high):

| focus | before | after |
|---|---|---|
| Baritone API | 113 | 24 |
| Process Layer | 113 | 40 |
| Utilities & Schematics | 107 | 28 |
| Command System | 70 | 34 |
| Core Runtime | 69 | 36 |
| Pathing Engine | 57 | 25 |
| Behavior Layer | 50 | 18 |
| World Cache | 39 | 23 |
| Mixin Launch Layer | 41 | 20 |

Survivors: 85 described, 95 with a specific verb (`triggers` 43, `queries` 20, `modifies` 18,
`aggregates` 13, `publishes`/`subscribes` 14, `writes` 9).

The 231 deleted connections were dumped to a scratchpad file before deletion. **15 of them — the
`Settings` fan — were then restored**, because Part 3 needs those relationships to exist as data.
The model now stands at **195 connections**, `Settings` back at degree 16.

`Baritone`'s 24 composition-root edges were **kept** for the same reason. They are worthless as
*labels* but true as *facts*, and Part 3 turns them into a single mark instead of 24 lines.

**The model file is untracked and git is not a safety net for it.** Any further bulk edit dumps the
affected connections to a file first.

## Part 2 — `verb` + `object` become one `label`

### What changes

`ConnectionSchema` loses `verb` and `object` and gains `label: z.string().default('')`. The label is
free text, it is the only thing drawn on an edge, and it is expected to carry the whole point of the
edge. `description` survives as the optional long form for the inspector.

The `object` slot was meant to become a `DataEntity` reference in a later phase. That phase is
abandoned — the field never carried enough to justify it, and 73 of the surviving 180 objects merely
echoed an endpoint name.

### What this costs, explicitly

`verb` is load-bearing well beyond the edge label. Removing it removes:

- `core/verbColors.ts`'s `VERB_CLASS_COLOR` and the five `--verb-*` tokens. `LAYER_COLOR` and
  `layerColorOf` live in the same module and **stay** — they are read by the inspector and the
  canvas overlays.
- The `Legend`'s verb section and the `FilterPanel`'s verb-class filter axis, plus the corresponding
  slice of `state/store.ts`.
- `list_connections`' `verb` and `verbClass` filters, the verb vocabulary in
  `profiles/c4-backend.ts`, the `unknown-verb` issue kind in `validate.ts`, and the verbs section of
  `describe_profile`.
- Verb handling in `core/focusView/*`, `features/canvas/patternView.ts`,
  `features/canvas/reactflow.ts`, `features/inspector/ConnectionList.tsx` and `SidePanel.tsx`.

`test/styles/tokens.test.ts` fails on a token declared in `:root` and never referenced, so the
`--verb-*` tokens must be **deleted from both themes**, not merely left unused. Any of the 33 pairs
in `contrast.test.ts` that names a verb token goes with them.

This leaves the chromatic budget empty. That is an accepted outcome, not an opportunity: per
`docs/SPEC.md` §9 hue must mean something or not exist, and no new hue meaning is introduced here.

### Migration

Zod strips unknown keys, so a model file written before this change would load with every label
blank and 195 labels would be silently destroyed. `ConnectionSchema` therefore gets a **preprocess
shim**: when `label` is absent and legacy `verb`/`object` are present, compose
`label = [verb, object].filter(Boolean).join(' ')`. This mirrors the precedent already in the file —
`verb` defaults to `'uses'` specifically "so a model written before verbs existed still parses".

The shim produces mediocre labels (`"triggers mine process"`). Improving them is model work for a
later round, not part of this change; it is deliberately not blocking.

The living docs — `README.md`, `docs/MODEL.md`, `docs/SPEC.md` §6 and
`skills/building-architecture-models/SKILL.md` — change in the same branch. The skill in particular
is a root cause: it produced a model that was 79% undescribed, and it must now state the rule above
and require a label that survives it.

## Part 3 — foundational nodes and the shelf

### The idea

A node marked **foundational** stops being drawn as a participant in the graph and becomes a piece of
furniture that states its own weight.

- New field on `NodeSchema`: `foundational: z.boolean().default(false)`. It sits at the same tier as
  `root` — a structural property of the model, orthogonal to the profile vocabulary. It is **not**
  `role`, which selects a node's drawn shape from the profile and is already spoken for.
- It is **set by the author**, never derived from a degree threshold. The threshold is the specific
  thing that made hub quieting guess wrong.
- Its edges are **not drawn**. The node instead carries a count chip — `◂ 10` — of how many edges it
  has to nodes *in the current view*. One mark, in one place, on the hub itself. This is the
  inversion of hub quieting, which put a chip on each of the N dependants.
- It is laid out on a **shelf**: a band at the edge of the canvas, outside the graph flow, so it
  stops attracting lines *and* stops competing for position with the nodes that are the subject.
- **Hover or select reveals its edges** through the existing `highlight.ts` machinery. Nothing is
  permanently hidden.
- The inspector's `ConnectionList` lists all of them in full, and the MCP still answers "what reads
  Settings?" — the model is unchanged, only the resting picture is.

Per `docs/SPEC.md` §9 this must be **form, not hue**: a chip and a distinct region. Never a colour,
and never only a luminance step.

### When a node is shelved

**Only when it is external to the focused container.** Inside its own container it is drawn as a
normal member.

The fan is a cross-boundary phenomenon — `Baritone` fans 10 into Process Layer, 5 into Utilities, 4
into Behavior Layer — so shelving on the crossing is what actually fixes it, and containment stays
truthful: a container still shows all of its own children together.

The accepted cost is that focusing `Baritone API` still shows `Settings` attracting lines from its
siblings. That is 16 edges in one view, against a rule that would otherwise remove a container's own
child from its own cluster.

### Initial marks

`Baritone` (24 edges) and `Settings` (16). No others; the census showed the next-worst fans are 7 and
5, which are not yet worth the treatment. More can be marked later with `update_nodes` — that is the
point of making it authored.

## Out of scope

- Any change to the edge router, and the known `squared` collinear-overlap gap recorded in
  `CLAUDE.md`. `curved` stays the default.
- Viewer-side edge bundling with an expandable count badge. It is hub quieting's cousin and is not
  worth code until a legitimate fan survives Part 3.
- Re-describing the 95 surviving bare edges, and improving the labels the migration shim generates.
  Both are model rounds, driven by looking at the result.
- `realizedBy` and container-level edge drawing. Still unused, still a live option, not needed here.
- Generalising any of this into a `model_gaps` gate or a build-style check. That is a later phase and
  gets its own design once the rule has proven itself on a real model.

## Testing

- **Part 2** is mostly deletion, so the guard is that the suite still passes with the verb machinery
  gone: `pnpm -r test` (baseline 745 — schema 147, server 107, web 491), and `tokens.test.ts` /
  `contrast.test.ts` in particular, which fail loudly on an orphaned token. New schema tests cover
  the preprocess shim in both directions: a legacy connection composes a label, a current one is
  untouched.
- **Part 3** is pure functions first, per the repo's testing gotchas — `buildFocusView` marking a
  foundational external, the shelf band in `layoutFocusView`, and the in-view count. React Flow
  renders zero edges in jsdom, so edge suppression is asserted through the pure layer and through
  the generated highlight CSS, never through edge DOM.
- `pnpm --filter @hyphae/web typecheck` after any import-touching change. It has a pre-existing
  4-error floor, all in test files; 4 is clean, 5 is ours.
- The model itself is verified with `validate_model` after every write, and the census scripts
  re-run to report edge count, per-focus drawn edges and orphans.

## Sequencing

Part 1 is done. **Part 2 lands before Part 3** — it frees the colour budget that Part 3's visual
design would otherwise have to negotiate with, and it touches the same inspector and canvas files.
Each part is its own implementation plan.

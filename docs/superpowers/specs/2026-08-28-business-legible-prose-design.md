# Business-legible prose — design

*2026-08-28*

> Nodes and connections carry prose written for a code reader. This turns it into prose written
> for an architecture reader, and adds the measurement that says whether it worked. It is the
> node-side counterpart to the connection legibility pass recorded in
> [2026-08-12-model-legibility-design.md](./2026-08-12-model-legibility-design.md).

---

## 1. Problem

`SPEC.md` §1 calls the model **business-legible** and `MODEL.md` §1 says the diagram must be
legible on its own. Connections were made to honour that: the verb vocabulary was deleted, a
mechanical test replaced it (*read "`<from>` `<label>` `<to>`" and ask what a reader learns*), and
the result was measured on a real 411-edge model. **Nodes never got the equivalent pass.** Node
prose is unconstrained, unmeasured, and in practice reads as a code walkthrough.

Measured on the current 112-node / 195-connection Baritone model:

| Measure | Value |
|---|---|
| Nodes with any `description` | 64 of 112 |
| `description` length (chars) | median 354 · p75 485 · **p90 630** · max 2177 |
| Identifier density (per 100 words) | median 7.5 · p75 12.1 · **p90 16.1** · max 39.3 |
| Connection `description` | 85 of 195, **median density 30/100 words** |
| `responsibilities` items ≥80% word-covered by the node's own description | **20 of 181 (11%)** |
| `invariants` items ≥80% word-covered | **0 of 57** |
| `invariants` that are identifier-free | 35 of 118 |

Three distinct failures sit behind those numbers.

**1. The prose describes code, not architecture.** `PathingBehavior.description` is 2,177
characters naming `onTick()`, `pathPlanLock`, `toDispatch`, `snipsnapifpossible`,
`secretInternalSetGoal` and GitHub issue #209. It duplicates what `codeRefs` already points at,
and it goes stale the moment someone renames a method.

**2. `invariants` invites code contracts, because that is what the word means.** Four of
`PathingBehavior`'s are lock protocols — *"findPathInNewThread() must only be called while holding
pathCalcLock"*. But 35 of the model's 118 invariants are identifier-free and excellent:

> "Exactly one process holds pathing control at a time (highest priority active bid wins)"
> "Movement costs are in ticks and must never be negative"
> "Cached data is a lossy approximation — real chunk data always wins when loaded"

The slot earns its place. The **name** is what invited lock protocols into it.

**3. The three prose fields duplicate each other.** A third of `responsibilities` items are ≥60%
word-covered by their own node's description, 11% are ≥80%. Phrase coverage is near zero — so it
is the same facts *reworded*, not copy-paste. `MODEL.md` §7.1 already forbids this ("One truth per
fact"); nobody had applied it *within* a node.

Notably `invariants` do **not** duplicate the description (median coverage 0.25, zero items above
80%). The duplication is specific to `responsibilities`.

### Incidental defect found

`skills/building-architecture-models/references/subagent-prompt.md` steps 0 and 4, and its
`crossPackageDeps` report shape, still instruct subagents to set a `verb` from "the CLOSED verb
vocabulary". That vocabulary was deleted in the 2026-08-12 legibility work. Every model built today
is authored against a vocabulary that no longer exists. Fixed here because this work opens the file
anyway.

---

## 2. Approach

Four changes, each tied to one of the failures above, plus one feature the model is already
reaching for.

1. A **governing rule** that is mechanical, like the edge test (§3).
2. A **field vocabulary** that names the business slot instead of the code one (§4).
3. A **measurement** that says whether prose obeys the rule, calibrated on the real model (§5).
4. **Inline formatting** in panel prose — bold and code spans (§6).

The unifying principle: the model already owns the right home for code detail — `codeRefs` and
Patterns (`MODEL.md` §7.7, *"Code is refs + shape, not nodes"*). Prose is competing with them. So
the fix is a **rule and a measurement**, not a new entity and not a new field.

---

## 3. The governing rule

Added to `MODEL.md` §7 as anti-redundancy principle 9, quoted in `SPEC.md` §9 and in the skill:

> **9. Prose names the responsibility; refs name the code.** A node's or connection's prose must
> stay true after a refactor that renames every symbol inside it. If renaming a class breaks your
> description, the description is in the wrong layer: the code belongs in `codeRefs` or a Pattern,
> both of which exist to hold it.

It is mechanical in the same way the edge test is — applying it needs no judgement about how
important a detail feels.

### The division of labour between the four prose slots

This is the part the skill must state explicitly, because the measurement shows agents do not infer
it. **Each fact appears in exactly one slot.**

| Slot | Carries | Test |
|---|---|---|
| `summary` | what it is *for*, one line, on canvas | Would a stranger know why this box exists? |
| `responsibilities` | what it is **accountable for**, enumerable | *"The system relies on `<name>` to ___"* |
| `rules` | what **always holds** — promises a reader could not guess | *"You can count on this even when ___"* |
| `description` | **only what the lists structurally cannot carry**: why it exists, the trade-off it embodies, how it participates in the system's stories, its history | Does any sentence restate a list item? Delete it. |

The rule that follows, and the one the user asked for: **`description` must not narrate the
responsibilities.** If a fact is enumerable it belongs in a list and must not be repeated in prose;
if the prose repeats it, the prose is what gets cut, because the list is the scannable form.

---

## 4. Field vocabulary

In `packages/schema/src/profiles/c4-backend.ts`:

| Field | Change |
|---|---|
| `summary` | unchanged — required, one line, drawn on the canvas |
| `technology` | unchanged — one canonical name |
| `responsibilities` | kept, **redefined** to accountability in domain language |
| `invariants` | **renamed to `rules`**, redefined as behavioural promises |
| `description` | core field, not profile-constrained — governed by §3, measured by §5 |

### `responsibilities` — new FieldDef description

> What this node is accountable for in the system, in the language of the domain — one item per
> entry. Each item must pass: *"The system relies on `<name>` to ___"*. Name the capability, not
> the mechanism: a method it calls, a lock it holds or a class it constructs is not a
> responsibility. Do not repeat these in `description`; the list is the scannable form and the
> description is for what a list cannot carry.

Worked pair, from the real model:

    BAD   "Runs the per-tick state machine: advance, fail-over to next, splice, or start a new calc"
    GOOD  "Keeps exactly one path being walked at a time, and replaces it before it runs out"

### `rules` — new FieldDef description

> Conditions that always hold, stated as promises about the system's behaviour that a reader could
> not guess from the node's name. Never a code-level precondition — not a lock protocol, not a call
> ordering, not a null check. If the statement stops being true when a method is renamed, it is a
> code comment and belongs in the code.

Worked pair, from the real model:

    BAD   "findPathInNewThread() must only be called while holding pathCalcLock"
    GOOD  "Never hands out a path computed from a position the player has already left"

### Migration

**None**, following the Phase E precedent (`SPEC.md` §6.7, §11): a model is recreated, not folded.
`schemaVersion` stays `1`. No preprocess is added to `node.ts`. A model still carrying `invariants`
reports `unknown-field` from `validate_model` until it is rebuilt.

The Baritone model at `apps/server/hyphae-baritone.json` will go invalid. Re-prosing it is a
separate follow-up run of the skill and is **out of scope here** (§9). When it is rebuilt, the
`crossings.real.test.ts` budgets are re-baselined — they are a property of the model, as
`CLAUDE.md` already records.

### Call sites that name the old key

- `apps/server/src/mcp/tools/nodes.ts:18` — the default `list_nodes` search field list.
- `apps/server/src/mcp/register.ts:25` — the same list inside that parameter's `.describe()` text.

Both must change to `rules` or the default search silently stops matching a field that exists.

---

## 5. Measurement — `model_gaps`

`modelGaps()` in `packages/schema/src/gaps.ts` gains `bloatedProse[]` beside the existing
`thinDescriptions[]`. It covers **nodes and connections** — connection descriptions measured worst
of anything in the model, at median 30 identifiers per 100 words.

```ts
export type BloatedProse = {
  kind: 'node' | 'connection';
  id: string; name: string;              // connection: "<from name> → <to name>"
  reason: 'over-budget' | 'code-shaped' | 'restates-description';
  chars: number;                          // description length
  identifierDensity: number;              // per 100 words
  coverage?: number;                      // restates-description only: 0..1
  item?: string;                          // restates-description only: the offending entry
  inbound: number; outbound: number;      // degree, as thinDescriptions carries
};
```

### The three reasons, and their thresholds

Every threshold is the **measured p90 of the real model**. One methodology, re-derivable after any
rebuild.

| Reason | Threshold | Flags today | Catches |
|---|---|---|---|
| `over-budget` | `description` > **600 chars** | 7 nodes | the 2,177-char walkthrough |
| `code-shaped` | identifier density > **15 per 100 words** | top decile | `Schematic Model`: 390 chars at 39.3 |
| `restates-description` | a `responsibilities` item ≥ **0.8** word coverage by its own description | 20 items | `PathingBehavior`: "Owns current/next PathExecutor…" at 1.00 |

**The three are genuinely independent** and a single check would miss most of the problem. The
densest prose is not the longest: `Schematic Model` is short and pure code listing, `Baritone` is
899 chars at 2.3 density and perfectly clean. And duplication is item-level — only 1 node of 56 has
*every* item duplicated, so a whole-field comparison finds nothing.

`restates-description` is scoped to `responsibilities` deliberately. `rules`/`invariants` measured
zero items above 80% coverage: that slot is already distinct, and flagging it would be noise.

### Heuristic details

Identifier density counts, per 100 words: camelCase tokens, `name()` call syntax, and
`name.ext` file names for common source extensions.

Word coverage strips stopwords and words of ≤2 characters, then measures the fraction of an item's
content words that appear in the description. Bigram/phrase coverage was measured too and is **not**
used: it sits near zero throughout, because the duplication is rewording rather than copying, so a
phrase test would find almost nothing.

**Known and accepted:** genuinely CamelCase product names (`PostgreSQL`, `TypeScript`) score as
identifiers. At a threshold of 15 per 100 words, two proper nouns in a 60-word description score
about 3 — it only bites at pathological density. This goes in a code comment so it is not later
"fixed" into a special-case list.

Advisory only: `modelGaps` flags candidates and never mutates, exactly as it does now. No
`validate_model` issue and no `422` — a heuristic that hard-blocks prose would be wrong sometimes,
with no way for an author to say "this identifier really is the contract".

Surfaced at the Phase 5 checkpoint the skill already has, listed beside the `foundational`
candidates.

---

## 6. Inline formatting

The model is already reaching for this. An existing invariant reads *"Contains no implementation
logic — the \`main\` source set implements it"* — authored with backticks that currently render as
literal characters.

### Marks

Exactly two: `**bold**` and `` `code` ``.

**No italic**, deliberately. `_` is ubiquitous inside identifiers, so `snake_case_name` would
italicise — and this feature exists to make code names *more* readable, not less. `*single
asterisk*` was considered and dropped: one bold mark is unambiguous, two overlapping asterisk marks
are not worth the parser.

Unmatched or unclosed markers render as literal text. A model file stays readable raw, and the
syntax is markdown-compatible, so an authoring agent needs no new concept.

### Module

A new pure module `apps/web/src/core/richText.ts`. It earns `core/` by being readable and testable
knowing only strings — it renders nothing itself, imports no feature, and has no stylesheet.

It returns **React elements, never HTML**. Nothing calls `dangerouslySetInnerHTML`, so injection is
structurally impossible rather than sanitised against.

### Where it renders

Panel prose only, per `SPEC.md` §9 *"Meaning on the canvas, detail in the panel"*:

| Renders marks | Stays plain |
|---|---|
| node `description` | node `summary` (canvas, 2-line clamp) |
| connection `description` | connection `label` (canvas, rotated) |
| `responsibilities` items | flow step captions (canvas) |
| `rules` items | node name, `technology` chip |
| pattern / flow `description` | |

Wired through `FieldRows` (`Row` prose values, `ListRow` items) and `SidePanel`. The canvas is
untouched, so no highlight-CSS or crossings behaviour moves.

### Styling

A `.rich-code` class in `features/inspector/inspector.css`, built from existing tokens (`--chip`,
`--tx-2`). No new colour literal, so `tokens.test.ts` stays green; no new token, so the
every-token-is-referenced direction stays green too.

### Advertising it to authors

The `FieldDef` descriptions for `responsibilities`/`rules` and the MCP `description` params say the
two marks are available, **with the constraint that makes them serve this design rather than fight
it**:

> A code span is for a name that is part of the system's contract — a config key, an environment
> variable, a wire-protocol field, a published API name. Never an internal class or method: those
> are what §3 removes.

This is the one real risk in the feature. An agent handed a code-span syntax will reach for it, and
unconstrained that would undo §3. Constrained this way it reinforces it — a code span marks the few
names that *survive* a refactor.

---

## 7. Skill changes

`skills/building-architecture-models/SKILL.md`:

- A new **node prose** section under *The visual vocabulary*, shaped like the existing edge-test
  section: principle 9, the four-slot division of labour table from §3, the BAD/GOOD pairs from §4
  (all drawn from the real model), and the no-duplication rule.
- `invariants` → `rules` throughout, including the Phase 1 and Phase 2 field lists.
- New red flags: prose that names a method or a lock; a `description` sentence that restates a
  responsibility; a code span on an internal symbol.
- Phase 5's coverage sweep gains the `bloatedProse` flags next to the existing ones.

`skills/building-architecture-models/references/subagent-prompt.md`:

- Same prose rules, since this file is deliberately self-contained ("This prompt is complete").
- `invariants` → `rules`.
- **The stale verb instructions removed** — steps 0 and 4 and the `crossPackageDeps` report shape,
  replaced with the `label` rule and its mechanical test.

---

## 8. Docs

| File | Sections |
|---|---|
| `docs/MODEL.md` | §3.1 (node core field list), §4 (the not-first-class list), §7 (new principle 9) |
| `docs/SPEC.md` | §6.2 (node fields), §8 (LLM-friendliness bullet naming the fields), §9 (quote principle 9) |
| `README.md` | field names wherever they appear in the MCP tool docs |
| `CLAUDE.md` | no change needed — its model-rebuild and crossings-budget notes already cover the fallout |

---

## 9. Testing

Baseline is **771 green** (schema 145, server 109, web 517).

| Area | Tests |
|---|---|
| `packages/schema/test/gaps.test.ts` | each reason at and either side of its threshold; connections covered as well as nodes; the CamelCase-product-name case scoring below threshold |
| `packages/schema/test/c4-backend.test.ts` | `rules` present, `invariants` absent |
| `packages/schema/test/validate.test.ts` | a node carrying `invariants` reports `unknown-field` (the no-migration decision, pinned) |
| `apps/web/test/core/richText.test.ts` | bold, code, adjacent marks, unclosed markers, empty spans, a literal backtick, a `snake_case` word left alone |
| `apps/web/test/features/inspector/FieldRows.test.tsx` | marks render in `Row` prose and `ListRow` items |
| `apps/web/test/features/inspector/SidePanel.test.tsx` | node and connection descriptions render marks |
| `apps/web/test/styles/…` | a `rule()` assertion that `.rich-code` exists in `inspector.css`, anchored to line start |
| `apps/server/test/mcp.test.ts` | the `list_nodes` default search list names `rules` |

`pnpm --filter @hyphae/web typecheck` after the import-touching changes; the pre-existing floor is
4 errors, so 4 is clean and 5 is ours.

---

## 10. Out of scope

- **Re-prosing the Baritone model.** A separate follow-up run of the skill. Note that 48 of its 112
  nodes have no description at all, so that work is closer to writing the model than editing it.
- **Canvas formatting** — `summary` and `label` stay literally plain.
- **Italic, links, lists, headings** — the two marks are the whole grammar.
- **Hard-blocking validation** on prose. Measurement is advisory (§5).
- **The Data axis, Requirements, Decisions** — untouched, still reserved.

---

## 11. Open questions

- **Threshold drift.** All three thresholds are the p90 of one model. They should be re-derived
  after the rebuild rather than treated as constants; the probe scripts that produced them are the
  method, and the design deliberately records the method rather than only the numbers.
- **`rules` on connections.** `commonConnectionFields` stays empty here. If connection prose proves
  to want the same slot, it is a one-line profile addition — but nothing measured says it does yet.

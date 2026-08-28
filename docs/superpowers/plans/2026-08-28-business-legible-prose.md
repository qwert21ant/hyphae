# Business-Legible Prose Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Turn node and connection prose from a code walkthrough into an architecture description — by renaming `invariants` to `rules`, measuring prose quality in `model_gaps`, and rendering bold/code spans in the inspector.

**Architecture:** Four independent layers, in dependency order. The schema profile changes the field vocabulary (Task 1). `gaps.ts` gains a `bloatedProse[]` measurement with three reasons, all thresholded at the real model's p90 (Tasks 2–3). The server's two hardcoded field lists follow the rename (Task 4). A new pure `core/richText.ts` parses two inline marks into React elements, wired through the inspector (Tasks 5–6). Docs and the modeling skill close it out (Tasks 7–8).

**Tech Stack:** TypeScript, Zod (`packages/schema`), Vitest, React 18 + jsdom + Testing Library (`apps/web`), Hono + MCP SDK (`apps/server`), plain CSS.

**Spec:** `docs/superpowers/specs/2026-08-28-business-legible-prose-design.md`

## Global Constraints

- **No migration.** `schemaVersion` stays `1`. Do **not** add a preprocess to `packages/schema/src/node.ts`. A model carrying `fields.invariants` must report `unknown-field` — that is the intended, tested outcome.
- **Every threshold is the measured p90 of the Baritone model**, and must appear in code as a named constant with the measurement in its comment: description length **600** chars, identifier density **15** per 100 words, responsibilities word coverage **0.8**.
- **`model_gaps` is advisory.** It flags candidates and never mutates. No new `validate_model` issue kind and no `422` for prose.
- **Exactly two marks:** `**bold**` and `` `code` ``. No italic, no links, no lists, no headings. Unmatched markers render as literal text.
- **Rich text returns React elements, never HTML strings.** Nothing may call `dangerouslySetInnerHTML`.
- **Canvas text stays plain** — node `summary`, edge `label`, flow step captions are untouched.
- **No colour literal anywhere in `apps/web/src` outside `tokens.css`** — no hex, no `rgb()`/`hsl()`. Enforced by `test/styles/tokens.test.ts`.
- **Web imports use the `@/` alias**, except a file in the *same* directory, which uses `./Name`.
- **Test baseline is 771 green** (schema 145, server 109, web 517). Run `pnpm -r test` — never bare `pnpm vitest run` from the repo root.
- `pnpm --filter @hyphae/web typecheck` has a **pre-existing 4-error floor**. 4 is clean; 5 is yours.
- Commit messages end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Stage explicit paths — never `git add -A`. **Never `git add` any `*.json` model file** (`apps/server/hyphae-baritone.json`, `hyphae-baritone-lagacy.json` are untracked and must stay so — verify with `git status --short` before every commit).

---

### Task 1: Rename `invariants` → `rules` in the profile

**Files:**
- Modify: `packages/schema/src/profiles/c4-backend.ts:33-36`
- Test: `packages/schema/test/c4-backend.test.ts:40-47`
- Test: `packages/schema/test/validate.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `c4Backend.commonNodeFields` is `[responsibilities, rules]`. `nodeFields(c4Backend, 'Component')` returns keys `['responsibilities', 'rules', 'summary', 'technology']`; for `'System'`, `['responsibilities', 'rules', 'summary']`. Tasks 2, 4, 6, 7 and 8 all depend on the key being exactly `rules`.

- [x] **Step 1: Update the two failing profile tests**

In `packages/schema/test/c4-backend.test.ts`, replace the two field-order tests (currently naming `invariants`):

```ts
  it('effective node fields = common (responsibilities, rules) then per-kind (summary, technology)', () => {
    const keys = nodeFields(c4Backend, 'Component').map((f) => f.key);
    expect(keys).toEqual(['responsibilities', 'rules', 'summary', 'technology']);
  });

  it('a node kind with no own fields beyond summary gets the common fields plus summary', () => {
    expect(nodeFields(c4Backend, 'System').map((f) => f.key)).toEqual(['responsibilities', 'rules', 'summary']);
  });
```

And add, in the same `describe('profile meta-schema')` block:

```ts
  it('has retired invariants — the word invited code-level preconditions', () => {
    expect(c4Backend.commonNodeFields.some((f) => f.key === 'invariants')).toBe(false);
  });

  it('describes rules and responsibilities in domain terms, banning code detail', () => {
    const byKey = Object.fromEntries(c4Backend.commonNodeFields.map((f) => [f.key, f]));
    expect(byKey['rules'].description).toMatch(/never a code-level precondition/i);
    expect(byKey['responsibilities'].description).toMatch(/The system relies on/i);
  });
```

- [x] **Step 2: Run them to verify they fail**

Run: `cd packages/schema && npx vitest run test/c4-backend.test.ts`
Expected: FAIL — the field-order tests report `invariants` where `rules` is expected, and the two new tests fail on `undefined`/no match.

- [x] **Step 3: Rename and rewrite the two FieldDefs**

In `packages/schema/src/profiles/c4-backend.ts`, replace the `commonNodeFields` array (lines 33-36) with:

```ts
  commonNodeFields: [
    {
      key: 'responsibilities', type: 'list',
      description: 'What this node is accountable for in the system, in the language of the domain — one item per entry. Each item must pass: "The system relies on <name> to ___". Name the capability, not the mechanism: a method it calls, a lock it holds or a class it constructs is not a responsibility. Do not repeat these in `description` — the list is the scannable form, and the description is for what a list cannot carry. Supports `**bold**` and `` `code` `` (a code span is for a name that is part of the system\'s contract — a config key, an environment variable, a wire-protocol field — never an internal class or method).',
    },
    {
      key: 'rules', type: 'list',
      description: 'Conditions that always hold, stated as promises about the system\'s behaviour that a reader could not guess from the node\'s name — e.g. "Never hands out a path computed from a position the player has already left". Never a code-level precondition: not a lock protocol, not a call ordering, not a null check. If the statement stops being true when a method is renamed, it is a code comment and belongs in the code. Supports `**bold**` and `` `code` `` (contract names only, never an internal symbol).',
    },
  ],
```

- [x] **Step 4: Run the schema suite**

Run: `cd packages/schema && npx vitest run`
Expected: PASS. Note any failure in `validate.test.ts` — a fixture there may seed `fields: { invariants: [...] }`, which now correctly produces `unknown-field`. If so, that fixture is asserting the *old* vocabulary; fix it in the next step rather than reverting the profile.

- [x] **Step 5: Pin the no-migration decision**

Add to `packages/schema/test/validate.test.ts` (inside the existing top-level `describe`):

```ts
  it('reports a legacy invariants field as unknown — no migration ships', () => {
    const m = emptyModel();
    m.nodes.push({
      id: 'n1', name: 'N1', type: 'Component', parentId: null, description: '',
      root: null, role: null, foundational: false, codeRefs: [], docRefs: [],
      createdAt: 't', updatedAt: 't',
      fields: { summary: 's', invariants: ['legacy'] },
    });
    const issues = validateModel(m, c4Backend);
    expect(issues.some((i) => i.kind === 'unknown-field' && /invariants/.test(i.message))).toBe(true);
  });
```

Check the file's existing imports and node-fixture helper first and reuse them — it may already have a `nodeBase` spread like `gaps.test.ts` does, in which case use that instead of the inline literal. The `missing-parent` issue this node also produces is irrelevant to the assertion.

- [x] **Step 6: Run the schema suite again**

Run: `cd packages/schema && npx vitest run`
Expected: PASS, all green.

- [x] **Step 7: Commit**

```bash
git status --short
git add packages/schema/src/profiles/c4-backend.ts packages/schema/test/c4-backend.test.ts packages/schema/test/validate.test.ts
git commit -m "feat(schema): rename invariants to rules and redefine both list fields

35 of 118 invariants on the real model were already identifier-free
architectural rules; the rest were lock protocols. The slot earns its
place, the word did not — 'invariant' is a programming term, so a
code-reading agent fills it with thread-safety contracts.

Ships no migration, per the Phase E precedent: schemaVersion stays 1 and
a model carrying the old key reports unknown-field until it is rebuilt.
Pinned by a test so nobody adds a preprocess later.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: The prose measurement helpers

**Files:**
- Modify: `packages/schema/src/gaps.ts`
- Test: `packages/schema/test/gaps.test.ts`

**Interfaces:**
- Consumes: Task 1's `rules` key (not directly referenced here, but the profile must already be renamed for the suite to be green).
- Produces: two exported pure functions used by Task 3 —
  `identifierDensity(text: string): number` (hits per 100 words, `0` for empty text)
  `wordCoverage(item: string, hay: string): number` (0..1, `0` for an item with no content words)

- [x] **Step 1: Write the failing tests**

Append to `packages/schema/test/gaps.test.ts`:

```ts
describe('identifierDensity', () => {
  it('is zero for prose with no code shapes', () => {
    expect(identifierDensity('Keeps exactly one path being walked at a time')).toBe(0);
  });

  it('counts camelCase, call syntax and source file names', () => {
    // 8 words, 3 hits -> 37.5 per 100
    expect(identifierDensity('it calls onTick() and reads pathPlanLock from Main.java')).toBeGreaterThan(15);
  });

  it('scores a CamelCase product name below the threshold in ordinary prose', () => {
    // One proper noun in a long clean sentence must not trip the 15/100 flag.
    const prose = 'Stores the recorded clip and its metadata durably, so that a viewer can replay '
      + 'any camera from the last thirty days without the capture service being reachable. '
      + 'Runs on PostgreSQL.';
    expect(identifierDensity(prose)).toBeLessThan(15);
  });

  it('is zero for empty text', () => {
    expect(identifierDensity('')).toBe(0);
  });
});

describe('wordCoverage', () => {
  it('is 1 when every content word of the item appears in the description', () => {
    expect(wordCoverage('Owns the active goal', 'This component owns the active goal and more')).toBe(1);
  });

  it('ignores stopwords and very short words', () => {
    // "of the a" are stopwords; only "cache" and "chunk" count, both present.
    expect(wordCoverage('a cache of the chunk', 'the chunk cache')).toBe(1);
  });

  it('is low when the item says something the description does not', () => {
    expect(wordCoverage('Rejects negative movement costs', 'Handles alpha ingest')).toBeLessThan(0.5);
  });

  it('is zero for an item with no content words', () => {
    expect(wordCoverage('of the', 'anything at all')).toBe(0);
  });
});
```

Add `identifierDensity` and `wordCoverage` to the existing `import { modelGaps } from '../src/gaps';` line.

- [x] **Step 2: Run to verify they fail**

Run: `cd packages/schema && npx vitest run test/gaps.test.ts`
Expected: FAIL — `identifierDensity is not a function`.

- [x] **Step 3: Implement the two helpers**

Add to `packages/schema/src/gaps.ts`, below the existing `normalize` constant:

```ts
/** Shapes that mean "this is a code identifier, not prose": camelCase, a call, a source file name.
 *  Deliberately NOT an exhaustive identifier grammar — this is a density signal, not a parser. */
const CODE_SHAPES: RegExp[] = [
  /\b[a-z][a-z0-9]*[A-Z]\w*/g,                              // camelCase
  /\b\w+\(\)/g,                                             // call syntax
  /\b\w+\.(java|ts|tsx|js|py|go|rs|cs|rb|json|gradle|toml)\b/g, // source file names
  /\b[A-Z][a-z0-9]+[A-Z]\w*/g,                              // PascalCase
];

/**
 * Code-identifier hits per 100 words. Measured p90 on the real 112-node model is 16.1, so
 * BLOAT_DENSITY sits at 15.
 *
 * A genuinely CamelCase product name (PostgreSQL, TypeScript) scores as an identifier, and that
 * is accepted: two proper nouns in a 60-word description score about 3, so the flag only fires at
 * pathological density. Do NOT "fix" this with an allow-list of product names — the list would
 * never be complete and the threshold already absorbs the noise.
 */
export function identifierDensity(text: string): number {
  const words = (text.match(/\S+/g) ?? []).length;
  if (words === 0) return 0;
  let hits = 0;
  for (const re of CODE_SHAPES) hits += (text.match(re) ?? []).length;
  return (hits / words) * 100;
}

/** Words carrying no topical signal, dropped before comparing an item against a description. */
const STOPWORDS = new Set(
  ('a an the and or of to in on for with by is are be it its this that as at from into over per '
   + 'not no all any each every which when while so if then than').split(' '),
);

const contentWords = (s: string): string[] =>
  (s.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => w.length > 2 && !STOPWORDS.has(w));

/**
 * The fraction of `item`'s content words that also appear in `hay` — how much of a list entry the
 * node's own description already says.
 *
 * Word overlap, not phrase overlap, on purpose: measured on the real model, bigram coverage of
 * responsibilities sits near zero at every percentile while word coverage reaches 0.80 at p90.
 * The duplication is the same facts *reworded*, so a phrase test finds almost nothing.
 */
export function wordCoverage(item: string, hay: string): number {
  const words = contentWords(item);
  if (words.length === 0) return 0;
  const haystack = new Set(contentWords(hay));
  return words.filter((w) => haystack.has(w)).length / words.length;
}
```

- [x] **Step 4: Run to verify they pass**

Run: `cd packages/schema && npx vitest run test/gaps.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git status --short
git add packages/schema/src/gaps.ts packages/schema/test/gaps.test.ts
git commit -m "feat(schema): add identifierDensity and wordCoverage prose metrics

Two pure signals behind the bloated-prose flags. Word overlap rather than
phrase overlap because the measurement says so: bigram coverage of
responsibilities sits near zero at every percentile while word coverage
reaches 0.80 at p90 — the duplication is rewording, not copying.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: `bloatedProse` in `modelGaps`

**Files:**
- Modify: `packages/schema/src/gaps.ts`
- Modify: `packages/schema/src/index.ts` (export the new type if the file re-exports gap types — check first)
- Test: `packages/schema/test/gaps.test.ts`

**Interfaces:**
- Consumes: `identifierDensity`, `wordCoverage` from Task 2.
- Produces: `ModelGaps` gains `bloatedProse: BloatedProse[]`. Task 4 and Task 8 depend on the field name and the three `reason` values.

- [x] **Step 1: Write the failing tests**

Append to `packages/schema/test/gaps.test.ts`. Note this builds its own model — the shared `model()` fixture has short clean descriptions and must stay that way, since the existing thin/orphan tests assert against it.

```ts
/** One node per bloat reason, plus one clean node and one bloated connection. */
function proseModel(): HyphaeModel {
  const m = emptyModel();
  const long = 'x'.repeat(400);
  m.nodes.push(
    { id: 'sys', name: 'Sys', type: 'System', parentId: null, description: 'The system', ...nodeBase },
    { id: 'ca', name: 'Alpha', type: 'Container', parentId: 'sys', description: 'Alpha container', ...nodeBase },
    // over-budget: >600 chars, but clean prose and no list to restate
    { id: 'big', name: 'Big', type: 'Component', parentId: 'ca',
      description: `It stores the recorded clip and serves it back to a viewer later. ${long} ${long}`, ...nodeBase },
    // code-shaped: short, but pure identifiers
    { id: 'codey', name: 'Codey', type: 'Component', parentId: 'ca',
      description: 'Calls onTick() then reads pathPlanLock and writes CachedRegion from Main.java',
      ...nodeBase },
    // restates-description: the responsibility adds nothing the description has not said
    { id: 'dup', name: 'Dup', type: 'Component', parentId: 'ca',
      description: 'Owns the current path executor and the active goal for the session',
      ...nodeBase, fields: { responsibilities: ['Owns the current path executor and the active goal'] } },
    // clean: nothing should flag
    { id: 'ok', name: 'Ok', type: 'Component', parentId: 'ca',
      description: 'Keeps exactly one path being walked at a time, and replaces it before it runs out',
      ...nodeBase, fields: { responsibilities: ['Rejects a movement cost below zero'] } },
  );
  m.connections.push(
    { id: 'e1', from: 'big', to: 'codey', ...edgeBase,
      description: 'Hands PathExecutor to AbstractNodeCostSearch via secretInternalSetGoal() in Main.java' },
  );
  return m;
}

describe('modelGaps bloatedProse', () => {
  const flags = () => modelGaps(proseModel(), c4Backend).bloatedProse;
  const reasonsFor = (id: string) => flags().filter((b) => b.id === id).map((b) => b.reason);

  it('flags a description over the 600-char budget', () => {
    expect(reasonsFor('big')).toContain('over-budget');
  });

  it('flags short-but-code-shaped prose the length check misses', () => {
    expect(reasonsFor('codey')).toContain('code-shaped');
    expect(reasonsFor('codey')).not.toContain('over-budget');
  });

  it('flags a responsibility its own description already states', () => {
    const dup = flags().find((b) => b.id === 'dup' && b.reason === 'restates-description');
    expect(dup).toBeTruthy();
    expect(dup!.coverage).toBeGreaterThanOrEqual(0.8);
    expect(dup!.item).toMatch(/Owns the current path executor/);
  });

  it('leaves clean prose alone', () => {
    expect(flags().some((b) => b.id === 'ok')).toBe(false);
  });

  it('covers connections, which measured worst of anything on the real model', () => {
    const e = flags().find((b) => b.kind === 'connection');
    expect(e).toMatchObject({ id: 'e1', reason: 'code-shaped' });
    expect(e!.name).toBe('Big → Codey');
  });

  it('does not flag rules for restating — that slot measured zero duplication', () => {
    const m = proseModel();
    m.nodes.find((n) => n.id === 'ok')!.fields = {
      rules: ['Keeps exactly one path being walked at a time, and replaces it before it runs out'],
    };
    expect(modelGaps(m, c4Backend).bloatedProse.some((b) => b.reason === 'restates-description')).toBe(false);
  });

  it('carries degree, so a bloated hub stands out', () => {
    const codey = flags().find((b) => b.id === 'codey')!;
    expect(codey).toMatchObject({ inbound: 1, outbound: 0 });
  });
});
```

- [x] **Step 2: Run to verify they fail**

Run: `cd packages/schema && npx vitest run test/gaps.test.ts`
Expected: FAIL — `Cannot read properties of undefined (reading 'filter')`, since `bloatedProse` does not exist.

- [x] **Step 3: Implement**

In `packages/schema/src/gaps.ts`, add the type and thresholds near the top, beside `ThinDescription`:

```ts
export type BloatedProse = {
  kind: 'node' | 'connection';
  id: string;
  name: string;                 // connection: "<from name> → <to name>"
  reason: 'over-budget' | 'code-shaped' | 'restates-description';
  chars: number;
  identifierDensity: number;
  coverage?: number;            // restates-description only
  item?: string;                // restates-description only
  inbound: number; outbound: number;
};
```

Add `bloatedProse: BloatedProse[];` to the `ModelGaps` type.

Add the thresholds beside `COMPONENT_LAYER`:

```ts
/** All three are the measured p90 of the real 112-node Baritone model — one methodology, so they
 *  can be re-derived rather than re-argued after a rebuild. Length p90 was 630 chars, density p90
 *  16.1 per 100 words, responsibilities word-coverage p90 0.80. */
const BLOAT_CHARS = 600;
const BLOAT_DENSITY = 15;
const RESTATE_COVERAGE = 0.8;
```

Then, inside `modelGaps` after the `thinDescriptions` loop and before the missing-refs block:

```ts
  // 3. Bloated prose: a description that is over budget, reads as code, or is restated by a list.
  //    Three independent reasons on purpose — measured on the real model, the densest prose is not
  //    the longest (a 390-char pure-identifier description scored 39.3/100 words while an 899-char
  //    one scored 2.3), and duplication is item-level (only 1 node of 56 had every item covered).
  //    Advisory: this flags candidates and never mutates.
  const bloatedProse: BloatedProse[] = [];
  const nameById = new Map(model.nodes.map((n) => [n.id, n.name]));

  const measure = (
    kind: 'node' | 'connection', id: string, name: string, description: string,
    responsibilities: string[],
  ) => {
    const density = identifierDensity(description);
    const degree = { inbound: inbound.get(id) ?? 0, outbound: outbound.get(id) ?? 0 };
    const base = { kind, id, name, chars: description.length, identifierDensity: density, ...degree };
    if (description.length > BLOAT_CHARS) bloatedProse.push({ ...base, reason: 'over-budget' });
    if (density > BLOAT_DENSITY) bloatedProse.push({ ...base, reason: 'code-shaped' });
    // Scoped to responsibilities: `rules` measured zero items above the coverage threshold, so
    // checking it would only add noise.
    for (const item of responsibilities) {
      const coverage = wordCoverage(item, description);
      if (coverage >= RESTATE_COVERAGE) {
        bloatedProse.push({ ...base, reason: 'restates-description', coverage, item });
      }
    }
  };

  for (const n of model.nodes) {
    const responsibilities = Array.isArray(n.fields?.responsibilities)
      ? (n.fields.responsibilities as unknown[]).map(String)
      : [];
    measure('node', n.id, n.name, n.description ?? '', responsibilities);
  }
  for (const c of model.connections) {
    const name = `${nameById.get(c.from) ?? c.from} → ${nameById.get(c.to) ?? c.to}`;
    measure('connection', c.id, name, c.description ?? '', []);
  }
```

Add `bloatedProse` to the returned object.

Note two things the code above relies on: `inbound`/`outbound` are the degree maps already built at the top of `modelGaps`, and a connection's degree is looked up by *connection* id, which is never in those maps — so a connection always reports `0/0`. That is correct: degree is a node property, and the field exists on the shared shape.

- [x] **Step 4: Run to verify they pass**

Run: `cd packages/schema && npx vitest run`
Expected: PASS, whole schema package green.

- [x] **Step 5: Check the barrel export**

Run: `grep -n "ThinDescription\|ModelGaps\|OrphanNode" packages/schema/src/index.ts`
If those types are re-exported there, add `BloatedProse` alongside them in the same style. If `index.ts` uses a blanket `export * from './gaps'`, no change is needed.

- [x] **Step 6: Run the full suite and commit**

Run: `pnpm -r test`
Expected: server and web still green; schema up by 7 tests.

```bash
git status --short
git add packages/schema/src/gaps.ts packages/schema/test/gaps.test.ts packages/schema/src/index.ts
git commit -m "feat(schema): flag bloated, code-shaped and restated prose in model_gaps

model_gaps measured only thin descriptions; the real failure mode on the
Baritone model is the opposite. Three independent reasons, because one
threshold would miss most of it: the densest prose is not the longest
(390 chars at 39.3 identifiers/100 words vs 899 chars at 2.3), and
duplication is item-level, so a whole-field comparison finds nothing.

Thresholds are the measured p90 of that model, recorded as such so they
are re-derived rather than re-argued after a rebuild.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Follow the rename through the server

**Files:**
- Modify: `apps/server/src/mcp/tools/nodes.ts:18`
- Modify: `apps/server/src/mcp/register.ts:25`
- Test: `apps/server/test/mcp.test.ts`

**Interfaces:**
- Consumes: Task 1's `rules` key.
- Produces: nothing downstream.

- [x] **Step 1: Write the failing test**

Add to `apps/server/test/mcp.test.ts` (place it beside the existing `list_nodes` tests and reuse that file's model-seeding helper — read the surrounding tests first and match their style):

```ts
  it('searches the rules field by default, not the retired invariants key', async () => {
    // Seed a node whose ONLY match for the query is inside fields.rules.
    // (Adapt the seeding to this file's existing helper.)
    const res = await listNodes({ query: 'lossy approximation' });
    expect(res.map((n: { name: string }) => n.name)).toContain('Cache');
  });
```

- [x] **Step 2: Run to verify it fails**

Run: `cd apps/server && npx vitest run test/mcp.test.ts`
Expected: FAIL — the default search list still names `invariants`, so a value stored under `rules` is never searched.

- [x] **Step 3: Update both hardcoded lists**

`apps/server/src/mcp/tools/nodes.ts:18` — change the default array:

```ts
        const searchFields = fields?.length ? fields : ['name', 'description', 'technology', 'responsibilities', 'rules'];
```

`apps/server/src/mcp/register.ts:25` — change the `.describe()` text so the tool's own documentation matches:

```ts
        fields: z.array(z.string()).optional().describe('Restrict which fields `query` searches (core fields or any documented `fields` key — see describe_profile). Default: name, description, technology, responsibilities, rules.'),
```

- [x] **Step 4: Run to verify it passes**

Run: `cd apps/server && npx vitest run`
Expected: PASS, server package green.

- [x] **Step 5: Commit**

```bash
git status --short
git add apps/server/src/mcp/tools/nodes.ts apps/server/src/mcp/register.ts apps/server/test/mcp.test.ts
git commit -m "fix(server): search rules, not invariants, in the list_nodes default

Two hardcoded copies of the default search field list. Left alone, a
query silently stops matching a field that exists — the worst kind of
rename fallout, because nothing errors.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: `core/richText.ts` — the parser

**Files:**
- Create: `apps/web/src/core/richText.ts`
- Test: `apps/web/test/core/richText.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `renderRichText(text: string): React.ReactNode` — returns a `Fragment` of strings, `<strong>` and `<code className="rich-code">` elements. Task 6 imports it as `import { renderRichText } from '@/core/richText'`.

Note the test file is `.tsx`, not `.ts` — it renders JSX. It still mirrors `src/core/richText.ts`, which is the convention.

- [x] **Step 1: Write the failing tests**

Create `apps/web/test/core/richText.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { renderRichText } from '@/core/richText';

const html = (text: string) => render(<div>{renderRichText(text)}</div>).container.innerHTML;

describe('renderRichText', () => {
  it('leaves plain prose untouched', () => {
    expect(html('Keeps one path at a time')).toBe('<div>Keeps one path at a time</div>');
  });

  it('renders bold', () => {
    expect(html('a **bold** word')).toBe('<div>a <strong>bold</strong> word</div>');
  });

  it('renders a code span with the styling hook', () => {
    expect(html('reads `MAX_DEPTH` at startup'))
      .toBe('<div>reads <code class="rich-code">MAX_DEPTH</code> at startup</div>');
  });

  it('renders both marks in one string', () => {
    expect(html('**always** set `TZ`'))
      .toBe('<div><strong>always</strong> set <code class="rich-code">TZ</code></div>');
  });

  it('renders adjacent marks with no text between them', () => {
    expect(html('**a**`b`')).toBe('<div><strong>a</strong><code class="rich-code">b</code></div>');
  });

  it('leaves an unclosed marker as literal text', () => {
    expect(html('a **bold word')).toBe('<div>a **bold word</div>');
    expect(html('a `code word')).toBe('<div>a `code word</div>');
  });

  it('leaves a lone backtick and a lone asterisk pair alone', () => {
    expect(html('100% * 2 ` done')).toBe('<div>100% * 2 ` done</div>');
  });

  it('does not italicise snake_case, which is why there is no italic mark', () => {
    expect(html('the max_retry_count setting')).toBe('<div>the max_retry_count setting</div>');
  });

  it('treats an empty mark as literal text rather than an empty element', () => {
    expect(html('**** and ``')).toBe('<div>**** and ``</div>');
  });

  it('does not nest — a code span inside bold stays literal inside the code span', () => {
    expect(html('`**not bold**`'))
      .toBe('<div><code class="rich-code">**not bold**</code></div>');
  });

  it('handles an empty string', () => {
    expect(html('')).toBe('<div></div>');
  });
});
```

- [x] **Step 2: Run to verify they fail**

Run: `cd apps/web && npx vitest run test/core/richText.test.tsx`
Expected: FAIL — cannot resolve `@/core/richText`.

- [x] **Step 3: Implement**

Create `apps/web/src/core/richText.ts`:

```ts
import { Fragment, createElement, type ReactNode } from 'react';

/**
 * The two inline marks model prose may carry: `**bold**` and `` `code` ``.
 *
 * Deliberately NOT markdown. There is no italic, because `_` is ubiquitous inside identifiers and
 * `snake_case_name` would italicise — this exists to make contract names *more* readable, not less.
 * There are no links, lists or headings: the inspector's typography is tight and the model is not
 * a document.
 *
 * Returns React elements, never an HTML string — nothing here reaches `dangerouslySetInnerHTML`,
 * so injection is structurally impossible rather than sanitised against.
 *
 * An unmatched or empty marker renders as literal text, so a model file stays readable raw and a
 * half-typed mark never eats the rest of a description.
 */

// Ordered alternation: a code span wins over bold, so `**x**` inside backticks stays literal.
// Both require at least one non-marker character, which is what makes `****` and ` `` ` literal.
const MARK = /`([^`]+)`|\*\*((?:(?!\*\*)[\s\S])+)\*\*/g;

export function renderRichText(text: string): ReactNode {
  if (!text) return null;
  const parts: ReactNode[] = [];
  let last = 0;
  let key = 0;

  MARK.lastIndex = 0;
  for (let m = MARK.exec(text); m !== null; m = MARK.exec(text)) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const [, code, bold] = m;
    if (code !== undefined) {
      parts.push(createElement('code', { key: key++, className: 'rich-code' }, code));
    } else {
      parts.push(createElement('strong', { key: key++ }, bold));
    }
    last = m.index + m[0].length;
  }
  if (last === 0) return text;              // no marks at all — hand back the plain string
  if (last < text.length) parts.push(text.slice(last));
  return createElement(Fragment, null, ...parts);
}
```

- [x] **Step 4: Run to verify they pass**

Run: `cd apps/web && npx vitest run test/core/richText.test.tsx`
Expected: PASS, 11 tests.

If the "does not nest" case fails, the alternation order is wrong — the code branch must come first in `MARK`.

- [x] **Step 5: Commit**

```bash
git status --short
git add apps/web/src/core/richText.ts apps/web/test/core/richText.test.tsx
git commit -m "feat(web): add richText, a two-mark inline parser for panel prose

Bold and code spans only. No italic: \`_\` is ubiquitous inside
identifiers, so snake_case_name would italicise — and this feature exists
to make contract names more readable, not less.

Returns React elements rather than an HTML string, so injection is
structurally impossible rather than sanitised against. Lands in core/ on
the usual test: pure, testable knowing only its input, renders nothing
and imports no feature.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Wire rich text into the inspector

**Files:**
- Modify: `apps/web/src/features/inspector/FieldRows.tsx`
- Modify: `apps/web/src/features/inspector/inspector.css`
- Test: `apps/web/test/features/inspector/FieldRows.test.tsx`
- Test: `apps/web/test/features/inspector/SidePanel.test.tsx`

**Interfaces:**
- Consumes: `renderRichText` from Task 5; the `rules` key from Task 1.
- Produces: nothing downstream.

`SidePanel.tsx` needs **no change** — it passes prose as `children` into `Row`, and `Row` is where the formatting is applied. Confirm this while implementing; if a description is passed some other way, format it at that call site instead.

- [x] **Step 1: Write the failing tests**

Add to `apps/web/test/features/inspector/FieldRows.test.tsx`:

```tsx
describe('rich text in prose', () => {
  it('formats marks in a Row value', () => {
    const { container } = render(<Row label="description">{'set **always** via `TZ`'}</Row>);
    expect(container.querySelector('strong')?.textContent).toBe('always');
    expect(container.querySelector('code.rich-code')?.textContent).toBe('TZ');
  });

  it('formats marks in each ListRow item', () => {
    const { container } = render(<ListRow label="rules" items={['never reads `TZ` twice', 'plain one']} />);
    expect(container.querySelectorAll('li')).toHaveLength(2);
    expect(container.querySelector('code.rich-code')?.textContent).toBe('TZ');
  });

  it('formats a list-typed FieldRow, so rules and responsibilities both get it', () => {
    const { container } = render(
      <FieldRow def={def({ key: 'rules', type: 'list' })} value={['holds **one** lock-free path']}
        nodes={nodes} onNavigate={vi.fn()} />,
    );
    expect(container.querySelector('strong')?.textContent).toBe('one');
  });

  it('leaves a non-prose Row value alone', () => {
    // A NodeLink child is an element, not a string — it must pass through untouched.
    const { container } = render(
      <Row label="parent"><NodeLink id="a1" nodes={nodes} onNavigate={vi.fn()} /></Row>,
    );
    expect(container.querySelector('button')?.textContent).toBe('A1');
  });
});
```

Add to `apps/web/test/features/inspector/SidePanel.test.tsx` — match the file's existing store-seeding helper:

```tsx
  it('formats marks in a node description', () => {
    // seed a node with description: 'reads `TZ` at **startup**' and select it
    const { container } = render(<SidePanel />);
    expect(container.querySelector('code.rich-code')?.textContent).toBe('TZ');
    expect(container.querySelector('strong')?.textContent).toBe('startup');
  });
```

Add a CSS invariant test. If `apps/web/test/features/inspector/` has no stylesheet test yet, create `apps/web/test/features/inspector/inspector.css.test.ts`, copying the `rule()` helper verbatim from `test/features/outline/TreePanel.test.tsx` (lines 17-21) — including its start-of-line anchoring, which is what stops `.rich-code {` also matching inside a descendant selector:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Paths resolve from the PACKAGE root, not the test file — that is what lets the mirrored test
// tree sit at any depth. Do not reach for import.meta.url: under jsdom it is an http URL.
const css = readFileSync(resolve(process.cwd(), 'src/features/inspector/inspector.css'), 'utf8');

function rule(css: string, selector: string): string {
  const m = new RegExp(`^\\${selector}\\s*\\{([^}]*)\\}`, 'm').exec(css);
  expect(m, `${selector} has no rule of its own in inspector.css`).toBeTruthy();
  return m![1];
}

describe('inspector.css', () => {
  it('styles a code span from tokens, with no colour literal', () => {
    const body = rule(css, '.rich-code');
    expect(body).toMatch(/var\(--chip\)/);
    expect(body).not.toMatch(/#[0-9a-f]{3,8}|rgb\(|hsl\(/i);
  });
});
```

- [x] **Step 2: Run to verify they fail**

Run: `cd apps/web && npx vitest run test/features/inspector/`
Expected: FAIL — no `<strong>`/`<code>` produced, and `.rich-code` has no rule.

- [x] **Step 3: Format prose in `FieldRows.tsx`**

Add the import: `import { renderRichText } from '@/core/richText';`

Add this helper above `Row`:

```tsx
/** Prose gets its two inline marks; anything already an element (a NodeLink, say) passes through.
 *  Applied here rather than at each call site so every prose slot the panel renders behaves the
 *  same — node and connection descriptions, and every list item. Canvas text never comes through
 *  this file, which is why summaries and edge labels stay literally plain. */
const prose = (children: React.ReactNode): React.ReactNode =>
  typeof children === 'string' ? renderRichText(children) : children;
```

In `Row`, wrap both `{children}` occurrences: `{prose(children)}`.

In `ListRow`, wrap the item: `<li key={`${i}:${item}`}>{renderRichText(item)}</li>`.

`FieldRow`'s `list` branch already delegates to `ListRow`, and its scalar branch already goes through `Row`, so both are covered with no further change.

- [x] **Step 4: Add the CSS rule**

In `apps/web/src/features/inspector/inspector.css`, add after the `.field__list` rule (~line 57). It must sit below `.field__value`/`.field__list` in source order, since those are equal-specificity class selectors and source order is the cascade:

```css
/* A code span inside panel prose. `.field__list` is already monospace, so the chip background —
 * not the font — is what makes a code span read as one in either context. */
.rich-code {
  font-family: var(--font-mono); font-size: 0.92em;
  background: var(--chip); border-radius: var(--r-sm);
  padding: 0 var(--s-1);
}
```

- [x] **Step 5: Run the web suite**

Run: `cd apps/web && npx vitest run`
Expected: PASS. `test/styles/tokens.test.ts` must stay green — the rule adds no literal and no new token.

- [x] **Step 6: Typecheck**

Run: `pnpm --filter @hyphae/web typecheck`
Expected: exactly **4** errors, the known pre-existing floor. A 5th is yours.

- [x] **Step 7: Commit**

```bash
git status --short
git add apps/web/src/features/inspector/FieldRows.tsx apps/web/src/features/inspector/inspector.css apps/web/test/features/inspector/
git commit -m "feat(web): render bold and code spans in inspector prose

Applied in Row/ListRow rather than at each call site, so every prose slot
behaves the same and canvas text — which never routes through this file —
stays literally plain, per 'meaning on the canvas, detail in the panel'.

The model was already asking for this: an existing invariant reads
'the \`main\` source set implements it', with backticks rendering as
literal characters.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Docs

**Files:**
- Modify: `docs/MODEL.md` (§3.1, §4, §7)
- Modify: `docs/SPEC.md` (§6.2, §8, §9)
- Modify: `README.md`

**Interfaces:**
- Consumes: the vocabulary from Tasks 1-6.
- Produces: nothing.

Docs only — no tests. The schema wins any disagreement, so read the shipped `c4-backend.ts` before writing.

- [x] **Step 1: `docs/MODEL.md`**

§3.1 (line ~82): change `` (`responsibilities`, `invariants`, `technology`, …) `` to `` (`responsibilities`, `rules`, `technology`, …) ``.

§4, "What is NOT first-class" (line ~192): change `` `responsibilities`, local `invariants` `` to `` `responsibilities`, local `rules` ``, and `(A cross-cutting invariant → a Requirement.)` to `(A cross-cutting rule → a Requirement.)`.

§7 principle 6 (line ~313): change "A single node's invariant — a field; cross-cutting — a Requirement." to "A single node's rule — a field; cross-cutting — a Requirement."

§7: add principle 9 after principle 8:

```markdown
9. **Prose names the responsibility; refs name the code.** A node's or connection's prose must
   stay true after a refactor that renames every symbol inside it. If renaming a class breaks your
   description, the description is in the wrong layer: the code belongs in `codeRefs` or a Pattern,
   both of which exist to hold it. The three prose slots divide the work and never repeat each
   other — `summary` says what it is for, `responsibilities` what it is accountable for, `rules`
   what always holds, and `description` carries only what a list structurally cannot.
```

Bump the version line at the foot to `Concept version: 0.4 — business-legible prose.`

- [x] **Step 2: `docs/SPEC.md`**

§6.2 (line ~135): change the `fields` paragraph to name `rules` instead of `invariants`, and add a sentence: "The three prose slots never repeat each other — see MODEL.md §7 principle 9."

§8, the "Free text + structured fields" bullet (line ~296): change `` `responsibilities` / `invariants` / `carries` `` to `` `responsibilities` / `rules` / `carries` ``.

§9, after the "Meaning on the canvas, detail in the panel" bullet, add:

```markdown
- **Prose names the responsibility; refs name the code.** Node and connection prose must survive a
  refactor that renames every symbol inside it; code detail belongs in `codeRefs` and Patterns.
  Panel prose carries two inline marks — `**bold**` and `` `code` `` — and a code span is for a
  name that is part of the system's contract, never an internal symbol. Canvas text takes no marks.
  `model_gaps` measures all of this: an over-budget description, code-shaped prose, and a
  responsibility its own description already states.
```

§11: add a row to the roadmap table — `| F | Business-legible prose | **shipped** |` — and a short section describing it, in the style of the other phase sections.

§12 open questions: add the two from the spec's §11 (threshold drift; `rules` on connections).

Bump the version line at the foot to `Spec version: 0.4 — business-legible prose.`

- [x] **Step 3: `README.md`**

Run `grep -n "invariants" README.md` and update each hit to `rules`. Where the MCP tool list documents `model_gaps`, add that it also reports bloated/code-shaped/restating prose.

- [x] **Step 4: Verify no stale references remain**

Run: `grep -rn "invariants" --include=*.md --include=*.ts --include=*.tsx . | grep -v "docs/superpowers/" | grep -v node_modules`
Expected: only the deliberate historical mentions — the `validate.test.ts` no-migration test from Task 1, and any line explaining the rename. `docs/superpowers/` is excluded because those are dated historical records and must not be rewritten.

- [x] **Step 5: Commit**

```bash
git status --short
git add docs/MODEL.md docs/SPEC.md README.md
git commit -m "docs: record the prose rule and the rules field

Adds anti-redundancy principle 9 — prose names the responsibility, refs
name the code — and the division of labour between the four prose slots,
which is the part the measurement showed agents do not infer.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: The modeling skill

**Files:**
- Modify: `skills/building-architecture-models/SKILL.md`
- Modify: `skills/building-architecture-models/references/subagent-prompt.md`

**Interfaces:**
- Consumes: the vocabulary from Tasks 1-7.
- Produces: nothing.

This task carries the incidental defect fix. `subagent-prompt.md` is deliberately self-contained ("This prompt is complete"), so every rule must be restated there rather than cross-referenced.

- [x] **Step 1: Add the node prose section to `SKILL.md`**

In *The visual vocabulary*, after the `fields.summary` bullet and before the edge bullet, insert:

```markdown
- **Prose names the responsibility; refs name the code.** The single rule for node prose, and the
  counterpart to the edge test below. A node's text must stay true after a refactor that renames
  every symbol inside it. If renaming a class breaks your description, the description is in the
  wrong layer — code belongs in `codeRefs` and Patterns, which exist to hold it.

      BAD   "Every game tick, onTick() drains a PathEvent queue (toDispatch, a
             LinkedBlockingQueue filled by queuePathEvent), then calls tickPath(), a
             hand-rolled state machine guarded by pathPlanLock and pathCalcLock."
      GOOD  "Owns the path the bot is currently walking. Searches run off the game thread, so
             a path can be replaced mid-walk; the component exists to make that swap invisible
             to everything downstream."

  Measured on the 112-node Baritone model, the worst description ran to 2,177 characters of
  method and lock names — a code walkthrough duplicating what its own `codeRefs` already pointed
  at, and stale the moment anyone renamed a method.

- **The four prose slots divide the work and never repeat each other.** Each fact lives in exactly
  one of them. This is the rule most often broken: a third of the real model's `responsibilities`
  were already ≥60% restated by their own node's description.

  | Slot | Carries | Test |
  |---|---|---|
  | `fields.summary` | what it is *for*, one line, on canvas | Would a stranger know why this box exists? |
  | `fields.responsibilities` | what it is **accountable for** | *"The system relies on `<name>` to ___"* |
  | `fields.rules` | what **always holds** | *"You can count on this even when ___"* |
  | `description` | only what a list cannot carry: why it exists, the trade-off it embodies, how it participates in the system's stories | Does a sentence restate a list item? Cut it. |

      responsibilities
        BAD   "Runs the per-tick state machine: advance, fail-over, splice, or start a calc"
        GOOD  "Keeps exactly one path being walked at a time, and replaces it before it runs out"
      rules
        BAD   "findPathInNewThread() must only be called while holding pathCalcLock"
        GOOD  "Never hands out a path computed from a position the player has already left"

  If a fact is enumerable it goes in a list and is **not** repeated in prose. When both hold it,
  the prose is what gets cut — the list is the scannable form.

- **Panel prose takes two inline marks:** `**bold**` and `` `code` ``. They render in
  `description`, `responsibilities` and `rules`; canvas text (`summary`, a connection's `label`)
  takes none and shows them literally. A code span is for a name that is **part of the system's
  contract** — a config key, an environment variable, a wire-protocol field, a published API name.
  Never an internal class or method: those are exactly what the rule above removes.
```

- [x] **Step 2: Rename `invariants` through `SKILL.md`**

Run `grep -n "invariants" skills/building-architecture-models/SKILL.md` and change each to `rules` — including the Phase 1 field list (~line 63) and the Phase 2 Components bullet (~line 74).

- [x] **Step 3: Add the red flags**

In *Red flags — STOP*, append:

```markdown
- A `description` that names a method, a lock, a private field or a line number → that is a code
  comment; move it to `codeRefs` or a Pattern and say what the node is *for* instead.
- A `fields.rules` entry stating a call order, a lock protocol or a null check → not a rule; a rule
  is a promise about behaviour that survives a rename.
- A `description` sentence that restates a `responsibilities` item → cut the sentence, keep the
  list entry.
- A code span on an internal class or method name → code spans are for contract names only.
```

- [x] **Step 4: Add the new gap flags to Phase 5**

In Phase 5 step 1, after the sentence describing `model_gaps`, add:

```markdown
   `model_gaps` also returns `bloatedProse` — prose that is over the length budget, reads as code
   (identifier density), or restates a `responsibilities` item it sits beside. Each entry names the
   reason and the measurement. Treat these as candidates like every other flag: fix by rewriting
   the prose against the four-slot table in **The visual vocabulary**, never by deleting the field.
```

Add the same flags to the GATE 2 coverage sweep in Phase 3 step 2, which calls `model_gaps` inline.

- [x] **Step 5: Fix `subagent-prompt.md` — the stale verb vocabulary**

This is the incidental defect. Replace **step 0**:

```markdown
0. Call `mcp__hyphae__describe_profile` first to learn the current node kinds, roles, pattern kinds, fields, and enum values.
```

Replace **step 4** in full:

```markdown
4. Create all intra-container edges in one `mcp__hyphae__create_connections` call, ONLY when BOTH
   endpoints are your own Components. Each edge carries a free-text `label` — the only text drawn
   on the diagram. There is NO verb vocabulary; the label alone carries the meaning.
   **An edge earns its place by saying something a reader cannot infer from the two node names.**
   The test is mechanical: read the sentence *"`<from name>` `<label>` `<to name>`"* and ask what a
   reader learns beyond "these two are connected". If the answer is nothing, **do not create the
   edge.**

       BAD   Process Contracts  uses           Pathing Goals   <- asserts only that a dep exists
       BAD   PathingBehavior    reads settings Settings        <- true of nearly every component
       GOOD  A* Search Engine   hands the node chain to        Path Result Assembler

   Containment already implies that things inside a container depend on each other. Prefer twenty
   edges that say something to two hundred that do not.
```

In the report JSON shape, replace the `crossPackageDeps` entry's `"verb"` and `"object"` keys with a single `"label"`:

```json
    { "from": "<your component name>",
      "toContainer": "<the container/package that owns the target, or \"external\" for an external system>",
      "to": "<target node name within that container (or the external system name)>",
      "label": "<free text: what this edge does, passing the test in step 4>", "why": "..." }
```

And in the paragraph below the "You MUST NOT" line, replace the final sentence ("Include a `verb` from the profile's verb vocabulary…") with:

```markdown
Include a `label` that passes the step-4 test, so the orchestrator creates an edge that says something rather than one that merely asserts a dependency.
```

- [x] **Step 6: Add the prose rules to `subagent-prompt.md`**

In step 3 (**Components**), replace the sentence naming the domain fields with:

```markdown
   Put other domain values (`responsibilities`, `rules`, `technology`) in the `fields` bag where
   known — `describe_profile` (step 0) lists the valid keys.

   **Prose names the responsibility; refs name the code.** Everything you write must stay true
   after a refactor that renames every symbol inside the component. A method name, a lock, a
   private field or a line number in a `description` is a code comment — put the code in
   `codeRefs` (step 3a) and say what the component is *for* instead.

   The four slots divide the work and **never repeat each other**:
     summary          what it is for, one line, on canvas
     responsibilities what it is accountable for — "The system relies on <name> to ___"
     rules            what always holds — a promise that survives a rename, never a lock
                      protocol, call ordering or null check
     description      ONLY what a list cannot carry: why it exists, the trade-off it embodies,
                      how it participates in the system's stories

       responsibilities  BAD  "Runs the per-tick state machine: advance, fail-over, or start a calc"
                         GOOD "Keeps exactly one path being walked at a time, and replaces it
                               before it runs out"
       rules             BAD  "findPathInNewThread() must only be called while holding pathCalcLock"
                         GOOD "Never hands out a path computed from a position the player has
                               already left"

   If a fact is enumerable it goes in a list and is NOT repeated in `description`.

   `description`, `responsibilities` and `rules` take two inline marks: `**bold**` and `` `code` ``.
   A code span is for a name that is part of the system's contract — a config key, an environment
   variable, a wire-protocol field. Never an internal class or method.
```

Also change step 6's self-review list from "`description` / `responsibilities` / `invariants`" to "`description` / `responsibilities` / `rules`", and append to step 6:

```markdown
   Also check each component for the two prose faults: a `description` that names methods or locks,
   and a `description` sentence that restates a `responsibilities` item. Fix both before returning.
```

- [x] **Step 7: Verify the skill is self-consistent**

Run: `grep -rn "verb\|invariants" skills/building-architecture-models/`
Expected: no hit instructing an agent to *set* a verb or fill `invariants`. A hit explaining that the verb vocabulary was removed is fine.

- [x] **Step 8: Full verification**

Run: `pnpm -r test`
Expected: all green, above the 771 baseline.

Run: `pnpm -r build`
Expected: clean.

Run: `pnpm --filter @hyphae/web typecheck`
Expected: exactly 4 errors (the known floor).

- [x] **Step 9: Commit**

```bash
git status --short
git add skills/building-architecture-models/SKILL.md skills/building-architecture-models/references/subagent-prompt.md
git commit -m "docs(skill): teach the prose rule, and fix the stale verb instructions

Adds the node-prose counterpart to the edge test: prose must survive a
refactor that renames every symbol inside it, and the four slots divide
the work without repeating each other — the part the measurement showed
agents do not infer, with a third of responsibilities already restated by
their own description.

Also repairs an unrelated defect the file carried since the legibility
work: steps 0 and 4 and the report shape still commanded a CLOSED verb
vocabulary that was deleted three weeks ago, so every model built from
this prompt was authored against a vocabulary that no longer exists.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Self-review

**Spec coverage.** §3 governing rule → Tasks 7, 8. §3 division of labour → Tasks 1 (FieldDef text), 7, 8. §4 field vocabulary + no migration → Task 1; call sites → Task 4. §5 measurement → Tasks 2, 3. §6 formatting → Tasks 5, 6. §7 skill (incl. the verb defect) → Task 8. §8 docs → Task 7. §9 testing → distributed, with the full sweep in Task 8 step 8. §10 out-of-scope items appear in no task, correctly.

**Type consistency.** `rules` is the key in Tasks 1, 4, 6, 7, 8. `bloatedProse` / `BloatedProse` and the three reason strings match between Tasks 3, 7 and 8. `renderRichText` is named identically in Tasks 5 and 6. `identifierDensity` / `wordCoverage` match between Tasks 2 and 3. The `.rich-code` class name matches across Tasks 5, 6 and the CSS test.

**Known soft spots, flagged rather than papered over.** Task 4 step 1 and Task 6 step 1's `SidePanel` test must adapt to seeding helpers this plan has not read — both say so and name what to match. Task 3 step 5 branches on whether `index.ts` re-exports gap types. Task 1 step 4 anticipates a `validate.test.ts` fixture that may seed the old key.

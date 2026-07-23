# Phase C — Patterns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a profile-driven **Pattern** overlay entity (pipeline / middleware / state-machine / layered / event-bus) with schema, validation, server CRUD, MCP read+write tools, and a dedicated canvas renderer for pipeline and state-machine — absorbing the old `stateMachines` axis.

**Architecture:** A `Pattern` has `id`, `name`, `kind` (a profile `patternKinds` id), `members` (`{name, nodeId?, ref?, description?}`, at most one binding), `transitions` (state-machine detail keyed by member name), and an optional `anchor` node whose root resolves ref members. Member array order is the stage order. Rendering is **dedicated**: selecting a pattern swaps the canvas to a self-contained diagram of that pattern (node- and ref-members draw as identical boxes). Pipeline and state-machine get bespoke layouts; the other three kinds fall back to a member list.

**Tech Stack:** pnpm workspaces · TypeScript · Zod (`packages/schema`) · Hono (`apps/server`) · Vite + React 18 + `@xyflow/react` + Zustand (`apps/web`) · Vitest · MCP over an HTTP client of the running server.

## Global Constraints

- **No model-file migration, and NEVER `git add` a model `.json`.** `apps/server/hyphae-cctv-new.json` is untracked; `apps/server/hyphae.json` is the tracked working file. Stage files explicitly (never `git add apps/server`). Run `git status --short` before **every** commit and confirm no `.json` is staged.
- **Zod schemas in `packages/schema/src` are the single source of truth.** Never hand-write a JSON Schema or duplicate a type. New vocabulary (`patternKinds`) is profile-declared, never hardcoded in a renderer.
- **`schemaVersion` stays `1`.** Patterns are additive; dropping `stateMachines` is read-safe (a non-strict Zod object strips the now-unknown key). No migration script.
- **`pnpm -r test` does NOT type-check** (vitest strips types via esbuild). After every task run all three:
  `pnpm --filter @hyphae/schema exec tsc -p tsconfig.json`
  `pnpm --filter @hyphae/server exec tsc -p tsconfig.json`
  `pnpm --filter @hyphae/web exec tsc --noEmit -p tsconfig.json`
- **A Zod `.default(...)` makes the field required in the inferred output type.** Hand-built model/profile literals in tests must supply every non-defaulted field. `Profile` gains a required `patternKinds`; `HyphaeModel` gains `patterns` and loses `stateMachines`.
- **Optional-by-default.** Only `Pattern.name` (and `PatternMember.name`) are required; everything else defaults.
- Write scratch to the scratchpad dir, never the repo.

## File map

| File | Change |
|------|--------|
| `packages/schema/src/pattern.ts` | **create** — `PatternMemberSchema`, `PatternTransitionSchema`, `PatternSchema` + types |
| `packages/schema/src/profile.ts` | add `PatternRendererSchema`, `PatternKindDefSchema`, `patternKinds` on `ProfileSchema`, `patternKindDefOf`, types |
| `packages/schema/src/profiles/c4-backend.ts` | declare the five `patternKinds` |
| `packages/schema/src/model.ts` | add `patterns`, remove `stateMachines` (field + import + `emptyModel`) |
| `packages/schema/src/reserved.ts` | drop `StateMachineSchema` |
| `packages/schema/src/index.ts` | export `./pattern` |
| `packages/schema/src/validate.ts` | seven `pattern-*` Issue kinds + pattern loop |
| `apps/server/src/store.ts` | `PatternInput`, `addPattern`/`updatePattern`/`deletePattern` |
| `apps/server/src/routes.ts` | `POST`/`PATCH`/`DELETE /patterns` |
| `apps/server/src/mcp.ts` | `patternItemSchema`, `HyphaeApi` methods, tool handlers, `httpApi`, `main()` registrations |
| `apps/web/src/store.ts` | `selectedPatternId` + `selectPattern` (mutually exclusive with `selectedFlowId`) |
| `apps/web/src/patternView.ts` | **create** — pure `(pattern, profile, nodes) → {nodes, edges}` |
| `apps/web/src/PatternMemberNode.tsx` | **create** — the member box renderer |
| `apps/web/src/Canvas.tsx` | pattern-mode switch + register node type + `PatternPicker` in the panel |
| `apps/web/src/PatternPicker.tsx` | **create** — mirrors `FlowPicker` |
| test literals with `stateMachines: []` | `apps/web/test/store.test.ts`, `App.test.tsx`, `SidePanel.test.tsx` → `patterns: []` |
| `plugins/hyphae-modeling/skills/building-architecture-models/SKILL.md` | a "Patterns" section |

---

### Task 1: PatternSchema

**Files:**
- Create: `packages/schema/src/pattern.ts`
- Create: `packages/schema/test/pattern.test.ts`
- Modify: `packages/schema/src/index.ts`

**Interfaces:**
- Produces: `PatternSchema`, `PatternMemberSchema`, `PatternTransitionSchema` (Zod), and types `Pattern`, `PatternMember`, `PatternTransition`. `Pattern` = `{ id: string; name: string; kind: string; description: string; anchor: string | null; members: PatternMember[]; transitions: PatternTransition[] }`. `PatternMember` = `{ name: string; nodeId?: string; ref?: string; description: string }`. `PatternTransition` = `{ from: string; to: string; trigger: string; description: string }`.

- [ ] **Step 1: Write the failing test**

Create `packages/schema/test/pattern.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { PatternSchema } from '../src/pattern';

describe('PatternSchema', () => {
  it('parses a minimal pattern and defaults description/anchor/members/transitions', () => {
    const p = PatternSchema.parse({ id: 'p1', name: 'Ingest', kind: 'pipeline' });
    expect(p).toMatchObject({ id: 'p1', name: 'Ingest', kind: 'pipeline', description: '', anchor: null, members: [], transitions: [] });
  });

  it('defaults a member description and keeps a nodeId or a ref', () => {
    const p = PatternSchema.parse({ id: 'p', name: 'P', kind: 'pipeline', members: [
      { name: 'Decode', ref: 'src/decode.ts' },
      { name: 'Sink', nodeId: 'n1' },
      { name: 'Idle' },
    ] });
    expect(p.members[0]).toMatchObject({ name: 'Decode', ref: 'src/decode.ts', description: '' });
    expect(p.members[1]).toMatchObject({ name: 'Sink', nodeId: 'n1' });
    expect(p.members[2].nodeId).toBeUndefined();
    expect(p.members[2].ref).toBeUndefined();
  });

  it('keeps transitions and defaults their trigger/description', () => {
    const p = PatternSchema.parse({ id: 'p', name: 'P', kind: 'state-machine',
      members: [{ name: 'Idle' }, { name: 'Recording' }],
      transitions: [{ from: 'Idle', to: 'Recording' }] });
    expect(p.transitions[0]).toMatchObject({ from: 'Idle', to: 'Recording', trigger: '', description: '' });
  });

  it('rejects a pattern with an empty name', () => {
    expect(() => PatternSchema.parse({ id: 'p', name: '', kind: 'pipeline' })).toThrow();
  });

  it('rejects a member with an empty name', () => {
    expect(() => PatternSchema.parse({ id: 'p', name: 'P', kind: 'pipeline', members: [{ name: '' }] })).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hyphae/schema exec vitest run test/pattern.test.ts`
Expected: FAIL — cannot find module `../src/pattern`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/schema/src/pattern.ts`:

```ts
import { z } from 'zod';

/** A pattern member: a named element that may bind to a node (`nodeId`) OR a code Ref
 *  (`ref`) — at most one. A member with neither is a pure name (e.g. a state). */
export const PatternMemberSchema = z.object({
  name: z.string().min(1),
  nodeId: z.string().optional(),
  ref: z.string().optional(),
  description: z.string().default(''),
});

/** A directed transition between two members, referenced by member name (state-machine detail). */
export const PatternTransitionSchema = z.object({
  from: z.string(),
  to: z.string(),
  trigger: z.string().default(''),
  description: z.string().default(''),
});

/** A recognized architectural shape over a set of members (the Structure overlay).
 *  Member array order is the stage order for ordered kinds. `anchor` is the node this
 *  pattern describes; a ref member resolves against the anchor's root. */
export const PatternSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  kind: z.string(),
  description: z.string().default(''),
  anchor: z.string().nullable().default(null),
  members: z.array(PatternMemberSchema).default([]),
  transitions: z.array(PatternTransitionSchema).default([]),
});

export type PatternMember = z.infer<typeof PatternMemberSchema>;
export type PatternTransition = z.infer<typeof PatternTransitionSchema>;
export type Pattern = z.infer<typeof PatternSchema>;
```

Add to `packages/schema/src/index.ts` after the `./flow` line (line 5):

```ts
export * from './pattern';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @hyphae/schema exec vitest run test/pattern.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Type-check and commit**

Run: `pnpm --filter @hyphae/schema exec tsc -p tsconfig.json`
Expected: no output (clean).

```bash
git add packages/schema/src/pattern.ts packages/schema/src/index.ts packages/schema/test/pattern.test.ts
git status --short   # confirm no .json staged
git commit -m "feat(schema): PatternSchema (members, transitions, anchor)"
```

---

### Task 2: patternKinds profile vocabulary

**Files:**
- Modify: `packages/schema/src/profile.ts`
- Modify: `packages/schema/src/profiles/c4-backend.ts`
- Modify: `packages/schema/test/c4-backend.test.ts`
- Test: `packages/schema/test/profile.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `PatternRendererSchema` (`z.enum([...])`), `PatternKindDefSchema`, `ProfileSchema.patternKinds: PatternKindDef[]`, helper `patternKindDefOf(profile, id) => PatternKindDef | undefined`, types `PatternRenderer`, `PatternKindDef`. `PatternKindDef` = `{ id: string; description: string; renderer: PatternRenderer; ordered: boolean }`.

- [ ] **Step 1: Write the failing test**

Add to `packages/schema/test/c4-backend.test.ts` inside the `describe('c4-backend visual vocabulary', ...)` block (before its closing `});` at line 107):

```ts
  it('declares the five pattern kinds, each with a described renderer', () => {
    const ids = c4Backend.patternKinds.map((k) => k.id).sort();
    expect(ids).toEqual(['event-bus', 'layered', 'middleware', 'pipeline', 'state-machine']);
    for (const k of c4Backend.patternKinds) expect(k.description).toMatch(/\S/);
  });

  it('marks pipeline and middleware as ordered', () => {
    const ordered = new Set(c4Backend.patternKinds.filter((k) => k.ordered).map((k) => k.id));
    expect(ordered).toEqual(new Set(['pipeline', 'middleware']));
  });
```

Add to `packages/schema/test/profile.test.ts` a new test (append inside the top-level `describe`, or add a fresh block at end of file):

```ts
import { patternKindDefOf } from '../src/profile';
import { c4Backend } from '../src/profiles/c4-backend';

describe('patternKinds', () => {
  it('patternKindDefOf resolves a declared kind and its renderer', () => {
    expect(patternKindDefOf(c4Backend, 'pipeline')?.renderer).toBe('pipeline');
    expect(patternKindDefOf(c4Backend, 'nope')).toBeUndefined();
  });
});
```

(If `profile.test.ts` already imports `c4Backend`/`describe`, drop the duplicate imports — keep only `patternKindDefOf` in the import list.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hyphae/schema exec vitest run test/c4-backend.test.ts test/profile.test.ts`
Expected: FAIL — `patternKinds` undefined / `patternKindDefOf` is not exported.

- [ ] **Step 3: Write minimal implementation**

In `packages/schema/src/profile.ts`, after `VerbDefSchema` (line 34) add:

```ts
/** Which built-in renderer draws a pattern kind. The profile names it; the code owns the geometry. */
export const PatternRendererSchema = z.enum([
  'pipeline', 'middleware', 'state-machine', 'layered', 'event-bus',
]);

export const PatternKindDefSchema = z.object({
  id: z.string(),
  description: z.string(),
  renderer: PatternRendererSchema,
  ordered: z.boolean().default(false),
});
```

In `ProfileSchema` (the `z.object({...})` at line 64), add after `verbs: z.array(VerbDefSchema).default([]),` (line 70):

```ts
  patternKinds: z.array(PatternKindDefSchema).default([]),
```

After the `VerbDef` type export (line 84) add:

```ts
export type PatternRenderer = z.infer<typeof PatternRendererSchema>;
export type PatternKindDef = z.infer<typeof PatternKindDefSchema>;
```

After `verbDefOf` (line 93) add:

```ts
export const patternKindDefOf = (profile: Profile, kindId: string): PatternKindDef | undefined =>
  profile.patternKinds.find((k) => k.id === kindId);
```

In `packages/schema/src/profiles/c4-backend.ts`, add a `patternKinds` array to the `c4Backend` object. Put it right after the `verbs: [ ... ],` array closes (after line 42):

```ts
  patternKinds: [
    { id: 'pipeline', renderer: 'pipeline', ordered: true, description: 'Ordered stages data flows through in sequence (e.g. decode → normalize → persist). Members are the stages, in array order.' },
    { id: 'middleware', renderer: 'middleware', ordered: true, description: 'A request passes through an ordered chain of interceptors (e.g. auth → log → handler).' },
    { id: 'state-machine', renderer: 'state-machine', ordered: false, description: 'States and the transitions between them (e.g. Idle → Recording → Error). Members are states (pure names); transitions connect them by member name.' },
    { id: 'layered', renderer: 'layered', ordered: false, description: 'Stacked architectural bands (e.g. UI / domain / data).' },
    { id: 'event-bus', renderer: 'event-bus', ordered: false, description: 'A hub with publishers and subscribers around it.' },
  ],
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @hyphae/schema exec vitest run test/c4-backend.test.ts test/profile.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check and commit**

Run: `pnpm --filter @hyphae/schema exec tsc -p tsconfig.json`
Expected: clean. (If it complains `patternKinds` is missing on `c4Backend`, the array wasn't added — it is required by the inferred `Profile` type.)

```bash
git add packages/schema/src/profile.ts packages/schema/src/profiles/c4-backend.ts packages/schema/test/c4-backend.test.ts packages/schema/test/profile.test.ts
git status --short
git commit -m "feat(schema): patternKinds profile vocabulary + c4-backend kinds"
```

---

### Task 3: Model wiring — add `patterns`, drop `stateMachines`

**Files:**
- Modify: `packages/schema/src/model.ts`
- Modify: `packages/schema/src/reserved.ts`
- Modify: `packages/schema/test/model.test.ts`
- Modify: `apps/web/test/store.test.ts`
- Modify: `apps/web/test/App.test.tsx`
- Modify: `apps/web/test/SidePanel.test.tsx`

**Interfaces:**
- Consumes: `PatternSchema` from Task 1.
- Produces: `HyphaeModel.patterns: Pattern[]`; `HyphaeModel` no longer has `stateMachines`. `emptyModel()` returns `patterns: []` in place of `stateMachines: []`. Top-level key order: `schemaVersion, metadata, activeProfile, nodes, connections, flows, patterns, dataTypes, requirements, decisions, views`.

- [ ] **Step 1: Update the failing tests first**

In `packages/schema/test/model.test.ts`, replace line 11:

```ts
    expect(m.stateMachines).toEqual([]);
```

with:

```ts
    expect(m.patterns).toEqual([]);
```

and replace the key-order array (lines 20-24) with:

```ts
    expect(Object.keys(emptyModel())).toEqual([
      'schemaVersion', 'metadata', 'activeProfile',
      'nodes', 'connections', 'flows', 'patterns',
      'dataTypes', 'requirements', 'decisions', 'views',
    ]);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hyphae/schema exec vitest run test/model.test.ts`
Expected: FAIL — `m.patterns` is undefined / key order mismatch.

- [ ] **Step 3: Write the implementation**

In `packages/schema/src/reserved.ts`, delete the `StateMachineSchema` line so it reads:

```ts
import { z } from 'zod';

// Reserved axes (SPEC.md §6.6). Present in the schema as opaque arrays so the model file
// shape is stable; editors arrive in later phases.
export const DataTypeSchema = z.unknown();
export const RequirementSchema = z.unknown();
export const DecisionSchema = z.unknown();
```

In `packages/schema/src/model.ts`:

- Add the pattern import after the flow import (line 5):
```ts
import { PatternSchema } from './pattern';
```
- Change the reserved import (lines 6-9) to drop `StateMachineSchema`:
```ts
import {
  DataTypeSchema, RequirementSchema, DecisionSchema,
} from './reserved';
```
- In `HyphaeModelSchema` replace the `stateMachines` line (line 26) with:
```ts
  patterns: z.array(PatternSchema).default([]),
```
- In `emptyModel()` replace the `stateMachines: []` line (line 44) with:
```ts
    patterns: [],
```

- [ ] **Step 4: Run schema tests**

Run: `pnpm --filter @hyphae/schema exec vitest run`
Expected: PASS (all schema tests, including `json-schema.test.ts`, `flow.test.ts`, `pattern.test.ts`).

- [ ] **Step 5: Fix the web test literals**

In each of `apps/web/test/store.test.ts` (line ~13), `apps/web/test/App.test.tsx` (line ~12), and `apps/web/test/SidePanel.test.tsx` (line ~12), replace the substring:

```ts
flows: [], stateMachines: [],
```

with:

```ts
flows: [], patterns: [],
```

- [ ] **Step 6: Run schema + web tests and type-check all three**

Run:
```
pnpm --filter @hyphae/schema exec vitest run
pnpm --filter @hyphae/web exec vitest run
pnpm --filter @hyphae/schema exec tsc -p tsconfig.json
pnpm --filter @hyphae/server exec tsc -p tsconfig.json
pnpm --filter @hyphae/web exec tsc --noEmit -p tsconfig.json
```
Expected: all PASS / clean. (Server tests still use `emptyModel()`, so no server literal changes — but confirm server `tsc` is clean, since `store.ts`/`mcp.ts` import from the model.)

- [ ] **Step 7: Commit**

```bash
git add packages/schema/src/model.ts packages/schema/src/reserved.ts packages/schema/test/model.test.ts apps/web/test/store.test.ts apps/web/test/App.test.tsx apps/web/test/SidePanel.test.tsx
git status --short   # NO .json
git commit -m "feat(schema): add patterns to the model, drop stateMachines"
```

---

### Task 4: Pattern validation

**Files:**
- Modify: `packages/schema/src/validate.ts`
- Test: `packages/schema/test/validate.test.ts`

**Interfaces:**
- Consumes: `Pattern` (Task 1), `patternKinds` (Task 2), `resolveRef` from `./ref`.
- Produces: seven new `Issue.kind` values, all prefixed `pattern-`: `pattern-unknown-kind`, `pattern-member-double-bind`, `pattern-member-bad-node`, `pattern-bad-anchor`, `pattern-unanchored-ref`, `pattern-bad-transition`, `pattern-duplicate-member-name`. Each issue's `ref` is the pattern id.

- [ ] **Step 1: Write the failing tests**

Append to `packages/schema/test/validate.test.ts` (import `c4Backend`, `validateModel`, `emptyModel` are already imported at the top of that file — reuse them; add a fresh `describe`):

```ts
describe('pattern validation', () => {
  const base = { description: '', root: null, role: null, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: { summary: 's' } };
  const patternModel = () => {
    const m = emptyModel();
    m.nodes.push(
      { id: 'cont', name: 'Gateway', type: 'Container', parentId: null, ...base, root: 'media_gateway/' } as never,
      { id: 'comp', name: 'Ingest', type: 'Component', parentId: 'cont', ...base } as never,
    );
    return m;
  };

  it('accepts a realistic ref-member pipeline anchored to a component', () => {
    const m = patternModel();
    m.patterns.push({ id: 'p1', name: 'Ingest', kind: 'pipeline', description: '', anchor: 'comp',
      members: [{ name: 'Decode', ref: 'decode.ts', description: '' }, { name: 'Persist', nodeId: 'comp', description: '' }],
      transitions: [] });
    expect(validateModel(m, c4Backend)).toEqual([]);
  });

  it('accepts a pure-name state machine with transitions', () => {
    const m = patternModel();
    m.patterns.push({ id: 'p2', name: 'Recorder', kind: 'state-machine', description: '', anchor: null,
      members: [{ name: 'Idle', description: '' }, { name: 'Recording', description: '' }],
      transitions: [{ from: 'Idle', to: 'Recording', trigger: 'start', description: '' }] });
    expect(validateModel(m, c4Backend)).toEqual([]);
  });

  it('flags an unknown kind', () => {
    const m = patternModel();
    m.patterns.push({ id: 'p', name: 'X', kind: 'octopus', description: '', anchor: null, members: [], transitions: [] });
    expect(validateModel(m, c4Backend).filter((i) => i.kind === 'pattern-unknown-kind')).toHaveLength(1);
  });

  it('flags a member bound to both a node and a ref', () => {
    const m = patternModel();
    m.patterns.push({ id: 'p', name: 'X', kind: 'pipeline', description: '', anchor: 'comp',
      members: [{ name: 'M', nodeId: 'comp', ref: 'decode.ts', description: '' }], transitions: [] });
    const issues = validateModel(m, c4Backend).filter((i) => i.kind === 'pattern-member-double-bind');
    expect(issues).toHaveLength(1);
    expect(issues[0].ref).toBe('p');
  });

  it('flags a member nodeId that is not a node', () => {
    const m = patternModel();
    m.patterns.push({ id: 'p', name: 'X', kind: 'pipeline', description: '', anchor: null,
      members: [{ name: 'M', nodeId: 'ghost', description: '' }], transitions: [] });
    expect(validateModel(m, c4Backend).filter((i) => i.kind === 'pattern-member-bad-node')).toHaveLength(1);
  });

  it('flags an anchor that is not a node', () => {
    const m = patternModel();
    m.patterns.push({ id: 'p', name: 'X', kind: 'pipeline', description: '', anchor: 'ghost', members: [], transitions: [] });
    expect(validateModel(m, c4Backend).filter((i) => i.kind === 'pattern-bad-anchor')).toHaveLength(1);
  });

  it('flags a relative ref member with no anchoring root', () => {
    const m = patternModel();
    // comp has no root and its ancestor "cont" DOES declare one — so anchor:'comp' resolves.
    // Anchor null => the ref cannot resolve.
    m.patterns.push({ id: 'p', name: 'X', kind: 'pipeline', description: '', anchor: null,
      members: [{ name: 'M', ref: 'decode.ts', description: '' }], transitions: [] });
    expect(validateModel(m, c4Backend).filter((i) => i.kind === 'pattern-unanchored-ref')).toHaveLength(1);
  });

  it('flags a transition endpoint that is not a member name', () => {
    const m = patternModel();
    m.patterns.push({ id: 'p', name: 'X', kind: 'state-machine', description: '', anchor: null,
      members: [{ name: 'Idle', description: '' }],
      transitions: [{ from: 'Idle', to: 'Ghost', trigger: '', description: '' }] });
    expect(validateModel(m, c4Backend).filter((i) => i.kind === 'pattern-bad-transition')).toHaveLength(1);
  });

  it('flags duplicate member names', () => {
    const m = patternModel();
    m.patterns.push({ id: 'p', name: 'X', kind: 'pipeline', description: '', anchor: null,
      members: [{ name: 'M', description: '' }, { name: 'M', description: '' }], transitions: [] });
    expect(validateModel(m, c4Backend).filter((i) => i.kind === 'pattern-duplicate-member-name')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hyphae/schema exec vitest run test/validate.test.ts`
Expected: FAIL — new kinds not produced (and TS union rejects the kind strings at compile is not checked by vitest, so failures are assertion mismatches).

- [ ] **Step 3: Write the implementation**

In `packages/schema/src/validate.ts`:

- Extend the `ref` import (line 6) to include `resolveRef`:
```ts
import { isDirectoryRef, resolveRoot, resolveRef } from './ref';
```
- Extend the `Issue['kind']` union (add before the closing `;` after `'bad-flow-scope'` on line 15):
```ts
    | 'bad-flow-endpoint' | 'bad-flow-via' | 'bad-flow-scope'
    | 'pattern-unknown-kind' | 'pattern-member-double-bind' | 'pattern-member-bad-node'
    | 'pattern-bad-anchor' | 'pattern-unanchored-ref' | 'pattern-bad-transition'
    | 'pattern-duplicate-member-name';
```
(Replace the existing `| 'bad-flow-endpoint' | 'bad-flow-via' | 'bad-flow-scope';` line — note the trailing `;` moves to the last new line.)

- In `validateModel`, after the flow loop closes (after line 151, before `return issues;`) add:
```ts
  const patternKinds = new Set(profile.patternKinds.map((k) => k.id));
  for (const p of model.patterns) {
    if (!patternKinds.has(p.kind)) {
      issues.push({ kind: 'pattern-unknown-kind', ref: p.id, message: `Unknown pattern kind "${p.kind}"` });
    }
    if (p.anchor !== null && !nodeById.has(p.anchor)) {
      issues.push({ kind: 'pattern-bad-anchor', ref: p.id, message: `anchor "${p.anchor}" is not a node` });
    }
    const names = new Set<string>();
    for (const m of p.members) {
      if (m.nodeId !== undefined && m.ref !== undefined) {
        issues.push({ kind: 'pattern-member-double-bind', ref: p.id, message: `Member "${m.name}" has both a nodeId and a ref` });
      }
      if (m.nodeId !== undefined && !nodeById.has(m.nodeId)) {
        issues.push({ kind: 'pattern-member-bad-node', ref: p.id, message: `Member "${m.name}" nodeId "${m.nodeId}" is not a node` });
      }
      if (m.ref !== undefined && !m.ref.startsWith('/')) {
        const resolved = p.anchor !== null ? resolveRef(model.nodes, p.anchor, m.ref) : null;
        if (resolved === null) {
          issues.push({ kind: 'pattern-unanchored-ref', ref: p.id, message: `Member "${m.name}" ref "${m.ref}" cannot be resolved: no anchoring root (set the pattern's anchor to a node whose root chain covers it)` });
        }
      }
      if (names.has(m.name)) {
        issues.push({ kind: 'pattern-duplicate-member-name', ref: p.id, message: `Duplicate member name "${m.name}"` });
      }
      names.add(m.name);
    }
    for (const t of p.transitions) {
      if (!names.has(t.from) || !names.has(t.to)) {
        issues.push({ kind: 'pattern-bad-transition', ref: p.id, message: `Transition ${t.from} → ${t.to} references a name that is not a member` });
      }
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @hyphae/schema exec vitest run test/validate.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check and commit**

Run: `pnpm --filter @hyphae/schema exec tsc -p tsconfig.json`
Expected: clean.

```bash
git add packages/schema/src/validate.ts packages/schema/test/validate.test.ts
git status --short
git commit -m "feat(schema): validate patterns (members, anchor, refs, transitions)"
```

---

### Task 5: Server store — pattern CRUD

**Files:**
- Modify: `apps/server/src/store.ts`
- Test: `apps/server/test/store.test.ts`

**Interfaces:**
- Consumes: `Pattern`, `PatternSchema` from `@hyphae/schema`.
- Produces: `PatternInput = Partial<Pattern> & { name: string; kind: string }`; `ModelStore.addPattern(input): Pattern`, `updatePattern(id, patch): Pattern`, `deletePattern(id): void` — all commit through `newIssues` (throw `ValidationError` on a new issue) + persist + SSE.

- [ ] **Step 1: Write the failing tests**

In `apps/server/test/store.test.ts`, find the existing flow-CRUD `describe`/tests (around the `addFlow` tests near line 104) and add these tests alongside them (reuse the same `file` / `seed` helpers the flow tests use):

```ts
  it('addPattern persists a valid pattern', () => {
    const store = new ModelStore(file);
    const { a } = seed(store);
    const p = store.addPattern({ name: 'Recorder', kind: 'state-machine',
      members: [{ name: 'Idle' }, { name: 'Recording' }],
      transitions: [{ from: 'Idle', to: 'Recording' }] });
    expect(p.id).toBeTruthy();
    expect(store.get().patterns).toHaveLength(1);
    // an unbound state member is valid; a nodeId member must resolve
    expect(a.id).toBeTruthy();
  });

  it('addPattern rejects a pattern with an unknown kind', () => {
    const store = new ModelStore(file);
    seed(store);
    expect(() => store.addPattern({ name: 'Bad', kind: 'octopus' })).toThrow(ValidationError);
    expect(store.get().patterns).toEqual([]);
  });

  it('updatePattern throws NotFoundError for a missing id', () => {
    expect(() => new ModelStore(file).updatePattern('nope', { name: 'X' })).toThrow(NotFoundError);
  });

  it('deletePattern removes the pattern', () => {
    const store = new ModelStore(file);
    seed(store);
    const p = store.addPattern({ name: 'P', kind: 'pipeline', members: [{ name: 'S' }] });
    store.deletePattern(p.id);
    expect(store.get().patterns).toEqual([]);
  });
```

(If the `seed` helper does not already return an object with `a`, adapt: call `const ids = seed(store);` and use `ids.a?.id`. Check the existing flow tests in the file for the exact `seed` shape and match it.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hyphae/server exec vitest run test/store.test.ts`
Expected: FAIL — `store.addPattern is not a function`.

- [ ] **Step 3: Write the implementation**

In `apps/server/src/store.ts`:

- Extend the schema import (lines 2-6) to add `PatternSchema` and the `Pattern` type:
```ts
import {
  HyphaeModelSchema, NodeSchema, ConnectionSchema, FlowSchema, PatternSchema, emptyModel, newId, now,
  newIssues, resolveProfile,
  type HyphaeModel, type Node, type Connection, type Flow, type Pattern, type Position,
} from '@hyphae/schema';
```
- Add the input type after `FlowInput` (line 13):
```ts
export type PatternInput = Partial<Pattern> & { name: string; kind: string };
```
- Add the three methods after `deleteFlow` (after line 100):
```ts
  addPattern(input: PatternInput): Pattern {
    const pattern = PatternSchema.parse({ ...input, id: input.id ?? newId() });
    this.commit({ ...this.model, patterns: [...this.model.patterns, pattern] });
    return pattern;
  }

  updatePattern(id: string, patch: Partial<Pattern>): Pattern {
    const existing = this.model.patterns.find((p) => p.id === id);
    if (!existing) throw new NotFoundError(`pattern ${id} not found`);
    const updated = PatternSchema.parse({ ...existing, ...patch, id });
    this.commit({ ...this.model, patterns: this.model.patterns.map((p) => (p.id === id ? updated : p)) });
    return updated;
  }

  deletePattern(id: string): void {
    if (!this.model.patterns.some((p) => p.id === id)) throw new NotFoundError(`pattern ${id} not found`);
    this.commit({ ...this.model, patterns: this.model.patterns.filter((p) => p.id !== id) });
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @hyphae/server exec vitest run test/store.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check and commit**

Run: `pnpm --filter @hyphae/server exec tsc -p tsconfig.json`
Expected: clean.

```bash
git add apps/server/src/store.ts apps/server/test/store.test.ts
git status --short
git commit -m "feat(server): pattern CRUD in the model store"
```

---

### Task 6: Server routes — `/patterns`

**Files:**
- Modify: `apps/server/src/routes.ts`
- Test: `apps/server/test/routes.test.ts`

**Interfaces:**
- Consumes: `ModelStore.addPattern/updatePattern/deletePattern` (Task 5).
- Produces: `POST /patterns` → `{ pattern, version }` (201); `PATCH /patterns/:id` → `{ pattern, version }`; `DELETE /patterns/:id` → `{ version }`; errors mapped by `mapError` (422 on `ValidationError`, 404 on `NotFoundError`).

- [ ] **Step 1: Write the failing test**

In `apps/server/test/routes.test.ts`, mirror the existing flow-route tests. Add (adapt the app/store setup to match the file's existing helpers — the flow POST test shows the shape):

```ts
  it('POST /patterns creates a pattern', async () => {
    const res = await app.request('/patterns', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Recorder', kind: 'state-machine', members: [{ name: 'Idle' }] }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { pattern: { id: string; kind: string } };
    expect(body.pattern.kind).toBe('state-machine');
  });

  it('POST /patterns rejects an unknown kind with 422', async () => {
    const res = await app.request('/patterns', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Bad', kind: 'octopus' }),
    });
    expect(res.status).toBe(422);
  });
```

(Match the surrounding tests' way of building `app` — likely `const app = createApp(store)` with a seeded `store`. If patterns need a node to be valid, a state-machine with pure-name members needs none, so the above is self-contained.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hyphae/server exec vitest run test/routes.test.ts`
Expected: FAIL — 404 (route not registered) instead of 201/422.

- [ ] **Step 3: Write the implementation**

In `apps/server/src/routes.ts`, after the `DELETE /flows/:id` handler (after line 76) add:

```ts
  app.post('/patterns', async (c) => {
    let body: unknown;
    try { body = await c.req.json(); } catch { return c.json({ error: 'invalid JSON' }, 400); }
    try { const pattern = store.addPattern(body as never); return c.json({ pattern, version: store.version }, 201); }
    catch (e) { return mapError(c, e); }
  });

  app.patch('/patterns/:id', async (c) => {
    let body: unknown;
    try { body = await c.req.json(); } catch { return c.json({ error: 'invalid JSON' }, 400); }
    try { const pattern = store.updatePattern(c.req.param('id'), body as never); return c.json({ pattern, version: store.version }); }
    catch (e) { return mapError(c, e); }
  });

  app.delete('/patterns/:id', (c) => {
    try { store.deletePattern(c.req.param('id')); return c.json({ version: store.version }); }
    catch (e) { return mapError(c, e); }
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @hyphae/server exec vitest run test/routes.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check and commit**

Run: `pnpm --filter @hyphae/server exec tsc -p tsconfig.json`
Expected: clean.

```bash
git add apps/server/src/routes.ts apps/server/test/routes.test.ts
git status --short
git commit -m "feat(server): /patterns routes"
```

---

### Task 7: MCP — pattern read + write tools

**Files:**
- Modify: `apps/server/src/mcp.ts`
- Test: `apps/server/test/mcp.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: exported `patternItemSchema` (Zod); `HyphaeApi.createPattern/updatePattern/deletePattern`; tool handlers `list_patterns`, `get_pattern`, `create_patterns`, `update_patterns`, `delete_patterns`; `describe_profile` output already includes `patternKinds` (it returns `c4Backend`).

- [ ] **Step 1: Write the failing tests**

In `apps/server/test/mcp.test.ts`:

- Extend `fakeApi` (lines 18-32) — add three methods before the `...over` spread (after `deleteFlow` on line 29):
```ts
    createPattern: async (input) => ({ pattern: { id: 'p2', ...(input as object) }, version: 1 }),
    updatePattern: async (id, patch) => ({ pattern: { id, ...(patch as object) }, version: 1 }),
    deletePattern: async () => ({ version: 1 }),
```
- Extend the existing `describe_profile` test (around line 169) — add after its existing assertions:
```ts
    expect(Array.isArray((r as { patternKinds?: unknown[] }).patternKinds)).toBe(true);
```
(and widen the `r` type annotation to include `patternKinds: Array<{ id: string }>`.)
- Add a new describe block at the end of the file:
```ts
import { patternItemSchema } from '../src/mcp';

describe('MCP pattern tools', () => {
  const patternModel = (): HyphaeModel => {
    const m = emptyModel();
    m.patterns.push({ id: 'p1', name: 'Recorder', kind: 'state-machine', description: '', anchor: null,
      members: [{ name: 'Idle', description: '' }], transitions: [] });
    return m;
  };
  const api = () => fakeApi({ getModel: async () => patternModel() });

  it('list_patterns returns summaries with validity', async () => {
    const r = await buildTools(api()).list_patterns({});
    expect(r).toEqual([{ id: 'p1', name: 'Recorder', kind: 'state-machine', members: 1, anchor: null, valid: true }]);
  });

  it('list_patterns marks a pattern invalid on an unknown kind', async () => {
    const bad = fakeApi({ getModel: async () => { const m = patternModel(); m.patterns[0].kind = 'octopus'; return m; } });
    const r = (await buildTools(bad).list_patterns({})) as Array<{ valid: boolean }>;
    expect(r[0].valid).toBe(false);
  });

  it('get_pattern returns one pattern, or an error', async () => {
    expect(await buildTools(api()).get_pattern({ id: 'p1' })).toMatchObject({ name: 'Recorder' });
    expect(await buildTools(api()).get_pattern({ id: 'nope' })).toMatchObject({ error: expect.stringContaining('not found') });
  });

  it('create_patterns returns ids and forwards the member shape', async () => {
    const seen: Record<string, unknown>[] = [];
    const tools = buildTools(fakeApi({ createPattern: async (input) => { seen.push(input as Record<string, unknown>); return { pattern: { id: 'p9', ...(input as object) }, version: 1 }; } }));
    const r = await tools.create_patterns({ patterns: [{ name: 'P', kind: 'pipeline', members: [{ name: 'Decode', ref: 'd.ts' }] }] });
    expect(r).toEqual({ ids: ['p9'] });
    expect(seen[0]).toMatchObject({ name: 'P', kind: 'pipeline', members: [{ name: 'Decode', ref: 'd.ts' }] });
  });
});

describe('MCP pattern write shape', () => {
  it('accepts a full pattern item and rejects a missing name', () => {
    expect(() => patternItemSchema.parse({ name: 'P', kind: 'pipeline', members: [{ name: 'M', ref: 'x.ts' }], transitions: [{ from: 'M', to: 'M' }] })).not.toThrow();
    expect(() => patternItemSchema.parse({ kind: 'pipeline' })).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hyphae/server exec vitest run test/mcp.test.ts`
Expected: FAIL — `patternItemSchema` not exported / `list_patterns` undefined.

- [ ] **Step 3: Write the implementation**

In `apps/server/src/mcp.ts`:

- Add to the `HyphaeApi` interface after `deleteFlow` (line 20):
```ts
  createPattern(input: unknown): Promise<unknown>;
  updatePattern(id: string, patch: unknown): Promise<unknown>;
  deletePattern(id: string): Promise<unknown>;
```
- Extend `ApiResult` (line 23) to include `pattern`:
```ts
type ApiResult = { node?: { id: string }; connection?: { id: string }; flow?: { id: string }; pattern?: { id: string }; issues?: unknown; error?: unknown };
```
- Add the exported write shape after `flowItemSchema` (after line 42):
```ts
export const patternMemberSchema = z.object({
  name: z.string().describe('Human label for this member/stage/state.'),
  nodeId: z.string().optional().describe('Id of the node this member is — use for a higher-altitude member (a Component, a Container). Set nodeId OR ref, never both.'),
  ref: z.string().optional().describe('A code Ref for a member with no node (a code stage), relative to the pattern anchor\'s root, e.g. "decode.ts" or "src/pipeline/#normalize". Set ref OR nodeId, never both.'),
  description: z.string().optional(),
});
export const patternTransitionSchema = z.object({
  from: z.string().describe('The source member name (state).'),
  to: z.string().describe('The target member name (state).'),
  trigger: z.string().optional().describe('What causes the transition, e.g. "start", "error".'),
  description: z.string().optional(),
});
export const patternItemSchema = z.object({
  name: z.string(),
  kind: z.string().describe('A pattern kind id from describe_profile.patternKinds: pipeline, middleware, state-machine, layered, event-bus.'),
  description: z.string().optional(),
  anchor: z.string().nullable().optional().describe('Optional id of the node this pattern describes (the Component a code pipeline lives in). Required when any member uses a relative ref, since a ref resolves against the anchor\'s root.'),
  members: z.array(patternMemberSchema).default([]).describe('The members, in order. For an ordered kind (pipeline, middleware) the array order IS the stage order.'),
  transitions: z.array(patternTransitionSchema).default([]).describe('For state-machine: directed transitions between members, referenced by member name.'),
});
```
- Extend `runCreate`'s `key` param type (line 47) to include `'pattern'`:
```ts
  key: 'node' | 'connection' | 'flow' | 'pattern',
```
- Add the five handlers in `buildTools` after the `delete_flows` handler (after line 263):
```ts
    list_patterns: async (_: Record<string, never>) => {
      const model = await api.getModel();
      const issues = validateModel(model, resolveProfile(model));
      const invalid = new Set(issues.filter((i) => i.kind.startsWith('pattern-')).map((i) => i.ref));
      return model.patterns.map((p) => ({ id: p.id, name: p.name, kind: p.kind, members: p.members.length, anchor: p.anchor, valid: !invalid.has(p.id) }));
    },
    get_pattern: async ({ id }: { id: string }) =>
      (await api.getModel()).patterns.find((p) => p.id === id) ?? { error: `pattern ${id} not found` },
    create_patterns: async ({ patterns }: { patterns: Record<string, unknown>[] }) => runCreate(patterns, api.createPattern, 'pattern'),
    update_patterns: async ({ updates }: { updates: Array<{ id: string } & Record<string, unknown>> }) =>
      runVoid(updates.map((u) => () => { const { id, ...patch } = u; return api.updatePattern(id, patch); })),
    delete_patterns: async ({ ids }: { ids: string[] }) => runVoid(ids.map((id) => () => api.deletePattern(id))),
```
- Add to `httpApi`'s returned object after `deleteFlow` (after line 305):
```ts
    createPattern: (input) => mutate('POST', '/patterns', input),
    updatePattern: (id, patch) => mutate('PATCH', `/patterns/${id}`, patch),
    deletePattern: (id) => mutate('DELETE', `/patterns/${id}`),
```
- In `main()`, register the five tools after the `delete_flows` registration (after line 515):
```ts
  server.registerTool('list_patterns', {
    description: 'List Pattern summaries: id, name, kind, member count, anchor, and whether the pattern currently validates. Use get_pattern for full members + transitions.',
    inputSchema: {},
  }, async () => text(await tools.list_patterns({})));

  server.registerTool('get_pattern', {
    description: 'Get one Pattern by id with its full members and transitions. Returns {error} if the id does not exist.',
    inputSchema: { id: z.string() },
  }, async (a) => text(await tools.get_pattern(a)));

  server.registerTool('create_patterns', {
    description: "Create one OR MANY Patterns (architectural shapes; single write = one-element array). A Pattern has a name, a kind (from describe_profile.patternKinds), optional anchor (the node it describes), members, and — for state-machine — transitions. A member is { name, and either nodeId (a node) OR ref (a code Ref, resolved against the anchor's root) OR neither (a pure name, e.g. a state) }. For ordered kinds (pipeline, middleware) member array order is the stage order. Best-effort: {ids:[...]} on full success, else {results:[{id}|{issues}]}.",
    inputSchema: { patterns: z.array(patternItemSchema) },
  }, async (a) => text(await tools.create_patterns(a)));

  const patternUpdate = z.object({ id: z.string(), name: z.string().optional(), kind: z.string().optional(), description: z.string().optional(), anchor: z.string().nullable().optional(), members: z.array(patternMemberSchema).optional(), transitions: z.array(patternTransitionSchema).optional() });
  server.registerTool('update_patterns', {
    description: 'Update one OR MANY patterns by id (single update = one-element array). Each item: id + fields to change (name, kind, anchor, or the full replacement members/transitions arrays). Best-effort: {ok:true} on full success, else {results:[{ok}|{issues}]}.',
    inputSchema: { updates: z.array(patternUpdate) },
  }, async (a) => text(await tools.update_patterns(a)));

  server.registerTool('delete_patterns', {
    description: 'Delete one OR MANY patterns by id (single delete = one-element array). Best-effort: {ok:true} on full success, else {results:[{ok}|{error}]}.',
    inputSchema: { ids: z.array(z.string()) },
  }, async (a) => text(await tools.delete_patterns(a)));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @hyphae/server exec vitest run test/mcp.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check, full server tests, commit**

Run:
```
pnpm --filter @hyphae/server exec tsc -p tsconfig.json
pnpm --filter @hyphae/server exec vitest run
```
Expected: clean / all PASS.

```bash
git add apps/server/src/mcp.ts apps/server/test/mcp.test.ts
git status --short
git commit -m "feat(server): MCP pattern read+write tools; describe_profile exposes patternKinds"
```

---

### Task 8: Web store — pattern selection

**Files:**
- Modify: `apps/web/src/store.ts`
- Test: `apps/web/test/store.test.ts`

**Interfaces:**
- Produces: `selectedPatternId: string | null`, `selectPattern(id: string | null)`. Selecting a pattern clears `selectedFlowId`; selecting a flow clears `selectedPatternId`.

- [ ] **Step 1: Write the failing test**

In `apps/web/test/store.test.ts`, add inside the `describe('editor store', ...)` block (after the existing flow-selection test near line 153):

```ts
  it('selects a pattern and clears any selected flow (and vice versa)', () => {
    useStore.getState().selectFlow('f1');
    useStore.getState().selectPattern('p1');
    expect(useStore.getState().selectedPatternId).toBe('p1');
    expect(useStore.getState().selectedFlowId).toBeNull();
    useStore.getState().selectFlow('f2');
    expect(useStore.getState().selectedFlowId).toBe('f2');
    expect(useStore.getState().selectedPatternId).toBeNull();
    useStore.getState().selectPattern(null);
    expect(useStore.getState().selectedPatternId).toBeNull();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hyphae/web exec vitest run test/store.test.ts`
Expected: FAIL — `selectPattern is not a function`.

- [ ] **Step 3: Write the implementation**

In `apps/web/src/store.ts`:

- Add to the `State` type after `selectedFlowId: string | null;` (line 15):
```ts
  selectedPatternId: string | null;
```
- Add to the `State` type after `selectFlow: (id: string | null) => void;` (line 26):
```ts
  selectPattern: (id: string | null) => void;
```
- Add to the initial state after `selectedFlowId: null,` (line 62):
```ts
    selectedPatternId: null,
```
- Replace the `selectFlow` action (line 84) to also clear the pattern, and add `selectPattern`:
```ts
    selectFlow: (selectedFlowId) => set({ selectedFlowId, selectedPatternId: null }),
    selectPattern: (selectedPatternId) => set({ selectedPatternId, selectedFlowId: null }),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @hyphae/web exec vitest run test/store.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check and commit**

Run: `pnpm --filter @hyphae/web exec tsc --noEmit -p tsconfig.json`
Expected: clean.

```bash
git add apps/web/src/store.ts apps/web/test/store.test.ts
git status --short
git commit -m "feat(web): pattern selection state (mutually exclusive with flow)"
```

---

### Task 9: Web — `patternView` pure builder

**Files:**
- Create: `apps/web/src/patternView.ts`
- Create: `apps/web/test/patternView.test.ts`

**Interfaces:**
- Consumes: `Pattern`, `Profile`, `patternKindDefOf`, model `Node[]`, `@xyflow/react` `Node`/`Edge` types; `NODE_W`, `NODE_H` from `./layout`.
- Produces: `type PatternMemberData = { name: string; binding: 'node' | 'ref' | 'none'; detail: string; description: string }`; `patternViewToFlow(pattern: Pattern, profile: Profile, nodes: ModelNode[]): { nodes: FlowNode[]; edges: FlowEdge[] }`. Member `name` is the React Flow node id and edge endpoints. Node data is `PatternMemberData`, node `type: 'patternMember'`. Ordered kinds lay members left→right with sequential edges; `state-machine` lays them by transition (dagre LR) with one edge per transition; other kinds stack members vertically with no edges.

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/patternView.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { c4Backend, type Pattern } from '@hyphae/schema';
import { patternViewToFlow } from '../src/patternView';

const nodes = [
  { id: 'comp', name: 'Ingest', type: 'Component', parentId: null, root: null, role: null, description: '', codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {} },
] as never[];

const pattern = (over: Partial<Pattern>): Pattern => ({
  id: 'p', name: 'P', kind: 'pipeline', description: '', anchor: null, members: [], transitions: [], ...over,
});

describe('patternViewToFlow', () => {
  it('pipeline: members become boxes in array order with sequential edges', () => {
    const p = pattern({ kind: 'pipeline', members: [
      { name: 'Decode', ref: 'd.ts', description: '' },
      { name: 'Persist', nodeId: 'comp', description: '' },
    ] });
    const { nodes: fn, edges } = patternViewToFlow(p, c4Backend, nodes);
    expect(fn.map((n) => n.id)).toEqual(['Decode', 'Persist']);
    // ordered left->right
    expect(fn[0].position.x).toBeLessThan(fn[1].position.x);
    // one sequential edge Decode -> Persist
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ source: 'Decode', target: 'Persist' });
  });

  it('resolves a nodeId member to the node name and marks bindings', () => {
    const p = pattern({ members: [
      { name: 'Persist', nodeId: 'comp', description: '' },
      { name: 'Decode', ref: 'd.ts', description: '' },
      { name: 'Idle', description: '' },
    ] });
    const { nodes: fn } = patternViewToFlow(p, c4Backend, nodes);
    const byId = Object.fromEntries(fn.map((n) => [n.id, n.data as { binding: string; detail: string }]));
    expect(byId['Persist']).toMatchObject({ binding: 'node', detail: 'Ingest' });
    expect(byId['Decode']).toMatchObject({ binding: 'ref', detail: 'd.ts' });
    expect(byId['Idle']).toMatchObject({ binding: 'none', detail: '' });
  });

  it('state-machine: one edge per transition, labeled by trigger', () => {
    const p = pattern({ kind: 'state-machine',
      members: [{ name: 'Idle', description: '' }, { name: 'Recording', description: '' }],
      transitions: [{ from: 'Idle', to: 'Recording', trigger: 'start', description: '' }] });
    const { nodes: fn, edges } = patternViewToFlow(p, c4Backend, nodes);
    expect(fn.map((n) => n.id).sort()).toEqual(['Idle', 'Recording']);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ source: 'Idle', target: 'Recording', label: 'start' });
  });

  it('an unrendered kind (layered) stacks members with no edges', () => {
    const p = pattern({ kind: 'layered', members: [{ name: 'UI', description: '' }, { name: 'Data', description: '' }] });
    const { nodes: fn, edges } = patternViewToFlow(p, c4Backend, nodes);
    expect(fn).toHaveLength(2);
    expect(edges).toEqual([]);
    // stacked vertically
    expect(fn[0].position.y).toBeLessThan(fn[1].position.y);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hyphae/web exec vitest run test/patternView.test.ts`
Expected: FAIL — cannot find `../src/patternView`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/patternView.ts`:

```ts
import dagre from '@dagrejs/dagre';
import type { Node as FlowNode, Edge as FlowEdge } from '@xyflow/react';
import { MarkerType } from '@xyflow/react';
import { patternKindDefOf, type Pattern, type Profile, type Node as ModelNode } from '@hyphae/schema';
import { NODE_W, NODE_H } from './layout';

export type PatternMemberData = {
  name: string;
  binding: 'node' | 'ref' | 'none';
  detail: string;       // node name (node), ref string (ref), or '' (none)
  description: string;
};

const H_GAP = 60;   // horizontal pitch between ordered stages
const V_GAP = 40;   // vertical pitch between stacked (unordered) members

function memberData(m: Pattern['members'][number], nodes: ModelNode[]): PatternMemberData {
  if (m.nodeId !== undefined) {
    const node = nodes.find((n) => n.id === m.nodeId);
    return { name: m.name, binding: 'node', detail: node?.name ?? m.nodeId, description: m.description };
  }
  if (m.ref !== undefined) return { name: m.name, binding: 'ref', detail: m.ref, description: m.description };
  return { name: m.name, binding: 'none', detail: '', description: m.description };
}

function memberNode(m: Pattern['members'][number], nodes: ModelNode[], x: number, y: number): FlowNode {
  return {
    id: m.name,
    type: 'patternMember',
    position: { x, y },
    data: memberData(m, nodes),
    initialWidth: NODE_W,
    initialHeight: NODE_H,
    draggable: false,
  };
}

const arrow = { type: MarkerType.ArrowClosed, color: '#475569' };
const seqEdge = (source: string, target: string, id: string, label = ''): FlowEdge => ({
  id, source, target, label,
  sourceHandle: 'r', targetHandle: 'l',
  style: { stroke: '#475569' },
  labelStyle: { fill: '#475569', fontWeight: 500 },
  markerEnd: arrow,
});

/** Build the React-Flow nodes/edges that draw one pattern as its own diagram.
 *  Node ids and edge endpoints are member names (unique within a pattern). */
export function patternViewToFlow(pattern: Pattern, profile: Profile, nodes: ModelNode[]): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const kind = patternKindDefOf(profile, pattern.kind);
  const renderer = kind?.renderer;

  if (renderer === 'state-machine') {
    // Lay states out by their transition graph, left to right.
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: 'LR', nodesep: V_GAP, ranksep: H_GAP, marginx: 20, marginy: 20 });
    g.setDefaultEdgeLabel(() => ({}));
    for (const m of pattern.members) g.setNode(m.name, { width: NODE_W, height: NODE_H });
    for (const t of pattern.transitions) if (t.from !== t.to) g.setEdge(t.from, t.to);
    dagre.layout(g);
    const flowNodes = pattern.members.map((m) => {
      const d = g.node(m.name);
      const x = d ? d.x - NODE_W / 2 : 0;
      const y = d ? d.y - NODE_H / 2 : 0;
      return memberNode(m, nodes, x, y);
    });
    const edges = pattern.transitions.map((t, i) => seqEdge(t.from, t.to, `t-${i}`, t.trigger));
    return { nodes: flowNodes, edges };
  }

  if (kind?.ordered) {
    // pipeline / middleware: a row of stages with sequential arrows.
    const flowNodes = pattern.members.map((m, i) => memberNode(m, nodes, i * (NODE_W + H_GAP), 0));
    const edges: FlowEdge[] = [];
    for (let i = 0; i < pattern.members.length - 1; i++) {
      edges.push(seqEdge(pattern.members[i].name, pattern.members[i + 1].name, `seq-${i}`));
    }
    return { nodes: flowNodes, edges };
  }

  // Fallback (layered / event-bus / unknown): a vertical stack, no edges.
  const flowNodes = pattern.members.map((m, i) => memberNode(m, nodes, 0, i * (NODE_H + V_GAP)));
  return { nodes: flowNodes, edges: [] };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @hyphae/web exec vitest run test/patternView.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check and commit**

Run: `pnpm --filter @hyphae/web exec tsc --noEmit -p tsconfig.json`
Expected: clean.

```bash
git add apps/web/src/patternView.ts apps/web/test/patternView.test.ts
git status --short
git commit -m "feat(web): patternView — pure shape builder for pipeline/state-machine/fallback"
```

---

### Task 10: Web — `PatternMemberNode` renderer + Canvas pattern mode

**Files:**
- Create: `apps/web/src/PatternMemberNode.tsx`
- Modify: `apps/web/src/Canvas.tsx`
- Test: `apps/web/test/Canvas.test.tsx`

**Interfaces:**
- Consumes: `PatternMemberData` (Task 9), `patternViewToFlow` (Task 9), `selectedPatternId` (Task 8).
- Produces: `PatternMemberNode` React component (reads `PatternMemberData`, exposes handles `l`/`r`/`t`/`b`); Canvas renders the pattern view when `selectedPatternId` is set.

- [ ] **Step 1: Write the failing test**

In `apps/web/test/Canvas.test.tsx`, add a test that selecting a pattern renders its members. First check the file's existing render helper/setup; add:

```ts
  it('renders pattern member boxes when a pattern is selected', () => {
    const m = emptyModel();
    m.nodes.push({ id: 'comp', name: 'Ingest', type: 'Component', parentId: null, root: null, role: null, description: '', codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: { summary: 's' } } as never);
    m.patterns.push({ id: 'p1', name: 'Recorder', kind: 'state-machine', description: '', anchor: null,
      members: [{ name: 'Idle', description: '' }, { name: 'Recording', description: '' }],
      transitions: [{ from: 'Idle', to: 'Recording', trigger: 'start', description: '' }] });
    useStore.setState({ model: m, selectedPatternId: 'p1', selectedFlowId: null, focusId: null });
    const { getByText } = render(<Canvas />);
    expect(getByText('Idle')).toBeTruthy();
    expect(getByText('Recording')).toBeTruthy();
  });
```

(Match the imports/render setup already used by `Canvas.test.tsx` — it likely already imports `render`, `Canvas`, `useStore`, `emptyModel`. If it wraps `<Canvas/>` in a `ReactFlowProvider`, do the same here.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hyphae/web exec vitest run test/Canvas.test.tsx`
Expected: FAIL — 'Idle' not found (pattern mode not wired).

- [ ] **Step 3: Write the renderer**

Create `apps/web/src/PatternMemberNode.tsx`:

```tsx
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { PatternMemberData } from './patternView';
import { NODE_W, NODE_H } from './layout';

const BINDING_COLOR: Record<PatternMemberData['binding'], { bg: string; border: string; tag: string }> = {
  node: { bg: '#f0fdf4', border: '#16a34a', tag: 'node' },
  ref: { bg: '#fefce8', border: '#ca8a04', tag: 'ref' },
  none: { bg: '#f8fafc', border: '#94a3b8', tag: '' },
};

export function PatternMemberNode({ data }: NodeProps) {
  const d = data as PatternMemberData;
  const c = BINDING_COLOR[d.binding] ?? BINDING_COLOR.none;
  return (
    <div
      style={{
        width: NODE_W, height: NODE_H, padding: '6px 10px', boxSizing: 'border-box',
        border: `1px solid ${c.border}`, background: c.bg, borderRadius: 6,
        fontSize: 12, lineHeight: 1.25, textAlign: 'center',
        display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2, overflow: 'hidden',
      }}
    >
      <Handle id="l" type="target" position={Position.Left} style={{ opacity: 0, pointerEvents: 'none' }} />
      <Handle id="t" type="target" position={Position.Top} style={{ opacity: 0, pointerEvents: 'none' }} />
      <Handle id="r" type="source" position={Position.Right} style={{ opacity: 0, pointerEvents: 'none' }} />
      <Handle id="b" type="source" position={Position.Bottom} style={{ opacity: 0, pointerEvents: 'none' }} />
      <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</div>
      {d.detail && (
        <div style={{ fontSize: 10, color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {c.tag ? `${c.tag}: ` : ''}{d.detail}
        </div>
      )}
      {d.description && (
        <div style={{ fontSize: 9, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.description}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Wire pattern mode into Canvas**

In `apps/web/src/Canvas.tsx`:

- Add imports near the other local imports (after line 20):
```ts
import { c4Backend } from '@hyphae/schema';
import { patternViewToFlow } from './patternView';
import { PatternMemberNode } from './PatternMemberNode';
import { PatternPicker } from './PatternPicker';
```
(`c4Backend` is already imported on line 7 — extend that import instead of adding a duplicate: `import { c4Backend, layerOfType } from '@hyphae/schema';` already exists, so only add the `patternViewToFlow` / `PatternMemberNode` / `PatternPicker` imports. **Note:** `PatternPicker` is created in Task 11; until then this import will not resolve — implement Task 10 and Task 11 together, or temporarily stub `PatternPicker`. Recommended: do Task 11 first if executing strictly, or import `PatternPicker` last. See ordering note below.)
- Register the node type (line 22):
```ts
const nodeTypes = { region: GroupNode, node: NodeBox, ghost: GhostNode, ghostGroup: GhostGroupNode, patternMember: PatternMemberNode };
```
- Read the selection (after line 43, `const selectedFlowId = ...`):
```ts
  const selectedPatternId = useStore((s) => s.selectedPatternId);
```
- After the `overlay`/`flowActive` block (after line 70), compute the pattern view:
```ts
  const pattern = useMemo(() => model.patterns.find((p) => p.id === selectedPatternId) ?? null, [model.patterns, selectedPatternId]);
  const patternFlow = useMemo(() => (pattern ? patternViewToFlow(pattern, c4Backend, model.nodes) : null), [pattern, model.nodes]);
```
- Choose which nodes/edges feed React Flow. Replace the `<ReactFlow ... nodes={nodes} edges={displayEdges} ...>` props: introduce `rfNodes`/`rfEdges` just before the `return`:
```ts
  const rfNodes = patternFlow ? patternFlow.nodes : nodes;
  const rfEdges = patternFlow ? patternFlow.edges : displayEdges;
```
  and in the JSX use `nodes={rfNodes} edges={rfEdges}`. Also key the graph on the pattern so it remounts/fits:
```ts
        key={selectedPatternId ? `pattern:${selectedPatternId}` : (focusId ?? '__root__')}
```
- Suppress the highlight overlay in pattern mode: where `highlightCss` early-returns, guard with the pattern too. Change the `if (!activeId && !flowActive) return trans;` line to:
```ts
    if (patternFlow || (!activeId && !flowActive)) return trans;
```
- Add `PatternPicker` to the top-left panel stack (inside the `<div style={{ display:'flex', flexDirection:'column', gap:8 }}>` at line 195):
```tsx
            <FilterPanel />
            <FlowPicker />
            <PatternPicker />
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @hyphae/web exec vitest run test/Canvas.test.tsx`
Expected: PASS. (If `PatternPicker` is not yet created, this task does not compile — do Task 11 in the same working session, then run.)

- [ ] **Step 6: Type-check and commit (after Task 11 exists)**

Run: `pnpm --filter @hyphae/web exec tsc --noEmit -p tsconfig.json`
Expected: clean.

```bash
git add apps/web/src/PatternMemberNode.tsx apps/web/src/Canvas.tsx apps/web/test/Canvas.test.tsx
git status --short
git commit -m "feat(web): pattern-mode canvas + PatternMemberNode renderer"
```

> **Ordering note for the executor:** Task 10 imports `PatternPicker` (Task 11). Implement Task 11's `PatternPicker.tsx` first (it has no dependency on Canvas), then Task 10 — or create an empty `PatternPicker` stub, finish Task 10, then flesh it out in Task 11. The two commits can land in either order as long as the branch compiles at each commit; simplest is **do Task 11 before Task 10's commit**.

---

### Task 11: Web — `PatternPicker`

**Files:**
- Create: `apps/web/src/PatternPicker.tsx`
- Create: `apps/web/test/PatternPicker.test.tsx`

**Interfaces:**
- Consumes: `selectedPatternId`/`selectPattern` (Task 8), `validateModel`/`resolveProfile`.
- Produces: `PatternPicker` component — lists patterns, selects/deselects, shows members, flags an invalid pattern with ⚠, renders nothing when there are no patterns.

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/PatternPicker.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { PatternPicker } from '../src/PatternPicker';
import { useStore } from '../src/store';
import { emptyModel } from '@hyphae/schema';

function modelWithPattern() {
  const m = emptyModel();
  m.patterns.push({ id: 'p1', name: 'Recorder', kind: 'state-machine', description: '', anchor: null,
    members: [{ name: 'Idle', description: '' }, { name: 'Recording', description: '' }],
    transitions: [{ from: 'Idle', to: 'Recording', trigger: 'start', description: '' }] });
  return m;
}

beforeEach(() => useStore.setState({ model: modelWithPattern(), selectedPatternId: null, selectedFlowId: null }));

describe('PatternPicker', () => {
  it('lists patterns and selects one on click', () => {
    const { getByText } = render(<PatternPicker />);
    fireEvent.click(getByText('Recorder'));
    expect(useStore.getState().selectedPatternId).toBe('p1');
  });

  it('shows the selected pattern members', () => {
    useStore.setState({ selectedPatternId: 'p1' });
    const { getByText } = render(<PatternPicker />);
    expect(getByText('Idle')).toBeTruthy();
    expect(getByText('Recording')).toBeTruthy();
  });

  it('flags an invalid pattern with a warning marker', () => {
    const m = modelWithPattern();
    m.patterns[0].kind = 'octopus';   // unknown kind -> pattern-unknown-kind
    useStore.setState({ model: m });
    const { getByText } = render(<PatternPicker />);
    expect(getByText(/Recorder ⚠/)).toBeTruthy();
  });

  it('renders nothing when there are no patterns', () => {
    useStore.setState({ model: emptyModel() });
    const { container } = render(<PatternPicker />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hyphae/web exec vitest run test/PatternPicker.test.tsx`
Expected: FAIL — cannot find `../src/PatternPicker`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/PatternPicker.tsx`:

```tsx
import { useMemo } from 'react';
import { validateModel, resolveProfile } from '@hyphae/schema';
import { useStore } from './store';

/** Lists authored patterns; selecting one draws its shape on the canvas. A pattern that
 *  fails validation (unknown kind, bad member/anchor/ref, bad transition) is marked ⚠. */
export function PatternPicker() {
  const model = useStore((s) => s.model);
  const selectedPatternId = useStore((s) => s.selectedPatternId);
  const selectPattern = useStore((s) => s.selectPattern);

  const invalid = useMemo(() => {
    const issues = validateModel(model, resolveProfile(model));
    return new Set(issues.filter((i) => i.kind.startsWith('pattern-')).map((i) => i.ref));
  }, [model]);

  if (model.patterns.length === 0) return null;
  const selected = model.patterns.find((p) => p.id === selectedPatternId) ?? null;

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, color: '#334155', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', minWidth: 180 }}>
      <div style={{ padding: '5px 8px', fontWeight: 600, borderBottom: '1px solid #f1f5f9' }}>Patterns</div>
      <div style={{ padding: 4 }}>
        {model.patterns.map((p) => (
          <button
            key={p.id}
            onClick={() => selectPattern(p.id === selectedPatternId ? null : p.id)}
            aria-pressed={p.id === selectedPatternId}
            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '3px 6px', border: 'none', borderRadius: 4, cursor: 'pointer', background: p.id === selectedPatternId ? '#dbeafe' : 'transparent', fontWeight: p.id === selectedPatternId ? 600 : 400 }}
          >
            {p.name} <span style={{ color: '#94a3b8', fontWeight: 400 }}>· {p.kind}</span>{invalid.has(p.id) ? ' ⚠' : ''}
          </button>
        ))}
      </div>
      {selected && (
        <ol style={{ margin: 0, padding: '4px 8px 8px 24px', lineHeight: 1.5 }}>
          {selected.members.map((m) => (
            <li key={m.name}>{m.name}</li>
          ))}
        </ol>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @hyphae/web exec vitest run test/PatternPicker.test.tsx`
Expected: PASS.

- [ ] **Step 5: Type-check, full web tests, commit**

Run:
```
pnpm --filter @hyphae/web exec tsc --noEmit -p tsconfig.json
pnpm --filter @hyphae/web exec vitest run
```
Expected: clean / all PASS.

```bash
git add apps/web/src/PatternPicker.tsx apps/web/test/PatternPicker.test.tsx
git status --short
git commit -m "feat(web): PatternPicker panel"
```

---

### Task 12: Modeling skill + docs refresh

**Files:**
- Modify: `plugins/hyphae-modeling/skills/building-architecture-models/SKILL.md`
- Modify (if prose diverges): `docs/MODEL.md`, `README.md`

**Interfaces:** none — documentation only.

- [ ] **Step 1: Read the current skill and its Flows section**

Read `plugins/hyphae-modeling/skills/building-architecture-models/SKILL.md`. Find the "Flows" section added in Phase B; the new "Patterns" section mirrors its structure and placement.

- [ ] **Step 2: Add a "Patterns" section**

Add after the Flows section:

```markdown
## Patterns (architectural shapes)

A **Pattern** gives a Component's internals or a behavior a recognized *shape*, drawn specially —
instead of a wall of class boxes. Author with `create_patterns`. Each pattern has:

- `name`, and `kind` — one of the profile's `patternKinds` (see `describe_profile`):
  **pipeline** (ordered stages), **middleware** (interceptor chain), **state-machine**
  (states + transitions), **layered** (bands), **event-bus** (hub). Only pipeline and
  state-machine have bespoke renderers today; the rest show a member list.
- `members: [{ name, nodeId? | ref?, description? }]` — each member binds to **at most one** of a
  node (`nodeId`) or a code Ref (`ref`), or **neither** (a pure name, e.g. a state). For an
  ordered kind the **array order is the stage order** — no separate order field.
- `anchor` — the node the pattern describes (the Component a code pipeline lives in). **Required
  when a member uses a relative `ref`**, because a ref resolves against the anchor's `root`.
- `transitions: [{ from, to, trigger?, description? }]` — for **state-machine** only; `from`/`to`
  are member **names**.

Guidance:
- A code pipeline inside a Component: `anchor` = that Component, members = the stages with `ref`s
  into the source (`decode.ts`, `normalize.ts`), in order.
- A state machine: members = the states (pure names), plus `transitions` between them by name.
- Member names must be unique within a pattern. A node may appear in more than one pattern.
```

- [ ] **Step 3: Refresh MODEL.md / README only if the shipped shape diverges from the prose**

Skim `docs/MODEL.md` §3.4 and `README.md`. The shipped shape matches §3.4 with two clarifications worth adding if absent: member binding is **at most one** (a pure-name state is valid), and rendering this phase covers **pipeline + state-machine** (others fall back to a member list). Make minimal edits only where the prose would mislead.

- [ ] **Step 4: Commit**

```bash
git add plugins/hyphae-modeling/skills/building-architecture-models/SKILL.md docs/MODEL.md README.md
git status --short   # NO .json
git commit -m "docs(skill): teach pattern authoring (create_patterns, kinds, members, transitions)"
```

---

## Final verification (after Task 12)

- [ ] Run the whole suite and all three type-checks:
```
pnpm -r test
pnpm --filter @hyphae/schema exec tsc -p tsconfig.json
pnpm --filter @hyphae/server exec tsc -p tsconfig.json
pnpm --filter @hyphae/web exec tsc --noEmit -p tsconfig.json
```
Expected: all PASS / clean. Test counts should be schema 122 + new, server 86 + new, web 152 + new.
- [ ] `git status --short` — confirm no model `.json` is tracked/staged (only `apps/server/hyphae-cctv-new.json` remains untracked).
- [ ] **De-risk smoke (optional, no commit):** with the server running against the fixture, author a real ref-member pipeline anchored to a Component and a small state-machine over `create_patterns`, select each in the web app, and confirm the shape renders. Do **not** commit the resulting `.json`.

## Self-review checklist (done while writing — recorded here)

- **Spec coverage:** schema (T1) · patternKinds vocab + describe_profile (T2, T7) · model add/drop (T3) · validation seven kinds (T4) · server CRUD (T5) + routes (T6) · MCP read+write + shape assertion (T7) · web selection (T8) · dedicated renderer pipeline+state-machine+fallback (T9, T10) · picker (T11) · skill/docs (T12). All spec §4–§11 items map to a task.
- **`name` required:** enforced by `z.string().min(1)` (T1) and tested.
- **anchor / ref resolution:** T4 validates `pattern-unanchored-ref` against the anchor's root; T9 renders ref/node/none uniformly.
- **Issue-kind naming:** all seven use the `pattern-` prefix so `startsWith('pattern-')` (T7 list_patterns, T11 picker) selects them — consistent across tasks.
- **Type consistency:** `PatternMemberData` defined in T9, consumed in T10; `patternViewToFlow` signature identical in T9/T10; `patternItemSchema`/`patternMemberSchema`/`patternTransitionSchema` defined and reused in T7.
- **Placeholder scan:** every code step carries complete code; no TBD/TODO.

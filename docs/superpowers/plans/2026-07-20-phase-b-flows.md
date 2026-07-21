# Phase B — Flows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Behavior axis — a real `Flow` schema plus read/write (server + MCP) and a static numbered overlay in the web app that lights a flow's steps in order along the diagram's edges.

**Architecture:** `Flow` becomes a real Zod schema (`packages/schema/src/flow.ts`) replacing `FlowSchema = z.unknown()`; the model already carries a populated-by-default `flows: []`, so this is additive and `schemaVersion` stays `1`. Validation gains three flow issue kinds. The server store/routes and the MCP layer gain flow CRUD mirroring nodes/connections. The web app renames its React-Flow mapping file (name collision), adds a pure overlay computation, a flow picker panel, and numbered-badge rendering on the canvas.

**Tech Stack:** pnpm workspaces · TypeScript · Zod (`packages/schema`) · Hono (`apps/server`) · Vite + React 18 + `@xyflow/react` + Zustand (`apps/web`) · Vitest · MCP over an HTTP client of the running server.

## Global Constraints

- **Zod schemas in `packages/schema/src` are the single source of truth.** Never hand-write JSON Schema or duplicate a type.
- **`schemaVersion` stays `1`.** Flows are additive (existing files carry `flows: []`). No migration script.
- **No committed model `.json`.** `apps/server/hyphae-cctv-new.json` is untracked and migrated-on-disk; never `git add` a model `.json`. Run `git status --short` before every commit and confirm no `.json` is staged. Stage files explicitly (never `git add apps/server` — it sweeps in the untracked fixture).
- **`pnpm -r test` does NOT type-check** (vitest strips types via esbuild). After every task run all three: `pnpm --filter @hyphae/schema exec tsc -p tsconfig.json`, `pnpm --filter @hyphae/server exec tsc -p tsconfig.json`, `pnpm --filter @hyphae/web exec tsc --noEmit -p tsconfig.json`.
- **Scratch files go to the scratchpad dir**, never the repo: `C:\Users\qwert\AppData\Local\Temp\claude\C--projects-hyphae\<session>\scratchpad`.
- **New vocabulary is profile-declared** — but Phase B adds none (`kind`/`control.type` are core enums like `direction`), so `describe_profile` is unchanged.
- Branch: `phase-b-flows` (already created). Commit after every task.
- `c4Backend.layers` = `['Context', 'Container', 'Component', 'Code']`.

---

## File structure

| File | Responsibility | Task |
|---|---|---|
| `packages/schema/src/flow.ts` (create) | `FlowSchema` + `FlowStepSchema` + types | 1 |
| `packages/schema/src/reserved.ts` (modify) | drop the `FlowSchema` placeholder | 1 |
| `packages/schema/src/model.ts` (modify) | import `FlowSchema` from `./flow` | 1 |
| `packages/schema/src/index.ts` (modify) | export `./flow` | 1 |
| `packages/schema/src/validate.ts` (modify) | three flow issue kinds | 2 |
| `apps/server/src/store.ts` (modify) | `addFlow`/`updateFlow`/`deleteFlow`; deletes tolerate flow invalidation | 3 |
| `apps/server/src/routes.ts` (modify) | `POST`/`PATCH`/`DELETE /flows` | 4 |
| `apps/server/src/mcp.ts` (modify) | `HyphaeApi` flow methods; `list_flows`/`get_flow`/`create_flows`/`update_flows`/`delete_flows`; exported flow write shape | 5 |
| `apps/web/src/flow.ts` → `apps/web/src/reactflow.ts` (rename) | React-Flow mapping — resolve the name collision | 6 |
| `apps/web/src/flowOverlay.ts` (create) | pure: map a `Flow` onto drawn edges | 7 |
| `apps/web/src/store.ts` (modify) | `selectedFlowId` + `selectFlow` | 8 |
| `apps/web/src/FlowPicker.tsx` (create) | picker panel | 9 |
| `apps/web/src/Canvas.tsx` (modify) | numbered overlay + dim + mount picker | 10 |
| `plugins/hyphae-modeling/skills/building-architecture-models/SKILL.md` (modify) | teach flow authoring | 11 |

---

## Task 1: Flow schema

**Files:**
- Create: `packages/schema/src/flow.ts`
- Modify: `packages/schema/src/reserved.ts:5`
- Modify: `packages/schema/src/model.ts:5-8`
- Modify: `packages/schema/src/index.ts:4`
- Test: `packages/schema/test/flow.test.ts`

**Interfaces:**
- Produces: `FlowSchema`, `FlowStepSchema`, `FlowControlSchema`, and types `Flow`, `FlowStep`, `FlowControl`, `FlowStepKind` (`'Sync'|'Async'|'Return'`), `FlowControlType` (`'alt'|'opt'|'loop'|'par'`). `Flow = { id: string; name: string; description: string; scope: string | null; steps: FlowStep[] }`. `FlowStep = { order: number; from: string; to: string; via?: string; message: string; kind: FlowStepKind; control?: FlowControl }`.

- [ ] **Step 1: Write the failing test**

Create `packages/schema/test/flow.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { FlowSchema } from '../src/flow';
import { HyphaeModelSchema, emptyModel } from '../src/model';

describe('FlowSchema', () => {
  it('parses a minimal flow and defaults description/scope/steps', () => {
    const f = FlowSchema.parse({ id: 'f1', name: 'Views feed' });
    expect(f).toMatchObject({ id: 'f1', name: 'Views feed', description: '', scope: null, steps: [] });
  });

  it('defaults a step kind to Sync and message to empty, with no via', () => {
    const f = FlowSchema.parse({ id: 'f1', name: 'F', steps: [{ order: 1, from: 'a', to: 'b' }] });
    expect(f.steps[0]).toMatchObject({ order: 1, from: 'a', to: 'b', kind: 'Sync', message: '' });
    expect(f.steps[0].via).toBeUndefined();
  });

  it('keeps via, an explicit kind, and a control fragment', () => {
    const f = FlowSchema.parse({ id: 'f1', name: 'F', steps: [
      { order: 1, from: 'a', to: 'b', via: 'c1', kind: 'Async', message: 'go', control: { type: 'alt', condition: 'authorized' } },
    ] });
    expect(f.steps[0]).toMatchObject({ via: 'c1', kind: 'Async', message: 'go', control: { type: 'alt', condition: 'authorized' } });
  });

  it('rejects an unknown step kind', () => {
    expect(() => FlowSchema.parse({ id: 'f', name: 'F', steps: [{ order: 1, from: 'a', to: 'b', kind: 'Telepathy' }] })).toThrow();
  });

  it('rejects a flow with an empty name', () => {
    expect(() => FlowSchema.parse({ id: 'f', name: '' })).toThrow();
  });
});

describe('HyphaeModel with populated flows', () => {
  it('parses a model carrying a flow, schemaVersion stays 1', () => {
    const m = { ...emptyModel(), flows: [{ id: 'f1', name: 'F', steps: [{ order: 1, from: 'a', to: 'b' }] }] };
    const parsed = HyphaeModelSchema.parse(m);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.flows[0].name).toBe('F');
    expect(parsed.flows[0].steps[0].kind).toBe('Sync');
  });

  it('still parses a legacy model with an empty flows array', () => {
    expect(HyphaeModelSchema.parse(emptyModel()).flows).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hyphae/schema exec vitest run test/flow.test.ts`
Expected: FAIL — `Cannot find module '../src/flow'`.

- [ ] **Step 3: Create the schema**

Create `packages/schema/src/flow.ts`:

```ts
import { z } from 'zod';

/** Universal sequence mechanics — core enums like `direction`, NOT profile vocabulary. */
export const FlowStepKindSchema = z.enum(['Sync', 'Async', 'Return']);
export const FlowControlTypeSchema = z.enum(['alt', 'opt', 'loop', 'par']);

export const FlowControlSchema = z.object({
  type: FlowControlTypeSchema,
  condition: z.string().default(''),
});

export const FlowStepSchema = z.object({
  order: z.number(),
  from: z.string(),                 // node id (required)
  to: z.string(),                   // node id (required)
  via: z.string().optional(),       // connection id (optional) — traceability + parallel-edge disambiguation
  message: z.string().default(''),  // the step caption
  kind: FlowStepKindSchema.default('Sync'),
  control: FlowControlSchema.optional(),
});

/** A named scenario overlaid on nodes/connections (the Behavior axis). */
export const FlowSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string().default(''),
  scope: z.string().nullable().default(null),   // optional layer hint (advisory)
  steps: z.array(FlowStepSchema).default([]),
});

export type FlowStepKind = z.infer<typeof FlowStepKindSchema>;
export type FlowControlType = z.infer<typeof FlowControlTypeSchema>;
export type FlowControl = z.infer<typeof FlowControlSchema>;
export type FlowStep = z.infer<typeof FlowStepSchema>;
export type Flow = z.infer<typeof FlowSchema>;
```

- [ ] **Step 4: Rewire reserved.ts, model.ts, index.ts**

In `packages/schema/src/reserved.ts`, delete this line (line 5):

```ts
export const FlowSchema = z.unknown();
```

In `packages/schema/src/model.ts`, replace the import block (lines 5-8):

```ts
import {
  FlowSchema, StateMachineSchema, DataTypeSchema,
  RequirementSchema, DecisionSchema,
} from './reserved';
```

with:

```ts
import { FlowSchema } from './flow';
import {
  StateMachineSchema, DataTypeSchema,
  RequirementSchema, DecisionSchema,
} from './reserved';
```

In `packages/schema/src/index.ts`, add after the `./connection` export (line 4):

```ts
export * from './flow';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @hyphae/schema exec vitest run test/flow.test.ts`
Expected: PASS (all 7).

- [ ] **Step 6: Run the full schema suite + type-check**

Run: `pnpm --filter @hyphae/schema test`
Expected: PASS (108 prior + 7 new).
Run: `pnpm --filter @hyphae/schema exec tsc -p tsconfig.json`
Expected: no output (clean).

- [ ] **Step 7: Commit**

```bash
git add packages/schema/src/flow.ts packages/schema/src/reserved.ts packages/schema/src/model.ts packages/schema/src/index.ts packages/schema/test/flow.test.ts
git status --short   # confirm NO .json staged
git commit -m "feat(schema): real Flow schema replacing the reserved placeholder"
```

---

## Task 2: Flow validation

**Files:**
- Modify: `packages/schema/src/validate.ts:8-17` (Issue union) and after the connection loop (before `return issues`, around line 134)
- Test: `packages/schema/test/validate.test.ts` (append a describe block)

**Interfaces:**
- Consumes: `Flow`/`FlowStep` from Task 1; `validateModel(model, profile) → Issue[]`.
- Produces: three new `Issue` kinds — `bad-flow-endpoint`, `bad-flow-via`, `bad-flow-scope`, all with `ref` = the flow id.

- [ ] **Step 1: Write the failing test**

Append to `packages/schema/test/validate.test.ts`:

```ts
describe('flow validation', () => {
  const nbase = { root: null, role: null, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: { summary: 's' } };
  const edge = { verb: 'uses', object: '', description: '', direction: 'Unidirectional' as const, realizedBy: [], codeRefs: [], fields: {} };

  function flowModel(): HyphaeModel {
    const m = emptyModel();
    m.nodes.push(
      { ...nbase, id: 'a', name: 'A', type: 'Component', parentId: null, description: 'd' },
      { ...nbase, id: 'b', name: 'B', type: 'Component', parentId: null, description: 'd' },
    );
    m.connections.push({ ...edge, id: 'c1', from: 'a', to: 'b', type: 'Dependency' });
    m.flows.push({ id: 'f1', name: 'F', description: '', scope: null, steps: [
      { order: 1, from: 'a', to: 'b', via: 'c1', message: 'go', kind: 'Sync' },
    ] });
    return m;
  }

  it('accepts a flow whose steps reference existing nodes and connection', () => {
    expect(validateModel(flowModel(), c4Backend)).toEqual([]);
  });

  it('flags a step endpoint that is not a node', () => {
    const m = flowModel();
    m.flows[0].steps[0].to = 'ghost';
    const issues = validateModel(m, c4Backend).filter((i) => i.kind === 'bad-flow-endpoint');
    expect(issues).toHaveLength(1);
    expect(issues[0].ref).toBe('f1');
  });

  it('flags a via that is not a connection', () => {
    const m = flowModel();
    m.flows[0].steps[0].via = 'nope';
    const issues = validateModel(m, c4Backend).filter((i) => i.kind === 'bad-flow-via');
    expect(issues).toHaveLength(1);
    expect(issues[0].ref).toBe('f1');
  });

  it('flags a scope that is not a profile layer, accepts one that is', () => {
    const bad = flowModel(); bad.flows[0].scope = 'Stratosphere';
    expect(validateModel(bad, c4Backend).filter((i) => i.kind === 'bad-flow-scope')).toHaveLength(1);
    const ok = flowModel(); ok.flows[0].scope = 'Container';
    expect(validateModel(ok, c4Backend)).toEqual([]);
  });

  it('accepts a step with no via', () => {
    const m = flowModel();
    m.flows[0].steps[0].via = undefined;
    expect(validateModel(m, c4Backend)).toEqual([]);
  });

  it('marks a flow invalid when a referenced node is deleted (the delete invariant)', () => {
    const m = flowModel();
    m.nodes = m.nodes.filter((n) => n.id !== 'b');
    m.connections = [];
    expect(validateModel(m, c4Backend).map((i) => i.kind)).toContain('bad-flow-endpoint');
  });

  it('a realistic 2-step request/return flow validates clean', () => {
    const m = flowModel();
    m.flows[0].steps = [
      { order: 1, from: 'a', to: 'b', via: 'c1', message: 'request stream', kind: 'Sync' },
      { order: 2, from: 'b', to: 'a', message: 'stream frames', kind: 'Return' },
    ];
    expect(validateModel(m, c4Backend)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hyphae/schema exec vitest run test/validate.test.ts -t "flow validation"`
Expected: FAIL — the flags are not produced (`accepts…` passes, the flag tests fail).

- [ ] **Step 3: Extend the Issue union**

In `packages/schema/src/validate.ts`, add the three kinds to the `Issue['kind']` union (after `'unknown-role' | 'unknown-verb'` on line 14):

```ts
    | 'unknown-role' | 'unknown-verb'
    | 'bad-flow-endpoint' | 'bad-flow-via' | 'bad-flow-scope';
```

- [ ] **Step 4: Add the flow check**

In `packages/schema/src/validate.ts`, immediately before `return issues;` at the end of `validateModel` (after the `for (const c of model.connections)` loop), insert:

```ts
  const connIds = new Set(model.connections.map((c) => c.id));
  const layers = new Set(profile.layers);
  for (const f of model.flows) {
    if (f.scope !== null && !layers.has(f.scope)) {
      issues.push({ kind: 'bad-flow-scope', ref: f.id, message: `Flow scope "${f.scope}" is not a profile layer` });
    }
    for (const s of f.steps) {
      if (!nodeById.has(s.from) || !nodeById.has(s.to)) {
        issues.push({ kind: 'bad-flow-endpoint', ref: f.id, message: `Step ${s.order} references a missing node (${s.from} → ${s.to})` });
      }
      if (s.via !== undefined && !connIds.has(s.via)) {
        issues.push({ kind: 'bad-flow-via', ref: f.id, message: `Step ${s.order} via references a missing connection "${s.via}"` });
      }
    }
  }
```

(`nodeById` is already built at the top of `validateModel`.)

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @hyphae/schema exec vitest run test/validate.test.ts -t "flow validation"`
Expected: PASS.

- [ ] **Step 6: Full schema suite + type-check**

Run: `pnpm --filter @hyphae/schema test` → PASS.
Run: `pnpm --filter @hyphae/schema exec tsc -p tsconfig.json` → clean.

- [ ] **Step 7: Commit**

```bash
git add packages/schema/src/validate.ts packages/schema/test/validate.test.ts
git status --short   # confirm NO .json staged
git commit -m "feat(schema): validate flow step endpoints, via, and scope"
```

---

## Task 3: Store flow CRUD

**Files:**
- Modify: `apps/server/src/store.ts:2-6` (imports), and add methods + a delete-tolerance option to `commit`
- Test: `apps/server/test/store.test.ts` (append a describe block)

**Interfaces:**
- Consumes: `FlowSchema`, `type Flow`, `validateModel`, `resolveProfile` from `@hyphae/schema`.
- Produces: `store.addFlow(input: FlowInput): Flow`, `store.updateFlow(id, patch): Flow`, `store.deleteFlow(id): void`. Node/connection deletes are allowed to leave a flow invalid (flagged, not blocked); flow creates/updates with a bad ref are still rejected.

- [ ] **Step 1: Write the failing test**

Append to `apps/server/test/store.test.ts`:

```ts
import { validateModel, resolveProfile } from '@hyphae/schema';

describe('ModelStore flows', () => {
  function seed(store: ModelStore) {
    const a = store.addNode({ name: 'A', type: 'Component', fields: { summary: 'x' } });
    const b = store.addNode({ name: 'B', type: 'Component', fields: { summary: 'x' } });
    const c = store.addConnection({ from: a.id, to: b.id, type: 'Dependency' });
    return { a, b, c };
  }

  it('addFlow persists a valid flow', () => {
    const store = new ModelStore(file);
    const { a, b, c } = seed(store);
    const flow = store.addFlow({ name: 'Views feed', steps: [{ order: 1, from: a.id, to: b.id, via: c.id, message: 'go', kind: 'Sync' }] });
    expect(flow.id).toBeTruthy();
    expect(store.get().flows).toHaveLength(1);
  });

  it('rejects a flow whose step references a missing node', () => {
    const store = new ModelStore(file);
    seed(store);
    expect(() => store.addFlow({ name: 'Bad', steps: [{ order: 1, from: 'ghost', to: 'ghost', message: '', kind: 'Sync' }] })).toThrow(ValidationError);
    expect(store.get().flows).toEqual([]);
  });

  it('updateFlow throws NotFoundError for a missing id', () => {
    expect(() => new ModelStore(file).updateFlow('nope', { name: 'X' })).toThrow(NotFoundError);
  });

  it('deleteFlow removes the flow', () => {
    const store = new ModelStore(file);
    const { a, b } = seed(store);
    const flow = store.addFlow({ name: 'F', steps: [{ order: 1, from: a.id, to: b.id, message: '', kind: 'Sync' }] });
    store.deleteFlow(flow.id);
    expect(store.get().flows).toEqual([]);
  });

  it('allows deleting a node used by a flow, leaving the flow invalid (flagged, not blocked)', () => {
    const store = new ModelStore(file);
    const { a, b } = seed(store);
    const flow = store.addFlow({ name: 'F', steps: [{ order: 1, from: a.id, to: b.id, message: '', kind: 'Sync' }] });
    store.deleteNode(b.id);                                   // not rejected
    expect(store.get().flows.map((f) => f.id)).toEqual([flow.id]);   // flow survives
    const issues = validateModel(store.get(), resolveProfile(store.get()));
    expect(issues.some((i) => i.kind === 'bad-flow-endpoint' && i.ref === flow.id)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hyphae/server exec vitest run test/store.test.ts -t "ModelStore flows"`
Expected: FAIL — `store.addFlow is not a function`.

- [ ] **Step 3: Add imports**

In `apps/server/src/store.ts`, extend the `@hyphae/schema` import (lines 2-6) to add `FlowSchema` and `type Flow`:

```ts
import {
  HyphaeModelSchema, NodeSchema, ConnectionSchema, FlowSchema, emptyModel, newId, now,
  newIssues, resolveProfile,
  type HyphaeModel, type Node, type Connection, type Flow, type Position,
} from '@hyphae/schema';
```

Add the input type near the other input types (after line 12):

```ts
export type FlowInput = Partial<Flow> & { name: string };
```

- [ ] **Step 4: Add the flow methods**

In `apps/server/src/store.ts`, after `deleteConnection` (line 80), add:

```ts
  addFlow(input: FlowInput): Flow {
    const flow = FlowSchema.parse({ ...input, id: input.id ?? newId() });
    this.commit({ ...this.model, flows: [...this.model.flows, flow] });
    return flow;
  }

  updateFlow(id: string, patch: Partial<Flow>): Flow {
    const existing = this.model.flows.find((f) => f.id === id);
    if (!existing) throw new NotFoundError(`flow ${id} not found`);
    const updated = FlowSchema.parse({ ...existing, ...patch, id });
    this.commit({ ...this.model, flows: this.model.flows.map((f) => (f.id === id ? updated : f)) });
    return updated;
  }

  deleteFlow(id: string): void {
    if (!this.model.flows.some((f) => f.id === id)) throw new NotFoundError(`flow ${id} not found`);
    this.commit({ ...this.model, flows: this.model.flows.filter((f) => f.id !== id) });
  }
```

- [ ] **Step 5: Let node/connection deletes tolerate flow invalidation**

Per the spec's delete invariant, deleting a node/connection that a flow references must be *allowed* (the flow is flagged invalid, not the delete blocked). In `apps/server/src/store.ts`, change `commit` (lines 93-101) to accept an option that drops flow-ref issues:

```ts
  /** Validate the candidate model; reject if it adds an issue, else commit + bump + save + notify.
   *  `ignoreFlowRefs` lets a node/connection delete proceed even if it strands a flow step — the
   *  flow is left flagged-invalid (spec: deletes mark flows invalid, they do not block on them). */
  private commit(next: HyphaeModel, opts: { ignoreFlowRefs?: boolean } = {}): void {
    let issues = newIssues(this.model, next, resolveProfile(next));
    if (opts.ignoreFlowRefs) {
      issues = issues.filter((i) => i.kind !== 'bad-flow-endpoint' && i.kind !== 'bad-flow-via');
    }
    if (issues.length) throw new ValidationError(issues);
    this.model = next;
    this._version += 1;
    this.scheduleSave();
    this.notify();
  }
```

Then pass the option from the two delete methods. `deleteNode` (line 56) becomes:

```ts
    this.commit({
      ...this.model,
      nodes: this.model.nodes.filter((n) => n.id !== id),
      connections: this.model.connections.filter((c) => c.from !== id && c.to !== id),
    }, { ignoreFlowRefs: true });
```

`deleteConnection` (line 79) becomes:

```ts
    this.commit({ ...this.model, connections: this.model.connections.filter((c) => c.id !== id) }, { ignoreFlowRefs: true });
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @hyphae/server exec vitest run test/store.test.ts -t "ModelStore flows"`
Expected: PASS.

- [ ] **Step 7: Full server suite + type-check**

Run: `pnpm --filter @hyphae/server test` → PASS (70 prior + 5 new).
Run: `pnpm --filter @hyphae/server exec tsc -p tsconfig.json` → clean.

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/store.ts apps/server/test/store.test.ts
git status --short   # confirm NO .json staged
git commit -m "feat(server): flow CRUD in the store; deletes flag rather than block flows"
```

---

## Task 4: Flow HTTP routes

**Files:**
- Modify: `apps/server/src/routes.ts` (after the connection routes, before the `/views` route ~line 58)
- Test: `apps/server/test/routes.test.ts` (append a describe block)

**Interfaces:**
- Consumes: `store.addFlow`/`updateFlow`/`deleteFlow` from Task 3.
- Produces: `POST /flows` → `{ flow, version }` (201) / 422; `PATCH /flows/:id` → `{ flow, version }` / 404; `DELETE /flows/:id` → `{ version }` / 404.

- [ ] **Step 1: Write the failing test**

Append to `apps/server/test/routes.test.ts`:

```ts
describe('flow routes', () => {
  const seed = async () => {
    const a = await createNode({ name: 'A', type: 'Component', fields: { summary: 'x' } });
    const b = await createNode({ name: 'B', type: 'Component', fields: { summary: 'x' } });
    return { a, b };
  };
  const makeFlow = async (a: { id: string }, b: { id: string }) =>
    (await (await post('/flows', { name: 'F', steps: [{ order: 1, from: a.id, to: b.id, message: 'go', kind: 'Sync' }] })).json()).flow;

  it('POST /flows creates a flow', async () => {
    const { a, b } = await seed();
    const res = await post('/flows', { name: 'Views feed', steps: [{ order: 1, from: a.id, to: b.id, message: 'go', kind: 'Sync' }] });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.flow).toMatchObject({ name: 'Views feed' });
    expect(body.flow.steps[0].kind).toBe('Sync');
  });

  it('POST /flows rejects a step with a missing node (422)', async () => {
    const res = await post('/flows', { name: 'Bad', steps: [{ order: 1, from: 'ghost', to: 'ghost', message: '', kind: 'Sync' }] });
    expect(res.status).toBe(422);
    expect((await res.json()).issues[0]).toMatchObject({ kind: 'bad-flow-endpoint' });
  });

  it('PATCH /flows/:id updates a flow name', async () => {
    const { a, b } = await seed();
    const flow = await makeFlow(a, b);
    const res = await app.request(`/flows/${flow.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Renamed' }) });
    expect(res.status).toBe(200);
    expect((await res.json()).flow.name).toBe('Renamed');
  });

  it('PATCH /flows/:id returns 404 for a missing id', async () => {
    const res = await app.request('/flows/nope', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'X' }) });
    expect(res.status).toBe(404);
  });

  it('DELETE /flows/:id removes it', async () => {
    const { a, b } = await seed();
    const flow = await makeFlow(a, b);
    expect((await app.request(`/flows/${flow.id}`, { method: 'DELETE' })).status).toBe(200);
    const model = await (await app.request('/model')).json();
    expect(model.flows).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hyphae/server exec vitest run test/routes.test.ts -t "flow routes"`
Expected: FAIL — `POST /flows` returns 404 (no route).

- [ ] **Step 3: Add the routes**

In `apps/server/src/routes.ts`, after the `app.delete('/connections/:id', ...)` block (line 57), insert:

```ts
  app.post('/flows', async (c) => {
    let body: unknown;
    try { body = await c.req.json(); } catch { return c.json({ error: 'invalid JSON' }, 400); }
    try { const flow = store.addFlow(body as never); return c.json({ flow, version: store.version }, 201); }
    catch (e) { return mapError(c, e); }
  });

  app.patch('/flows/:id', async (c) => {
    let body: unknown;
    try { body = await c.req.json(); } catch { return c.json({ error: 'invalid JSON' }, 400); }
    try { const flow = store.updateFlow(c.req.param('id'), body as never); return c.json({ flow, version: store.version }); }
    catch (e) { return mapError(c, e); }
  });

  app.delete('/flows/:id', (c) => {
    try { store.deleteFlow(c.req.param('id')); return c.json({ version: store.version }); }
    catch (e) { return mapError(c, e); }
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @hyphae/server exec vitest run test/routes.test.ts -t "flow routes"`
Expected: PASS.

- [ ] **Step 5: Full server suite + type-check**

Run: `pnpm --filter @hyphae/server test` → PASS.
Run: `pnpm --filter @hyphae/server exec tsc -p tsconfig.json` → clean.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/routes.ts apps/server/test/routes.test.ts
git status --short   # confirm NO .json staged
git commit -m "feat(server): POST/PATCH/DELETE /flows routes"
```

---

## Task 5: MCP flow tools

**Files:**
- Modify: `apps/server/src/mcp.ts` — `HyphaeApi` interface (lines 10-18), `ApiResult` (line 20), `runCreate` key type (line 25), `buildTools` (add handlers), module-scope flow write shapes (exported), `httpApi` (add methods), `main()` (register five tools)
- Test: `apps/server/test/mcp.test.ts` (extend `fakeApi`, append describe blocks)

**Interfaces:**
- Consumes: `list_flows`/`get_flow`/`create_flows`/`update_flows`/`delete_flows` handlers over `HyphaeApi` (extended with `createFlow`/`updateFlow`/`deleteFlow`).
- Produces: exported `flowItemSchema` (a Zod object for a create item) for the shape assertion; the five registered MCP tools.

- [ ] **Step 1: Write the failing test**

In `apps/server/test/mcp.test.ts`, extend `fakeApi` (inside the returned object, before `...over`) with:

```ts
    createFlow: async (input) => ({ flow: { id: 'f2', ...(input as object) }, version: 1 }),
    updateFlow: async (id, patch) => ({ flow: { id, ...(patch as object) }, version: 1 }),
    deleteFlow: async () => ({ version: 1 }),
```

Then append these describe blocks at the end of the file:

```ts
import { flowItemSchema } from '../src/mcp';

describe('MCP flow tools', () => {
  const flowModel = (): HyphaeModel => {
    const m = model();   // 'api' container + self-connection 'c1'
    m.flows.push({ id: 'f1', name: 'Views feed', description: '', scope: 'Container', steps: [
      { order: 1, from: 'api', to: 'api', via: 'c1', message: 'go', kind: 'Sync' },
    ] });
    return m;
  };
  const api = () => fakeApi({ getModel: async () => flowModel() });

  it('list_flows returns summaries with validity', async () => {
    const r = await buildTools(api()).list_flows({});
    expect(r).toEqual([{ id: 'f1', name: 'Views feed', scope: 'Container', steps: 1, valid: true }]);
  });

  it('list_flows marks a flow invalid when a step endpoint is missing', async () => {
    const bad = fakeApi({ getModel: async () => { const m = flowModel(); m.flows[0].steps[0].to = 'ghost'; return m; } });
    const r = (await buildTools(bad).list_flows({})) as Array<{ valid: boolean }>;
    expect(r[0].valid).toBe(false);
  });

  it('get_flow returns the full flow, errors on a missing id', async () => {
    expect(await buildTools(api()).get_flow({ id: 'f1' })).toMatchObject({ name: 'Views feed', steps: [{ message: 'go' }] });
    expect(await buildTools(api()).get_flow({ id: 'nope' })).toMatchObject({ error: expect.stringContaining('not found') });
  });

  it('create_flows returns ids and forwards the step shape', async () => {
    const seen: Record<string, unknown>[] = [];
    const tools = buildTools(fakeApi({ createFlow: async (input) => { seen.push(input as Record<string, unknown>); return { flow: { id: 'f9', ...(input as object) }, version: 1 }; } }));
    const r = await tools.create_flows({ flows: [{ name: 'F', steps: [{ order: 1, from: 'a', to: 'b', via: 'c1', message: 'go', kind: 'Sync' }] }] });
    expect(r).toEqual({ ids: ['f9'] });
    expect(seen[0]).toMatchObject({ name: 'F', steps: [{ from: 'a', to: 'b', via: 'c1' }] });
  });

  it('update_flows splits id from patch; delete_flows forwards ids', async () => {
    const seenU: Array<[string, unknown]> = [];
    const seenD: string[] = [];
    const tools = buildTools(fakeApi({
      updateFlow: async (id, patch) => { seenU.push([id, patch]); return { flow: { id }, version: 1 }; },
      deleteFlow: async (id) => { seenD.push(id); return { version: 1 }; },
    }));
    expect(await tools.update_flows({ updates: [{ id: 'f1', name: 'R' }] })).toEqual({ ok: true });
    expect(seenU).toEqual([['f1', { name: 'R' }]]);
    expect(await tools.delete_flows({ ids: ['f1'] })).toEqual({ ok: true });
    expect(seenD).toEqual(['f1']);
  });
});

describe('MCP flow write shape', () => {
  it('accepts a full flow item and rejects a bad step kind', () => {
    expect(() => flowItemSchema.parse({ name: 'F', steps: [{ order: 1, from: 'a', to: 'b', kind: 'Sync' }] })).not.toThrow();
    expect(() => flowItemSchema.parse({ name: 'F', steps: [{ order: 1, from: 'a', to: 'b', kind: 'Bad' }] })).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hyphae/server exec vitest run test/mcp.test.ts -t "MCP flow"`
Expected: FAIL — `flowItemSchema` not exported / `list_flows is not a function`.

- [ ] **Step 3: Extend the API interface and result plumbing**

In `apps/server/src/mcp.ts`, add three methods to `HyphaeApi` (after `deleteConnection`, line 17):

```ts
  createFlow(input: unknown): Promise<unknown>;
  updateFlow(id: string, patch: unknown): Promise<unknown>;
  deleteFlow(id: string): Promise<unknown>;
```

Change `ApiResult` (line 20) to include a flow:

```ts
type ApiResult = { node?: { id: string }; connection?: { id: string }; flow?: { id: string }; issues?: unknown; error?: unknown };
```

Change `runCreate`'s `key` parameter type (line 25) from `key: 'node' | 'connection'` to:

```ts
  key: 'node' | 'connection' | 'flow',
```

- [ ] **Step 4: Add the module-scope flow write shapes (exported)**

In `apps/server/src/mcp.ts`, add near the top-level helpers (after the imports, before `buildTools`, around line 20). These live at module scope specifically so the test can assert the shape (the Phase A carryover: `buildTools` otherwise forwards blindly):

```ts
export const flowStepSchema = z.object({
  order: z.number().describe('1-based position of this step in the sequence.'),
  from: z.string().describe('Node id the step originates at.'),
  to: z.string().describe('Node id the step targets.'),
  via: z.string().optional().describe('Optional id of the connection this step traverses (adds traceability and disambiguates parallel edges). A Return or implied hop may omit it.'),
  message: z.string().optional().describe('Short caption shown on the step, e.g. "request stream".'),
  kind: z.enum(['Sync', 'Async', 'Return']).optional().describe('Sync = blocking call, Async = fire-and-forget, Return = a response back to the caller (drawn dashed). Default Sync.'),
  control: z.object({
    type: z.enum(['alt', 'opt', 'loop', 'par']).describe('alt = alternative branch, opt = optional, loop = repeated, par = parallel.'),
    condition: z.string().optional().describe('The guard/condition for the fragment.'),
  }).optional().describe('Optional sequence-fragment wrapping this step.'),
});
export const flowItemSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  scope: z.string().nullable().optional().describe('Optional layer this flow is authored at (Context/Container/Component). Advisory — used only to group flows in the picker.'),
  steps: z.array(flowStepSchema).default([]),
});
```

- [ ] **Step 5: Add the buildTools handlers**

In `apps/server/src/mcp.ts`, inside the object returned by `buildTools`, after `resolve_refs` (line 229) add:

```ts
    list_flows: async (_: Record<string, never>) => {
      const model = await api.getModel();
      const issues = validateModel(model, resolveProfile(model));
      const invalid = new Set(issues.filter((i) => i.kind.startsWith('bad-flow-')).map((i) => i.ref));
      return model.flows.map((f) => ({ id: f.id, name: f.name, scope: f.scope, steps: f.steps.length, valid: !invalid.has(f.id) }));
    },
    get_flow: async ({ id }: { id: string }) =>
      (await api.getModel()).flows.find((f) => f.id === id) ?? { error: `flow ${id} not found` },
    create_flows: async ({ flows }: { flows: Record<string, unknown>[] }) => runCreate(flows, api.createFlow, 'flow'),
    update_flows: async ({ updates }: { updates: Array<{ id: string } & Record<string, unknown>> }) =>
      runVoid(updates.map((u) => () => { const { id, ...patch } = u; return api.updateFlow(id, patch); })),
    delete_flows: async ({ ids }: { ids: string[] }) => runVoid(ids.map((id) => () => api.deleteFlow(id))),
```

- [ ] **Step 6: Add the httpApi methods**

In `apps/server/src/mcp.ts`, inside the object returned by `httpApi` (after `deleteConnection`, line 268), add:

```ts
    createFlow: (input) => mutate('POST', '/flows', input),
    updateFlow: (id, patch) => mutate('PATCH', `/flows/${id}`, patch),
    deleteFlow: (id) => mutate('DELETE', `/flows/${id}`),
```

- [ ] **Step 7: Register the five MCP tools**

In `apps/server/src/mcp.ts`, in `main()` after the `model_gaps` registration (line 452), add:

```ts
  server.registerTool('list_flows', {
    description: 'List behavior Flow summaries: id, name, scope, step count, and whether the flow currently validates (all step endpoints and via still resolve). Use get_flow for the full ordered steps.',
    inputSchema: {},
  }, async () => text(await tools.list_flows({})));

  server.registerTool('get_flow', {
    description: 'Get one behavior Flow by id with its full ordered steps. Returns {error} if the id does not exist.',
    inputSchema: { id: z.string() },
  }, async (a) => text(await tools.get_flow(a)));

  server.registerTool('create_flows', {
    description: "Create one OR MANY behavior Flows (numbered scenario overlays; single write = one-element array). Each flow: name, optional description/scope, and ordered steps. A step is { order, from, to (existing node ids), optional via (an existing connection id), message caption, kind (Sync|Async|Return), optional control fragment }. from/to must be existing nodes; via, when set, an existing connection. Best-effort: {ids:[...]} on full success, else {results:[{id}|{issues}]}.",
    inputSchema: { flows: z.array(flowItemSchema) },
  }, async (a) => text(await tools.create_flows(a)));

  const flowUpdate = z.object({ id: z.string(), name: z.string().optional(), description: z.string().optional(), scope: z.string().nullable().optional(), steps: z.array(flowStepSchema).optional() });
  server.registerTool('update_flows', {
    description: 'Update one OR MANY flows by id (single update = one-element array). Each item: id + fields to change (name, description, scope, or the full replacement steps array). Best-effort: {ok:true} on full success, else {results:[{ok}|{issues}]}.',
    inputSchema: { updates: z.array(flowUpdate) },
  }, async (a) => text(await tools.update_flows(a)));

  server.registerTool('delete_flows', {
    description: 'Delete one OR MANY flows by id (single delete = one-element array). Best-effort: {ok:true} on full success, else {results:[{ok}|{error}]}.',
    inputSchema: { ids: z.array(z.string()) },
  }, async (a) => text(await tools.delete_flows(a)));
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm --filter @hyphae/server exec vitest run test/mcp.test.ts -t "MCP flow"`
Expected: PASS.

- [ ] **Step 9: Full server suite + type-check**

Run: `pnpm --filter @hyphae/server test` → PASS.
Run: `pnpm --filter @hyphae/server exec tsc -p tsconfig.json` → clean.

- [ ] **Step 10: Commit**

```bash
git add apps/server/src/mcp.ts apps/server/test/mcp.test.ts
git status --short   # confirm NO .json staged
git commit -m "feat(mcp): list/get/create/update/delete flow tools with a shape assertion"
```

---

## Task 6: Rename the web mapping file (resolve the name collision)

**Files:**
- Rename: `apps/web/src/flow.ts` → `apps/web/src/reactflow.ts`
- Rename: `apps/web/test/flow.test.ts` → `apps/web/test/reactflow.test.ts`
- Modify: `apps/web/src/Canvas.tsx:11`, `apps/web/src/Legend.tsx:3`, and the moved test's import line 2

**Interfaces:**
- Produces: the same exports (`focusViewToFlow`, `highlightSets`, `LAYER_COLOR`, `VERB_CLASS_COLOR`, `edgeLabel`, `nodeVisual`, `layerColorOf`) from `./reactflow`. No behavior change.

- [ ] **Step 1: Move the files with git**

```bash
git mv apps/web/src/flow.ts apps/web/src/reactflow.ts
git mv apps/web/test/flow.test.ts apps/web/test/reactflow.test.ts
```

- [ ] **Step 2: Update the three importers**

In `apps/web/src/Canvas.tsx` line 11: change `from './flow'` to `from './reactflow'`.
In `apps/web/src/Legend.tsx` line 3: change `from './flow'` to `from './reactflow'`.
In `apps/web/test/reactflow.test.ts` line 2: change `from '../src/flow'` to `from '../src/reactflow'`.

- [ ] **Step 3: Run the web suite + type-check**

Run: `pnpm --filter @hyphae/web test`
Expected: PASS (138, unchanged — only the file moved).
Run: `pnpm --filter @hyphae/web exec tsc --noEmit -p tsconfig.json`
Expected: clean (no dangling `./flow` import).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/reactflow.ts apps/web/src/flow.ts apps/web/src/Canvas.tsx apps/web/src/Legend.tsx apps/web/test/reactflow.test.ts apps/web/test/flow.test.ts
git status --short   # confirm NO .json staged; the rename shows as delete+add
git commit -m "refactor(web): rename flow.ts -> reactflow.ts to free the Flow name"
```

---

## Task 7: Pure flow overlay computation

**Files:**
- Create: `apps/web/src/flowOverlay.ts`
- Test: `apps/web/test/flowOverlay.test.ts`

**Interfaces:**
- Consumes: `Flow`, `FlowStep` from `@hyphae/schema`; `Edge as FlowEdge` from `@xyflow/react`.
- Produces: `computeFlowOverlay(flow: Flow, edges: FlowEdge[], visibleNodeIds: Set<string>): FlowOverlay` where `FlowOverlay = { edgeSteps: Map<string, StepBadge[]>; participatingNodes: Set<string>; participatingEdges: Set<string>; offViewSteps: FlowStep[] }` and `StepBadge = { order: number; message: string; kind: FlowStep['kind'] }`. Steps are matched to a drawn edge whose endpoints equal `{from,to}` in either orientation, preferring the edge whose id (real edge) or `data.realizedBy` (derived edge) contains `via`. A step whose endpoints are not both visible goes to `offViewSteps`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/flowOverlay.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeFlowOverlay } from '../src/flowOverlay';
import type { Flow } from '@hyphae/schema';
import type { Edge as FlowEdge } from '@xyflow/react';

const flow = (steps: Flow['steps']): Flow => ({ id: 'f', name: 'F', description: '', scope: null, steps });
const edges: FlowEdge[] = [
  { id: 'c1', source: 'a', target: 'b' },
  { id: 'agg:a->c', source: 'a', target: 'c', data: { realizedBy: ['c2', 'c3'] } },
];
const visible = new Set(['a', 'b', 'c']);

describe('computeFlowOverlay', () => {
  it('badges the edge matching a step, marking participants', () => {
    const o = computeFlowOverlay(flow([{ order: 1, from: 'a', to: 'b', message: 'go', kind: 'Sync' }]), edges, visible);
    expect(o.edgeSteps.get('c1')).toEqual([{ order: 1, message: 'go', kind: 'Sync' }]);
    expect([...o.participatingNodes].sort()).toEqual(['a', 'b']);
    expect([...o.participatingEdges]).toEqual(['c1']);
    expect(o.offViewSteps).toEqual([]);
  });

  it('matches an edge regardless of step orientation (a Return)', () => {
    const o = computeFlowOverlay(flow([{ order: 1, from: 'b', to: 'a', message: 'back', kind: 'Return' }]), edges, visible);
    expect(o.edgeSteps.get('c1')).toEqual([{ order: 1, message: 'back', kind: 'Return' }]);
  });

  it('hosts multiple steps on one edge, sorted by order', () => {
    const o = computeFlowOverlay(flow([
      { order: 2, from: 'b', to: 'a', message: 'back', kind: 'Return' },
      { order: 1, from: 'a', to: 'b', message: 'go', kind: 'Sync' },
    ]), edges, visible);
    expect(o.edgeSteps.get('c1')).toEqual([
      { order: 1, message: 'go', kind: 'Sync' },
      { order: 2, message: 'back', kind: 'Return' },
    ]);
  });

  it('prefers the edge whose connection matches via', () => {
    const two: FlowEdge[] = [
      { id: 'c1', source: 'a', target: 'b' },
      { id: 'agg:a->b', source: 'a', target: 'b', data: { realizedBy: ['cX'] } },
    ];
    const o = computeFlowOverlay(flow([{ order: 1, from: 'a', to: 'b', via: 'cX', message: 'go', kind: 'Sync' }]), two, new Set(['a', 'b']));
    expect(o.edgeSteps.has('agg:a->b')).toBe(true);
    expect(o.edgeSteps.has('c1')).toBe(false);
  });

  it('lists a step off-view when an endpoint is not visible', () => {
    const o = computeFlowOverlay(flow([{ order: 1, from: 'a', to: 'z', message: 'go', kind: 'Sync' }]), edges, visible);
    expect(o.offViewSteps.map((s) => s.order)).toEqual([1]);
    expect(o.participatingEdges.size).toBe(0);
  });

  it('lists a step off-view when both endpoints are visible but no drawn edge joins them', () => {
    const o = computeFlowOverlay(flow([{ order: 1, from: 'b', to: 'c', message: 'x', kind: 'Sync' }]), edges, visible);
    expect(o.offViewSteps.map((s) => s.order)).toEqual([1]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hyphae/web exec vitest run test/flowOverlay.test.ts`
Expected: FAIL — `Cannot find module '../src/flowOverlay'`.

- [ ] **Step 3: Create the module**

Create `apps/web/src/flowOverlay.ts`:

```ts
import type { Edge as FlowEdge } from '@xyflow/react';
import type { Flow, FlowStep } from '@hyphae/schema';

export type StepBadge = { order: number; message: string; kind: FlowStep['kind'] };

export type FlowOverlay = {
  edgeSteps: Map<string, StepBadge[]>;   // edge id -> the steps it hosts, in order
  participatingNodes: Set<string>;       // stay bright; the rest dims
  participatingEdges: Set<string>;
  offViewSteps: FlowStep[];              // endpoints not both visible, or no drawn edge joins them
};

/** Does this drawn edge carry connection `connId` — directly (a real edge) or via rollup? */
function edgeHostsConnection(edge: FlowEdge, connId: string): boolean {
  if (edge.id === connId) return true;
  const rb = (edge.data as { realizedBy?: string[] } | undefined)?.realizedBy;
  return Array.isArray(rb) && rb.includes(connId);
}

function edgeJoins(edge: FlowEdge, step: FlowStep): boolean {
  const ends = new Set([edge.source, edge.target]);
  return ends.has(step.from) && ends.has(step.to);
}

/** Map a flow onto the currently-drawn edges: which edge hosts which numbered step, who
 *  participates (to keep bright), and which steps cannot be drawn in this view. */
export function computeFlowOverlay(flow: Flow, edges: FlowEdge[], visibleNodeIds: Set<string>): FlowOverlay {
  const edgeSteps = new Map<string, StepBadge[]>();
  const participatingNodes = new Set<string>();
  const participatingEdges = new Set<string>();
  const offViewSteps: FlowStep[] = [];

  for (const step of [...flow.steps].sort((a, b) => a.order - b.order)) {
    if (!visibleNodeIds.has(step.from) || !visibleNodeIds.has(step.to)) { offViewSteps.push(step); continue; }
    let candidates = edges.filter((e) => edgeJoins(e, step));
    if (step.via) {
      const via = step.via;
      candidates = [...candidates].sort((a, b) => Number(edgeHostsConnection(b, via)) - Number(edgeHostsConnection(a, via)));
    }
    const host = candidates[0];
    if (!host) { offViewSteps.push(step); continue; }
    (edgeSteps.get(host.id) ?? edgeSteps.set(host.id, []).get(host.id)!).push({ order: step.order, message: step.message, kind: step.kind });
    participatingEdges.add(host.id);
    participatingNodes.add(step.from);
    participatingNodes.add(step.to);
  }
  return { edgeSteps, participatingNodes, participatingEdges, offViewSteps };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @hyphae/web exec vitest run test/flowOverlay.test.ts`
Expected: PASS (6).

- [ ] **Step 5: Type-check**

Run: `pnpm --filter @hyphae/web exec tsc --noEmit -p tsconfig.json` → clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/flowOverlay.ts apps/web/test/flowOverlay.test.ts
git status --short
git commit -m "feat(web): pure flow-overlay computation (steps -> drawn edges)"
```

---

## Task 8: Store flow selection

**Files:**
- Modify: `apps/web/src/store.ts` — `State` type (lines 11-37), initial state (~line 55), one action
- Test: `apps/web/test/store.test.ts` (append a test)

**Interfaces:**
- Produces: `useStore` gains `selectedFlowId: string | null` and `selectFlow(id: string | null): void`. Selecting a flow does not mutate the model.

- [ ] **Step 1: Write the failing test**

Append inside the `describe('editor store', ...)` block in `apps/web/test/store.test.ts`:

```ts
  it('selects and clears a flow without mutating the model', () => {
    useStore.getState().selectFlow('f1');
    expect(useStore.getState().selectedFlowId).toBe('f1');
    expect(useStore.getState().model.flows).toEqual([]);
    useStore.getState().selectFlow(null);
    expect(useStore.getState().selectedFlowId).toBeNull();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hyphae/web exec vitest run test/store.test.ts -t "selects and clears a flow"`
Expected: FAIL — `selectFlow is not a function`.

- [ ] **Step 3: Add the state field, initial value, and action**

In `apps/web/src/store.ts`, in the `State` type add after `selectedId: string | null;` (line 15):

```ts
  selectedFlowId: string | null;
```

and add to the actions list (after `select:` on line 25):

```ts
  selectFlow: (id: string | null) => void;
```

In the returned object, add after `selectedId: null,` (line 57):

```ts
    selectedFlowId: null,
```

and add the action after the `select:` action (line 80):

```ts
    selectFlow: (selectedFlowId) => set({ selectedFlowId }),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @hyphae/web exec vitest run test/store.test.ts -t "selects and clears a flow"`
Expected: PASS.

- [ ] **Step 5: Full web suite + type-check**

Run: `pnpm --filter @hyphae/web test` → PASS.
Run: `pnpm --filter @hyphae/web exec tsc --noEmit -p tsconfig.json` → clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/store.ts apps/web/test/store.test.ts
git status --short
git commit -m "feat(web): selectedFlowId state + selectFlow action"
```

---

## Task 9: Flow picker panel

**Files:**
- Create: `apps/web/src/FlowPicker.tsx`
- Test: `apps/web/test/FlowPicker.test.tsx`

**Interfaces:**
- Consumes: `useStore` (`model`, `selectedFlowId`, `selectFlow`); `validateModel`, `resolveProfile` from `@hyphae/schema`.
- Produces: `FlowPicker` — renders nothing when the model has no flows; lists flows (a `⚠` marker on any that fail flow validation), toggles selection, and shows the selected flow's ordered step captions.

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/FlowPicker.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { FlowPicker } from '../src/FlowPicker';
import { useStore } from '../src/store';
import { emptyModel } from '@hyphae/schema';

const base = { description: '', root: null, role: null, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: { summary: 's' } };

function modelWithFlow() {
  const m = emptyModel();
  m.nodes.push(
    { id: 'a', name: 'A', type: 'Component', parentId: null, ...base } as never,
    { id: 'b', name: 'B', type: 'Component', parentId: null, ...base } as never,
  );
  m.flows.push({ id: 'f1', name: 'Views feed', description: '', scope: null, steps: [
    { order: 1, from: 'a', to: 'b', message: 'request stream', kind: 'Sync' },
  ] });
  return m;
}

beforeEach(() => useStore.setState({ model: modelWithFlow(), selectedFlowId: null }));

describe('FlowPicker', () => {
  it('lists flows and selects one on click', () => {
    const { getByText } = render(<FlowPicker />);
    fireEvent.click(getByText('Views feed'));
    expect(useStore.getState().selectedFlowId).toBe('f1');
  });

  it('shows the selected flow steps', () => {
    useStore.setState({ selectedFlowId: 'f1' });
    const { getByText } = render(<FlowPicker />);
    expect(getByText('request stream')).toBeTruthy();
  });

  it('flags an invalid flow with a warning marker', () => {
    const m = modelWithFlow();
    m.flows[0].steps[0].to = 'ghost';   // dangling -> bad-flow-endpoint
    useStore.setState({ model: m });
    const { getByText } = render(<FlowPicker />);
    expect(getByText(/Views feed ⚠/)).toBeTruthy();
  });

  it('renders nothing when there are no flows', () => {
    useStore.setState({ model: emptyModel() });
    const { container } = render(<FlowPicker />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hyphae/web exec vitest run test/FlowPicker.test.tsx`
Expected: FAIL — `Cannot find module '../src/FlowPicker'`.

- [ ] **Step 3: Create the component**

Create `apps/web/src/FlowPicker.tsx`:

```tsx
import { useMemo } from 'react';
import { validateModel, resolveProfile } from '@hyphae/schema';
import { useStore } from './store';

/** Lists authored flows; selecting one activates the numbered overlay on the canvas.
 *  A flow whose steps no longer resolve (e.g. a referenced node was deleted) is marked ⚠. */
export function FlowPicker() {
  const model = useStore((s) => s.model);
  const selectedFlowId = useStore((s) => s.selectedFlowId);
  const selectFlow = useStore((s) => s.selectFlow);

  const invalid = useMemo(() => {
    const issues = validateModel(model, resolveProfile(model));
    return new Set(issues.filter((i) => i.kind.startsWith('bad-flow-')).map((i) => i.ref));
  }, [model]);

  if (model.flows.length === 0) return null;
  const selected = model.flows.find((f) => f.id === selectedFlowId) ?? null;

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, color: '#334155', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', minWidth: 180 }}>
      <div style={{ padding: '5px 8px', fontWeight: 600, borderBottom: '1px solid #f1f5f9' }}>Flows</div>
      <div style={{ padding: 4 }}>
        {model.flows.map((f) => (
          <button
            key={f.id}
            onClick={() => selectFlow(f.id === selectedFlowId ? null : f.id)}
            aria-pressed={f.id === selectedFlowId}
            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '3px 6px', border: 'none', borderRadius: 4, cursor: 'pointer', background: f.id === selectedFlowId ? '#dbeafe' : 'transparent', fontWeight: f.id === selectedFlowId ? 600 : 400 }}
          >
            {f.name}{invalid.has(f.id) ? ' ⚠' : ''}
          </button>
        ))}
      </div>
      {selected && (
        <ol style={{ margin: 0, padding: '4px 8px 8px 24px', lineHeight: 1.5 }}>
          {[...selected.steps].sort((a, b) => a.order - b.order).map((s) => (
            <li key={s.order} style={{ color: s.kind === 'Return' ? '#64748b' : '#334155' }}>
              {s.message || <em>(no caption)</em>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @hyphae/web exec vitest run test/FlowPicker.test.tsx`
Expected: PASS (4).

- [ ] **Step 5: Type-check**

Run: `pnpm --filter @hyphae/web exec tsc --noEmit -p tsconfig.json` → clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/FlowPicker.tsx apps/web/test/FlowPicker.test.tsx
git status --short
git commit -m "feat(web): FlowPicker panel with per-flow validity marker"
```

---

## Task 10: Canvas numbered overlay

**Files:**
- Modify: `apps/web/src/Canvas.tsx` (full replacement below)
- Test: `apps/web/test/Canvas.test.tsx` (append a describe block)

**Interfaces:**
- Consumes: `computeFlowOverlay` (Task 7), `FlowPicker` (Task 9), `selectedFlowId` (Task 8).
- Produces: when a flow is selected, the canvas dims non-participating elements (reusing the injected-CSS mechanism) and relabels participating edges with numbered captions (`① request stream`), `Return` steps dashed. `FlowPicker` is mounted as a second top-left panel.

- [ ] **Step 1: Write the failing test**

Append to `apps/web/test/Canvas.test.tsx`:

```ts
function flowModel() {
  const m = emptyModel();
  m.nodes.push(
    { id: 'ca', name: 'Alpha', type: 'Container', parentId: null, ...base },
    { id: 'a1', name: 'A1', type: 'Component', parentId: 'ca', ...base },
    { id: 'a2', name: 'A2', type: 'Component', parentId: 'ca', ...base },
  );
  m.connections.push({ id: 'x', from: 'a1', to: 'a2', type: 'Dependency', ...e });
  m.flows.push({ id: 'f1', name: 'F', description: '', scope: null, steps: [
    { order: 1, from: 'a1', to: 'a2', via: 'x', message: 'go', kind: 'Sync' },
  ] });
  return m;
}

describe('Canvas flow overlay', () => {
  const hlCss = (container: HTMLElement) => container.querySelector('style[data-hyphae-hl]')!.textContent ?? '';

  it('mounts the FlowPicker when the model has flows', () => {
    useStore.setState({ model: flowModel(), focusId: 'ca', selectedId: null, selectedFlowId: null });
    const { getByText } = render(<Canvas />);
    expect(getByText('Flows')).toBeTruthy();
    expect(getByText('F')).toBeTruthy();
  });

  it('selecting a flow dims the rest and restores its participating edge (via CSS)', () => {
    useStore.setState({ model: flowModel(), focusId: 'ca', selectedId: null, selectedFlowId: 'f1' });
    const { container } = render(<Canvas />);
    const css = hlCss(container);
    expect(css).toContain('.react-flow__edge{opacity:');           // dim rule active
    expect(css).toContain('.react-flow__edge[data-id="x"]');       // participating edge restored
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hyphae/web exec vitest run test/Canvas.test.tsx -t "Canvas flow overlay"`
Expected: FAIL — no "Flows" panel; no flow-driven dim CSS.

- [ ] **Step 3: Replace Canvas.tsx**

Replace the entire contents of `apps/web/src/Canvas.tsx` with:

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow, Background, Controls, MiniMap, Panel, ConnectionMode,
  type Node as FlowNode,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { c4Backend, layerOfType } from '@hyphae/schema';
import { useStore } from './store';
import { buildFocusView } from './focusView';
import { layoutFocusView, resolveViewPositions } from './layout';
import { focusViewToFlow, highlightSets } from './reactflow';
import { computeFlowOverlay } from './flowOverlay';
import { GroupNode } from './GroupNode';
import { NodeBox } from './NodeBox';
import { GhostNode } from './GhostNode';
import { GhostGroupNode } from './GhostGroupNode';
import { FloatingEdge } from './FloatingEdge';
import { FilterPanel } from './FilterPanel';
import { FlowPicker } from './FlowPicker';
import { Legend } from './Legend';

const nodeTypes = { region: GroupNode, node: NodeBox, ghost: GhostNode, ghostGroup: GhostGroupNode };
const edgeTypes = { floating: FloatingEdge };
const STEP_NUM = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪', '⑫'];
const stepBadge = (order: number) => STEP_NUM[order - 1] ?? `(${order})`;

// Colour minimap dots by layer (regions muted) so the overview reads like the canvas.
const miniMapColor = (n: FlowNode): string => {
  if (n.type === 'region') return '#e2e8f0';
  const c = (n.data as { color?: { border: string } }).color;
  return c?.border ?? '#94a3b8';
};

export function Canvas() {
  const model = useStore((s) => s.model);
  const focusId = useStore((s) => s.focusId);
  const connFilter = useStore((s) => s.connFilter);
  const selectedId = useStore((s) => s.selectedId);
  const select = useStore((s) => s.select);
  const setFocus = useStore((s) => s.setFocus);
  const audience = useStore((s) => s.audience);
  const expandedExternals = useStore((s) => s.expandedExternals);
  const selectedFlowId = useStore((s) => s.selectedFlowId);

  // Transient hover, so a user can trace a node's neighborhood without committing a selection.
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  // Drilling changes focus (and remounts the graph); reset hover so the new view opens neutral.
  useEffect(() => setHoveredId(null), [focusId]);

  // Stable base layout: positions come from the full / unfiltered / full-audience / COLLAPSED view,
  // memoized on [model, focusId] only. The connection filter, the audience toggle, and expansion
  // therefore never reflow the graph — resolveViewPositions maps the actual view onto these slots.
  const EMPTY_EXPANDED = useMemo(() => new Set<string>(), []);
  const baseView = useMemo(
    () => buildFocusView(model, focusId, undefined, 'full', EMPTY_EXPANDED),
    [model, focusId, EMPTY_EXPANDED],
  );
  const basePositions = useMemo(() => layoutFocusView(baseView), [baseView]);
  const view = useMemo(
    () => buildFocusView(model, focusId, connFilter, audience, expandedExternals),
    [model, focusId, connFilter, audience, expandedExternals],
  );
  const positions = useMemo(() => resolveViewPositions(view, basePositions), [view, basePositions]);
  const { nodes, edges } = useMemo(() => focusViewToFlow(view, positions), [view, positions]);

  // Flow overlay: when a flow is selected, map its steps onto the drawn edges.
  const flow = useMemo(() => model.flows.find((f) => f.id === selectedFlowId) ?? null, [model.flows, selectedFlowId]);
  const visibleNodeIds = useMemo(() => new Set(nodes.map((n) => n.id)), [nodes]);
  const overlay = useMemo(() => (flow ? computeFlowOverlay(flow, edges, visibleNodeIds) : null), [flow, edges, visibleNodeIds]);
  const flowActive = !!overlay;

  // Relabel the participating edges with numbered captions; leave the rest untouched. Only the
  // edges change reference (never the nodes — that is what blanks the canvas), and only when the
  // flow selection changes, so this is not per-frame churn.
  const displayEdges = useMemo(() => {
    if (!overlay) return edges;
    return edges.map((ed) => {
      const steps = overlay.edgeSteps.get(ed.id);
      if (!steps) return ed;
      const label = steps.map((s) => `${stepBadge(s.order)} ${s.message}`.trim()).join('   ');
      const anyReturn = steps.some((s) => s.kind === 'Return');
      return {
        ...ed,
        label,
        style: { ...ed.style, ...(anyReturn ? { strokeDasharray: '6 4' } : {}) },
        labelStyle: { ...(ed.labelStyle as Record<string, unknown> | undefined), fontWeight: 700 },
      };
    });
  }, [edges, overlay]);

  // Highlight the active node/edge + neighbors (a region highlights its children), dim the rest.
  // Selection wins over hover. When a flow is active, its participating set drives the highlight
  // instead (and is treated as a strong selection).
  //
  // IMPORTANT: applied via an injected stylesheet keyed on React Flow's stable `data-id`s, NOT by
  // rebuilding the node/edge objects. React Flow drops a node's measured size on a new object
  // reference, hiding it until re-measured; restyling in CSS avoids that churn.
  const present = useMemo(
    () => new Set<string>([...nodes.map((n) => n.id), ...edges.map((e) => e.id)]),
    [nodes, edges],
  );
  const activeId =
    (selectedId && present.has(selectedId) && selectedId) ||
    (hoveredId && present.has(hoveredId) && hoveredId) ||
    null;
  const strong = flowActive || !!(selectedId && present.has(selectedId));
  const accent = strong ? '#2563eb' : '#93c5fd';
  const dimEdge = strong ? 0.12 : 0.4;
  const dimNode = strong ? 0.4 : 0.65;
  const childIds = useMemo(
    () => (!flowActive && activeId === view.focusId ? new Set(view.children.map((n) => n.id)) : new Set<string>()),
    [flowActive, activeId, view],
  );
  const hi = useMemo(
    () => (overlay ? { nodes: overlay.participatingNodes, edges: overlay.participatingEdges } : highlightSets(activeId, edges, childIds)),
    [overlay, activeId, edges, childIds],
  );

  const highlightCss = useMemo(() => {
    // Always-on transitions so both dimming and un-dimming animate.
    const trans =
      '.hyphae-canvas .react-flow__node{transition:opacity .15s ease,box-shadow .15s ease}'
      + '.hyphae-canvas .react-flow__edge,.hyphae-canvas .react-flow__edge .react-flow__edge-path{transition:opacity .15s ease,stroke-width .15s ease}';
    if (!activeId && !flowActive) return trans;
    const esc = (id: string) => id.replace(/["\\]/g, '\\$&');
    const nodeSel = [...hi.nodes].map((id) => `.hyphae-canvas .react-flow__node[data-id="${esc(id)}"]`);
    const edgeSel = [...hi.edges].map((id) => `.hyphae-canvas .react-flow__edge[data-id="${esc(id)}"]`);
    const rules = [
      trans,
      // Dim everything except the focus-region backdrop, then restore + emphasize the highlighted set.
      `.hyphae-canvas .react-flow__node:not(.react-flow__node-region):not(.react-flow__node-ghostGroup){opacity:${dimNode}}`,
      `.hyphae-canvas .react-flow__edge{opacity:${dimEdge}}`,
    ];
    // !important: the dim rule's two :not() pseudo-classes give it specificity (0,4,0), which
    // outranks this [data-id] restore (0,3,0) — without !important the active node would stay dimmed.
    if (nodeSel.length) rules.push(`${nodeSel.join(',')}{opacity:1!important;box-shadow:0 0 0 2px ${accent};border-radius:4px}`);
    if (edgeSel.length) {
      rules.push(`${edgeSel.join(',')}{opacity:1}`);
      // !important beats the derived edge's inline stroke-width.
      rules.push(`${edgeSel.map((s) => `${s} .react-flow__edge-path`).join(',')}{stroke-width:${strong ? 3.5 : 3}px!important}`);
    }
    return rules.join('');
  }, [activeId, flowActive, hi, strong, accent, dimEdge, dimNode]);

  // Drill in: an external ghost, or a node with children, becomes the new focus.
  const drill = (node: FlowNode) => {
    if (node.type === 'ghost') { setFocus(node.id); return; }
    if (!model.nodes.some((n) => n.parentId === node.id)) return;
    if (audience === 'stakeholder') {
      const target = model.nodes.find((n) => n.id === node.id);
      if (target && layerOfType(c4Backend, target.type) === 'Component') return; // Components are leaves for stakeholders
    }
    setFocus(node.id);
  };

  // React Flow suppresses onNodeDoubleClick while nodesDraggable={false} (double-click rides on
  // the node drag machinery), so we detect the double-click from the onNodeClick stream instead:
  // first click selects, a second click on the same node within the threshold drills in.
  const lastClick = useRef<{ id: string; t: number }>({ id: '', t: 0 });
  const DOUBLE_CLICK_MS = 350;
  const onNodeClick = (_: unknown, node: FlowNode) => {
    const now = Date.now();
    if (lastClick.current.id === node.id && now - lastClick.current.t < DOUBLE_CLICK_MS) {
      lastClick.current = { id: '', t: 0 };
      drill(node);
    } else {
      lastClick.current = { id: node.id, t: now };
      select(node.id);
    }
  };

  return (
    <div className="hyphae-canvas" style={{ flex: 1, height: '100%' }}>
      <style data-hyphae-hl>{highlightCss}</style>
      <ReactFlow
        key={focusId ?? '__root__'}
        nodes={nodes}
        edges={displayEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        connectionMode={ConnectionMode.Loose}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        onNodeClick={onNodeClick}
        onNodeMouseEnter={(_, node) => setHoveredId(node.id)}
        onNodeMouseLeave={() => setHoveredId(null)}
        onEdgeMouseEnter={(_, e) => setHoveredId(e.id)}
        onEdgeMouseLeave={() => setHoveredId(null)}
        onEdgeClick={(_, e) => select(e.id)}
        onPaneClick={() => select(null)}
        fitView
      >
        <Panel position="top-left"><FilterPanel /></Panel>
        <Panel position="top-left"><FlowPicker /></Panel>
        <Panel position="top-right"><Legend /></Panel>
        <Background />
        <Controls />
        <MiniMap nodeColor={miniMapColor} pannable zoomable />
      </ReactFlow>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @hyphae/web exec vitest run test/Canvas.test.tsx -t "Canvas flow overlay"`
Expected: PASS.

- [ ] **Step 5: Full web suite + type-check**

Run: `pnpm --filter @hyphae/web test`
Expected: PASS (regression guard: the existing hover/selection Canvas tests still pass — the non-flow path is unchanged).
Run: `pnpm --filter @hyphae/web exec tsc --noEmit -p tsconfig.json` → clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/Canvas.tsx apps/web/test/Canvas.test.tsx
git status --short
git commit -m "feat(web): numbered flow overlay + FlowPicker on the canvas"
```

---

## Task 11: Teach flow authoring in the modeling skill

**Files:**
- Modify: `plugins/hyphae-modeling/skills/building-architecture-models/SKILL.md` (add a section after "## The visual vocabulary", before "## Idempotency contract")

**Interfaces:** none (documentation). No test; verified by reading.

- [ ] **Step 1: Add the flows section**

In `plugins/hyphae-modeling/skills/building-architecture-models/SKILL.md`, immediately before the `## Idempotency contract (every run, every agent)` heading (line ~168), insert:

```markdown
## Flows (the Behavior axis — optional, after connections)

A **Flow** is a named scenario overlaid on existing nodes/connections — the diagram lights its
steps in order. Author one with `create_flows` when a request path is worth showing end to end
(e.g. "User views live feed"). Flows are additive and never required.

- A flow is `{ name, description?, scope?, steps: [...] }`. `scope` is an optional layer hint
  (Context/Container/Component) used only to group flows — leave it off unless it helps.
- A **step** is `{ order, from, to, via?, message, kind, control? }`:
  - `from`/`to` are **node ids** that must already exist; `order` is 1-based.
  - `via` is an **optional connection id** — set it to the specific connection the step traverses
    (adds traceability and picks the right edge when two nodes have parallel connections). A
    `Return` or an implied hop may omit it.
  - `message` is the short caption shown on the step ("request stream").
  - `kind` is `Sync` (blocking call), `Async` (fire-and-forget), or `Return` (a response back to
    the caller — drawn dashed). Default `Sync`.
  - `control` (optional) wraps a step in a sequence fragment: `{ type: alt|opt|loop|par, condition }`.
- Read flows back with `list_flows` (summaries + a `valid` flag) and `get_flow` (full steps).
- **The overlay only lights a step when both its endpoints are visible in the current view.** Keep
  a flow's steps at one altitude (all Component-level, or all Container-level) so it lights up as a
  unit; a flow whose steps span containers will only partly render at any single focus.
- Deleting a node or connection a flow references does **not** delete the flow — it leaves the flow
  flagged invalid (`list_flows` returns `valid:false`, the picker marks it ⚠). Fix or delete such
  flows with `update_flows`/`delete_flows`.
```

- [ ] **Step 2: Verify the insertion reads correctly**

Run: `git diff plugins/hyphae-modeling/skills/building-architecture-models/SKILL.md`
Expected: the new section sits between "## The visual vocabulary" and "## Idempotency contract", well-formed.

- [ ] **Step 3: Commit**

```bash
git add plugins/hyphae-modeling/skills/building-architecture-models/SKILL.md
git status --short
git commit -m "docs(skill): teach flow authoring (create_flows, step shape, kinds)"
```

---

## Final verification (whole branch)

- [ ] Run all three suites: `pnpm -r test` → all pass (schema 108+12, server 70+~14, web 138+~12).
- [ ] Run all three type-checks:
  - `pnpm --filter @hyphae/schema exec tsc -p tsconfig.json`
  - `pnpm --filter @hyphae/server exec tsc -p tsconfig.json`
  - `pnpm --filter @hyphae/web exec tsc --noEmit -p tsconfig.json`
- [ ] `git status --short` shows only `apps/server/hyphae-cctv-new.json` untracked — no model `.json` was ever committed.
- [ ] Manual smoke (optional): start the server + web, author a flow over two sibling Components via MCP (`create_flows`), select it in the picker, confirm the numbered badges appear and the rest dims.

---

## Self-review notes (coverage against the spec)

- Spec §2 schema → Task 1. §3/§4 validation → Task 2. §4 store/routes → Tasks 3–4 (incl. the delete-invariant tolerance). §5 MCP + shape assertion (Phase A carryover) → Task 5. §6 rename → Task 6; overlay module → Task 7; store select → Task 8; picker → Task 9; canvas → Task 10. §7/§9 skill → Task 11.
- De-risking (spec §9, "author real flows early") is exercised as fixture tests in Tasks 2 (realistic 2-step request/return flow validates clean) and 5 (`list_flows` over a realistic flow) — no committed model `.json`.
- `describe_profile` deliberately unchanged (spec D-B2): flows add no profile vocabulary.
- Known bounded limitation (cross-view visibility, spec §8) is encoded in `computeFlowOverlay`'s `offViewSteps`, surfaced in the picker, and documented in the skill.
```

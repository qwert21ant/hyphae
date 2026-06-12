# LLM-Authored Model Edits via MCP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an LLM agent create and edit the architecture model (nodes + connections) through the read/write Hyphae MCP server, with the HTTP server as the single source of truth and the web editor updating live over SSE.

**Architecture:** The HTTP server owns the in-memory model plus a monotonic `version`, and is the only writer to `hyphae.json`. Both the web editor and the MCP server mutate through granular, strictly-validated endpoints (`POST/PATCH/DELETE /nodes`, `POST/DELETE /connections`, `PUT /views/:layer/positions/:nodeId`). A `GET /events` SSE stream broadcasts `changed {version}`; the editor refetches when an external (LLM) version exceeds its own. `PUT /model` is removed.

**Tech Stack:** TypeScript, pnpm workspaces, Zod, Hono + `hono/streaming` (SSE), `@hono/node-server`, `@modelcontextprotocol/sdk`, Vite + React + Zustand, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-12-llm-write-via-mcp-design.md`

---

## Conventions

- Tests live in each package's `test/` dir and import source via `../src/...` (established layout).
- Run commands from repo root `C:\projects\hyphae`, forward slashes, bash.
- Commit after each task with the message shown.
- ESM throughout; packages named `@hyphae/*`.

---

## Task 1: Schema — `newIssues` + `resolveProfile`

**Files:**
- Modify: `packages/schema/src/validate.ts`
- Test: `packages/schema/test/validate.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `packages/schema/test/validate.test.ts` (it already imports `validateModel`, `emptyModel`, `c4Backend`, the `node()` helper, and `type Node`):

```ts
import { newIssues, resolveProfile } from '../src/validate';

describe('newIssues', () => {
  it('returns only issues that are new in next', () => {
    const prev = emptyModel();
    const next = emptyModel();
    next.nodes.push(node({ id: 'a', type: 'Bogus' }));
    const result = newIssues(prev, next, c4Backend);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ kind: 'unknown-type', ref: 'a' });
  });

  it('ignores issues that already existed in prev', () => {
    const prev = emptyModel();
    prev.nodes.push(node({ id: 'a', type: 'Bogus' }));
    const next = { ...prev, nodes: [...prev.nodes] };
    expect(newIssues(prev, next, c4Backend)).toEqual([]);
  });
});

describe('resolveProfile', () => {
  it('returns c4Backend for the c4-backend profile', () => {
    expect(resolveProfile(emptyModel())).toBe(c4Backend);
  });

  it('throws for an unknown profile', () => {
    const m = { ...emptyModel(), activeProfile: 'nope' };
    expect(() => resolveProfile(m as never)).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @hyphae/schema test`
Expected: FAIL — `newIssues`/`resolveProfile` are not exported.

- [ ] **Step 3: Implement in `validate.ts`**

In `packages/schema/src/validate.ts`, change the existing import line
`import { allowedParentTypes } from './profiles/c4-backend';`
to:

```ts
import { allowedParentTypes, c4Backend } from './profiles/c4-backend';
```

Then append at the end of the file:

```ts
const issueKey = (i: Issue) => `${i.kind}:${i.ref}`;

/** Issues present in `next` but not already in `prev` (identity = kind+ref). */
export function newIssues(prev: HyphaeModel, next: HyphaeModel, profile: Profile): Issue[] {
  const before = new Set(validateModel(prev, profile).map(issueKey));
  return validateModel(next, profile).filter((i) => !before.has(issueKey(i)));
}

/** The Profile for a model's activeProfile. Only c4-backend exists today. */
export function resolveProfile(model: HyphaeModel): Profile {
  if (model.activeProfile === c4Backend.id) return c4Backend;
  throw new Error(`Unknown profile: ${model.activeProfile}`);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @hyphae/schema test`
Expected: PASS (all schema tests, including the 4 new ones).

- [ ] **Step 5: Commit**

```bash
git add packages/schema && git commit -m "feat(schema): newIssues + resolveProfile helpers"
```

---

## Task 2: Server — ModelStore version, mutations, subscriptions

**Files:**
- Create: `apps/server/src/errors.ts`
- Modify: `apps/server/src/store.ts`
- Test: `apps/server/test/store.test.ts` (rewrite)

- [ ] **Step 1: Create `errors.ts`**

`apps/server/src/errors.ts`:

```ts
import type { Issue } from '@hyphae/schema';

/** A mutation that would introduce one or more validation issues. */
export class ValidationError extends Error {
  constructor(public readonly issues: Issue[]) {
    super('validation failed');
    this.name = 'ValidationError';
  }
}

/** A mutation that targets an id that does not exist. */
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}
```

- [ ] **Step 2: Rewrite the store test (failing)**

Replace `apps/server/test/store.test.ts` with:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ModelStore } from '../src/store';
import { ValidationError, NotFoundError } from '../src/errors';

let dir: string;
let file: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hyphae-'));
  file = join(dir, 'hyphae.json');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('ModelStore', () => {
  it('returns an empty model when the file is absent', () => {
    expect(new ModelStore(file).get().nodes).toEqual([]);
  });

  it('addNode persists atomically and reloads', async () => {
    const store = new ModelStore(file);
    const node = store.addNode({ name: 'API', type: 'Container' });
    expect(node.id).toBeTruthy();
    expect(store.version).toBe(1);
    await store.flush();
    expect(existsSync(file)).toBe(true);
    expect(existsSync(file + '.tmp')).toBe(false);
    expect(new ModelStore(file).get().nodes.map((n) => n.name)).toEqual(['API']);
  });

  it('rejects a mutation that introduces an issue, leaving state unchanged', () => {
    const store = new ModelStore(file);
    expect(() => store.addNode({ name: 'X', type: 'Bogus' })).toThrow(ValidationError);
    expect(store.get().nodes).toEqual([]);
    expect(store.version).toBe(0);
  });

  it('updateNode throws NotFoundError for a missing id', () => {
    expect(() => new ModelStore(file).updateNode('nope', { name: 'X' })).toThrow(NotFoundError);
  });

  it('deleteNode cascades its connections', () => {
    const store = new ModelStore(file);
    const a = store.addNode({ name: 'A', type: 'Component' });
    const b = store.addNode({ name: 'B', type: 'Component' });
    store.addConnection({ from: a.id, to: b.id, relationCategory: 'Dependency' });
    store.deleteNode(a.id);
    expect(store.get().nodes.map((n) => n.id)).toEqual([b.id]);
    expect(store.get().connections).toEqual([]);
  });

  it('notifies subscribers with the new version on each change', () => {
    const store = new ModelStore(file);
    const seen: number[] = [];
    const unsub = store.subscribe((v) => seen.push(v));
    store.addNode({ name: 'A', type: 'Component' });
    store.addNode({ name: 'B', type: 'Component' });
    unsub();
    store.addNode({ name: 'C', type: 'Component' });
    expect(seen).toEqual([1, 2]);
  });

  it('stores a node position in the layer view', () => {
    const store = new ModelStore(file);
    const n = store.addNode({ name: 'A', type: 'Component' });
    store.setNodePosition('Component', n.id, { x: 10, y: 20 });
    expect(store.get().views.find((v) => v.layer === 'Component')?.nodePositions[n.id]).toEqual({ x: 10, y: 20 });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @hyphae/server test`
Expected: FAIL — `addNode`/`subscribe`/`version`/`setNodePosition` and `../src/errors` do not exist.

- [ ] **Step 4: Rewrite `store.ts`**

Replace `apps/server/src/store.ts` with:

```ts
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import {
  HyphaeModelSchema, NodeSchema, ConnectionSchema, emptyModel, newId, now,
  newIssues, resolveProfile,
  type HyphaeModel, type Node, type Connection, type Position,
} from '@hyphae/schema';
import { ValidationError, NotFoundError } from './errors';

const DEBOUNCE_MS = 500;

export type NodeInput = Partial<Node> & { name: string; type: string };
export type ConnectionInput = Partial<Connection> & {
  from: string;
  to: string;
  relationCategory: Connection['relationCategory'];
};

export class ModelStore {
  private model: HyphaeModel;
  private timer: NodeJS.Timeout | null = null;
  private _version = 0;
  private listeners = new Set<(version: number) => void>();

  constructor(private readonly file: string) {
    this.model = existsSync(file)
      ? HyphaeModelSchema.parse(JSON.parse(readFileSync(file, 'utf8')))
      : emptyModel();
  }

  get(): HyphaeModel {
    return this.model;
  }

  get version(): number {
    return this._version;
  }

  subscribe(listener: (version: number) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  addNode(input: NodeInput): Node {
    const ts = now();
    const node = NodeSchema.parse({ ...input, id: input.id ?? newId(), createdAt: ts, updatedAt: ts });
    this.commit({ ...this.model, nodes: [...this.model.nodes, node] });
    return node;
  }

  updateNode(id: string, patch: Partial<Node>): Node {
    const existing = this.model.nodes.find((n) => n.id === id);
    if (!existing) throw new NotFoundError(`node ${id} not found`);
    const updated = NodeSchema.parse({ ...existing, ...patch, id, createdAt: existing.createdAt, updatedAt: now() });
    this.commit({ ...this.model, nodes: this.model.nodes.map((n) => (n.id === id ? updated : n)) });
    return updated;
  }

  deleteNode(id: string): void {
    if (!this.model.nodes.some((n) => n.id === id)) throw new NotFoundError(`node ${id} not found`);
    this.commit({
      ...this.model,
      nodes: this.model.nodes.filter((n) => n.id !== id),
      connections: this.model.connections.filter((c) => c.from !== id && c.to !== id),
    });
  }

  addConnection(input: ConnectionInput): Connection {
    const conn = ConnectionSchema.parse({ ...input, id: input.id ?? newId() });
    this.commit({ ...this.model, connections: [...this.model.connections, conn] });
    return conn;
  }

  deleteConnection(id: string): void {
    if (!this.model.connections.some((c) => c.id === id)) throw new NotFoundError(`connection ${id} not found`);
    this.commit({ ...this.model, connections: this.model.connections.filter((c) => c.id !== id) });
  }

  setNodePosition(layer: string, nodeId: string, pos: Position): void {
    const views = this.model.views.map((v) => ({ ...v, nodePositions: { ...v.nodePositions } }));
    let view = views.find((v) => v.layer === layer);
    if (!view) {
      view = { id: newId(), name: layer, layer, nodePositions: {} };
      views.push(view);
    }
    view.nodePositions[nodeId] = pos;
    this.commit({ ...this.model, views });
  }

  /** Validate the candidate model; reject if it adds an issue, else commit + bump + save + notify. */
  private commit(next: HyphaeModel): void {
    const issues = newIssues(this.model, next, resolveProfile(next));
    if (issues.length) throw new ValidationError(issues);
    this.model = next;
    this._version += 1;
    this.scheduleSave();
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) listener(this._version);
  }

  private scheduleSave(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.writeNow(), DEBOUNCE_MS);
  }

  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.writeNow();
  }

  private writeNow(): void {
    const tmp = this.file + '.tmp';
    writeFileSync(tmp, JSON.stringify(this.model, null, 2) + '\n', 'utf8');
    renameSync(tmp, this.file);
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @hyphae/server test`
Expected: store tests PASS. (routes/mcp tests still reference the old API and will be updated in later tasks — if the runner reports failures there, that's expected until Tasks 3 and 5. To run only the store file: `pnpm --filter @hyphae/server exec vitest run test/store.test.ts`.)

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/errors.ts apps/server/src/store.ts apps/server/test/store.test.ts && git commit -m "feat(server): versioned ModelStore with validated mutations + subscriptions"
```

---

## Task 3: Server — granular routes (nodes, connections, positions); remove PUT /model

**Files:**
- Modify: `apps/server/src/routes.ts` (rewrite)
- Test: `apps/server/test/routes.test.ts` (rewrite)

- [ ] **Step 1: Rewrite the routes test (failing)**

Replace `apps/server/test/routes.test.ts` with:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ModelStore } from '../src/store';
import { createApp } from '../src/routes';

let dir: string;
let app: ReturnType<typeof createApp>;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hyphae-'));
  app = createApp(new ModelStore(join(dir, 'hyphae.json')));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const post = (path: string, body: unknown) =>
  app.request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const createNode = async (body: unknown) => (await (await post('/nodes', body)).json()).node;

describe('routes', () => {
  it('GET /model returns the model and the version header', async () => {
    const res = await app.request('/model');
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Hyphae-Version')).toBe('0');
    expect((await res.json()).nodes).toEqual([]);
  });

  it('POST /nodes creates a node and bumps version', async () => {
    const res = await post('/nodes', { name: 'API', type: 'Container' });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.node).toMatchObject({ name: 'API', type: 'Container' });
    expect(body.version).toBe(1);
  });

  it('POST /nodes rejects an unknown type with 422 and issues', async () => {
    const res = await post('/nodes', { name: 'X', type: 'Bogus' });
    expect(res.status).toBe(422);
    expect((await res.json()).issues[0]).toMatchObject({ kind: 'unknown-type' });
  });

  it('PATCH /nodes/:id updates a node', async () => {
    const node = await createNode({ name: 'API', type: 'Container' });
    const res = await app.request(`/nodes/${node.id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Renamed' }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).node.name).toBe('Renamed');
  });

  it('PATCH /nodes/:id returns 404 for a missing id', async () => {
    const res = await app.request('/nodes/nope', {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'X' }),
    });
    expect(res.status).toBe(404);
  });

  it('DELETE /nodes/:id cascades its connections', async () => {
    const a = await createNode({ name: 'A', type: 'Component' });
    const b = await createNode({ name: 'B', type: 'Component' });
    await post('/connections', { from: a.id, to: b.id, relationCategory: 'Dependency' });
    expect((await app.request(`/nodes/${a.id}`, { method: 'DELETE' })).status).toBe(200);
    const model = await (await app.request('/model')).json();
    expect(model.nodes.map((n: { id: string }) => n.id)).toEqual([b.id]);
    expect(model.connections).toEqual([]);
  });

  it('POST /connections rejects a dangling endpoint with 422', async () => {
    const a = await createNode({ name: 'A', type: 'Component' });
    const res = await post('/connections', { from: a.id, to: 'ghost', relationCategory: 'Dependency' });
    expect(res.status).toBe(422);
    expect((await res.json()).issues[0]).toMatchObject({ kind: 'dangling-endpoint' });
  });

  it('PUT /views/:layer/positions/:nodeId stores a position', async () => {
    const a = await createNode({ name: 'A', type: 'Component' });
    const res = await app.request(`/views/Component/positions/${a.id}`, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ x: 5, y: 6 }),
    });
    expect(res.status).toBe(200);
    const model = await (await app.request('/model')).json();
    expect(model.views.find((v: { layer: string }) => v.layer === 'Component').nodePositions[a.id]).toEqual({ x: 5, y: 6 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hyphae/server exec vitest run test/routes.test.ts`
Expected: FAIL — endpoints don't exist yet.

- [ ] **Step 3: Rewrite `routes.ts`**

Replace `apps/server/src/routes.ts` with (the `/events` SSE route is added in Task 4):

```ts
import { Hono } from 'hono';
import type { Context } from 'hono';
import type { ModelStore } from './store';
import { ValidationError, NotFoundError } from './errors';

function mapError(c: Context, e: unknown) {
  if (e instanceof ValidationError) return c.json({ issues: e.issues }, 422);
  if (e instanceof NotFoundError) return c.json({ error: e.message }, 404);
  return c.json({ error: 'invalid input', detail: String(e) }, 400);
}

export function createApp(store: ModelStore) {
  const app = new Hono();

  app.get('/model', (c) => {
    c.header('X-Hyphae-Version', String(store.version));
    return c.json(store.get());
  });

  app.post('/nodes', async (c) => {
    let body: unknown;
    try { body = await c.req.json(); } catch { return c.json({ error: 'invalid JSON' }, 400); }
    try { const node = store.addNode(body as never); return c.json({ node, version: store.version }, 201); }
    catch (e) { return mapError(c, e); }
  });

  app.patch('/nodes/:id', async (c) => {
    let body: unknown;
    try { body = await c.req.json(); } catch { return c.json({ error: 'invalid JSON' }, 400); }
    try { const node = store.updateNode(c.req.param('id'), body as never); return c.json({ node, version: store.version }); }
    catch (e) { return mapError(c, e); }
  });

  app.delete('/nodes/:id', (c) => {
    try { store.deleteNode(c.req.param('id')); return c.json({ version: store.version }); }
    catch (e) { return mapError(c, e); }
  });

  app.post('/connections', async (c) => {
    let body: unknown;
    try { body = await c.req.json(); } catch { return c.json({ error: 'invalid JSON' }, 400); }
    try { const connection = store.addConnection(body as never); return c.json({ connection, version: store.version }, 201); }
    catch (e) { return mapError(c, e); }
  });

  app.delete('/connections/:id', (c) => {
    try { store.deleteConnection(c.req.param('id')); return c.json({ version: store.version }); }
    catch (e) { return mapError(c, e); }
  });

  app.put('/views/:layer/positions/:nodeId', async (c) => {
    let body: unknown;
    try { body = await c.req.json(); } catch { return c.json({ error: 'invalid JSON' }, 400); }
    const { x, y } = (body ?? {}) as { x?: number; y?: number };
    if (typeof x !== 'number' || typeof y !== 'number') return c.json({ error: 'x and y must be numbers' }, 400);
    try { store.setNodePosition(c.req.param('layer'), c.req.param('nodeId'), { x, y }); return c.json({ version: store.version }); }
    catch (e) { return mapError(c, e); }
  });

  return app;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @hyphae/server exec vitest run test/routes.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/routes.ts apps/server/test/routes.test.ts && git commit -m "feat(server): granular validated routes; remove PUT /model"
```

---

## Task 4: Server — SSE `/events` endpoint

**Files:**
- Modify: `apps/server/src/routes.ts`
- Test: `apps/server/test/events.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/server/test/events.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ModelStore } from '../src/store';
import { createApp } from '../src/routes';

let dir: string;
let app: ReturnType<typeof createApp>;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hyphae-'));
  app = createApp(new ModelStore(join(dir, 'hyphae.json')));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('GET /events', () => {
  it('is an SSE stream that emits an initial hello with the version', async () => {
    const res = await app.request('/events');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const reader = res.body!.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain('event: hello');
    expect(text).toContain('data: 0');
    await reader.cancel();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hyphae/server exec vitest run test/events.test.ts`
Expected: FAIL — `/events` returns 404.

- [ ] **Step 3: Add the SSE route to `routes.ts`**

At the top of `apps/server/src/routes.ts`, add the import:

```ts
import { streamSSE } from 'hono/streaming';
```

Inside `createApp`, immediately before `return app;`, add:

```ts
  app.get('/events', (c) =>
    streamSSE(c, async (stream) => {
      await stream.writeSSE({ event: 'hello', data: String(store.version) });
      const unsub = store.subscribe((v) => {
        void stream.writeSSE({ event: 'changed', data: String(v) }).catch(() => undefined);
      });
      await new Promise<void>((resolve) => stream.onAbort(() => { unsub(); resolve(); }));
    }),
  );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @hyphae/server exec vitest run test/events.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the whole server suite**

Run: `pnpm --filter @hyphae/server exec vitest run test/store.test.ts test/routes.test.ts test/events.test.ts`
Expected: PASS (mcp.test is updated in Task 5).

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/routes.ts apps/server/test/events.test.ts && git commit -m "feat(server): SSE /events broadcasting model version changes"
```

---

## Task 5: Server — MCP read-through + write tools

**Files:**
- Modify: `apps/server/src/mcp.ts` (rewrite)
- Test: `apps/server/test/mcp.test.ts` (rewrite)

- [ ] **Step 1: Rewrite the MCP test (failing)**

Replace `apps/server/test/mcp.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { buildTools, type HyphaeApi } from '../src/mcp';
import { emptyModel, type HyphaeModel } from '@hyphae/schema';

function model(): HyphaeModel {
  const m = emptyModel();
  m.nodes.push({
    id: 'api', name: 'API', type: 'Container', description: 'edge', responsibilities: [],
    invariants: [], assumptions: [], failureModes: [], tags: [], status: 'Active',
    parentId: null, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't',
  });
  m.connections.push({
    id: 'c1', from: 'api', to: 'api', relationCategory: 'Dependency', transport: 'Sync',
    description: 'self', direction: 'Unidirectional', realizes: [], codeRefs: [],
  });
  return m;
}

function fakeApi(over: Partial<HyphaeApi> = {}): HyphaeApi {
  return {
    getModel: async () => model(),
    createNode: async (input) => ({ node: { id: 'new', ...(input as object) }, version: 1 }),
    updateNode: async (id, patch) => ({ node: { id, ...(patch as object) }, version: 1 }),
    deleteNode: async () => ({ version: 1 }),
    createConnection: async (input) => ({ connection: { id: 'c2', ...(input as object) }, version: 1 }),
    deleteConnection: async () => ({ version: 1 }),
    ...over,
  };
}

describe('MCP tool handlers', () => {
  it('get_text_context returns plain text', async () => {
    expect(await buildTools(fakeApi()).get_text_context({})).toContain('API (Container)');
  });
  it('get_node returns one node by id', async () => {
    expect(await buildTools(fakeApi()).get_node({ id: 'api' })).toMatchObject({ name: 'API' });
  });
  it('list_nodes lists summaries', async () => {
    expect(await buildTools(fakeApi()).list_nodes({})).toEqual([{ id: 'api', name: 'API', type: 'Container' }]);
  });
  it('find_connections filters by node id', async () => {
    expect(await buildTools(fakeApi()).find_connections({ nodeId: 'api' })).toHaveLength(1);
  });
  it('create_node forwards input and returns the created node', async () => {
    const r = await buildTools(fakeApi()).create_node({ name: 'X', type: 'Component' });
    expect(r).toMatchObject({ node: { name: 'X', type: 'Component' } });
  });
  it('create_node surfaces issues when the server rejects the write', async () => {
    const api = fakeApi({ createNode: async () => ({ issues: [{ kind: 'bad-parent', ref: 'x', message: 'no' }] }) });
    const r = await buildTools(api).create_node({ name: 'X', type: 'Component', parentId: 'y' });
    expect(r).toMatchObject({ issues: [{ kind: 'bad-parent' }] });
  });
  it('update_node splits id from the patch', async () => {
    const r = await buildTools(fakeApi()).update_node({ id: 'api', name: 'Renamed' });
    expect(r).toMatchObject({ node: { id: 'api', name: 'Renamed' } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hyphae/server exec vitest run test/mcp.test.ts`
Expected: FAIL — `HyphaeApi` export and new `buildTools` shape don't exist.

- [ ] **Step 3: Rewrite `mcp.ts`**

Replace `apps/server/src/mcp.ts` with:

```ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { getContext, HyphaeModelSchema, type HyphaeModel } from '@hyphae/schema';

export interface HyphaeApi {
  getModel(): Promise<HyphaeModel>;
  createNode(input: unknown): Promise<unknown>;
  updateNode(id: string, patch: unknown): Promise<unknown>;
  deleteNode(id: string): Promise<unknown>;
  createConnection(input: unknown): Promise<unknown>;
  deleteConnection(id: string): Promise<unknown>;
}

/** Pure tool handlers over an injected API client (re-reads the model per call). */
export function buildTools(api: HyphaeApi) {
  return {
    get_text_context: async ({ layer }: { layer?: string }) =>
      getContext(await api.getModel(), layer ? { layer } : {}),
    get_node: async ({ id }: { id: string }) =>
      (await api.getModel()).nodes.find((n) => n.id === id) ?? null,
    list_nodes: async (_: Record<string, never>) =>
      (await api.getModel()).nodes.map((n) => ({ id: n.id, name: n.name, type: n.type })),
    find_connections: async ({ nodeId }: { nodeId: string }) =>
      (await api.getModel()).connections.filter((c) => c.from === nodeId || c.to === nodeId),
    create_node: async (input: Record<string, unknown>) => api.createNode(input),
    update_node: async ({ id, ...patch }: { id: string } & Record<string, unknown>) => api.updateNode(id, patch),
    delete_node: async ({ id }: { id: string }) => api.deleteNode(id),
    create_connection: async (input: Record<string, unknown>) => api.createConnection(input),
    delete_connection: async ({ id }: { id: string }) => api.deleteConnection(id),
  };
}

/** HTTP client of the running Hyphae server (the single source of truth). */
function httpApi(base: string): HyphaeApi {
  async function mutate(method: string, path: string, body?: unknown): Promise<unknown> {
    try {
      const res = await fetch(`${base}${path}`, {
        method,
        headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const txt = await res.text();
      return txt ? JSON.parse(txt) : { version: null };
    } catch (e) {
      return { error: `Hyphae server not reachable at ${base} — start it with \`pnpm --filter @hyphae/server dev\`. (${String(e)})` };
    }
  }
  return {
    getModel: async () => {
      const res = await fetch(`${base}/model`);
      if (!res.ok) throw new Error(`GET /model failed: ${res.status}`);
      return HyphaeModelSchema.parse(await res.json());
    },
    createNode: (input) => mutate('POST', '/nodes', input),
    updateNode: (id, patch) => mutate('PATCH', `/nodes/${id}`, patch),
    deleteNode: (id) => mutate('DELETE', `/nodes/${id}`),
    createConnection: (input) => mutate('POST', '/connections', input),
    deleteConnection: (id) => mutate('DELETE', `/connections/${id}`),
  };
}

function text(value: unknown) {
  return { content: [{ type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] };
}

const nodeFields = {
  description: z.string().optional(),
  purpose: z.string().optional(),
  technology: z.string().optional(),
  responsibilities: z.array(z.string()).optional(),
  invariants: z.array(z.string()).optional(),
  assumptions: z.array(z.string()).optional(),
  failureModes: z.array(z.string()).optional(),
  parentId: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  owner: z.string().optional(),
  status: z.enum(['Planned', 'Active', 'Deprecated']).optional(),
};

async function main() {
  const base = process.env.HYPHAE_SERVER ?? 'http://localhost:5173';
  const tools = buildTools(httpApi(base));
  const server = new McpServer({ name: 'hyphae', version: '0.1.0' });

  server.tool('get_text_context', 'Compact plain-text view of the architecture model. Call this FIRST to see what already exists before creating or editing.', { layer: z.string().optional() }, async (a) => text(await tools.get_text_context(a)));
  server.tool('get_node', 'Get one node by id.', { id: z.string() }, async (a) => text(await tools.get_node(a)));
  server.tool('list_nodes', 'List node summaries (id, name, type).', {}, async () => text(await tools.list_nodes({})));
  server.tool('find_connections', 'List the connections touching a node id.', { nodeId: z.string() }, async (a) => text(await tools.find_connections(a)));

  server.tool(
    'create_node',
    "Add a node to the model. Call after get_text_context. `type` must be one of the active profile kinds: System, Container, Component, Actor, ExternalSystem. Containment: a Component's parentId must reference a Container, and a Container's parentId a System. Fill responsibilities/invariants/assumptions — these are the value this model gives other agents. Returns the created node, or {issues} if the write is rejected.",
    { name: z.string(), type: z.string(), ...nodeFields },
    async (a) => text(await tools.create_node(a)),
  );
  server.tool(
    'update_node',
    'Update fields of an existing node by id. Only provided fields change. Returns the updated node, or {issues} if rejected.',
    { id: z.string(), name: z.string().optional(), type: z.string().optional(), ...nodeFields },
    async (a) => text(await tools.update_node(a)),
  );
  server.tool('delete_node', 'Delete a node by id. Its connections are removed too.', { id: z.string() }, async (a) => text(await tools.delete_node(a)));

  server.tool(
    'create_connection',
    'Connect two existing nodes by id. relationCategory is required: Dependency, DataFlow, Realization, or Trace. transport: Sync, Async, InProcess, None. direction: Unidirectional or Bidirectional. Returns the created connection, or {issues} if rejected.',
    {
      from: z.string(), to: z.string(),
      relationCategory: z.enum(['Dependency', 'DataFlow', 'Realization', 'Trace']),
      transport: z.enum(['Sync', 'Async', 'InProcess', 'None']).optional(),
      intent: z.enum(['Read', 'Write', 'Trigger', 'Notify', 'Use']).optional(),
      description: z.string().optional(),
      direction: z.enum(['Unidirectional', 'Bidirectional']).optional(),
    },
    async (a) => text(await tools.create_connection(a)),
  );
  server.tool('delete_connection', 'Delete a connection by id.', { id: z.string() }, async (a) => text(await tools.delete_connection(a)));

  await server.connect(new StdioServerTransport());
}

// Only start the transport when run directly, not when imported by tests.
if (process.argv[1] && process.argv[1].endsWith('mcp.ts')) {
  void main();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @hyphae/server test`
Expected: PASS (all server tests: store + routes + events + mcp).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/mcp.ts apps/server/test/mcp.test.ts && git commit -m "feat(server): MCP read-through + node/connection write tools"
```

---

## Task 6: Web — API client + non-optimistic store

**Files:**
- Modify: `apps/web/src/api.ts` (rewrite)
- Modify: `apps/web/src/store.ts` (rewrite)
- Test: `apps/web/test/store.test.ts` (rewrite)

- [ ] **Step 1: Rewrite `api.ts`**

Replace `apps/web/src/api.ts` with:

```ts
import { HyphaeModelSchema, type HyphaeModel, type Node, type Connection, type Position } from '@hyphae/schema';

/** Non-2xx response carrying the parsed error body (e.g. {issues}). */
export class ApiError extends Error {
  constructor(public readonly status: number, public readonly body: unknown) {
    super(`request failed: ${status}`);
    this.name = 'ApiError';
  }
}

export async function loadModel(): Promise<{ model: HyphaeModel; version: number }> {
  const res = await fetch('/model');
  if (!res.ok) throw new Error(`GET /model failed: ${res.status}`);
  const version = Number(res.headers.get('X-Hyphae-Version') ?? '0');
  const model = HyphaeModelSchema.parse(await res.json());
  return { model, version };
}

async function mutate(method: string, path: string, body?: unknown): Promise<{ [k: string]: unknown }> {
  const res = await fetch(path, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = res.status === 204 ? {} : await res.json();
  if (!res.ok) throw new ApiError(res.status, json);
  return json;
}

export function createNode(input: { id: string; name: string; type: string }): Promise<{ node: Node; version: number }> {
  return mutate('POST', '/nodes', input) as Promise<{ node: Node; version: number }>;
}
export function updateNode(id: string, patch: Partial<Node>): Promise<{ node: Node; version: number }> {
  return mutate('PATCH', `/nodes/${id}`, patch) as Promise<{ node: Node; version: number }>;
}
export function deleteNode(id: string): Promise<{ version: number }> {
  return mutate('DELETE', `/nodes/${id}`) as Promise<{ version: number }>;
}
export function createConnection(input: { id: string; from: string; to: string; relationCategory: string }): Promise<{ connection: Connection; version: number }> {
  return mutate('POST', '/connections', input) as Promise<{ connection: Connection; version: number }>;
}
export function deleteConnection(id: string): Promise<{ version: number }> {
  return mutate('DELETE', `/connections/${id}`) as Promise<{ version: number }>;
}
export function setNodePosition(layer: string, nodeId: string, pos: Position): Promise<{ version: number }> {
  return mutate('PUT', `/views/${encodeURIComponent(layer)}/positions/${nodeId}`, pos) as Promise<{ version: number }>;
}
```

- [ ] **Step 2: Rewrite the store test (failing)**

Replace `apps/web/test/store.test.ts` with:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { emptyModel } from '@hyphae/schema';

vi.mock('../src/api', () => {
  let v = 0;
  const base = (over: Record<string, unknown>) => ({
    id: 'x', name: 'X', type: 'Component', description: '', purpose: undefined, technology: undefined,
    responsibilities: [], invariants: [], assumptions: [], failureModes: [], tags: [], owner: undefined,
    status: 'Active', parentId: null, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', ...over,
  });
  const blank = () => ({
    schemaVersion: 1, metadata: { name: 'Untitled', description: '', createdAt: 't', updatedAt: 't' },
    activeProfile: 'c4-backend', nodes: [], connections: [], flows: [], stateMachines: [],
    dataTypes: [], requirements: [], decisions: [], views: [],
  });
  class ApiError extends Error {
    constructor(public status: number, public body: unknown) { super('x'); this.name = 'ApiError'; }
  }
  return {
    ApiError,
    loadModel: vi.fn(async () => ({ model: blank(), version: v })),
    createNode: vi.fn(async (input: { id: string; name: string; type: string }) => ({ node: base({ id: input.id, name: input.name, type: input.type }), version: ++v })),
    updateNode: vi.fn(async (id: string, patch: Record<string, unknown>) => ({ node: base({ id, ...patch }), version: ++v })),
    deleteNode: vi.fn(async () => ({ version: ++v })),
    createConnection: vi.fn(async (input: { id: string; from: string; to: string }) => ({ connection: { id: input.id, from: input.from, to: input.to, relationCategory: 'Dependency', transport: 'None', description: '', direction: 'Unidirectional', realizes: [], codeRefs: [] }, version: ++v })),
    deleteConnection: vi.fn(async () => ({ version: ++v })),
    setNodePosition: vi.fn(async () => ({ version: ++v })),
  };
});

import { useStore } from '../src/store';

beforeEach(() => useStore.getState().setModel(emptyModel(), 0));

describe('editor store', () => {
  it('adds a node from the server response', async () => {
    await useStore.getState().addNode('Component');
    const { model, ownVersion } = useStore.getState();
    expect(model.nodes).toHaveLength(1);
    expect(model.nodes[0].type).toBe('Component');
    expect(ownVersion).toBeGreaterThan(0);
  });

  it('updates a node field', async () => {
    await useStore.getState().addNode('Component');
    const id = useStore.getState().model.nodes[0].id;
    await useStore.getState().updateNode(id, { name: 'Renamed' });
    expect(useStore.getState().model.nodes[0].name).toBe('Renamed');
  });

  it('deletes a node and its connections', async () => {
    await useStore.getState().addNode('Component');
    await useStore.getState().addNode('Component');
    const [a, b] = useStore.getState().model.nodes.map((n) => n.id);
    await useStore.getState().addConnection(a, b);
    await useStore.getState().deleteNode(a);
    const m = useStore.getState().model;
    expect(m.nodes).toHaveLength(1);
    expect(m.connections).toHaveLength(0);
  });

  it('stores a node position in the layer view', async () => {
    useStore.getState().setLayer('Component');
    await useStore.getState().addNode('Component');
    const id = useStore.getState().model.nodes[0].id;
    await useStore.getState().setNodePosition(id, { x: 10, y: 20 });
    const view = useStore.getState().model.views.find((v) => v.layer === 'Component');
    expect(view?.nodePositions[id]).toEqual({ x: 10, y: 20 });
  });

  it('refetches and surfaces the issue when a write is rejected (422)', async () => {
    const api = await import('../src/api');
    (api.createNode as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new api.ApiError(422, { issues: [{ message: 'unknown type' }] }));
    await useStore.getState().addNode('Bogus');
    expect(useStore.getState().error).toContain('unknown type');
    expect(useStore.getState().model.nodes).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @hyphae/web exec vitest run test/store.test.ts`
Expected: FAIL — store still has the old synchronous, PUT-based shape (no `ownVersion`, `error`, async actions, `syncFromServer`).

- [ ] **Step 4: Rewrite `store.ts`**

Replace `apps/web/src/store.ts` with:

```ts
import { create } from 'zustand';
import {
  emptyModel, newId, c4Backend, typesForLayer,
  type HyphaeModel, type Node, type Position,
} from '@hyphae/schema';
import * as api from './api';

type State = {
  model: HyphaeModel;
  layer: string;
  selectedId: string | null;
  ownVersion: number;
  error: string | null;
  setModel: (m: HyphaeModel, version?: number) => void;
  syncFromServer: () => Promise<void>;
  setLayer: (layer: string) => void;
  select: (id: string | null) => void;
  addNode: (type: string) => Promise<void>;
  updateNode: (id: string, patch: Partial<Node>) => Promise<void>;
  deleteNode: (id: string) => Promise<void>;
  addConnection: (from: string, to: string) => Promise<void>;
  deleteConnection: (id: string) => Promise<void>;
  setNodePosition: (id: string, pos: Position) => Promise<void>;
};

export const useStore = create<State>((set, get) => {
  // On a rejected write: resync from the server (single source of truth) and surface the issue.
  async function recover(e: unknown): Promise<void> {
    if (e instanceof api.ApiError && e.status === 422) {
      const body = e.body as { issues?: Array<{ message: string }> };
      const { model, version } = await api.loadModel();
      set({ model, ownVersion: version, error: (body.issues ?? []).map((i) => i.message).join('; ') || 'rejected' });
    } else {
      set({ error: String(e) });
    }
  }

  return {
    model: emptyModel(),
    layer: 'Component',
    selectedId: null,
    ownVersion: 0,
    error: null,

    setModel: (model, version = 0) => set({ model, ownVersion: version }),
    syncFromServer: async () => {
      const { model, version } = await api.loadModel();
      set({ model, ownVersion: version });
    },
    setLayer: (layer) => set({ layer, selectedId: null }),
    select: (selectedId) => set({ selectedId }),

    addNode: async (type) => {
      try {
        const { node, version } = await api.createNode({ id: newId(), name: type, type });
        set((s) => ({ model: { ...s.model, nodes: [...s.model.nodes, node] }, selectedId: node.id, ownVersion: version, error: null }));
      } catch (e) { await recover(e); }
    },

    updateNode: async (id, patch) => {
      try {
        const { node, version } = await api.updateNode(id, patch);
        set((s) => ({ model: { ...s.model, nodes: s.model.nodes.map((n) => (n.id === id ? node : n)) }, ownVersion: version, error: null }));
      } catch (e) { await recover(e); }
    },

    deleteNode: async (id) => {
      try {
        const { version } = await api.deleteNode(id);
        set((s) => ({
          model: {
            ...s.model,
            nodes: s.model.nodes.filter((n) => n.id !== id),
            connections: s.model.connections.filter((c) => c.from !== id && c.to !== id),
          },
          selectedId: null, ownVersion: version, error: null,
        }));
      } catch (e) { await recover(e); }
    },

    addConnection: async (from, to) => {
      try {
        const { connection, version } = await api.createConnection({ id: newId(), from, to, relationCategory: 'Dependency' });
        set((s) => ({ model: { ...s.model, connections: [...s.model.connections, connection] }, ownVersion: version, error: null }));
      } catch (e) { await recover(e); }
    },

    deleteConnection: async (id) => {
      try {
        const { version } = await api.deleteConnection(id);
        set((s) => ({ model: { ...s.model, connections: s.model.connections.filter((c) => c.id !== id) }, ownVersion: version, error: null }));
      } catch (e) { await recover(e); }
    },

    setNodePosition: async (id, pos) => {
      const layer = get().layer;
      try {
        const { version } = await api.setNodePosition(layer, id, pos);
        set((s) => {
          const views = s.model.views.map((v) => ({ ...v, nodePositions: { ...v.nodePositions } }));
          let view = views.find((v) => v.layer === layer);
          if (!view) {
            view = { id: newId(), name: layer, layer, nodePositions: {} };
            views.push(view);
          }
          view.nodePositions[id] = pos;
          return { model: { ...s.model, views }, ownVersion: version };
        });
      } catch (e) { await recover(e); }
    },
  };
});

export const layerTypes = (layer: string) => typesForLayer(c4Backend, layer);
export const layers = c4Backend.layers;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @hyphae/web exec vitest run test/store.test.ts`
Expected: PASS (5 tests). (Canvas/SidePanel/App tests are updated in Task 7.)

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/api.ts apps/web/src/store.ts apps/web/test/store.test.ts && git commit -m "feat(web): granular API client + non-optimistic async store"
```

---

## Task 7: Web — live SSE wiring, async-aware tests, dev proxy, README, smoke

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/vite.config.ts`
- Test: `apps/web/test/App.test.tsx` (rewrite)
- Test: `apps/web/test/SidePanel.test.tsx` (rewrite)
- Modify: `README.md`

- [ ] **Step 1: Rewrite the App test (failing)**

Replace `apps/web/test/App.test.tsx` with:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../src/api', () => {
  let v = 0;
  const base = (over: Record<string, unknown>) => ({
    id: 'x', name: 'X', type: 'Component', description: '', responsibilities: [], invariants: [],
    assumptions: [], failureModes: [], tags: [], status: 'Active', parentId: null, codeRefs: [],
    docRefs: [], createdAt: 't', updatedAt: 't', ...over,
  });
  const blank = () => ({
    schemaVersion: 1, metadata: { name: 'Untitled', description: '', createdAt: 't', updatedAt: 't' },
    activeProfile: 'c4-backend', nodes: [], connections: [], flows: [], stateMachines: [],
    dataTypes: [], requirements: [], decisions: [], views: [],
  });
  class ApiError extends Error { constructor(public status: number, public body: unknown) { super('x'); } }
  return {
    ApiError,
    loadModel: vi.fn(async () => ({ model: blank(), version: v })),
    createNode: vi.fn(async (input: { id: string; name: string; type: string }) => ({ node: base({ id: input.id, name: input.name, type: input.type }), version: ++v })),
    updateNode: vi.fn(async (id: string, patch: Record<string, unknown>) => ({ node: base({ id, ...patch }), version: ++v })),
    deleteNode: vi.fn(async () => ({ version: ++v })),
    createConnection: vi.fn(async () => ({ connection: {}, version: ++v })),
    deleteConnection: vi.fn(async () => ({ version: ++v })),
    setNodePosition: vi.fn(async () => ({ version: ++v })),
  };
});

import { App } from '../src/App';
import { useStore } from '../src/store';
import { emptyModel } from '@hyphae/schema';

beforeEach(() => {
  useStore.getState().setModel(emptyModel(), 0);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('EventSource', class { addEventListener() {} close() {} });
});

describe('App', () => {
  it('switches the active layer via the dropdown', () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('layer'), { target: { value: 'Container' } });
    expect(useStore.getState().layer).toBe('Container');
  });

  it('adds a node of the first type for the active layer', async () => {
    render(<App />);
    // Let the initial loadModel() in App's effect settle first, so its setModel
    // can't clobber the node we add below (setTimeout(0) flushes all microtasks).
    await new Promise((r) => setTimeout(r, 0));
    fireEvent.change(screen.getByLabelText('layer'), { target: { value: 'Component' } });
    fireEvent.click(screen.getByRole('button', { name: /add component/i }));
    await waitFor(() => expect(useStore.getState().model.nodes.map((n) => n.type)).toEqual(['Component']));
  });
});
```

- [ ] **Step 2: Rewrite the SidePanel test (failing)**

Replace `apps/web/test/SidePanel.test.tsx` with:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../src/api', () => {
  let v = 0;
  const base = (over: Record<string, unknown>) => ({
    id: 'x', name: 'X', type: 'Component', description: '', responsibilities: [], invariants: [],
    assumptions: [], failureModes: [], tags: [], status: 'Active', parentId: null, codeRefs: [],
    docRefs: [], createdAt: 't', updatedAt: 't', ...over,
  });
  const blank = () => ({
    schemaVersion: 1, metadata: { name: 'Untitled', description: '', createdAt: 't', updatedAt: 't' },
    activeProfile: 'c4-backend', nodes: [], connections: [], flows: [], stateMachines: [],
    dataTypes: [], requirements: [], decisions: [], views: [],
  });
  class ApiError extends Error { constructor(public status: number, public body: unknown) { super('x'); } }
  return {
    ApiError,
    loadModel: vi.fn(async () => ({ model: blank(), version: v })),
    createNode: vi.fn(async (input: { id: string; name: string; type: string }) => ({ node: base({ id: input.id, name: input.name, type: input.type }), version: ++v })),
    updateNode: vi.fn(async (id: string, patch: Record<string, unknown>) => ({ node: base({ id, ...patch }), version: ++v })),
    deleteNode: vi.fn(async () => ({ version: ++v })),
    createConnection: vi.fn(async () => ({ connection: {}, version: ++v })),
    deleteConnection: vi.fn(async () => ({ version: ++v })),
    setNodePosition: vi.fn(async () => ({ version: ++v })),
  };
});

import { SidePanel } from '../src/SidePanel';
import { useStore } from '../src/store';
import { emptyModel } from '@hyphae/schema';

beforeEach(() => useStore.getState().setModel(emptyModel(), 0));

describe('SidePanel', () => {
  it('shows a hint when nothing is selected', () => {
    render(<SidePanel />);
    expect(screen.getByText(/no node selected/i)).toBeTruthy();
  });

  it('edits the selected node name', async () => {
    await useStore.getState().addNode('Component');
    render(<SidePanel />);
    fireEvent.change(screen.getByLabelText('name') as HTMLInputElement, { target: { value: 'Payments' } });
    await waitFor(() => expect(useStore.getState().model.nodes[0].name).toBe('Payments'));
  });

  it('edits invariants as a newline-separated list', async () => {
    await useStore.getState().addNode('Component');
    render(<SidePanel />);
    fireEvent.change(screen.getByLabelText('invariants') as HTMLTextAreaElement, { target: { value: 'a\nb' } });
    await waitFor(() => expect(useStore.getState().model.nodes[0].invariants).toEqual(['a', 'b']));
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @hyphae/web exec vitest run test/App.test.tsx test/SidePanel.test.tsx`
Expected: FAIL — `App` still calls `loadModel().then(setModel)` with the old single-arg signature and has no `EventSource` wiring, so the async `add component` / edit assertions don't settle.

- [ ] **Step 4: Update `App.tsx` to seed version + subscribe to SSE**

Replace the `useEffect` block in `apps/web/src/App.tsx` (currently `loadModel().then(setModel).catch(...)`) with:

```tsx
  useEffect(() => {
    loadModel()
      .then(({ model, version }) => setModel(model, version))
      .catch((e) => console.error('load failed', e));
    const es = new EventSource('/events');
    es.addEventListener('changed', (e) => {
      const version = Number((e as MessageEvent).data);
      if (version > useStore.getState().ownVersion) void useStore.getState().syncFromServer();
    });
    return () => es.close();
  }, [setModel]);
```

This requires `useStore` in scope. Ensure the import at the top of `App.tsx` reads:

```tsx
import { useStore, layers, layerTypes } from './store';
```

(no other change to `App.tsx`; `setModel` is already pulled from the store there).

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @hyphae/web exec vitest run test/App.test.tsx test/SidePanel.test.tsx`
Expected: PASS.

- [ ] **Step 6: Update the Vite dev proxy**

In `apps/web/vite.config.ts`, replace the `proxy` object so all server paths are forwarded:

```ts
    proxy: {
      '/model': 'http://localhost:5173',
      '/nodes': 'http://localhost:5173',
      '/connections': 'http://localhost:5173',
      '/views': 'http://localhost:5173',
      '/events': 'http://localhost:5173',
    },
```

- [ ] **Step 7: Full web test sweep + typecheck + build**

Run: `pnpm --filter @hyphae/web test`
Expected: PASS (store 5 + toModel 2 + SidePanel 3 + App 2 = 12).

Run: `pnpm --filter @hyphae/web exec tsc --noEmit -p tsconfig.json`
Expected: exit 0.

Run: `pnpm --filter @hyphae/web build`
Expected: `apps/web/dist/index.html` written, no errors.

- [ ] **Step 8: Update `README.md`**

Replace the `## MCP (read-only, for an agent)` section of `README.md` with:

```markdown
## MCP (read + write, for an agent)

The MCP server is an HTTP client of the running Hyphae server, so the server must be up:

    pnpm --filter @hyphae/server dev          # terminal A — owns hyphae.json on :5173
    HYPHAE_SERVER=http://localhost:5173 pnpm --filter @hyphae/server mcp   # terminal B

Read tools: `get_text_context`, `get_node`, `list_nodes`, `find_connections`.
Write tools: `create_node`, `update_node`, `delete_node`, `create_connection`, `delete_connection`.

All edits go through the server's granular, validated endpoints (strict — a write that would
break the model is rejected with the specific issues). The web editor subscribes to `/events`
(SSE) and shows the agent's changes live.
```

- [ ] **Step 9: Manual end-to-end smoke (single source of truth + live path)**

```bash
cd /c/projects/hyphae
PORT=5196 pnpm --filter @hyphae/server exec tsx src/index.ts > /tmp/hy.log 2>&1 &
SRV=$!
sleep 2
# create a node via the granular endpoint
curl -s --noproxy localhost -X POST http://localhost:5196/nodes \
  -H 'content-type: application/json' -d '{"name":"Orders","type":"Component"}' | head -c 120; echo
# confirm it is in the model and version advanced
curl -s --noproxy localhost -i http://localhost:5196/model | grep -i x-hyphae-version
curl -s --noproxy localhost http://localhost:5196/model | grep -o '"name":"Orders"'
# reject path: unknown type -> 422
curl -s --noproxy localhost -o /dev/null -w "%{http_code}\n" -X POST http://localhost:5196/nodes \
  -H 'content-type: application/json' -d '{"name":"X","type":"Bogus"}'
kill $SRV 2>/dev/null; sleep 1
rm -f apps/server/hyphae.json hyphae.json
```
Expected: POST returns `{"node":{...},"version":1}`; the version header is `1`; `"name":"Orders"` is present; the bogus type returns `422`.

- [ ] **Step 10: Full monorepo test sweep**

Run: `pnpm -r test`
Expected: schema, server, and web suites all PASS.

- [ ] **Step 11: Commit**

```bash
git add apps/web/src/App.tsx apps/web/vite.config.ts apps/web/test/App.test.tsx apps/web/test/SidePanel.test.tsx README.md && git commit -m "feat(web): live SSE refresh + dev proxy; docs for MCP write tools"
```

---

## Self-Review notes

- **Spec coverage:** server as sole owner + version (Task 2) ✓; granular validated endpoints with strict `422` (Tasks 2,3) ✓; `PUT /model` removed (Task 3) ✓; SSE `/events` (Task 4) ✓; MCP read-through + write tools with prescriptive descriptions (Task 5) ✓; web granular client + non-optimistic store + refetch-on-422 (Task 6) ✓; live SSE refresh via version/ownVersion (Task 7) ✓; `newIssues`/`resolveProfile` pure helpers (Task 1) ✓. Position persistence (gap left by removing `PUT /model`) covered by `PUT /views/:layer/positions/:nodeId` + `ModelStore.setNodePosition` (Tasks 2,3,6) ✓.
- **Type consistency:** `ValidationError`/`NotFoundError` (errors.ts) used identically in store + routes; `ModelStore` methods (`addNode`, `updateNode`, `deleteNode`, `addConnection`, `deleteConnection`, `setNodePosition`, `subscribe`, `version`) match callers in routes and the SSE route; `HyphaeApi` interface identical between `buildTools` and `httpApi` and the web `api` module mirror; web store actions are async everywhere and consumers (`Canvas`, `SidePanel`, `App`) call them fire-and-forget (no signature mismatch); `setModel(model, version?)` back-compatible with `setModel(emptyModel())` in tests.
- **Out of scope honored:** no reserved-axis editing, no Claude Code skill/MCP prompt, no multi-profile beyond c4-backend (seam in `resolveProfile`), no optimistic UI (noted for a later slice).
- **Known thin-slice simplifications:** web store is non-optimistic (awaits the server, refetches on rejection); full SSE streaming is covered by a manual smoke plus a headers/`hello` unit test; the MCP stdio transport wiring stays untested (as before).
```

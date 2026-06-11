# Hyphae MVP (Thin Slice) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local web app where a human edits a single-layer-filtered C4 architecture model (nodes + connections + containment) in a visual editor, persisted to one JSON file, and read by an LLM agent through a read-only MCP server.

**Architecture:** pnpm monorepo. `packages/schema` is the single source of truth: Zod schemas → TS types → JSON Schema → a pure `getContext()` text renderer → referential validation. `apps/server` (Hono) serves `GET/PUT /model` with atomic file writes and, in prod, the built SPA. A separate MCP entrypoint reuses the schema package to expose read-only tools. `apps/web` (Vite + React + React Flow + Zustand) is the editor; layer is a dropdown filter (not zoom drill-down), containment lives in `parentId`.

**Tech Stack:** TypeScript, pnpm workspaces, Zod, zod-to-json-schema, Hono, @hono/node-server, @modelcontextprotocol/sdk, Vite, React 18, @xyflow/react, Zustand, Vitest, @testing-library/react.

**Spec:** `MVP_RU.md` (scope), `MODEL_RU.md` (model concept §8), `SPEC_RU.md` (product).

---

## File Structure

```
hyphae/
  pnpm-workspace.yaml
  package.json                      # root scripts + dev deps
  tsconfig.base.json                # shared compiler options
  packages/
    schema/
      package.json
      tsconfig.json
      vitest.config.ts
      src/
        ids.ts                      # uuid + timestamp helpers
        node.ts                     # Node Zod schema + type
        connection.ts               # Connection Zod schema + type
        view.ts                     # View Zod schema + type
        reserved.ts                 # reserved-axis collection schemas (empty)
        profile.ts                  # Profile schema + type
        model.ts                    # HyphaeModel schema + emptyModel()
        profiles/c4-backend.ts      # the one MVP profile (data)
        validate.ts                 # referential integrity beyond Zod
        context.ts                  # getContext(model, scope?) renderer
        json-schema.ts              # zod-to-json-schema export
        index.ts                    # public exports
  apps/
    server/
      package.json
      tsconfig.json
      vitest.config.ts
      src/
        store.ts                    # load + atomic debounced save of model file
        routes.ts                   # Hono app: GET/PUT /model
        index.ts                    # http entry (serves SPA in prod)
        mcp.ts                      # MCP server entry (read-only tools)
    web/
      package.json
      tsconfig.json
      vite.config.ts
      vitest.config.ts
      index.html
      src/
        main.tsx                    # React root
        api.ts                      # fetch GET/PUT /model
        store.ts                    # Zustand editor store
        App.tsx                     # layout: toolbar + canvas + side panel
        Canvas.tsx                  # React Flow canvas, layer-filtered
        SidePanel.tsx               # all fields of selected node
        toModel.ts                  # store<->React-Flow mapping helpers
        styles.css
```

**Responsibility boundaries:** schema package knows nothing about HTTP or React. Server knows the schema + filesystem. MCP entry reuses schema + store-load only. Web knows the schema types + the HTTP API. `getContext`/`validate` are pure functions reused by both server and MCP.

---

## Conventions

- All packages are ESM (`"type": "module"`).
- Package name prefix `@hyphae/*`. Web/server import schema via `@hyphae/schema`.
- Tests colocated as `*.test.ts` next to source (Vitest `globals: true`).
- Commit after every task with the message shown.
- Run all commands from repo root `C:\projects\hyphae` unless stated. Use forward slashes.

---

## Task 1: Monorepo scaffold + tooling

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `.gitignore`

- [ ] **Step 1: Init git + workspace files**

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - 'packages/*'
  - 'apps/*'
```

Create `.gitignore`:

```
node_modules
dist
*.tmp
hyphae.json
```

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

Create root `package.json`:

```json
{
  "name": "hyphae",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "pnpm --parallel -r --filter \"./apps/*\" dev",
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "mcp": "pnpm --filter @hyphae/server mcp"
  },
  "devDependencies": {
    "typescript": "^5.5.4",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 2: Install and init git**

Run:
```bash
cd /c/projects/hyphae && pnpm install && git init && git add -A && git commit -m "chore: monorepo scaffold"
```
Expected: pnpm creates lockfile; git commit succeeds.

---

## Task 2: Schema — core entity schemas

**Files:**
- Create: `packages/schema/package.json`
- Create: `packages/schema/tsconfig.json`
- Create: `packages/schema/vitest.config.ts`
- Create: `packages/schema/src/ids.ts`
- Create: `packages/schema/src/node.ts`
- Create: `packages/schema/src/connection.ts`
- Create: `packages/schema/src/view.ts`
- Create: `packages/schema/src/reserved.ts`
- Test: `packages/schema/src/node.test.ts`

- [ ] **Step 1: Create package manifest + config**

`packages/schema/package.json`:

```json
{
  "name": "@hyphae/schema",
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "build": "tsc -p tsconfig.json"
  },
  "dependencies": {
    "zod": "^3.23.8",
    "zod-to-json-schema": "^3.23.2"
  }
}
```

`packages/schema/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

`packages/schema/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { globals: true, environment: 'node' },
});
```

- [ ] **Step 2: Write `ids.ts`**

`packages/schema/src/ids.ts`:

```ts
import { randomUUID } from 'node:crypto';

export const newId = (): string => randomUUID();
export const now = (): string => new Date().toISOString();
```

- [ ] **Step 3: Write the failing test for Node**

`packages/schema/src/node.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { NodeSchema } from './node';

describe('NodeSchema', () => {
  it('fills defaults for a minimal node', () => {
    const parsed = NodeSchema.parse({
      id: 'n1',
      name: 'Orders',
      type: 'Component',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(parsed.description).toBe('');
    expect(parsed.responsibilities).toEqual([]);
    expect(parsed.invariants).toEqual([]);
    expect(parsed.status).toBe('Active');
    expect(parsed.parentId).toBeNull();
  });

  it('rejects a node missing required name', () => {
    expect(() =>
      NodeSchema.parse({ id: 'n1', type: 'Component', createdAt: 'x', updatedAt: 'x' }),
    ).toThrow();
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm --filter @hyphae/schema test`
Expected: FAIL — cannot find module `./node`.

- [ ] **Step 5: Implement `node.ts`**

`packages/schema/src/node.ts`:

```ts
import { z } from 'zod';

export const StatusSchema = z.enum(['Planned', 'Active', 'Deprecated']);

export const NodeSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  type: z.string().min(1), // validated against active profile in validate.ts
  description: z.string().default(''),
  purpose: z.string().optional(),
  technology: z.string().optional(),
  responsibilities: z.array(z.string()).default([]),
  invariants: z.array(z.string()).default([]),
  assumptions: z.array(z.string()).default([]),
  failureModes: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  owner: z.string().optional(),
  status: StatusSchema.default('Active'),
  parentId: z.string().nullable().default(null),
  codeRefs: z.array(z.string()).default([]),
  docRefs: z.array(z.string()).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Node = z.infer<typeof NodeSchema>;
```

- [ ] **Step 6: Implement `connection.ts`**

`packages/schema/src/connection.ts`:

```ts
import { z } from 'zod';

export const RelationCategorySchema = z.enum(['Dependency', 'DataFlow', 'Realization', 'Trace']);
export const TransportSchema = z.enum(['Sync', 'Async', 'InProcess', 'None']);
export const IntentSchema = z.enum(['Read', 'Write', 'Trigger', 'Notify', 'Use']);
export const DirectionSchema = z.enum(['Unidirectional', 'Bidirectional']);
export const FrequencySchema = z.enum(['Rare', 'Occasional', 'Frequent', 'Continuous']);

export const ConnectionSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  relationCategory: RelationCategorySchema,
  transport: TransportSchema.default('None'),
  intent: IntentSchema.optional(),
  description: z.string().default(''),
  protocol: z.string().optional(),
  direction: DirectionSchema.default('Unidirectional'),
  // reserved-for-later fields: present in schema, not surfaced in MVP editor UI
  frequency: FrequencySchema.optional(),
  latencyBudgetMs: z.number().optional(),
  security: z.object({ authRequired: z.boolean(), encryption: z.boolean() }).optional(),
  dataTypeRef: z.string().optional(),
  realizes: z.array(z.string()).default([]),
  codeRefs: z.array(z.string()).default([]),
});

export type Connection = z.infer<typeof ConnectionSchema>;
```

- [ ] **Step 7: Implement `view.ts`**

`packages/schema/src/view.ts`:

```ts
import { z } from 'zod';

export const PositionSchema = z.object({ x: z.number(), y: z.number() });

export const ViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  layer: z.string(),
  nodePositions: z.record(z.string(), PositionSchema).default({}),
});

export type View = z.infer<typeof ViewSchema>;
export type Position = z.infer<typeof PositionSchema>;
```

- [ ] **Step 8: Implement `reserved.ts`**

`packages/schema/src/reserved.ts`:

```ts
import { z } from 'zod';

// Reserved axes (MODEL_RU §6.6). Present in the schema from day 1 as opaque
// arrays so the model file shape is stable; editors arrive in later phases.
export const FlowSchema = z.unknown();
export const StateMachineSchema = z.unknown();
export const DataTypeSchema = z.unknown();
export const RequirementSchema = z.unknown();
export const DecisionSchema = z.unknown();
```

- [ ] **Step 9: Run test to verify it passes**

Run: `pnpm --filter @hyphae/schema test`
Expected: PASS (2 tests).

- [ ] **Step 10: Commit**

```bash
git add packages/schema && git commit -m "feat(schema): core node/connection/view/reserved schemas"
```

---

## Task 3: Schema — Profile + c4-backend

**Files:**
- Create: `packages/schema/src/profile.ts`
- Create: `packages/schema/src/profiles/c4-backend.ts`
- Test: `packages/schema/src/profiles/c4-backend.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/schema/src/profiles/c4-backend.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { c4Backend, layerOfType, allowedParentTypes } from './c4-backend';
import { ProfileSchema } from '../profile';

describe('c4-backend profile', () => {
  it('is a valid Profile', () => {
    expect(() => ProfileSchema.parse(c4Backend)).not.toThrow();
  });

  it('maps a type to its layer', () => {
    expect(layerOfType(c4Backend, 'Component')).toBe('Component');
    expect(layerOfType(c4Backend, 'Container')).toBe('Container');
  });

  it('exposes containment rules', () => {
    expect(allowedParentTypes(c4Backend, 'Component')).toContain('Container');
    expect(allowedParentTypes(c4Backend, 'Container')).toContain('System');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hyphae/schema test`
Expected: FAIL — cannot find module `./c4-backend`.

- [ ] **Step 3: Implement `profile.ts`**

`packages/schema/src/profile.ts`:

```ts
import { z } from 'zod';

export const CategorySchema = z.enum(['Structure', 'Behavior', 'Data', 'Intent', 'Actor']);

export const NodeKindSchema = z.object({
  id: z.string(),            // the node `type` value
  category: CategorySchema,
  layer: z.string(),
  allowedParents: z.array(z.string()).default([]),
  allowedChildren: z.array(z.string()).default([]),
});

export const ProfileSchema = z.object({
  id: z.string(),
  layers: z.array(z.string()),       // ordered, top -> bottom
  nodeKinds: z.array(NodeKindSchema),
});

export type Profile = z.infer<typeof ProfileSchema>;
export type NodeKind = z.infer<typeof NodeKindSchema>;
```

- [ ] **Step 4: Implement `profiles/c4-backend.ts`**

`packages/schema/src/profiles/c4-backend.ts`:

```ts
import type { Profile } from '../profile';

export const c4Backend: Profile = {
  id: 'c4-backend',
  layers: ['Context', 'Container', 'Component'],
  nodeKinds: [
    { id: 'System', category: 'Structure', layer: 'Context', allowedParents: [], allowedChildren: ['Container'] },
    { id: 'Actor', category: 'Actor', layer: 'Context', allowedParents: [], allowedChildren: [] },
    { id: 'ExternalSystem', category: 'Structure', layer: 'Context', allowedParents: [], allowedChildren: [] },
    { id: 'Container', category: 'Structure', layer: 'Container', allowedParents: ['System'], allowedChildren: ['Component'] },
    { id: 'Component', category: 'Structure', layer: 'Component', allowedParents: ['Container'], allowedChildren: [] },
  ],
};

export const layerOfType = (profile: Profile, type: string): string | undefined =>
  profile.nodeKinds.find((k) => k.id === type)?.layer;

export const allowedParentTypes = (profile: Profile, type: string): string[] =>
  profile.nodeKinds.find((k) => k.id === type)?.allowedParents ?? [];

export const typesForLayer = (profile: Profile, layer: string): string[] =>
  profile.nodeKinds.filter((k) => k.layer === layer).map((k) => k.id);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @hyphae/schema test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/schema && git commit -m "feat(schema): profile machinery + c4-backend profile"
```

---

## Task 4: Schema — HyphaeModel + emptyModel factory

**Files:**
- Create: `packages/schema/src/model.ts`
- Test: `packages/schema/src/model.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/schema/src/model.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { HyphaeModelSchema, emptyModel } from './model';

describe('HyphaeModel', () => {
  it('emptyModel parses and has reserved collections', () => {
    const m = emptyModel();
    expect(() => HyphaeModelSchema.parse(m)).not.toThrow();
    expect(m.nodes).toEqual([]);
    expect(m.connections).toEqual([]);
    expect(m.flows).toEqual([]);
    expect(m.stateMachines).toEqual([]);
    expect(m.dataTypes).toEqual([]);
    expect(m.requirements).toEqual([]);
    expect(m.decisions).toEqual([]);
    expect(m.activeProfile).toBe('c4-backend');
    expect(m.schemaVersion).toBe(1);
  });

  it('keeps deterministic top-level key order', () => {
    expect(Object.keys(emptyModel())).toEqual([
      'schemaVersion', 'metadata', 'activeProfile',
      'nodes', 'connections', 'flows', 'stateMachines',
      'dataTypes', 'requirements', 'decisions', 'views',
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hyphae/schema test`
Expected: FAIL — cannot find module `./model`.

- [ ] **Step 3: Implement `model.ts`**

`packages/schema/src/model.ts`:

```ts
import { z } from 'zod';
import { NodeSchema } from './node';
import { ConnectionSchema } from './connection';
import { ViewSchema } from './view';
import {
  FlowSchema, StateMachineSchema, DataTypeSchema,
  RequirementSchema, DecisionSchema,
} from './reserved';
import { now } from './ids';

export const MetadataSchema = z.object({
  name: z.string().default('Untitled'),
  description: z.string().default(''),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const HyphaeModelSchema = z.object({
  schemaVersion: z.literal(1),
  metadata: MetadataSchema,
  activeProfile: z.string(),
  nodes: z.array(NodeSchema).default([]),
  connections: z.array(ConnectionSchema).default([]),
  flows: z.array(FlowSchema).default([]),
  stateMachines: z.array(StateMachineSchema).default([]),
  dataTypes: z.array(DataTypeSchema).default([]),
  requirements: z.array(RequirementSchema).default([]),
  decisions: z.array(DecisionSchema).default([]),
  views: z.array(ViewSchema).default([]),
});

export type HyphaeModel = z.infer<typeof HyphaeModelSchema>;

export function emptyModel(): HyphaeModel {
  const ts = now();
  return {
    schemaVersion: 1,
    metadata: { name: 'Untitled', description: '', createdAt: ts, updatedAt: ts },
    activeProfile: 'c4-backend',
    nodes: [],
    connections: [],
    flows: [],
    stateMachines: [],
    dataTypes: [],
    requirements: [],
    decisions: [],
    views: [],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @hyphae/schema test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/schema && git commit -m "feat(schema): HyphaeModel root + emptyModel factory"
```

---

## Task 5: Schema — referential validation

**Files:**
- Create: `packages/schema/src/validate.ts`
- Test: `packages/schema/src/validate.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/schema/src/validate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { validateModel } from './validate';
import { emptyModel } from './model';
import { c4Backend } from './profiles/c4-backend';
import type { Node } from './node';

const node = (over: Partial<Node>): Node => ({
  id: 'x', name: 'X', type: 'Component', description: '', responsibilities: [],
  invariants: [], assumptions: [], failureModes: [], tags: [], status: 'Active',
  parentId: null, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', ...over,
});

describe('validateModel', () => {
  it('passes for an empty model', () => {
    expect(validateModel(emptyModel(), c4Backend)).toEqual([]);
  });

  it('flags unknown node type', () => {
    const m = emptyModel();
    m.nodes.push(node({ id: 'a', type: 'Bogus' }));
    expect(validateModel(m, c4Backend)).toContainEqual(
      expect.objectContaining({ kind: 'unknown-type', ref: 'a' }),
    );
  });

  it('flags parentId that violates containment', () => {
    const m = emptyModel();
    m.nodes.push(node({ id: 'comp', type: 'Component', parentId: 'sys' }));
    m.nodes.push(node({ id: 'sys', type: 'System' }));
    expect(validateModel(m, c4Backend)).toContainEqual(
      expect.objectContaining({ kind: 'bad-parent', ref: 'comp' }),
    );
  });

  it('flags connection endpoint that does not exist', () => {
    const m = emptyModel();
    m.nodes.push(node({ id: 'a', type: 'Component' }));
    m.connections.push({
      id: 'c1', from: 'a', to: 'ghost', relationCategory: 'Dependency',
      transport: 'None', description: '', direction: 'Unidirectional',
      realizes: [], codeRefs: [],
    });
    expect(validateModel(m, c4Backend)).toContainEqual(
      expect.objectContaining({ kind: 'dangling-endpoint', ref: 'c1' }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hyphae/schema test`
Expected: FAIL — cannot find module `./validate`.

- [ ] **Step 3: Implement `validate.ts`**

`packages/schema/src/validate.ts`:

```ts
import type { HyphaeModel } from './model';
import type { Profile } from './profile';
import { allowedParentTypes } from './profiles/c4-backend';

export type Issue = {
  kind: 'unknown-type' | 'bad-parent' | 'missing-parent' | 'dangling-endpoint';
  ref: string;       // id of the offending node/connection
  message: string;
};

export function validateModel(model: HyphaeModel, profile: Profile): Issue[] {
  const issues: Issue[] = [];
  const nodeById = new Map(model.nodes.map((n) => [n.id, n]));
  const knownTypes = new Set(profile.nodeKinds.map((k) => k.id));

  for (const n of model.nodes) {
    if (!knownTypes.has(n.type)) {
      issues.push({ kind: 'unknown-type', ref: n.id, message: `Unknown type "${n.type}"` });
      continue;
    }
    if (n.parentId !== null) {
      const parent = nodeById.get(n.parentId);
      if (!parent) {
        issues.push({ kind: 'missing-parent', ref: n.id, message: `parentId "${n.parentId}" not found` });
      } else if (!allowedParentTypes(profile, n.type).includes(parent.type)) {
        issues.push({ kind: 'bad-parent', ref: n.id, message: `${n.type} cannot be child of ${parent.type}` });
      }
    }
  }

  for (const c of model.connections) {
    if (!nodeById.has(c.from) || !nodeById.has(c.to)) {
      issues.push({ kind: 'dangling-endpoint', ref: c.id, message: `Connection references missing node` });
    }
  }
  return issues;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @hyphae/schema test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/schema && git commit -m "feat(schema): referential validation (types, containment, endpoints)"
```

---

## Task 6: Schema — getContext() text renderer

**Files:**
- Create: `packages/schema/src/context.ts`
- Test: `packages/schema/src/context.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/schema/src/context.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getContext } from './context';
import { emptyModel } from './model';

describe('getContext', () => {
  it('renders nodes with semantics and connections as plain text', () => {
    const m = emptyModel();
    m.metadata.name = 'Shop';
    m.nodes.push({
      id: 'api', name: 'API', type: 'Container', description: 'HTTP edge',
      purpose: 'entry', technology: 'Hono', responsibilities: ['routing'],
      invariants: ['always authenticates'], assumptions: ['db reachable'],
      failureModes: ['timeout'], tags: [], status: 'Active', parentId: 'sys',
      codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't',
    });
    m.nodes.push({
      id: 'sys', name: 'Shop', type: 'System', description: '', responsibilities: [],
      invariants: [], assumptions: [], failureModes: [], tags: [], status: 'Active',
      parentId: null, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't',
    });
    m.connections.push({
      id: 'c1', from: 'api', to: 'sys', relationCategory: 'Dependency',
      transport: 'Sync', description: 'calls', direction: 'Unidirectional',
      realizes: [], codeRefs: [],
    });

    const text = getContext(m);
    expect(text).toContain('# Shop');
    expect(text).toContain('API (Container)');
    expect(text).toContain('always authenticates');
    expect(text).toContain('API -> Shop');
    expect(text).toContain('parent: Shop');
  });

  it('scopes to a single layer when scope given', () => {
    const m = emptyModel();
    m.nodes.push({
      id: 'sys', name: 'Shop', type: 'System', description: '', responsibilities: [],
      invariants: [], assumptions: [], failureModes: [], tags: [], status: 'Active',
      parentId: null, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't',
    });
    m.nodes.push({
      id: 'c', name: 'Comp', type: 'Component', description: '', responsibilities: [],
      invariants: [], assumptions: [], failureModes: [], tags: [], status: 'Active',
      parentId: null, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't',
    });
    const text = getContext(m, { layer: 'Component' });
    expect(text).toContain('Comp (Component)');
    expect(text).not.toContain('Shop (System)');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hyphae/schema test`
Expected: FAIL — cannot find module `./context`.

- [ ] **Step 3: Implement `context.ts`**

`packages/schema/src/context.ts`:

```ts
import type { HyphaeModel } from './model';
import type { Node } from './node';
import { c4Backend, layerOfType } from './profiles/c4-backend';

export type ContextScope = { layer?: string };

function nodeBlock(n: Node, nameById: Map<string, string>): string {
  const lines: string[] = [`## ${n.name} (${n.type})  [id: ${n.id}]`];
  if (n.purpose) lines.push(`purpose: ${n.purpose}`);
  if (n.description) lines.push(n.description);
  if (n.technology) lines.push(`tech: ${n.technology}`);
  if (n.parentId) lines.push(`parent: ${nameById.get(n.parentId) ?? n.parentId}`);
  const list = (label: string, items: string[]) => {
    if (items.length) lines.push(`${label}: ${items.map((i) => `- ${i}`).join(' ')}`);
  };
  list('responsibilities', n.responsibilities);
  list('invariants', n.invariants);
  list('assumptions', n.assumptions);
  list('failureModes', n.failureModes);
  return lines.join('\n');
}

export function getContext(model: HyphaeModel, scope: ContextScope = {}): string {
  const nameById = new Map(model.nodes.map((n) => [n.id, n.name]));
  const nodes = scope.layer
    ? model.nodes.filter((n) => layerOfType(c4Backend, n.type) === scope.layer)
    : model.nodes;
  const visible = new Set(nodes.map((n) => n.id));

  const out: string[] = [`# ${model.metadata.name}`];
  if (model.metadata.description) out.push(model.metadata.description);
  out.push('', '# Nodes', ...nodes.map((n) => nodeBlock(n, nameById)));

  const conns = model.connections.filter((c) => visible.has(c.from) && visible.has(c.to));
  if (conns.length) {
    out.push('', '# Connections');
    for (const c of conns) {
      const arrow = c.direction === 'Bidirectional' ? '<->' : '->';
      const tag = `${c.relationCategory}/${c.transport}`;
      const desc = c.description ? ` — ${c.description}` : '';
      out.push(`${nameById.get(c.from)} ${arrow} ${nameById.get(c.to)} [${tag}]${desc}`);
    }
  }
  return out.join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @hyphae/schema test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/schema && git commit -m "feat(schema): getContext() plain-text renderer for LLM"
```

---

## Task 7: Schema — JSON Schema export + public index

**Files:**
- Create: `packages/schema/src/json-schema.ts`
- Create: `packages/schema/src/index.ts`
- Test: `packages/schema/src/json-schema.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/schema/src/json-schema.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { hyphaeJsonSchema } from './json-schema';

describe('hyphaeJsonSchema', () => {
  it('produces a JSON Schema object with model properties', () => {
    const schema = hyphaeJsonSchema() as Record<string, unknown>;
    expect(schema).toHaveProperty('$schema');
    const props = (schema.properties ?? {}) as Record<string, unknown>;
    expect(props).toHaveProperty('nodes');
    expect(props).toHaveProperty('connections');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hyphae/schema test`
Expected: FAIL — cannot find module `./json-schema`.

- [ ] **Step 3: Implement `json-schema.ts`**

`packages/schema/src/json-schema.ts`:

```ts
import { zodToJsonSchema } from 'zod-to-json-schema';
import { HyphaeModelSchema } from './model';

export const hyphaeJsonSchema = () =>
  zodToJsonSchema(HyphaeModelSchema, { name: 'HyphaeModel', $refStrategy: 'none' });
```

- [ ] **Step 4: Implement `index.ts`**

`packages/schema/src/index.ts`:

```ts
export * from './ids';
export * from './node';
export * from './connection';
export * from './view';
export * from './profile';
export * from './profiles/c4-backend';
export * from './model';
export * from './validate';
export * from './context';
export * from './json-schema';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @hyphae/schema test`
Expected: PASS (all schema tests green).

- [ ] **Step 6: Commit**

```bash
git add packages/schema && git commit -m "feat(schema): JSON Schema export + public index"
```

---

## Task 8: Server — model file store (load + atomic debounced save)

**Files:**
- Create: `apps/server/package.json`
- Create: `apps/server/tsconfig.json`
- Create: `apps/server/vitest.config.ts`
- Create: `apps/server/src/store.ts`
- Test: `apps/server/src/store.test.ts`

- [ ] **Step 1: Create package manifest + config**

`apps/server/package.json`:

```json
{
  "name": "@hyphae/server",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "node --import tsx src/index.ts",
    "mcp": "tsx src/mcp.ts",
    "build": "tsc -p tsconfig.json",
    "test": "vitest run"
  },
  "dependencies": {
    "@hyphae/schema": "workspace:*",
    "@hono/node-server": "^1.12.0",
    "@modelcontextprotocol/sdk": "^1.0.4",
    "hono": "^4.5.0"
  },
  "devDependencies": {
    "tsx": "^4.16.2"
  }
}
```

`apps/server/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

`apps/server/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { globals: true, environment: 'node' },
});
```

- [ ] **Step 2: Install new deps**

Run: `pnpm install`
Expected: resolves `@hyphae/schema` as workspace link.

- [ ] **Step 3: Write the failing test**

`apps/server/src/store.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ModelStore } from './store';

let dir: string;
let file: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hyphae-'));
  file = join(dir, 'hyphae.json');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('ModelStore', () => {
  it('returns an empty model when file is absent', () => {
    const store = new ModelStore(file);
    expect(store.get().nodes).toEqual([]);
  });

  it('persists atomically and reloads', async () => {
    const store = new ModelStore(file);
    const m = store.get();
    m.metadata.name = 'Persisted';
    store.set(m);
    await store.flush();
    expect(existsSync(file)).toBe(true);
    expect(existsSync(file + '.tmp')).toBe(false);
    const fromDisk = JSON.parse(readFileSync(file, 'utf8'));
    expect(fromDisk.metadata.name).toBe('Persisted');
    expect(new ModelStore(file).get().metadata.name).toBe('Persisted');
  });

  it('rejects an invalid model on set', () => {
    const store = new ModelStore(file);
    expect(() => store.set({ nope: true } as never)).toThrow();
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm --filter @hyphae/server test`
Expected: FAIL — cannot find module `./store`.

- [ ] **Step 5: Implement `store.ts`**

`apps/server/src/store.ts`:

```ts
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { HyphaeModelSchema, emptyModel, type HyphaeModel } from '@hyphae/schema';

const DEBOUNCE_MS = 500;

export class ModelStore {
  private model: HyphaeModel;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly file: string) {
    this.model = existsSync(file)
      ? HyphaeModelSchema.parse(JSON.parse(readFileSync(file, 'utf8')))
      : emptyModel();
  }

  get(): HyphaeModel {
    return this.model;
  }

  /** Validate, store in memory, schedule a debounced atomic write. */
  set(next: unknown): HyphaeModel {
    this.model = HyphaeModelSchema.parse(next);
    this.scheduleSave();
    return this.model;
  }

  private scheduleSave(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.writeNow(), DEBOUNCE_MS);
  }

  /** Force a pending write immediately (used by tests / shutdown). */
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

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @hyphae/server test`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add apps/server pnpm-lock.yaml && git commit -m "feat(server): atomic debounced model store"
```

---

## Task 9: Server — Hono routes GET/PUT /model

**Files:**
- Create: `apps/server/src/routes.ts`
- Test: `apps/server/src/routes.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/server/src/routes.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ModelStore } from './store';
import { createApp } from './routes';

let dir: string;
let app: ReturnType<typeof createApp>;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hyphae-'));
  app = createApp(new ModelStore(join(dir, 'hyphae.json')));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('routes', () => {
  it('GET /model returns the current model', async () => {
    const res = await app.request('/model');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.nodes).toEqual([]);
  });

  it('PUT /model stores a valid model', async () => {
    const get = await (await app.request('/model')).json();
    get.metadata.name = 'Via API';
    const res = await app.request('/model', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(get),
    });
    expect(res.status).toBe(200);
    const after = await (await app.request('/model')).json();
    expect(after.metadata.name).toBe('Via API');
  });

  it('PUT /model rejects an invalid model with 400', async () => {
    const res = await app.request('/model', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nope: true }),
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hyphae/server test`
Expected: FAIL — cannot find module `./routes`.

- [ ] **Step 3: Implement `routes.ts`**

`apps/server/src/routes.ts`:

```ts
import { Hono } from 'hono';
import type { ModelStore } from './store';

export function createApp(store: ModelStore) {
  const app = new Hono();

  app.get('/model', (c) => c.json(store.get()));

  app.put('/model', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'invalid JSON' }, 400);
    }
    try {
      const saved = store.set(body);
      return c.json(saved);
    } catch (err) {
      return c.json({ error: 'invalid model', detail: String(err) }, 400);
    }
  });

  return app;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @hyphae/server test`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/server && git commit -m "feat(server): GET/PUT /model routes"
```

---

## Task 10: Server — HTTP entry (serves SPA in prod)

**Files:**
- Create: `apps/server/src/index.ts`

- [ ] **Step 1: Implement `index.ts`**

`apps/server/src/index.ts`:

```ts
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { ModelStore } from './store';
import { createApp } from './routes';

const MODEL_FILE = process.env.HYPHAE_FILE ?? join(process.cwd(), 'hyphae.json');
const PORT = Number(process.env.PORT ?? 5173);

const store = new ModelStore(MODEL_FILE);
const app = createApp(store);

// In prod, serve the built SPA. In dev, Vite serves the UI and proxies /model here.
const dist = join(process.cwd(), 'apps/web/dist');
if (existsSync(dist)) {
  app.use('/*', serveStatic({ root: './apps/web/dist' }));
}

process.on('SIGINT', async () => {
  await store.flush();
  process.exit(0);
});

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`Hyphae server on http://localhost:${info.port}  (model: ${MODEL_FILE})`);
});
```

- [ ] **Step 2: Smoke-run the server**

Run: `pnpm --filter @hyphae/server exec tsx src/index.ts &` then `sleep 1 && curl -s http://localhost:5173/model | head -c 60 && kill %1`
Expected: prints JSON beginning `{"schemaVersion":1`.

- [ ] **Step 3: Commit**

```bash
git add apps/server && git commit -m "feat(server): http entry serving API + prod SPA"
```

---

## Task 11: Server — read-only MCP server

**Files:**
- Create: `apps/server/src/mcp.ts`
- Test: `apps/server/src/mcp.test.ts`

The MCP tools wrap pure schema functions so they stay testable without a transport. We test the underlying handlers, then wire them to the SDK server.

- [ ] **Step 1: Write the failing test**

`apps/server/src/mcp.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildTools } from './mcp';
import { emptyModel } from '@hyphae/schema';

function model() {
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

describe('MCP tool handlers', () => {
  const tools = buildTools(() => model());

  it('get_text_context returns plain text', () => {
    expect(tools.get_text_context({})).toContain('API (Container)');
  });

  it('get_node returns one node by id', () => {
    expect(tools.get_node({ id: 'api' })).toMatchObject({ name: 'API' });
  });

  it('list_nodes lists summaries', () => {
    expect(tools.list_nodes({})).toEqual([{ id: 'api', name: 'API', type: 'Container' }]);
  });

  it('find_connections filters by node id', () => {
    expect(tools.find_connections({ nodeId: 'api' })).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hyphae/server test`
Expected: FAIL — cannot find module `./mcp`.

- [ ] **Step 3: Implement `mcp.ts`**

`apps/server/src/mcp.ts`:

```ts
import { join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { getContext, type HyphaeModel } from '@hyphae/schema';
import { ModelStore } from './store';

/** Pure tool handlers, parameterised by a model getter (re-read per call). */
export function buildTools(getModel: () => HyphaeModel) {
  return {
    get_text_context: ({ layer }: { layer?: string }) =>
      getContext(getModel(), layer ? { layer } : {}),
    get_node: ({ id }: { id: string }) =>
      getModel().nodes.find((n) => n.id === id) ?? null,
    list_nodes: (_: Record<string, never>) =>
      getModel().nodes.map((n) => ({ id: n.id, name: n.name, type: n.type })),
    find_connections: ({ nodeId }: { nodeId: string }) =>
      getModel().connections.filter((c) => c.from === nodeId || c.to === nodeId),
  };
}

function text(value: unknown) {
  return { content: [{ type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] };
}

async function main() {
  const file = process.env.HYPHAE_FILE ?? join(process.cwd(), 'hyphae.json');
  // Re-create the store per call so external edits to the file are picked up.
  const tools = buildTools(() => new ModelStore(file).get());
  const server = new McpServer({ name: 'hyphae', version: '0.1.0' });

  server.tool('get_text_context', 'Compact plain-text view of the architecture model', { layer: z.string().optional() }, async (a) => text(tools.get_text_context(a)));
  server.tool('get_node', 'Get one node by id', { id: z.string() }, async (a) => text(tools.get_node(a)));
  server.tool('list_nodes', 'List node summaries', {}, async () => text(tools.list_nodes({})));
  server.tool('find_connections', 'Connections touching a node', { nodeId: z.string() }, async (a) => text(tools.find_connections(a)));

  await server.connect(new StdioServerTransport());
}

// Only start the transport when run directly, not when imported by tests.
if (process.argv[1] && process.argv[1].endsWith('mcp.ts')) {
  void main();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @hyphae/server test`
Expected: PASS (all server tests green).

- [ ] **Step 5: Commit**

```bash
git add apps/server && git commit -m "feat(server): read-only MCP server (4 tools)"
```

---

## Task 12: Web — scaffold + API client + store

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/index.html`
- Create: `apps/web/src/api.ts`
- Create: `apps/web/src/store.ts`
- Test: `apps/web/src/store.test.ts`

- [ ] **Step 1: Create manifest + config**

`apps/web/package.json`:

```json
{
  "name": "@hyphae/web",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "@hyphae/schema": "workspace:*",
    "@xyflow/react": "^12.3.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "zustand": "^4.5.4"
  },
  "devDependencies": {
    "@testing-library/react": "^16.0.0",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "jsdom": "^24.1.1",
    "vite": "^5.4.0"
  }
}
```

`apps/web/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "jsx": "react-jsx", "noEmit": true },
  "include": ["src"]
}
```

`apps/web/vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: { '/model': 'http://localhost:5173' },
  },
});
```

`apps/web/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: { globals: true, environment: 'jsdom' },
});
```

`apps/web/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Hyphae</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Install deps**

Run: `pnpm install`
Expected: web deps resolve.

- [ ] **Step 3: Implement `api.ts`**

`apps/web/src/api.ts`:

```ts
import { HyphaeModelSchema, type HyphaeModel } from '@hyphae/schema';

export async function loadModel(): Promise<HyphaeModel> {
  const res = await fetch('/model');
  if (!res.ok) throw new Error(`GET /model failed: ${res.status}`);
  return HyphaeModelSchema.parse(await res.json());
}

export async function saveModel(model: HyphaeModel): Promise<void> {
  const res = await fetch('/model', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(model),
  });
  if (!res.ok) throw new Error(`PUT /model failed: ${res.status}`);
}
```

- [ ] **Step 4: Write the failing test for the store**

`apps/web/src/store.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from './store';
import { emptyModel } from '@hyphae/schema';

beforeEach(() => useStore.getState().setModel(emptyModel()));

describe('editor store', () => {
  it('adds a node on the active layer', () => {
    useStore.getState().setLayer('Component');
    useStore.getState().addNode('Component');
    const { model } = useStore.getState();
    expect(model.nodes).toHaveLength(1);
    expect(model.nodes[0].type).toBe('Component');
  });

  it('updates a node field', () => {
    useStore.getState().addNode('Component');
    const id = useStore.getState().model.nodes[0].id;
    useStore.getState().updateNode(id, { name: 'Renamed' });
    expect(useStore.getState().model.nodes[0].name).toBe('Renamed');
  });

  it('deletes a node and its connections', () => {
    const s = useStore.getState();
    s.addNode('Component');
    s.addNode('Component');
    const [a, b] = s.model.nodes.map((n) => n.id);
    s.addConnection(a, b);
    s.deleteNode(a);
    const m = useStore.getState().model;
    expect(m.nodes).toHaveLength(1);
    expect(m.connections).toHaveLength(0);
  });

  it('stores node position in the layer view', () => {
    const s = useStore.getState();
    s.setLayer('Component');
    s.addNode('Component');
    const id = s.model.nodes[0].id;
    s.setNodePosition(id, { x: 10, y: 20 });
    const view = useStore.getState().model.views.find((v) => v.layer === 'Component');
    expect(view?.nodePositions[id]).toEqual({ x: 10, y: 20 });
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `pnpm --filter @hyphae/web test`
Expected: FAIL — cannot find module `./store`.

- [ ] **Step 6: Implement `store.ts`**

`apps/web/src/store.ts`:

```ts
import { create } from 'zustand';
import {
  emptyModel, newId, now, c4Backend, typesForLayer,
  type HyphaeModel, type Node, type Position,
} from '@hyphae/schema';
import { saveModel } from './api';

type State = {
  model: HyphaeModel;
  layer: string;
  selectedId: string | null;
  setModel: (m: HyphaeModel) => void;
  setLayer: (layer: string) => void;
  select: (id: string | null) => void;
  addNode: (type: string) => void;
  updateNode: (id: string, patch: Partial<Node>) => void;
  deleteNode: (id: string) => void;
  addConnection: (from: string, to: string) => void;
  deleteConnection: (id: string) => void;
  setNodePosition: (id: string, pos: Position) => void;
};

function persist(model: HyphaeModel) {
  model.metadata.updatedAt = now();
  void saveModel(model).catch((e) => console.error(e));
}

export const useStore = create<State>((set, get) => ({
  model: emptyModel(),
  layer: 'Component',
  selectedId: null,

  setModel: (model) => set({ model }),
  setLayer: (layer) => set({ layer, selectedId: null }),
  select: (selectedId) => set({ selectedId }),

  addNode: (type) => {
    const ts = now();
    const node: Node = {
      id: newId(), name: type, type, description: '', responsibilities: [],
      invariants: [], assumptions: [], failureModes: [], tags: [], status: 'Active',
      parentId: null, codeRefs: [], docRefs: [], createdAt: ts, updatedAt: ts,
    };
    const model = { ...get().model, nodes: [...get().model.nodes, node] };
    set({ model, selectedId: node.id });
    persist(model);
  },

  updateNode: (id, patch) => {
    const model = {
      ...get().model,
      nodes: get().model.nodes.map((n) => (n.id === id ? { ...n, ...patch, updatedAt: now() } : n)),
    };
    set({ model });
    persist(model);
  },

  deleteNode: (id) => {
    const model = {
      ...get().model,
      nodes: get().model.nodes.filter((n) => n.id !== id),
      connections: get().model.connections.filter((c) => c.from !== id && c.to !== id),
    };
    set({ model, selectedId: null });
    persist(model);
  },

  addConnection: (from, to) => {
    const conn = {
      id: newId(), from, to, relationCategory: 'Dependency' as const, transport: 'None' as const,
      description: '', direction: 'Unidirectional' as const, realizes: [], codeRefs: [],
    };
    const model = { ...get().model, connections: [...get().model.connections, conn] };
    set({ model });
    persist(model);
  },

  deleteConnection: (id) => {
    const model = { ...get().model, connections: get().model.connections.filter((c) => c.id !== id) };
    set({ model });
    persist(model);
  },

  setNodePosition: (id, pos) => {
    const { model, layer } = get();
    const views = [...model.views];
    let view = views.find((v) => v.layer === layer);
    if (!view) {
      view = { id: newId(), name: layer, layer, nodePositions: {} };
      views.push(view);
    }
    view.nodePositions = { ...view.nodePositions, [id]: pos };
    const next = { ...model, views };
    set({ model: next });
    persist(next);
  },
}));

export const layerTypes = (layer: string) => typesForLayer(c4Backend, layer);
export const layers = c4Backend.layers;
```

- [ ] **Step 7: Run test to verify it passes**

Run: `pnpm --filter @hyphae/web test`
Expected: PASS (4 tests).

- [ ] **Step 8: Commit**

```bash
git add apps/web && git commit -m "feat(web): scaffold + api client + zustand store"
```

---

## Task 13: Web — React Flow canvas (layer-filtered) + mapping

**Files:**
- Create: `apps/web/src/toModel.ts`
- Create: `apps/web/src/Canvas.tsx`
- Test: `apps/web/src/toModel.test.ts`

- [ ] **Step 1: Write the failing test for mapping**

`apps/web/src/toModel.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { toFlowNodes, toFlowEdges } from './toModel';
import { emptyModel, layerOfType, c4Backend } from '@hyphae/schema';

describe('toModel mapping', () => {
  it('keeps only nodes whose type belongs to the active layer', () => {
    const m = emptyModel();
    m.nodes.push({
      id: 'sys', name: 'Shop', type: 'System', description: '', responsibilities: [],
      invariants: [], assumptions: [], failureModes: [], tags: [], status: 'Active',
      parentId: null, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't',
    });
    m.nodes.push({
      id: 'c', name: 'Comp', type: 'Component', description: '', responsibilities: [],
      invariants: [], assumptions: [], failureModes: [], tags: [], status: 'Active',
      parentId: null, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't',
    });
    const flow = toFlowNodes(m, 'Component');
    expect(flow.map((n) => n.id)).toEqual(['c']);
    expect(layerOfType(c4Backend, 'Component')).toBe('Component');
  });

  it('keeps only edges whose both endpoints are visible', () => {
    const m = emptyModel();
    m.nodes.push({
      id: 'a', name: 'A', type: 'Component', description: '', responsibilities: [],
      invariants: [], assumptions: [], failureModes: [], tags: [], status: 'Active',
      parentId: null, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't',
    });
    m.connections.push({
      id: 'c1', from: 'a', to: 'ghost', relationCategory: 'Dependency', transport: 'None',
      description: '', direction: 'Unidirectional', realizes: [], codeRefs: [],
    });
    expect(toFlowEdges(m, 'Component')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hyphae/web test`
Expected: FAIL — cannot find module `./toModel`.

- [ ] **Step 3: Implement `toModel.ts`**

`apps/web/src/toModel.ts`:

```ts
import { c4Backend, layerOfType, type HyphaeModel } from '@hyphae/schema';
import type { Node as FlowNode, Edge as FlowEdge } from '@xyflow/react';

export function toFlowNodes(model: HyphaeModel, layer: string): FlowNode[] {
  const view = model.views.find((v) => v.layer === layer);
  return model.nodes
    .filter((n) => layerOfType(c4Backend, n.type) === layer)
    .map((n, i) => ({
      id: n.id,
      position: view?.nodePositions[n.id] ?? { x: 80 + (i % 5) * 200, y: 80 + Math.floor(i / 5) * 140 },
      data: { label: `${n.name}\n(${n.type})` },
    }));
}

export function toFlowEdges(model: HyphaeModel, layer: string): FlowEdge[] {
  const visible = new Set(
    model.nodes.filter((n) => layerOfType(c4Backend, n.type) === layer).map((n) => n.id),
  );
  return model.connections
    .filter((c) => visible.has(c.from) && visible.has(c.to))
    .map((c) => ({ id: c.id, source: c.from, target: c.to }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @hyphae/web test`
Expected: PASS.

- [ ] **Step 5: Implement `Canvas.tsx`**

`apps/web/src/Canvas.tsx`:

```tsx
import { useMemo } from 'react';
import {
  ReactFlow, Background, Controls,
  type Connection as RFConnection, type NodeChange, applyNodeChanges,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useStore } from './store';
import { toFlowNodes, toFlowEdges } from './toModel';

export function Canvas() {
  const model = useStore((s) => s.model);
  const layer = useStore((s) => s.layer);
  const select = useStore((s) => s.select);
  const addConnection = useStore((s) => s.addConnection);
  const deleteConnection = useStore((s) => s.deleteConnection);
  const setNodePosition = useStore((s) => s.setNodePosition);

  const nodes = useMemo(() => toFlowNodes(model, layer), [model, layer]);
  const edges = useMemo(() => toFlowEdges(model, layer), [model, layer]);

  const onNodesChange = (changes: NodeChange[]) => {
    // We only persist final drag positions; React Flow re-renders from store.
    for (const ch of changes) {
      if (ch.type === 'position' && ch.position && ch.dragging === false) {
        setNodePosition(ch.id, ch.position);
      }
    }
    applyNodeChanges(changes, nodes); // keep RF internal happy; result discarded
  };

  const onConnect = (c: RFConnection) => {
    if (c.source && c.target) addConnection(c.source, c.target);
  };

  return (
    <div style={{ flex: 1, height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onConnect={onConnect}
        onNodeClick={(_, n) => select(n.id)}
        onEdgesDelete={(es) => es.forEach((e) => deleteConnection(e.id))}
        onPaneClick={() => select(null)}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/web && git commit -m "feat(web): layer-filtered React Flow canvas + mapping"
```

---

## Task 14: Web — side panel for node fields

**Files:**
- Create: `apps/web/src/SidePanel.tsx`
- Test: `apps/web/src/SidePanel.test.tsx`

- [ ] **Step 1: Write the failing test**

`apps/web/src/SidePanel.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SidePanel } from './SidePanel';
import { useStore } from './store';
import { emptyModel } from '@hyphae/schema';

beforeEach(() => useStore.getState().setModel(emptyModel()));

describe('SidePanel', () => {
  it('shows a hint when nothing is selected', () => {
    render(<SidePanel />);
    expect(screen.getByText(/no node selected/i)).toBeTruthy();
  });

  it('edits the selected node name', () => {
    useStore.getState().addNode('Component');
    render(<SidePanel />);
    const input = screen.getByLabelText('name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Payments' } });
    expect(useStore.getState().model.nodes[0].name).toBe('Payments');
  });

  it('edits invariants as newline-separated list', () => {
    useStore.getState().addNode('Component');
    render(<SidePanel />);
    const ta = screen.getByLabelText('invariants') as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: 'a\nb' } });
    expect(useStore.getState().model.nodes[0].invariants).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hyphae/web test`
Expected: FAIL — cannot find module `./SidePanel`.

- [ ] **Step 3: Implement `SidePanel.tsx`**

`apps/web/src/SidePanel.tsx`:

```tsx
import { useStore } from './store';
import type { Node } from '@hyphae/schema';

const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);

export function SidePanel() {
  const selectedId = useStore((s) => s.selectedId);
  const node = useStore((s) => s.model.nodes.find((n) => n.id === s.selectedId));
  const updateNode = useStore((s) => s.updateNode);
  const deleteNode = useStore((s) => s.deleteNode);

  if (!selectedId || !node) {
    return <aside className="panel"><p>No node selected.</p></aside>;
  }

  const text = (label: keyof Node, value: string) => (
    <label className="field">
      <span>{label}</span>
      <input aria-label={label} value={value}
        onChange={(e) => updateNode(node.id, { [label]: e.target.value } as Partial<Node>)} />
    </label>
  );

  const list = (label: 'responsibilities' | 'invariants' | 'assumptions' | 'failureModes') => (
    <label className="field">
      <span>{label}</span>
      <textarea aria-label={label} value={node[label].join('\n')}
        onChange={(e) => updateNode(node.id, { [label]: lines(e.target.value) })} />
    </label>
  );

  return (
    <aside className="panel">
      <h2>{node.type}</h2>
      {text('name', node.name)}
      {text('purpose', node.purpose ?? '')}
      {text('technology', node.technology ?? '')}
      <label className="field">
        <span>description</span>
        <textarea aria-label="description" value={node.description}
          onChange={(e) => updateNode(node.id, { description: e.target.value })} />
      </label>
      {list('responsibilities')}
      {list('invariants')}
      {list('assumptions')}
      {list('failureModes')}
      <button onClick={() => deleteNode(node.id)}>Delete node</button>
    </aside>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @hyphae/web test`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web && git commit -m "feat(web): side panel editing all node fields incl LLM semantics"
```

---

## Task 15: Web — App shell (toolbar: layer filter + add node) + main

**Files:**
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/styles.css`
- Test: `apps/web/src/App.test.tsx`

- [ ] **Step 1: Write the failing test**

`apps/web/src/App.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { App } from './App';
import { useStore } from './store';
import { emptyModel } from '@hyphae/schema';

beforeEach(() => {
  useStore.getState().setModel(emptyModel());
  // React Flow needs layout measurement; stub it so the canvas renders in jsdom.
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});

describe('App', () => {
  it('switches the active layer via the dropdown', () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('layer'), { target: { value: 'Container' } });
    expect(useStore.getState().layer).toBe('Container');
  });

  it('adds a node of the first type for the active layer', () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('layer'), { target: { value: 'Component' } });
    fireEvent.click(screen.getByRole('button', { name: /add component/i }));
    expect(useStore.getState().model.nodes.map((n) => n.type)).toEqual(['Component']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hyphae/web test`
Expected: FAIL — cannot find module `./App`.

- [ ] **Step 3: Implement `App.tsx`**

`apps/web/src/App.tsx`:

```tsx
import { useEffect } from 'react';
import { useStore, layers, layerTypes } from './store';
import { loadModel } from './api';
import { Canvas } from './Canvas';
import { SidePanel } from './SidePanel';
import './styles.css';

export function App() {
  const layer = useStore((s) => s.layer);
  const setLayer = useStore((s) => s.setLayer);
  const setModel = useStore((s) => s.setModel);
  const addNode = useStore((s) => s.addNode);
  const types = layerTypes(layer);

  useEffect(() => {
    loadModel().then(setModel).catch((e) => console.error('load failed', e));
  }, [setModel]);

  return (
    <div className="app">
      <header className="toolbar">
        <strong>Hyphae</strong>
        <label>
          layer{' '}
          <select aria-label="layer" value={layer} onChange={(e) => setLayer(e.target.value)}>
            {layers.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </label>
        {types.map((t) => (
          <button key={t} onClick={() => addNode(t)}>add {t}</button>
        ))}
      </header>
      <div className="body">
        <Canvas />
        <SidePanel />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Implement `main.tsx` and `styles.css`**

`apps/web/src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`apps/web/src/styles.css`:

```css
html, body, #root { height: 100%; margin: 0; font-family: system-ui, sans-serif; }
.app { display: flex; flex-direction: column; height: 100%; }
.toolbar { display: flex; gap: 12px; align-items: center; padding: 8px 12px; border-bottom: 1px solid #ddd; }
.body { display: flex; flex: 1; min-height: 0; }
.panel { width: 320px; border-left: 1px solid #ddd; padding: 12px; overflow-y: auto; }
.field { display: flex; flex-direction: column; margin-bottom: 8px; font-size: 12px; }
.field input, .field textarea { font-size: 13px; padding: 4px; }
.field textarea { min-height: 56px; }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @hyphae/web test`
Expected: PASS (2 tests). All web tests green.

- [ ] **Step 6: Commit**

```bash
git add apps/web && git commit -m "feat(web): app shell with layer filter + add-node toolbar"
```

---

## Task 16: End-to-end wiring + README + full build

**Files:**
- Create: `README.md`

- [ ] **Step 1: Full test sweep**

Run: `pnpm -r test`
Expected: all packages PASS.

- [ ] **Step 2: Production build of the web app**

Run: `pnpm --filter @hyphae/web build`
Expected: `apps/web/dist/index.html` created, no type errors.

- [ ] **Step 3: Manual end-to-end smoke (dogfood path)**

Run the server, open the dev UI, create a node, confirm it persists and MCP can read it:

```bash
# terminal A
pnpm --filter @hyphae/server dev
# terminal B
pnpm --filter @hyphae/web dev
```
Then in the browser at `http://localhost:3000`: pick layer Component, click "add Component", edit its name + an invariant in the side panel. Confirm a `hyphae.json` appears in the repo root within ~1s and contains the node.

Verify MCP read path:
```bash
HYPHAE_FILE="$PWD/hyphae.json" pnpm --filter @hyphae/server mcp
```
Expected: server starts on stdio without error (Ctrl-C to stop). (Full client wiring is the user's dogfood step.)

- [ ] **Step 4: Write `README.md`**

`README.md`:

```markdown
# Hyphae

Local visual editor for a C4-style architecture model, readable by LLM agents over MCP.
See `MVP_RU.md` for the thin-slice scope, `MODEL_RU.md` for the model concept.

## Develop

    pnpm install
    pnpm --filter @hyphae/server dev   # API on :5173, writes ./hyphae.json
    pnpm --filter @hyphae/web dev      # UI on :3000, proxies /model

## Test

    pnpm -r test

## MCP (read-only, for an agent)

    HYPHAE_FILE=/abs/path/to/hyphae.json pnpm --filter @hyphae/server mcp

Tools: `get_text_context`, `get_node`, `list_nodes`, `find_connections`.

## Production

    pnpm --filter @hyphae/web build
    PORT=5173 pnpm --filter @hyphae/server start   # serves API + built SPA
```

- [ ] **Step 5: Commit**

```bash
git add README.md && git commit -m "docs: README with dev/test/mcp/prod workflows"
```

---

## Self-Review notes

- **Spec coverage (MVP_RU §3):** schema with reserved collections (Tasks 2,4) ✓; LLM semantic fields first-class in Node + side panel (Tasks 2,14) ✓; Connection 3-field type, optional fields in schema not UI (Task 2) ✓; `parentId` containment + validation (Tasks 2,5) ✓; profile-as-data c4-backend (Task 3) ✓; `schemaVersion` (Task 4) ✓; JSON Schema from Zod (Task 7) ✓; Hono GET/PUT + atomic + 500ms debounce (Tasks 8,9) ✓; single JSON file (Task 8) ✓; prod SPA serving (Task 10) ✓; MCP read-only 4 tools, `get_text_context` over pure `getContext` (Tasks 6,11) ✓; React Flow editor, layer = dropdown filter not drill-down (Tasks 13,15) ✓; side panel all fields (Task 14) ✓; positions in views (Tasks 12,13) ✓.
- **Scope OUT honored:** no flows, no zoom drill-down, no reserved-axis editors, no `describe_flow`, no auto-layout. ✓
- **Type consistency:** `HyphaeModel`, `Node`, `Connection`, `Position`, `Profile`, `Issue` names consistent across tasks; store actions (`addNode`, `updateNode`, `deleteNode`, `addConnection`, `deleteConnection`, `setNodePosition`, `setLayer`, `setModel`, `select`) match between `store.ts` (Task 12) and consumers (Tasks 13–15); `getContext(model, scope)`, `layerOfType`, `typesForLayer`, `allowedParentTypes` consistent between schema and web. ✓
- **Known thin-slice simplification:** `Canvas.onNodesChange` persists only on drag-end; React Flow re-derives nodes from the store each render (acceptable for MVP, not high-frequency). Flagged for the zoom-navigation phase.
```

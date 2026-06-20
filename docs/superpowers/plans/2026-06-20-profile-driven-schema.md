# Profile-Driven Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Profile the meta-schema (node kinds, connection kinds, documented custom fields); shrink core Node/Connection to engine essentials plus a profile-validated `fields` bag.

**Architecture:** Zod in `@hyphae/schema` stays the source of truth. The Profile gains `connectionKinds`, `commonNodeFields`, `commonConnectionFields`, and per-kind `fields: FieldDef[]`. Node/Connection lose their hardcoded domain fields and gain `fields: Record<string, unknown>`, validated against the active profile in `validate.ts`. Server MCP tools build their input schemas dynamically from the profile and expose `describe_profile`. The web SidePanel/FilterPanel render generically from the profile.

**Tech Stack:** TypeScript, Zod, Vitest, Hono, @modelcontextprotocol/sdk 1.29, React, @xyflow/react, pnpm workspaces.

## Global Constraints

- Stay on `schemaVersion: 1` — no migration code. Old-shape model files are expected to fail parsing.
- `relationCategory` is replaced by the connection's `type` (a ConnectionKind id).
- Validation is strict: reject unknown field keys, wrong value types, bad enum values, missing required fields, refs to missing nodes, and (when declared) endpoint-kind violations. Still gated by `newIssues` (only newly-introduced issues block a write).
- A node/connection kind's **effective fields** = `common*Fields` then its own `fields`; **common fields always win** on key collision (a per-kind field reusing a common key is ignored).
- Removed-from-core node fields: `purpose, technology, responsibilities, invariants, assumptions, failureModes, tags, owner, status`. Removed-from-core connection fields: `relationCategory→type, transport, intent, protocol, frequency, latencyBudgetMs, security, dataTypeRef`. Kept core: node `id,name,type,parentId,description,codeRefs,docRefs,createdAt,updatedAt,fields`; connection `id,from,to,type,description,direction,realizes,codeRefs,fields`.
- This is a breaking core change: between Task 2 and Task 4 the `apps/server` and `apps/web` packages do not compile. Each task leaves **its own package's** `test` + `tsc` green; the whole monorepo is green again after Task 4.
- Run package tests with `pnpm --filter <pkg> test` and typecheck with `npx tsc -p <pkg> --noEmit` (web also has `pnpm --filter @hyphae/web build`).

**New-shape literals (use these in all fixtures/tests):**
```ts
// node
{ id: 'x', name: 'X', type: 'Component', parentId: null, description: '',
  codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {} }
// connection
{ id: 'e', from: 'a', to: 'b', type: 'Dependency', description: '',
  direction: 'Unidirectional', realizes: [], codeRefs: [], fields: {} }
```

---

## Task 1: Profile meta-schema types + effectiveFields + re-expressed c4-backend

Additive only — does not touch `node.ts`/`connection.ts`, so `@hyphae/schema` stays green throughout.

**Files:**
- Modify: `packages/schema/src/profile.ts`
- Modify: `packages/schema/src/profiles/c4-backend.ts`
- Test: `packages/schema/test/c4-backend.test.ts`

**Interfaces:**
- Produces: `FieldType`, `EnumValue`, `FieldDef`, `NodeKind` (now with `fields`), `ConnectionKind`, `Profile` (now with `connectionKinds`, `commonNodeFields`, `commonConnectionFields`); helpers `layerOfType`, `allowedParentTypes`, `typesForLayer` (unchanged signatures), `connectionKindIds(profile): string[]`, `effectiveFields(profile, kindId, scope: 'node' | 'connection'): FieldDef[]`.

- [ ] **Step 1: Write the failing test**

Append to `packages/schema/test/c4-backend.test.ts`:
```ts
import { effectiveFields, connectionKindIds } from '../src/profile';
// (c4Backend is already imported in this file)

describe('profile meta-schema', () => {
  it('exposes connection kinds', () => {
    expect(connectionKindIds(c4Backend).sort()).toEqual(['DataFlow', 'Dependency', 'Realization', 'Trace']);
  });

  it('effective node fields = common (responsibilities, invariants) then per-kind (technology)', () => {
    const keys = effectiveFields(c4Backend, 'Component', 'node').map((f) => f.key);
    expect(keys).toEqual(['responsibilities', 'invariants', 'technology']);
  });

  it('a node kind with no own fields gets just the common fields', () => {
    expect(effectiveFields(c4Backend, 'System', 'node').map((f) => f.key)).toEqual(['responsibilities', 'invariants']);
  });

  it('effective connection fields = common (transport, intent)', () => {
    expect(effectiveFields(c4Backend, 'Dependency', 'connection').map((f) => f.key)).toEqual(['transport', 'intent']);
  });

  it('common fields win on key collision', () => {
    const profile = {
      ...c4Backend,
      commonNodeFields: [{ key: 'technology', type: 'text' as const, description: 'common one' }],
      nodeKinds: c4Backend.nodeKinds.map((k) =>
        k.id === 'Component' ? { ...k, fields: [{ key: 'technology', type: 'text' as const, description: 'per-kind one' }] } : k),
    };
    const tech = effectiveFields(profile, 'Component', 'node').filter((f) => f.key === 'technology');
    expect(tech).toHaveLength(1);
    expect(tech[0].description).toBe('common one');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hyphae/schema test`
Expected: FAIL — `effectiveFields`/`connectionKindIds` not exported; c4Backend has no `connectionKinds`/`commonNodeFields`.

- [ ] **Step 3: Rewrite `packages/schema/src/profile.ts`**

```ts
import { z } from 'zod';

export const CategorySchema = z.enum(['Structure', 'Behavior', 'Data', 'Intent', 'Actor']);

export const FieldTypeSchema = z.enum(['text', 'number', 'boolean', 'list', 'enum', 'ref']);

export const EnumValueSchema = z.object({
  value: z.string(),
  description: z.string(),
});

export const FieldDefSchema = z.object({
  key: z.string(),
  label: z.string().optional(),
  type: FieldTypeSchema,
  description: z.string(),
  required: z.boolean().optional(),
  values: z.array(EnumValueSchema).optional(), // enum only
  refKind: z.string().optional(),              // ref only
});

export const NodeKindSchema = z.object({
  id: z.string(),            // the node `type` value
  category: CategorySchema,
  layer: z.string(),
  allowedParents: z.array(z.string()).default([]),
  allowedChildren: z.array(z.string()).default([]),
  fields: z.array(FieldDefSchema).default([]),
});

export const ConnectionKindSchema = z.object({
  id: z.string(),            // the connection `type` value
  description: z.string(),
  allowedFrom: z.array(z.string()).optional(),
  allowedTo: z.array(z.string()).optional(),
  fields: z.array(FieldDefSchema).default([]),
});

export const ProfileSchema = z.object({
  id: z.string(),
  layers: z.array(z.string()),       // ordered, top -> bottom
  nodeKinds: z.array(NodeKindSchema),
  connectionKinds: z.array(ConnectionKindSchema),
  commonNodeFields: z.array(FieldDefSchema).default([]),
  commonConnectionFields: z.array(FieldDefSchema).default([]),
});

export type FieldType = z.infer<typeof FieldTypeSchema>;
export type EnumValue = z.infer<typeof EnumValueSchema>;
export type FieldDef = z.infer<typeof FieldDefSchema>;
export type Profile = z.infer<typeof ProfileSchema>;
export type NodeKind = z.infer<typeof NodeKindSchema>;
export type ConnectionKind = z.infer<typeof ConnectionKindSchema>;

export const layerOfType = (profile: Profile, type: string): string | undefined =>
  profile.nodeKinds.find((k) => k.id === type)?.layer;

export const allowedParentTypes = (profile: Profile, type: string): string[] =>
  profile.nodeKinds.find((k) => k.id === type)?.allowedParents ?? [];

export const typesForLayer = (profile: Profile, layer: string): string[] =>
  profile.nodeKinds.filter((k) => k.layer === layer).map((k) => k.id);

export const connectionKindIds = (profile: Profile): string[] =>
  profile.connectionKinds.map((k) => k.id);

/** Common fields then the kind's own fields; common wins on key collision. */
export function effectiveFields(profile: Profile, kindId: string, scope: 'node' | 'connection'): FieldDef[] {
  const common = scope === 'node' ? profile.commonNodeFields : profile.commonConnectionFields;
  const kind = scope === 'node'
    ? profile.nodeKinds.find((k) => k.id === kindId)
    : profile.connectionKinds.find((k) => k.id === kindId);
  const own = kind?.fields ?? [];
  const seen = new Set(common.map((f) => f.key));
  return [...common, ...own.filter((f) => !seen.has(f.key))];
}
```

- [ ] **Step 4: Rewrite `packages/schema/src/profiles/c4-backend.ts`**

```ts
import type { Profile, FieldDef } from '../profile';

const technology: FieldDef = { key: 'technology', type: 'text', description: 'Implementation stack / technology used by this node.' };

export const c4Backend: Profile = {
  id: 'c4-backend',
  layers: ['Context', 'Container', 'Component'],
  commonNodeFields: [
    { key: 'responsibilities', type: 'list', description: 'What this node is responsible for (one item per line).' },
    { key: 'invariants', type: 'list', description: 'Conditions that always hold true for this node.' },
  ],
  commonConnectionFields: [
    {
      key: 'transport', type: 'enum', description: 'The runtime mechanism of this connection.',
      values: [
        { value: 'Sync', description: 'Blocking request/response — the caller waits for a reply.' },
        { value: 'Async', description: 'Fire-and-forget or queued — the caller does not wait.' },
        { value: 'InProcess', description: 'Same process — a direct in-memory call, not over a network.' },
        { value: 'None', description: 'No runtime transport (e.g. a build-time or structural dependency).' },
      ],
    },
    {
      key: 'intent', type: 'enum', description: 'The intent of this connection (optional).',
      values: [
        { value: 'Read', description: 'Reads data from the target.' },
        { value: 'Write', description: 'Writes or persists data to the target.' },
        { value: 'Trigger', description: 'Triggers an action or behavior on the target.' },
        { value: 'Notify', description: 'Sends a notification or event to the target.' },
        { value: 'Use', description: "General use of the target's capabilities." },
      ],
    },
  ],
  nodeKinds: [
    { id: 'System', category: 'Structure', layer: 'Context', allowedParents: [], allowedChildren: ['Container'], fields: [] },
    { id: 'Actor', category: 'Actor', layer: 'Context', allowedParents: [], allowedChildren: [], fields: [] },
    { id: 'ExternalSystem', category: 'Structure', layer: 'Context', allowedParents: [], allowedChildren: [], fields: [] },
    { id: 'Container', category: 'Structure', layer: 'Container', allowedParents: ['System'], allowedChildren: ['Component'], fields: [technology] },
    { id: 'Component', category: 'Structure', layer: 'Component', allowedParents: ['Container'], allowedChildren: [], fields: [technology] },
  ],
  connectionKinds: [
    { id: 'Dependency', description: 'A depends on / uses B.', fields: [] },
    { id: 'DataFlow', description: 'Data flows from A to B.', fields: [] },
    { id: 'Realization', description: 'A realizes/implements an interface defined by B.', fields: [] },
    { id: 'Trace', description: 'Traceability link (e.g. a requirement traced to its implementation).', fields: [] },
  ],
};

export const layerOfType = (profile: Profile, type: string): string | undefined =>
  profile.nodeKinds.find((k) => k.id === type)?.layer;

export const allowedParentTypes = (profile: Profile, type: string): string[] =>
  profile.nodeKinds.find((k) => k.id === type)?.allowedParents ?? [];

export const typesForLayer = (profile: Profile, layer: string): string[] =>
  profile.nodeKinds.filter((k) => k.layer === layer).map((k) => k.id);
```
> Note: `c4-backend.ts` re-exports the three helpers (existing imports across the app import them from here). `connectionKindIds`/`effectiveFields` are imported from `./profile`. Leave `src/index.ts` as-is (it already `export *`s both files; the duplicate helper names are identical re-exports of the same logic — if TS complains about duplicate exports, drop the three helper copies from `c4-backend.ts` and add `export { layerOfType, allowedParentTypes, typesForLayer } from './profile'` there instead).

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @hyphae/schema test` then `npx tsc -p packages/schema --noEmit`
Expected: PASS; tsc exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/schema/src/profile.ts packages/schema/src/profiles/c4-backend.ts packages/schema/test/c4-backend.test.ts
git commit -m "feat(schema): profile meta-schema — connection kinds, common + per-kind fields, effectiveFields"
```

---

## Task 2: Lean core Node/Connection + strict field validation + generic getContext

The breaking core change, contained to `@hyphae/schema`. After this task the schema package is green; `apps/server` and `apps/web` will not compile until Tasks 3–4.

**Files:**
- Modify: `packages/schema/src/node.ts`
- Modify: `packages/schema/src/connection.ts`
- Modify: `packages/schema/src/validate.ts`
- Modify: `packages/schema/src/context.ts`
- Test: `packages/schema/test/node.test.ts`, `packages/schema/test/validate.test.ts`, `packages/schema/test/context.test.ts`, `packages/schema/test/model.test.ts`, `packages/schema/test/json-schema.test.ts`

**Interfaces:**
- Consumes: `effectiveFields`, `connectionKindIds`, `c4Backend`, `layerOfType`, `allowedParentTypes` (Task 1).
- Produces: lean `NodeSchema`/`ConnectionSchema` + `Node`/`Connection` types; `DirectionSchema` (kept); `Issue` with extended `kind` union; `validateModel(model, profile)`, `newIssues`, `resolveProfile` (unchanged signatures); `getContext(model, scope)` (unchanged signature, generic field rendering).

- [ ] **Step 1: Write the failing tests**

Replace `packages/schema/test/node.test.ts` with:
```ts
import { describe, it, expect } from 'vitest';
import { NodeSchema } from '../src/node';

describe('NodeSchema', () => {
  it('applies defaults for the lean core shape', () => {
    const n = NodeSchema.parse({ id: 'a', name: 'A', type: 'Component', createdAt: 't', updatedAt: 't' });
    expect(n).toMatchObject({ description: '', parentId: null, codeRefs: [], docRefs: [], fields: {} });
  });
  it('keeps an arbitrary fields bag', () => {
    const n = NodeSchema.parse({ id: 'a', name: 'A', type: 'Component', createdAt: 't', updatedAt: 't', fields: { technology: 'Go', responsibilities: ['x'] } });
    expect(n.fields).toEqual({ technology: 'Go', responsibilities: ['x'] });
  });
  it('rejects an empty name', () => {
    expect(() => NodeSchema.parse({ id: 'a', name: '', type: 'Component', createdAt: 't', updatedAt: 't' })).toThrow();
  });
});
```

Replace `packages/schema/test/validate.test.ts` with:
```ts
import { describe, it, expect } from 'vitest';
import { validateModel } from '../src/validate';
import { c4Backend } from '../src/profiles/c4-backend';
import { emptyModel, type HyphaeModel } from '../src/model';

const node = (over: Record<string, unknown>) => ({
  id: 'x', name: 'X', type: 'Component', parentId: null, description: '',
  codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {}, ...over,
});
const conn = (over: Record<string, unknown>) => ({
  id: 'e', from: 'a', to: 'b', type: 'Dependency', description: '',
  direction: 'Unidirectional', realizes: [], codeRefs: [], fields: {}, ...over,
});
function model(over: Partial<HyphaeModel> = {}): HyphaeModel {
  return { ...emptyModel(), ...over };
}

describe('validateModel', () => {
  it('flags an unknown node type', () => {
    const m = model({ nodes: [node({ id: 'a', type: 'Nope' })] });
    expect(validateModel(m, c4Backend).map((i) => i.kind)).toContain('unknown-type');
  });

  it('flags a bad parent', () => {
    const m = model({ nodes: [node({ id: 's', type: 'System' }), node({ id: 'c', type: 'Component', parentId: 's' })] });
    expect(validateModel(m, c4Backend).map((i) => i.kind)).toContain('bad-parent');
  });

  it('flags an unknown connection kind', () => {
    const m = model({
      nodes: [node({ id: 'a', type: 'System' }), node({ id: 'b', type: 'System' })],
      connections: [conn({ from: 'a', to: 'b', type: 'Bogus' })],
    });
    expect(validateModel(m, c4Backend).map((i) => i.kind)).toContain('unknown-connection-kind');
  });

  it('flags an unknown field key', () => {
    const m = model({ nodes: [node({ id: 'a', type: 'Component', fields: { nope: 1 } })] });
    expect(validateModel(m, c4Backend).map((i) => i.kind)).toContain('unknown-field');
  });

  it('flags a bad field type', () => {
    const m = model({ nodes: [node({ id: 'a', type: 'Component', fields: { technology: 5 } })] });
    expect(validateModel(m, c4Backend).map((i) => i.kind)).toContain('bad-field-type');
  });

  it('flags a bad enum value on a connection field', () => {
    const m = model({
      nodes: [node({ id: 'a', type: 'System' }), node({ id: 'b', type: 'System' })],
      connections: [conn({ from: 'a', to: 'b', fields: { transport: 'Telepathy' } })],
    });
    expect(validateModel(m, c4Backend).map((i) => i.kind)).toContain('bad-enum-value');
  });

  it('accepts a valid model with fields', () => {
    const m = model({
      nodes: [
        node({ id: 's', type: 'System' }),
        node({ id: 'co', type: 'Container', parentId: 's', fields: { technology: 'Hono', responsibilities: ['serve'] } }),
      ],
      connections: [],
    });
    expect(validateModel(m, c4Backend)).toEqual([]);
  });
});
```

Replace `packages/schema/test/context.test.ts` with:
```ts
import { describe, it, expect } from 'vitest';
import { getContext } from '../src/context';
import { emptyModel, type HyphaeModel } from '../src/model';

function shop(): HyphaeModel {
  const m = emptyModel();
  m.metadata.name = 'Shop';
  m.nodes.push(
    { id: 'sys', name: 'Shop', type: 'System', parentId: null, description: '', codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {} },
    { id: 'api', name: 'API', type: 'Container', parentId: 'sys', description: 'HTTP edge', codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: { technology: 'Hono', responsibilities: ['routing'], invariants: ['always authenticates'] } },
  );
  m.connections.push({ id: 'c1', from: 'api', to: 'sys', type: 'Dependency', description: 'calls', direction: 'Unidirectional', realizes: [], codeRefs: [], fields: { transport: 'Sync' } });
  return m;
}

describe('getContext', () => {
  it('summary mode (default): headline + first line of description + parent, no deep fields', () => {
    const t = getContext(shop());
    expect(t).toContain('# Shop');
    expect(t).toContain('API (Container)');
    expect(t).toContain('HTTP edge');
    expect(t).toContain('parent: Shop');
    expect(t).toContain('API -> Shop');
    expect(t).not.toContain('always authenticates');
  });

  it('full mode renders profile fields generically', () => {
    const t = getContext(shop(), { mode: 'full' });
    expect(t).toContain('always authenticates');
    expect(t).toContain('routing');
    expect(t).toContain('Hono');
  });

  it('connection line shows the connection type and description', () => {
    const t = getContext(shop(), { mode: 'full' });
    expect(t).toContain('API -> Shop [Dependency]');
    expect(t).toContain('calls');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @hyphae/schema test`
Expected: FAIL — `NodeSchema` still has old fields; `validateModel` has no field/kind checks; `getContext` reads removed fields.

- [ ] **Step 3: Rewrite `packages/schema/src/node.ts`**

```ts
import { z } from 'zod';

export const NodeSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  type: z.string().min(1), // validated against active profile in validate.ts
  parentId: z.string().nullable().default(null),
  description: z.string().default(''),
  codeRefs: z.array(z.string()).default([]),
  docRefs: z.array(z.string()).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
  fields: z.record(z.string(), z.unknown()).default({}),
});

export type Node = z.infer<typeof NodeSchema>;
```

- [ ] **Step 4: Rewrite `packages/schema/src/connection.ts`**

```ts
import { z } from 'zod';

export const DirectionSchema = z.enum(['Unidirectional', 'Bidirectional']);

export const ConnectionSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  type: z.string().min(1), // a ConnectionKind id, validated against active profile
  description: z.string().default(''),
  direction: DirectionSchema.default('Unidirectional'),
  realizes: z.array(z.string()).default([]),
  codeRefs: z.array(z.string()).default([]),
  fields: z.record(z.string(), z.unknown()).default({}),
});

export type Connection = z.infer<typeof ConnectionSchema>;
```
> The old enum exports (`RelationCategorySchema`, `TransportSchema`, `IntentSchema`, `FrequencySchema`) are removed. Their values now live in the profile's FieldDefs. `DirectionSchema` stays (core).

- [ ] **Step 5: Rewrite `packages/schema/src/validate.ts`**

```ts
import type { HyphaeModel } from './model';
import type { Profile, FieldDef } from './profile';
import { allowedParentTypes, c4Backend } from './profiles/c4-backend';
import { effectiveFields } from './profile';
import type { Node } from './node';

export type Issue = {
  kind:
    | 'unknown-type' | 'bad-parent' | 'missing-parent' | 'dangling-endpoint'
    | 'unknown-connection-kind' | 'bad-endpoint'
    | 'unknown-field' | 'bad-field-type' | 'bad-enum-value' | 'missing-required-field' | 'bad-ref';
  ref: string;       // id of the offending node/connection
  message: string;
};

function isFilled(v: unknown): boolean {
  if (v === undefined || v === null || v === '') return false;
  if (Array.isArray(v) && v.length === 0) return false;
  return true;
}

function validateFields(fields: Record<string, unknown>, defs: FieldDef[], nodeById: Map<string, Node>, ref: string): Issue[] {
  const issues: Issue[] = [];
  const defByKey = new Map(defs.map((d) => [d.key, d]));

  for (const key of Object.keys(fields)) {
    if (!defByKey.has(key)) issues.push({ kind: 'unknown-field', ref, message: `Unknown field "${key}"` });
  }

  for (const d of defs) {
    const v = fields[d.key];
    if (!isFilled(v)) {
      if (d.required) issues.push({ kind: 'missing-required-field', ref, message: `Missing required field "${d.key}"` });
      continue;
    }
    const typeOk =
      d.type === 'number' ? typeof v === 'number'
      : d.type === 'boolean' ? typeof v === 'boolean'
      : d.type === 'list' ? Array.isArray(v) && v.every((x) => typeof x === 'string')
      : typeof v === 'string'; // text, enum, ref
    if (!typeOk) {
      issues.push({ kind: 'bad-field-type', ref, message: `Field "${d.key}" expects ${d.type}` });
      continue;
    }
    if (d.type === 'enum' && !(d.values ?? []).some((e) => e.value === v)) {
      issues.push({ kind: 'bad-enum-value', ref, message: `Field "${d.key}" value "${String(v)}" is not an allowed value` });
    }
    if (d.type === 'ref') {
      const target = nodeById.get(v as string);
      if (!target) issues.push({ kind: 'bad-ref', ref, message: `Field "${d.key}" references missing node "${String(v)}"` });
      else if (d.refKind && target.type !== d.refKind) issues.push({ kind: 'bad-ref', ref, message: `Field "${d.key}" must reference a ${d.refKind}` });
    }
  }
  return issues;
}

export function validateModel(model: HyphaeModel, profile: Profile): Issue[] {
  const issues: Issue[] = [];
  const nodeById = new Map(model.nodes.map((n) => [n.id, n]));
  const knownTypes = new Set(profile.nodeKinds.map((k) => k.id));
  const connKindById = new Map(profile.connectionKinds.map((k) => [k.id, k]));

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
    issues.push(...validateFields(n.fields, effectiveFields(profile, n.type, 'node'), nodeById, n.id));
  }

  for (const c of model.connections) {
    if (!nodeById.has(c.from) || !nodeById.has(c.to)) {
      issues.push({ kind: 'dangling-endpoint', ref: c.id, message: `Connection references missing node` });
    }
    const kind = connKindById.get(c.type);
    if (!kind) {
      issues.push({ kind: 'unknown-connection-kind', ref: c.id, message: `Unknown connection type "${c.type}"` });
      continue;
    }
    const fromNode = nodeById.get(c.from);
    const toNode = nodeById.get(c.to);
    if (kind.allowedFrom && fromNode && !kind.allowedFrom.includes(fromNode.type)) {
      issues.push({ kind: 'bad-endpoint', ref: c.id, message: `${c.type} cannot start at ${fromNode.type}` });
    }
    if (kind.allowedTo && toNode && !kind.allowedTo.includes(toNode.type)) {
      issues.push({ kind: 'bad-endpoint', ref: c.id, message: `${c.type} cannot end at ${toNode.type}` });
    }
    issues.push(...validateFields(c.fields, effectiveFields(profile, c.type, 'connection'), nodeById, c.id));
  }
  return issues;
}

const issueKey = (i: Issue) => `${i.kind}:${i.ref}:${i.message}`;

/** Issues present in `next` but not already in `prev` (identity = kind+ref+message). */
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
> `issueKey` now includes `message` so two different field issues on the same node aren't collapsed by `newIssues`.

- [ ] **Step 6: Rewrite `packages/schema/src/context.ts`**

```ts
import type { HyphaeModel } from './model';
import type { Node } from './node';
import type { Connection } from './connection';
import { c4Backend, layerOfType } from './profiles/c4-backend';
import { effectiveFields } from './profile';

export type ContextScope = {
  mode?: 'summary' | 'full';
  layer?: string;
  root?: string;
  fields?: string[];
};

function fieldLine(label: string, value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) return value.length ? `${label}: ${value.map((i) => `- ${i}`).join(' ')}` : undefined;
  return `${label}: ${String(value)}`;
}

function summaryLine(n: Node): string | undefined {
  if (!n.description) return undefined;
  const first = n.description.split('\n')[0].trim();
  return first.length > 140 ? `${first.slice(0, 137)}...` : first;
}

function nodeBlock(n: Node, nameById: Map<string, string>, mode: 'summary' | 'full', only?: string[]): string {
  const lines = [`## ${n.name} (${n.type})  [id: ${n.id}]`];
  const push = (s: string | undefined) => { if (s) lines.push(s); };

  if (only?.length) {
    for (const key of only) push(fieldLine(key, n.fields[key]));
    return lines.join('\n');
  }
  if (mode === 'summary') {
    push(summaryLine(n));
    if (n.parentId) push(`parent: ${nameById.get(n.parentId) ?? n.parentId}`);
    return lines.join('\n');
  }
  // full
  if (n.description) push(n.description);
  if (n.parentId) push(`parent: ${nameById.get(n.parentId) ?? n.parentId}`);
  for (const def of effectiveFields(c4Backend, n.type, 'node')) push(fieldLine(def.label ?? def.key, n.fields[def.key]));
  if (n.codeRefs.length) push(fieldLine('codeRefs', n.codeRefs));
  return lines.join('\n');
}

function connectionLine(c: Connection, nameById: Map<string, string>): string {
  const arrow = c.direction === 'Bidirectional' ? '<->' : '->';
  const desc = c.description ? ` — ${c.description}` : '';
  return `${nameById.get(c.from) ?? c.from} ${arrow} ${nameById.get(c.to) ?? c.to} [${c.type}]${desc}`;
}

function descendants(model: HyphaeModel, root: string): Set<string> {
  const childrenByParent = new Map<string, string[]>();
  for (const n of model.nodes) {
    if (!n.parentId) continue;
    const arr = childrenByParent.get(n.parentId);
    if (arr) arr.push(n.id); else childrenByParent.set(n.parentId, [n.id]);
  }
  const set = new Set<string>([root]);
  const stack = [root];
  while (stack.length) {
    const id = stack.pop();
    if (!id) continue;
    for (const child of childrenByParent.get(id) ?? []) if (!set.has(child)) { set.add(child); stack.push(child); }
  }
  return set;
}

export function getContext(model: HyphaeModel, scope: ContextScope = {}): string {
  const { layer, root, fields } = scope;
  const mode = scope.mode ?? (root ? 'full' : 'summary');
  const nameById = new Map(model.nodes.map((n) => [n.id, n.name]));

  let nodes = model.nodes;
  if (layer) nodes = nodes.filter((n) => layerOfType(c4Backend, n.type) === layer);
  if (root) { const sub = descendants(model, root); nodes = nodes.filter((n) => sub.has(n.id)); }
  const visible = new Set(nodes.map((n) => n.id));

  const out: string[] = [`# ${model.metadata.name}`];
  if (model.metadata.description) out.push(model.metadata.description);
  out.push('', '# Nodes', ...nodes.map((n) => nodeBlock(n, nameById, mode, fields)));

  const conns = model.connections.filter((c) => visible.has(c.from) && visible.has(c.to));
  if (conns.length) {
    out.push('', '# Connections');
    for (const c of conns) out.push(connectionLine(c, nameById));
  }
  return out.join('\n');
}
```

- [ ] **Step 7: Fix the remaining schema fixtures (model + json-schema tests)**

In `packages/schema/test/model.test.ts` and `packages/schema/test/json-schema.test.ts`, update any inline node/connection literals to the new-shape literals from Global Constraints (drop `purpose/technology/responsibilities/invariants/assumptions/failureModes/tags/owner/status`; replace `relationCategory: 'X'` with `type: 'X'`; add `fields: {}`; keep `direction/realizes/codeRefs`). If `json-schema.test.ts` asserts the presence of specific property names, change any assertion on `relationCategory` to `type`, and any node-field assertion (e.g. `responsibilities`) to `fields`.

- [ ] **Step 8: Run tests to verify they pass**

Run: `pnpm --filter @hyphae/schema test` then `npx tsc -p packages/schema --noEmit`
Expected: PASS; tsc exit 0.

- [ ] **Step 9: Commit**

```bash
git add packages/schema/src/node.ts packages/schema/src/connection.ts packages/schema/src/validate.ts packages/schema/src/context.ts packages/schema/test
git commit -m "feat(schema): lean core Node/Connection + strict profile-driven field validation + generic getContext"
```

---

## Task 3: Server/MCP — dynamic tool schemas + describe_profile

Brings `apps/server` back to green and exposes the profile to agents.

**Files:**
- Modify: `apps/server/src/store.ts`
- Modify: `apps/server/src/mcp.ts`
- Test: `apps/server/test/mcp.test.ts`, `apps/server/test/store.test.ts`, `apps/server/test/routes.test.ts`

**Interfaces:**
- Consumes: `c4Backend`, `effectiveFields`, `connectionKindIds`, `typesForLayer`, `FieldDef`, lean `Node`/`Connection` (Tasks 1–2).
- Produces: `buildTools(api)` gains `describe_profile`; `create_node`/`create_connection` handlers accept `{ ...core, fields? }`. MCP `create_connection` requires `type` (not `relationCategory`).

- [ ] **Step 1: Write the failing tests**

In `apps/server/test/mcp.test.ts`: update the `model()`/`graphModel()`/`connModel()` fixtures to new-shape literals (replace removed node fields with `fields: {}`; replace `relationCategory: 'X'` with `type: 'X'`; keep `direction/realizes/codeRefs/fields`). Update the existing `fakeApi` so `createConnection`/`updateConnection` echo a `type`. Update the `create_connection`/`update_connection` assertions to use `type` instead of `relationCategory`. Then add:
```ts
it('describe_profile returns kinds and documented fields', async () => {
  const r = (await buildTools(fakeApi()).describe_profile({})) as {
    nodeKinds: Array<{ id: string }>; connectionKinds: Array<{ id: string }>;
    commonNodeFields: Array<{ key: string }>;
  };
  expect(r.nodeKinds.map((k) => k.id)).toContain('Container');
  expect(r.connectionKinds.map((k) => k.id)).toContain('Dependency');
  expect(r.commonNodeFields.map((f) => f.key)).toContain('responsibilities');
});

it('create_node forwards a fields bag', async () => {
  const r = await buildTools(fakeApi()).create_node({ name: 'X', type: 'Component', fields: { technology: 'Go' } });
  expect(r).toMatchObject({ node: { name: 'X', fields: { technology: 'Go' } } });
});
```
For the new `create_node` test, extend `fakeApi`'s `createNode` to spread input into `node` (it already does `{ node: { id: 'new', ...input } }`, which carries `fields`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @hyphae/server test`
Expected: FAIL — `describe_profile` missing; fixtures referencing old fields fail to typecheck/parse.

- [ ] **Step 3: Update `apps/server/src/store.ts`**

The store imports types and parses with `NodeSchema`/`ConnectionSchema`, so most of it is unchanged. Update only the input types that named removed fields:
```ts
export type NodeInput = Partial<Node> & { name: string; type: string };
export type ConnectionInput = Partial<Connection> & { from: string; to: string; type: string };
```
(Replace the old `relationCategory: Connection['relationCategory']` requirement with `type: string`.) No other store changes — `addNode`/`addConnection` already `NodeSchema.parse`/`ConnectionSchema.parse`.

- [ ] **Step 4: Update `apps/server/src/mcp.ts`**

Add imports:
```ts
import { getContext, rollupConnections, HyphaeModelSchema, c4Backend, effectiveFields, connectionKindIds, typesForLayer, type HyphaeModel, type FieldDef } from '@hyphae/schema';
```
Add to the `HyphaeApi` interface nothing new (describe_profile is local). In `buildTools`, add a handler:
```ts
describe_profile: async (_: Record<string, never>) => c4Backend,
```
Add a helper near `nodeFields` to turn a FieldDef into an (always-optional, documented) Zod type, and to build a fields shape for a scope (union of every kind's effective fields):
```ts
function fieldDesc(d: FieldDef): string {
  const vals = d.values?.length ? ` Allowed: ${d.values.map((v) => `${v.value} (${v.description})`).join('; ')}.` : '';
  return `${d.description}${vals}${d.required ? ' (required)' : ''}`;
}
function fieldToZod(d: FieldDef) {
  const base =
    d.type === 'number' ? z.number()
    : d.type === 'boolean' ? z.boolean()
    : d.type === 'list' ? z.array(z.string())
    : d.type === 'enum' ? z.enum((d.values ?? []).map((v) => v.value) as [string, ...string[]])
    : z.string();
  return base.optional().describe(fieldDesc(d));
}
function fieldsShape(scope: 'node' | 'connection'): Record<string, z.ZodTypeAny> {
  const kinds = scope === 'node' ? c4Backend.nodeKinds.map((k) => k.id) : connectionKindIds(c4Backend);
  const byKey = new Map<string, FieldDef>();
  for (const id of kinds) for (const f of effectiveFields(c4Backend, id, scope)) if (!byKey.has(f.key)) byKey.set(f.key, f);
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [key, def] of byKey) shape[key] = fieldToZod(def);
  return shape;
}
```
Replace the hardcoded `nodeFields` object with core-only fields plus a typed `fields` object, and register the tools. Node tools:
```ts
const coreNodeFields = {
  parentId: z.string().nullable().optional(),
  description: z.string().optional(),
  codeRefs: z.array(z.string()).optional(),
  docRefs: z.array(z.string()).optional(),
  fields: z.object(fieldsShape('node')).partial().optional(),
};
server.registerTool('create_node', {
  description: "Add a node. Call describe_profile (or get_text_context) first. `type` is one of the active profile's node kinds. Containment: a Component's parent is a Container, a Container's parent a System. Domain values go in `fields` (see describe_profile for each kind's fields). Returns the created node or {issues}.",
  inputSchema: { name: z.string(), type: z.enum(c4Backend.nodeKinds.map((k) => k.id) as [string, ...string[]]), ...coreNodeFields },
}, async (a) => text(await tools.create_node(a)));
server.registerTool('update_node', {
  description: 'Update fields of a node by id. Only provided fields change. Domain values go in `fields`. Returns the updated node or {issues}.',
  inputSchema: { id: z.string(), name: z.string().optional(), type: z.string().optional(), ...coreNodeFields },
}, async (a) => text(await tools.update_node(a)));
```
Connection tools:
```ts
const coreConnFields = {
  description: z.string().optional(),
  direction: z.enum(['Unidirectional', 'Bidirectional']).optional(),
  fields: z.object(fieldsShape('connection')).partial().optional(),
};
server.registerTool('create_connection', {
  description: 'Connect two existing nodes by id. `type` is one of the active profile connection kinds (see describe_profile). Domain values (transport, intent, …) go in `fields`. Returns the created connection or {issues}.',
  inputSchema: { from: z.string(), to: z.string(), type: z.enum(connectionKindIds(c4Backend) as [string, ...string[]]), ...coreConnFields },
}, async (a) => text(await tools.create_connection(a)));
server.registerTool('update_connection', {
  description: 'Update fields of a connection by id. Only provided fields change. Domain values go in `fields`. Returns the updated connection or {issues}.',
  inputSchema: { id: z.string(), from: z.string().optional(), to: z.string().optional(), type: z.string().optional(), ...coreConnFields },
}, async (a) => text(await tools.update_connection(a)));
```
Register `describe_profile`:
```ts
server.registerTool('describe_profile', {
  description: 'The active profile: its layers, node kinds, connection kinds, and the documented custom fields (with enum values and descriptions) valid for each. Call this to learn what `type` values and `fields` are available before creating nodes/connections.',
  inputSchema: {},
}, async () => text(await tools.describe_profile({})));
```
Delete the old `nodeFields` const and the previous hardcoded `create_*`/`update_*` registrations (the ones using `relationCategory`/`transport`/`intent` as direct params).

- [ ] **Step 5: Update routes/store tests**

In `apps/server/test/store.test.ts` and `apps/server/test/routes.test.ts`: change any created connection to use `type` instead of `relationCategory`, and any node literal/assertion that used removed fields to the `fields` bag. Where a test asserts a rejected write, keep the assertion on `issues` (the kinds may now differ — assert `issues.length` > 0 or the specific new kind).

- [ ] **Step 6: Run tests + typecheck**

Run: `pnpm --filter @hyphae/server test` then `npx tsc -p apps/server --noEmit`
Expected: PASS; tsc exit 0.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/store.ts apps/server/src/mcp.ts apps/server/test
git commit -m "feat(server): profile-driven MCP tool schemas + describe_profile; connection type replaces relationCategory"
```

---

## Task 4: Web — generic SidePanel, generated FilterPanel, connection type

Restores `apps/web` (and the whole monorepo) to green.

**Files:**
- Modify: `apps/web/src/api.ts`
- Modify: `apps/web/src/store.ts`
- Modify: `apps/web/src/toModel.ts`
- Modify: `apps/web/src/FilterPanel.tsx`
- Modify: `apps/web/src/SidePanel.tsx`
- Modify: `apps/web/src/Canvas.tsx`
- Test: `apps/web/test/toModel.test.ts`

**Interfaces:**
- Consumes: `c4Backend`, `effectiveFields`, `connectionKindIds`, `allowedParentTypes`, `type FieldDef`, lean `Node`/`Connection` (Tasks 1–2).
- Produces: `ConnFilter = { kinds: string[]; fields: Record<string, string[]> }`; store actions `toggleConnKind(value)`, `toggleConnField(key, value)`, `clearConnFilter()`; `matchesFilter(connection, ConnFilter)`.

- [ ] **Step 1: Write the failing test**

In `apps/web/test/toModel.test.ts`: update all node literals to the new shape (drop removed fields, add `fields: {}`), and all connection literals to use `type` + `fields` (e.g. `transport` moves into `fields: { transport: 'Sync' }`). Replace the existing "filters connections by relationCategory and transport" test with:
```ts
it('filters connections by kind and by transport field', () => {
  const m = emptyModel();
  const base = { description: '', codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {} };
  m.nodes.push(
    { id: 'a', name: 'A', type: 'Component', parentId: null, ...base },
    { id: 'b', name: 'B', type: 'Component', parentId: null, ...base },
    { id: 'c', name: 'C', type: 'Component', parentId: null, ...base },
  );
  const e = { description: '', direction: 'Unidirectional' as const, realizes: [], codeRefs: [] };
  m.connections.push(
    { id: 'e1', from: 'a', to: 'b', type: 'Dependency', ...e, fields: { transport: 'Sync' } },
    { id: 'e2', from: 'a', to: 'c', type: 'DataFlow', ...e, fields: { transport: 'Async' } },
    { id: 'e3', from: 'b', to: 'c', type: 'Dependency', ...e, fields: { transport: 'InProcess' } },
  );
  const ids = (f: { kinds: string[]; fields: Record<string, string[]> }) => toFlowEdges(m, 'Component', f).map((x) => x.id).sort();
  expect(ids({ kinds: [], fields: {} })).toEqual(['e1', 'e2', 'e3']);
  expect(ids({ kinds: ['Dependency'], fields: {} })).toEqual(['e1', 'e3']);
  expect(ids({ kinds: [], fields: { transport: ['Sync'] } })).toEqual(['e1']);
  expect(ids({ kinds: ['Dependency'], fields: { transport: ['Async'] } })).toEqual([]);
});
```
Update the existing rollup/ghost/highlight tests' literals to the new shape too (they currently set `relationCategory`/`transport` inline → use `type` and `fields`). The edge-label assertion `'Dependency / Sync'` becomes `'Dependency'` (see Step 5).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hyphae/web test`
Expected: FAIL — `matchesFilter` shape changed; literals use removed fields.

- [ ] **Step 3: Update `apps/web/src/api.ts`**

Change the `createConnection` input type:
```ts
export function createConnection(input: { id: string; from: string; to: string; type: string }): Promise<{ connection: Connection; version: number }> {
  return mutate('POST', '/connections', input) as Promise<{ connection: Connection; version: number }>;
}
```

- [ ] **Step 4: Update `apps/web/src/store.ts`**

- Change `addConnection` to send a `type`:
```ts
const { connection, version } = await api.createConnection({ id: newId(), from, to, type: 'Dependency' });
```
- Replace the `ConnFilter` type and actions:
```ts
export type ConnFilter = { kinds: string[]; fields: Record<string, string[]> };
// in State:
connFilter: ConnFilter;
toggleConnKind: (value: string) => void;
toggleConnField: (key: string, value: string) => void;
clearConnFilter: () => void;
// initial:
connFilter: { kinds: [], fields: {} },
// actions:
toggleConnKind: (value) => set((s) => {
  const kinds = s.connFilter.kinds.includes(value) ? s.connFilter.kinds.filter((v) => v !== value) : [...s.connFilter.kinds, value];
  return { connFilter: { ...s.connFilter, kinds } };
}),
toggleConnField: (key, value) => set((s) => {
  const cur = s.connFilter.fields[key] ?? [];
  const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
  return { connFilter: { ...s.connFilter, fields: { ...s.connFilter.fields, [key]: next } } };
}),
clearConnFilter: () => set({ connFilter: { kinds: [], fields: {} } }),
```

- [ ] **Step 5: Update `apps/web/src/toModel.ts`**

- Import: `import { c4Backend, layerOfType, rollupConnections, connectionKindIds, type HyphaeModel, type Connection, type RollupConnection } from '@hyphae/schema';` (drop unused).
- `realEdge` label uses the connection type:
```ts
function realEdge(c: Connection): FlowEdge {
  return { id: c.id, type: 'floating', source: c.from, target: c.to, label: c.type };
}
```
- Replace `ConnFilter` + `matchesFilter`:
```ts
export type ConnFilter = { kinds: string[]; fields: Record<string, string[]> };

function matchesFilter(c: Connection, f: ConnFilter): boolean {
  if (f.kinds.length && !f.kinds.includes(c.type)) return false;
  for (const [key, vals] of Object.entries(f.fields)) {
    if (vals.length && !vals.includes(String(c.fields[key] ?? ''))) return false;
  }
  return true;
}
```
Everything else (`crossLayerEdges`, ghost logic, rollup, highlight) is unchanged.

- [ ] **Step 6: Rewrite `apps/web/src/FilterPanel.tsx`**

```tsx
import { useStore } from './store';
import { c4Backend, connectionKindIds, type FieldDef } from '@hyphae/schema';

function KindGroup() {
  const selected = useStore((s) => s.connFilter.kinds);
  const toggle = useStore((s) => s.toggleConnKind);
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4, color: '#888' }}>Kind</div>
      {connectionKindIds(c4Backend).map((k) => (
        <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={selected.includes(k)} onChange={() => toggle(k)} /> {k}
        </label>
      ))}
    </div>
  );
}

function FieldGroup({ def }: { def: FieldDef }) {
  const selected = useStore((s) => s.connFilter.fields[def.key] ?? []);
  const toggle = useStore((s) => s.toggleConnField);
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4, color: '#888' }}>{def.label ?? def.key}</div>
      {(def.values ?? []).map((v) => (
        <label key={v.value} title={v.description} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={selected.includes(v.value)} onChange={() => toggle(def.key, v.value)} /> {v.value}
        </label>
      ))}
    </div>
  );
}

export function FilterPanel() {
  const filter = useStore((s) => s.connFilter);
  const clear = useStore((s) => s.clearConnFilter);
  const active = filter.kinds.length + Object.values(filter.fields).reduce((a, v) => a + v.length, 0);
  const enumFields = c4Backend.commonConnectionFields.filter((f) => f.type === 'enum');
  return (
    <div style={{ background: '#fff', border: '1px solid #ddd', borderRadius: 6, padding: '8px 10px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', minWidth: 130 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ fontSize: 12 }}>Connections</strong>
        {active > 0 && <button onClick={clear} style={{ fontSize: 11, cursor: 'pointer' }}>clear</button>}
      </div>
      <KindGroup />
      {enumFields.map((f) => <FieldGroup key={f.key} def={f} />)}
    </div>
  );
}
```

- [ ] **Step 7: Rewrite `apps/web/src/SidePanel.tsx`**

```tsx
import { useStore } from './store';
import {
  DirectionSchema, allowedParentTypes, connectionKindIds, effectiveFields, c4Backend,
  type Node, type Connection, type FieldDef,
} from '@hyphae/schema';

const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);

function FieldInput({ def, value, onChange, nodes }: {
  def: FieldDef; value: unknown; onChange: (v: unknown) => void;
  nodes: Node[];
}) {
  const common = { 'aria-label': def.key } as const;
  let control;
  if (def.type === 'list') {
    control = <textarea {...common} value={Array.isArray(value) ? value.join('\n') : ''} onChange={(e) => onChange(lines(e.target.value))} />;
  } else if (def.type === 'boolean') {
    control = <input {...common} type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />;
  } else if (def.type === 'number') {
    control = <input {...common} type="number" value={value === undefined ? '' : String(value)} onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} />;
  } else if (def.type === 'enum') {
    control = (
      <select {...common} value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">(none)</option>
        {(def.values ?? []).map((v) => <option key={v.value} value={v.value} title={v.description}>{v.value}</option>)}
      </select>
    );
  } else if (def.type === 'ref') {
    control = (
      <select {...common} value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">(none)</option>
        {nodes.filter((n) => !def.refKind || n.type === def.refKind).map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
      </select>
    );
  } else {
    control = <input {...common} value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} />;
  }
  return <label className="field" title={def.description}><span>{def.label ?? def.key}{def.required ? ' *' : ''}</span>{control}</label>;
}

export function SidePanel() {
  const node = useStore((s) => s.model.nodes.find((n) => n.id === s.selectedId));
  const connection = useStore((s) => s.model.connections.find((c) => c.id === s.selectedId));
  const nodes = useStore((s) => s.model.nodes);
  const updateNode = useStore((s) => s.updateNode);
  const reparent = useStore((s) => s.reparent);
  const deleteNode = useStore((s) => s.deleteNode);
  const updateConnection = useStore((s) => s.updateConnection);
  const deleteConnection = useStore((s) => s.deleteConnection);

  if (node) {
    const parentTypes = allowedParentTypes(c4Backend, node.type);
    const parentOptions = nodes.filter((p) => parentTypes.includes(p.type) && p.id !== node.id);
    const setField = (key: string, v: unknown) => updateNode(node.id, { fields: { ...node.fields, [key]: v } });
    return (
      <aside className="panel">
        <h2>{node.type}</h2>
        <label className="field"><span>name</span>
          <input aria-label="name" value={node.name} onChange={(e) => updateNode(node.id, { name: e.target.value })} /></label>
        <label className="field"><span>description</span>
          <textarea aria-label="description" value={node.description} onChange={(e) => updateNode(node.id, { description: e.target.value })} /></label>
        {effectiveFields(c4Backend, node.type, 'node').map((def) => (
          <FieldInput key={def.key} def={def} value={node.fields[def.key]} nodes={nodes} onChange={(v) => setField(def.key, v)} />
        ))}
        {parentTypes.length > 0 && (
          <label className="field"><span>parent</span>
            <select aria-label="parent" value={node.parentId ?? ''} onChange={(e) => reparent(node.id, e.target.value || null)}>
              <option value="">(none)</option>
              {parentOptions.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.type})</option>)}
            </select></label>
        )}
        <button onClick={() => deleteNode(node.id)}>Delete node</button>
      </aside>
    );
  }

  if (connection) {
    const conn = connection;
    const nameOf = (id: string) => nodes.find((n) => n.id === id)?.name ?? id;
    const setField = (key: string, v: unknown) => updateConnection(conn.id, { fields: { ...conn.fields, [key]: v } });
    return (
      <aside className="panel">
        <h2>Connection</h2>
        <p className="field"><strong>{nameOf(conn.from)} → {nameOf(conn.to)}</strong></p>
        <label className="field"><span>type</span>
          <select aria-label="type" value={conn.type} onChange={(e) => updateConnection(conn.id, { type: e.target.value })}>
            {connectionKindIds(c4Backend).map((k) => <option key={k} value={k}>{k}</option>)}
          </select></label>
        <label className="field"><span>direction</span>
          <select aria-label="direction" value={conn.direction} onChange={(e) => updateConnection(conn.id, { direction: e.target.value as Connection['direction'] })}>
            {DirectionSchema.options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select></label>
        <label className="field"><span>description</span>
          <textarea aria-label="description" value={conn.description} onChange={(e) => updateConnection(conn.id, { description: e.target.value })} /></label>
        {effectiveFields(c4Backend, conn.type, 'connection').map((def) => (
          <FieldInput key={def.key} def={def} value={conn.fields[def.key]} nodes={nodes} onChange={(v) => setField(def.key, v)} />
        ))}
        <button onClick={() => deleteConnection(conn.id)}>Delete connection</button>
      </aside>
    );
  }

  return <aside className="panel"><p>No node selected.</p></aside>;
}
```

- [ ] **Step 8: Update `apps/web/src/Canvas.tsx`**

No logic change is required (it imports `ConnFilter` indirectly via store and passes `connFilter` through). Verify it still compiles; if `Canvas` referenced the old `connFilter` field names anywhere, none exist — it only passes the object through. No edit expected.

- [ ] **Step 9: Run tests + typecheck + build**

Run: `pnpm --filter @hyphae/web test`, then `npx tsc -p apps/web --noEmit`, then `pnpm --filter @hyphae/web build`, then `pnpm -r test`.
Expected: all PASS; tsc exit 0; build succeeds; full monorepo green.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src apps/web/test
git commit -m "feat(web): generic profile-driven SidePanel + generated FilterPanel; connection type replaces relationCategory"
```

---

## Task 5: Rewrite the self-model `hyphae.json`

The repo's own model file is in the old shape and will no longer parse. Regenerate it in the new shape.

**Files:**
- Modify: `hyphae.json` (repo root)

- [ ] **Step 1: Confirm it fails to load**

Run: `node -e "const {HyphaeModelSchema}=require('./packages/schema/dist/index.js'); HyphaeModelSchema.parse(JSON.parse(require('fs').readFileSync('hyphae.json','utf8')))"` — or simply start the server (`pnpm --filter @hyphae/server dev`) and observe the parse error on load.
Expected: a Zod parse error referencing `relationCategory`/removed fields.

- [ ] **Step 2: Rewrite each node and connection to the new shape**

For every node in `hyphae.json`: remove `purpose, technology, responsibilities, invariants, assumptions, failureModes, tags, owner, status` from the top level; move the ones the profile defines into `fields` (`technology` for Container/Component; `responsibilities`/`invariants` for any node) and add `"fields": {}` (or the populated object); keep `id,name,type,parentId,description,codeRefs,docRefs,createdAt,updatedAt`.
For every connection: rename `"relationCategory"` to `"type"`; move `transport`/`intent` into `"fields"`; drop `protocol/frequency/latencyBudgetMs/security/dataTypeRef`; keep `id,from,to,type,description,direction,realizes,codeRefs` and add `"fields"`.
Keep `schemaVersion: 1` and `activeProfile: "c4-backend"`.

Alternatively, delete `hyphae.json` and rebuild the model from scratch via the editor/MCP — but the hand-edit preserves the existing self-model content.

- [ ] **Step 3: Verify it loads and validates clean**

Start the server, then:
```bash
curl -s localhost:5173/model > /dev/null && echo loaded
```
Expected: server starts without a parse error; `GET /model` returns 200. Optionally call the `hyphae` MCP `get_text_context` and confirm the model renders.

- [ ] **Step 4: Commit**

```bash
git add hyphae.json
git commit -m "chore: rewrite self-model hyphae.json to the profile-driven schema shape"
```

---

## Self-Review

**Spec coverage:**
- §2 Profile meta-schema (FieldDef, NodeKind.fields, ConnectionKind, common fields, effectiveFields) → Task 1. ✓
- §3 lean core Node/Connection + fields bag → Task 2. ✓
- §4 c4-backend re-expressed → Task 1 (Step 4). ✓
- §5 strict validation (all new issue kinds) → Task 2 (Step 5) + tests. ✓
- §6.1 getContext generic → Task 2 (Step 6). ✓
- §6.2 dynamic MCP schemas + describe_profile → Task 3. ✓
- §6.3 SidePanel/FilterPanel/Canvas → Task 4. ✓
- §7 no migration, rewrite models → Task 5 (self-model) + fixture rewrites folded into Tasks 2–4. ✓
- §8 sequencing (schema→server→web→model) → task order. ✓

**Placeholder scan:** No "TBD"/"handle edge cases"/"similar to". Fixture-update steps name the exact transform and reference the new-shape literals in Global Constraints. The gccp-cctv model (user's, not in-repo) is intentionally not a task — it's the user's to rebuild via the skill.

**Type consistency:** `effectiveFields(profile, kindId, scope)`, `connectionKindIds(profile)`, `ConnFilter = { kinds, fields }`, `matchesFilter(c, f)`, connection `type` (not `relationCategory`), `fields: Record<string, unknown>`, `Issue.kind` union — all used consistently across tasks. MCP `fieldsShape`/`fieldToZod`/`fieldDesc` are defined and used only within Task 3. SidePanel `FieldInput` props match its call sites.

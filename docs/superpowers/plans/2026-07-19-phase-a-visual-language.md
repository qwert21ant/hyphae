# Phase A — Visual Language Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Hyphae diagram legible without opening the side panel — a node shows role shape + name + one-line purpose + tech chip; a connection shows verb + object colored by verb class.

**Architecture:** Two new core fields (`role` on a node, `verb`/`object` on a connection) plus two new profile vocabularies (`roles`, `verbs`). `role` resolves per node with a per-kind default fallback; `verb` is a Zod-defaulted core field so existing files gain a verb at parse time and need no migration. The renderer maps a profile-declared *shape name* to geometry, so the vocabulary stays profiled and the mechanism universal. `intent` is deleted from the profile; `summary` becomes a required field on the five non-Code kinds.

**Tech Stack:** pnpm workspaces · TypeScript · Zod (`packages/schema`) · Hono (`apps/server`) · Vite + React 18 + `@xyflow/react` + Zustand (`apps/web`) · Vitest · MCP

## Global Constraints

- **No model-file migration, at all.** No migration script, no rewriting `hyphae-cctv-new.json` or any other model JSON. Do not edit, stage, or commit a model `.json` file in any task. Existing files must still *load*; they are allowed to report validation issues.
- **Never stage with a bare `git add <dir>`.** `apps/server/hyphae-cctv-new.json` and `hyphae-cctv.json` are **untracked**, so `git add apps/server` sweeps them into the commit. Use `git add -u <dir>` (tracked files only) and name any genuinely new file explicitly. Run `git status --short` before every commit and confirm no `.json` is staged.
- **Zod schemas in `packages/schema/src` are the single source of truth.** TS types, JSON Schema (`json-schema.ts`), the server API, and the MCP tool shapes all derive from them. Never hand-write a JSON Schema or duplicate a type.
- **`schemaVersion` stays `1`.** Every schema change here is additive-with-default or a profile-vocabulary change, so no on-disk shape breaks.
- **New vocabulary is profile-declared, never hardcoded in the renderer.** Roles and verbs live in `packages/schema/src/profile.ts` + `profiles/c4-backend.ts` and flow automatically into `describe_profile`.
- **Every new field is described.** `FieldDef.description` is required; enum values are described individually.
- **Tests:** `pnpm -r test` must pass at the end of every task. Baseline entering this plan: **278 tests** (schema 86, server 67, web 125).
- **Type-check separately — `pnpm -r test` does NOT type-check.** Vitest compiles with esbuild and strips types without checking them, so a type regression passes the suite silently. At the end of every task run, and require clean:
  ```bash
  pnpm --filter @hyphae/schema exec tsc -p tsconfig.json
  pnpm --filter @hyphae/server exec tsc -p tsconfig.json
  pnpm --filter @hyphae/web exec tsc --noEmit -p tsconfig.json
  ```
  A Zod `.default(...)` makes a field **required in the inferred output type**: anything built by `NodeSchema.parse()` is unaffected, but hand-built object literals typed as `Node`/`Connection` must add the new key. Most test files spread a shared `nodeBase`/`base`/`edgeBase` const — fix that one const rather than each literal.

---

## Deviation from the spec (read before starting)

The spec (§6) gives the `external` role a **dashed rectangle**. This plan uses a **hexagon** instead.

Reason: `apps/web/src/GhostNode.tsx` already renders a dashed border, and it means something else — "this node is borrowed from another layer, shown so its connection is visible." An `ExternalSystem` drawn dashed would collide with that, and an external system shown *as a ghost* would be dashed for two unrelated reasons at once. A hexagon is unambiguous and keeps dashed meaning exactly one thing.

Everything else follows the spec as written.

---

## File Structure

| Path | Status | Responsibility |
|------|--------|----------------|
| `packages/schema/src/node.ts` | modify | add `role` |
| `packages/schema/src/connection.ts` | modify | add `verb`, `object` |
| `packages/schema/src/profile.ts` | modify | `RoleDefSchema`, `VerbDefSchema`, `roles`/`verbs` on profile, `role` on node kind, `roleOfNode`/`verbClassOf` helpers |
| `packages/schema/src/profiles/c4-backend.ts` | modify | the role + verb vocabulary; per-kind roles; retire `intent`; add `summary` |
| `packages/schema/src/validate.ts` | modify | `unknown-role`, `unknown-verb` issues |
| `packages/schema/test/*.test.ts` | modify | tests for all the above |
| `apps/server/src/mcp.ts` | modify | `role`/`verb`/`object` in write shapes |
| `apps/web/src/shapes.ts` | **create** | shape-name → SVG/CSS geometry, shared by node renderers |
| `apps/web/src/NodeBox.tsx` | modify | three-line body + role shape |
| `apps/web/src/GhostNode.tsx` | modify | same body, keeps dashed/italic ghost treatment |
| `apps/web/src/flow.ts` | modify | node data (summary/tech/role), edge label + verb-class color |
| `apps/web/src/layout.ts` | modify | `NODE_W`/`NODE_H` grow |
| `apps/web/src/focusView.ts` | modify | carry `verb`/`object` on `FocusEdge` |
| `apps/web/src/Legend.tsx` | modify | role-shape and verb-class keys |
| `apps/web/src/SidePanel.tsx` | modify | On-diagram vs Detail split; role/verb/object controls |
| `plugins/hyphae-modeling/**` | modify | teach summary, verbs, roles; stop writing `intent` |

---

## Task 1: Core fields — node `role`, connection `verb` and `object`

**Files:**
- Modify: `packages/schema/src/node.ts`
- Modify: `packages/schema/src/connection.ts`
- Modify: `packages/schema/test/node.test.ts`
- Modify: `packages/schema/test/connection.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `NodeSchema` gains `role: z.string().nullable().default(null)` — an override; `null` means "use my kind's default role".
  - `ConnectionSchema` gains `verb: z.string().default('uses')` and `object: z.string().default('')`.

The defaults are the whole no-migration story: an existing file that has never heard of `verb` parses and comes back with `verb: 'uses'`, so no connection can report a missing field and nothing on disk needs rewriting.

- [ ] **Step 1: Write the failing tests**

Append to `packages/schema/test/node.test.ts`, inside the existing `describe('NodeSchema', ...)` block:

```ts
  it('defaults role to null', () => {
    const n = NodeSchema.parse({ id: 'a', name: 'A', type: 'Component', createdAt: 't', updatedAt: 't' });
    expect(n.role).toBe(null);
  });
  it('keeps an explicit role override', () => {
    const n = NodeSchema.parse({ id: 'a', name: 'A', type: 'Component', createdAt: 't', updatedAt: 't', role: 'datastore' });
    expect(n.role).toBe('datastore');
  });
```

Append to `packages/schema/test/connection.test.ts` (add a `describe` block if the file's existing tests are not already inside one — match the file's current structure):

```ts
describe('ConnectionSchema verb/object', () => {
  const base = { id: 'c', from: 'a', to: 'b', type: 'Dependency' };

  it('defaults verb to uses so an old file needs no migration', () => {
    const c = ConnectionSchema.parse(base);
    expect(c.verb).toBe('uses');
  });

  it('defaults object to empty', () => {
    expect(ConnectionSchema.parse(base).object).toBe('');
  });

  it('keeps an explicit verb and object', () => {
    const c = ConnectionSchema.parse({ ...base, verb: 'reads', object: 'camera list' });
    expect(c).toMatchObject({ verb: 'reads', object: 'camera list' });
  });
});
```

If `ConnectionSchema` is not already imported at the top of `connection.test.ts`, add:

```ts
import { ConnectionSchema } from '../src/connection';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @hyphae/schema exec vitest run test/node.test.ts test/connection.test.ts`
Expected: FAIL — `expected undefined to be null` / `expected undefined to be 'uses'`.

- [ ] **Step 3: Add the fields**

`packages/schema/src/node.ts` — add `role` immediately after `root`:

```ts
  root: z.string().nullable().default(null),
  // Archetype override selecting this node's shape (a role id from the profile).
  // null = fall back to the node kind's default role. See profile.ts roleOfNode.
  role: z.string().nullable().default(null),
```

`packages/schema/src/connection.ts` — add `verb` and `object` after `type`:

```ts
export const ConnectionSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  type: z.string().min(1), // a ConnectionKind id, validated against active profile
  // The business action this edge performs, shown on the diagram. A verb id from the
  // profile. Defaults so a model written before verbs existed still parses — and so an
  // edge is never unlabeled.
  verb: z.string().default('uses'),
  // What the action acts on — a short noun ('camera list'). Free text this phase;
  // Phase D turns it into a DataEntity reference.
  object: z.string().default(''),
  description: z.string().default(''),
  direction: DirectionSchema.default('Unidirectional'),
  realizedBy: z.array(z.string()).default([]),
  codeRefs: z.array(z.string()).default([]),
  fields: z.record(z.string(), z.unknown()).default({}),
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @hyphae/schema exec vitest run test/node.test.ts test/connection.test.ts`
Expected: PASS.

- [ ] **Step 5: Fix type fallout across packages**

Run all three type-checks from Global Constraints. Adding defaulted fields makes `role`/`verb`/`object` required in the inferred output types, so hand-built literals typed as `Node`/`Connection` break. Fix by adding the keys to each file's shared base const, e.g. in `packages/schema/test/gaps.test.ts`:

```ts
const nodeBase = { root: null, role: null, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {} };
const edgeBase = { verb: 'uses', object: '', description: '', direction: 'Unidirectional' as const, realizedBy: [], codeRefs: [], fields: {} };
```

Apply the same shape to the equivalent const in every failing file across `packages/schema`, `apps/server`, and `apps/web`. Report every file you touched. Do not change any assertion — this is a type-only fix.

- [ ] **Step 6: Verify the fixture still loads (do NOT modify it)**

Write the script to the scratchpad, not the repo:

```bash
SCRATCH="C:/Users/qwert/AppData/Local/Temp/claude/C--projects-hyphae/2e553ec9-4405-46ea-bfcb-3f31a0f75e26/scratchpad"
cd apps/server && cat > "$SCRATCH/load.ts" <<'EOF'
import { readFileSync } from 'node:fs';
import { HyphaeModelSchema } from '@hyphae/schema';
const m = HyphaeModelSchema.parse(JSON.parse(readFileSync('hyphae-cctv-new.json','utf8')));
const verbs = new Set(m.connections.map((c) => c.verb));
console.log(m.nodes.length, 'nodes;', m.connections.length, 'connections; verbs seen:', [...verbs]);
EOF
pnpm exec tsx "$SCRATCH/load.ts"
```

Expected: `404 nodes; 567 connections; verbs seen: [ 'uses' ]` — every connection gained the default verb at parse time, with the file untouched on disk. Confirm with `git status` that no `.json` is modified.

- [ ] **Step 7: Run the full suite and commit**

```bash
pnpm -r test
git add -u packages/schema apps/server apps/web
git commit -m "feat(schema): add node role and connection verb/object core fields"
```

---

## Task 2: Profile vocabulary — roles and verbs

**Files:**
- Modify: `packages/schema/src/profile.ts`
- Modify: `packages/schema/src/profiles/c4-backend.ts`
- Modify: `packages/schema/test/profile.test.ts`
- Modify: `packages/schema/test/c4-backend.test.ts`

**Interfaces:**
- Consumes: `NodeSchema.role` from Task 1.
- Produces:
  - `RoleDefSchema` → `{ id: string; description: string; shape: Shape }` where
    `Shape = 'rectangle' | 'person' | 'cylinder' | 'bar' | 'hexagon' | 'titled-rectangle'`
  - `VerbDefSchema` → `{ id: string; class: VerbClass; description: string }` where
    `VerbClass = 'dataAccess' | 'messaging' | 'control' | 'user'`
  - `ProfileSchema` gains `roles: RoleDef[]` and `verbs: VerbDef[]`
  - `NodeKindSchema` gains `role: string` (that kind's default role id)
  - `roleOfNode(profile, node: { type: string; role: string | null }): string` — the node's override, else its kind's default, else `'service'`
  - `roleDefOf(profile, roleId: string): RoleDef | undefined`
  - `verbDefOf(profile, verbId: string): VerbDef | undefined`
  - `verbClassOf(profile, verbId: string): VerbClass | undefined`
- Also: `intent` is deleted from `commonConnectionFields`; `summary` is added to the five non-Code node kinds.

Note `c4Backend` is a typed literal (`export const c4Backend: Profile = {...}`), never `ProfileSchema.parse`d — so Zod defaults do not fill it in. Every field the output type requires must appear in the literal explicitly. That is intentional: a profile should state its vocabulary, not inherit it silently.

- [ ] **Step 1: Write the failing tests**

Append to `packages/schema/test/profile.test.ts`:

```ts
import { roleOfNode, roleDefOf, verbDefOf, verbClassOf } from '../src/profile';
import { c4Backend } from '../src/profiles/c4-backend';

describe('roleOfNode', () => {
  it('uses the node kind default when the node declares no role', () => {
    expect(roleOfNode(c4Backend, { type: 'Component', role: null })).toBe('service');
    expect(roleOfNode(c4Backend, { type: 'Actor', role: null })).toBe('actor');
    expect(roleOfNode(c4Backend, { type: 'ExternalSystem', role: null })).toBe('external');
  });

  it("prefers the node's own role over its kind default", () => {
    expect(roleOfNode(c4Backend, { type: 'Component', role: 'datastore' })).toBe('datastore');
  });

  it('falls back to service for an unknown node type', () => {
    expect(roleOfNode(c4Backend, { type: 'Nope', role: null })).toBe('service');
  });
});

describe('role and verb lookup', () => {
  it('resolves a role to its shape', () => {
    expect(roleDefOf(c4Backend, 'datastore')?.shape).toBe('cylinder');
    expect(roleDefOf(c4Backend, 'actor')?.shape).toBe('person');
    expect(roleDefOf(c4Backend, 'nope')).toBeUndefined();
  });

  it('resolves a verb to its class', () => {
    expect(verbClassOf(c4Backend, 'reads')).toBe('dataAccess');
    expect(verbClassOf(c4Backend, 'publishes')).toBe('messaging');
    expect(verbClassOf(c4Backend, 'uses')).toBe('control');
    expect(verbClassOf(c4Backend, 'views')).toBe('user');
    expect(verbClassOf(c4Backend, 'nope')).toBeUndefined();
  });

  it('exposes the verb description for the LLM and tooltips', () => {
    expect(verbDefOf(c4Backend, 'reads')?.description).toMatch(/\S/);
  });
});
```

Append to `packages/schema/test/c4-backend.test.ts`:

```ts
describe('c4-backend visual vocabulary', () => {
  it('declares a role for every node kind, and every such role exists', () => {
    const roleIds = new Set(c4Backend.roles.map((r) => r.id));
    for (const k of c4Backend.nodeKinds) {
      expect(k.role, `${k.id} has no role`).toBeTruthy();
      expect(roleIds.has(k.role), `${k.id} role "${k.role}" is not declared`).toBe(true);
    }
  });

  it('describes every role and every verb', () => {
    for (const r of c4Backend.roles) expect(r.description).toMatch(/\S/);
    for (const v of c4Backend.verbs) expect(v.description).toMatch(/\S/);
  });

  it('includes the default verb "uses" so a defaulted connection is valid', () => {
    expect(c4Backend.verbs.some((v) => v.id === 'uses')).toBe(true);
  });

  it('covers all four verb classes', () => {
    expect(new Set(c4Backend.verbs.map((v) => v.class)))
      .toEqual(new Set(['dataAccess', 'messaging', 'control', 'user']));
  });

  it('has retired intent', () => {
    expect(c4Backend.commonConnectionFields.some((f) => f.key === 'intent')).toBe(false);
  });

  it('requires summary on the five non-Code kinds and not on Code kinds', () => {
    const summaryOf = (kindId: string) =>
      effectiveFields(c4Backend, kindId, 'node').find((f) => f.key === 'summary');
    for (const k of ['System', 'Actor', 'ExternalSystem', 'Container', 'Component']) {
      expect(summaryOf(k)?.required, `${k} should require summary`).toBe(true);
    }
    for (const k of ['Class', 'Interface', 'Module', 'UIComponent', 'Function']) {
      expect(summaryOf(k), `${k} should not have summary`).toBeUndefined();
    }
  });
});
```

If `effectiveFields` is not already imported in `c4-backend.test.ts`, add it to the existing `../src/profile` import.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @hyphae/schema exec vitest run test/profile.test.ts test/c4-backend.test.ts`
Expected: FAIL — `roleOfNode is not exported`, `c4Backend.roles is undefined`.

- [ ] **Step 3: Extend the profile schema**

In `packages/schema/src/profile.ts`, add after `EnumValueSchema`:

```ts
/** How a role draws. The profile names the shape; the renderer owns the geometry. */
export const ShapeSchema = z.enum([
  'rectangle',         // default service box
  'person',            // an actor
  'cylinder',          // a datastore
  'bar',               // a queue — open-ended bar
  'hexagon',           // an external system
  'titled-rectangle',  // a UI surface — box with a title bar
]);

export const RoleDefSchema = z.object({
  id: z.string(),
  description: z.string(),
  shape: ShapeSchema,
});

export const VerbClassSchema = z.enum(['dataAccess', 'messaging', 'control', 'user']);

export const VerbDefSchema = z.object({
  id: z.string(),
  class: VerbClassSchema,
  description: z.string(),
});
```

Add `role` to `NodeKindSchema`, after `layer`:

```ts
  role: z.string(),          // this kind's default role id (a node may override)
```

Add the vocabularies to `ProfileSchema`, after `connectionKinds`:

```ts
  roles: z.array(RoleDefSchema).default([]),
  verbs: z.array(VerbDefSchema).default([]),
```

Add the inferred types beside the existing ones:

```ts
export type Shape = z.infer<typeof ShapeSchema>;
export type RoleDef = z.infer<typeof RoleDefSchema>;
export type VerbClass = z.infer<typeof VerbClassSchema>;
export type VerbDef = z.infer<typeof VerbDefSchema>;
```

And the helpers, next to `layerOfType`:

```ts
export const roleDefOf = (profile: Profile, roleId: string): RoleDef | undefined =>
  profile.roles.find((r) => r.id === roleId);

export const verbDefOf = (profile: Profile, verbId: string): VerbDef | undefined =>
  profile.verbs.find((v) => v.id === verbId);

export const verbClassOf = (profile: Profile, verbId: string): VerbClass | undefined =>
  verbDefOf(profile, verbId)?.class;

/**
 * The role that decides a node's shape: its own override, else its kind's default,
 * else 'service'. The final fallback keeps an unknown node type renderable rather
 * than blank — validateModel is what reports the unknown type.
 */
export const roleOfNode = (profile: Profile, node: { type: string; role: string | null }): string =>
  node.role ?? profile.nodeKinds.find((k) => k.id === node.type)?.role ?? 'service';
```

- [ ] **Step 4: Declare the vocabulary in c4-backend**

Rewrite `packages/schema/src/profiles/c4-backend.ts`:

```ts
import type { Profile, FieldDef } from '../profile';

const technology: FieldDef = { key: 'technology', type: 'text', description: 'Implementation stack / technology used by this node.' };

/** The one-line purpose shown on the diagram. Required above the Code layer: an unlabeled
 *  box is exactly what this phase exists to eliminate. `description` stays the long form. */
const summary: FieldDef = {
  key: 'summary', type: 'text', required: true,
  description: 'One-line purpose shown on the diagram (aim for under 70 characters). The full explanation belongs in `description`.',
};

export const c4Backend: Profile = {
  id: 'c4-backend',
  layers: ['Context', 'Container', 'Component', 'Code'],
  roles: [
    { id: 'actor', shape: 'person', description: 'A human or external agent that uses the system.' },
    { id: 'service', shape: 'rectangle', description: 'Runs logic — the default for most structural nodes.' },
    { id: 'datastore', shape: 'cylinder', description: 'Persists data (database, cache, file store).' },
    { id: 'queue', shape: 'bar', description: 'Buffers messages between producers and consumers.' },
    { id: 'external', shape: 'hexagon', description: 'A system outside this model’s ownership.' },
    { id: 'ui', shape: 'titled-rectangle', description: 'A user-facing surface (screen, view, widget).' },
  ],
  verbs: [
    { id: 'reads', class: 'dataAccess', description: 'Reads data from the target without changing it.' },
    { id: 'writes', class: 'dataAccess', description: 'Writes data to the target.' },
    { id: 'stores', class: 'dataAccess', description: 'Persists data in the target for later retrieval.' },
    { id: 'modifies', class: 'dataAccess', description: 'Changes data that already exists in the target.' },
    { id: 'aggregates', class: 'dataAccess', description: 'Combines data from the target into a derived view.' },
    { id: 'deletes', class: 'dataAccess', description: 'Removes data from the target.' },
    { id: 'queries', class: 'dataAccess', description: 'Runs a search or filtered lookup against the target.' },
    { id: 'publishes', class: 'messaging', description: 'Emits an event or message to the target.' },
    { id: 'subscribes', class: 'messaging', description: 'Receives events or messages from the target.' },
    { id: 'sends', class: 'messaging', description: 'Sends a directed message to the target.' },
    { id: 'notifies', class: 'messaging', description: 'Informs the target that something happened.' },
    { id: 'invokes', class: 'control', description: 'Calls an operation on the target and uses the result.' },
    { id: 'triggers', class: 'control', description: 'Starts a process or job on the target.' },
    { id: 'requests', class: 'control', description: 'Asks the target for a service or resource.' },
    { id: 'uses', class: 'control', description: 'General dependency — the neutral default when nothing more specific fits.' },
    { id: 'views', class: 'user', description: 'A person looks at information presented by the target.' },
    { id: 'submits', class: 'user', description: 'A person sends input to the target.' },
    { id: 'navigates', class: 'user', description: 'A person moves to the target surface.' },
  ],
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
  ],
  nodeKinds: [
    { id: 'System', category: 'Structure', layer: 'Context', role: 'service', allowedParents: [], allowedChildren: ['Container'], fields: [summary] },
    { id: 'Actor', category: 'Actor', layer: 'Context', role: 'actor', allowedParents: [], allowedChildren: [], fields: [summary] },
    { id: 'ExternalSystem', category: 'Structure', layer: 'Context', role: 'external', allowedParents: [], allowedChildren: [], fields: [summary] },
    { id: 'Container', category: 'Structure', layer: 'Container', role: 'service', allowedParents: ['System'], allowedChildren: ['Component'], fields: [summary, technology] },
    { id: 'Component', category: 'Structure', layer: 'Component', role: 'service', allowedParents: ['Container'], allowedChildren: ['Class', 'Interface', 'Function', 'Module', 'UIComponent'], fields: [summary, technology] },
    { id: 'Class', category: 'Structure', layer: 'Code', role: 'service', allowedParents: ['Component'], allowedChildren: [], fields: [] },
    { id: 'Interface', category: 'Structure', layer: 'Code', role: 'service', allowedParents: ['Component'], allowedChildren: [], fields: [] },
    { id: 'Module', category: 'Structure', layer: 'Code', role: 'service', allowedParents: ['Component'], allowedChildren: [], fields: [] },
    { id: 'UIComponent', category: 'Structure', layer: 'Code', role: 'ui', allowedParents: ['Component'], allowedChildren: [], fields: [] },
    { id: 'Function', category: 'Behavior', layer: 'Code', role: 'service', allowedParents: ['Component'], allowedChildren: [], fields: [] },
  ],
  connectionKinds: [
    { id: 'Dependency', description: 'A depends on / uses B.', fields: [] },
    { id: 'DataFlow', description: 'Data flows from A to B.', fields: [] },
    { id: 'Realization', description: 'A realizes/implements an interface defined by B.', fields: [] },
    { id: 'Trace', description: 'Traceability link (e.g. a requirement traced to its implementation).', fields: [] },
  ],
};

export { layerOfType, allowedParentTypes, allowedChildTypes, topLevelTypes, typesForLayer } from '../profile';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @hyphae/schema exec vitest run test/profile.test.ts test/c4-backend.test.ts`
Expected: PASS.

- [ ] **Step 6: Type-check and fix fallout**

Run all three type-checks. Anything constructing a `Profile` or a `NodeKind` literal in a test now needs a `role`. Fix minimally and report each file.

- [ ] **Step 7: Run the full suite and commit**

```bash
pnpm -r test
git add packages/schema
git commit -m "feat(schema): declare role and verb vocabularies, retire intent, require summary"
```

---

## Task 3: Validate roles and verbs

**Files:**
- Modify: `packages/schema/src/validate.ts`
- Modify: `packages/schema/test/validate.test.ts`

**Interfaces:**
- Consumes: `roleDefOf`, `verbDefOf` from Task 2; `NodeSchema.role`, `ConnectionSchema.verb` from Task 1.
- Produces: `Issue['kind']` gains `'unknown-role' | 'unknown-verb'`. No signature change to `validateModel`.

Rules:
- `unknown-role` — a node's `role` is non-null and is not a declared role id. A `null` role is always fine (it means "use the kind default").
- `unknown-verb` — a connection's `verb` is not a declared verb id. Because `verb` always has a value after parse, this always applies; the default `uses` is declared, so a defaulted connection is valid.

- [ ] **Step 1: Write the failing tests**

Append to `packages/schema/test/validate.test.ts`:

```ts
describe('role and verb validation', () => {
  const base = { root: null, role: null, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: { summary: 's' } };
  const edge = { verb: 'uses', object: '', description: '', direction: 'Unidirectional' as const, realizedBy: [], codeRefs: [], fields: {} };

  function model(): HyphaeModel {
    const m = emptyModel();
    m.nodes.push(
      { ...base, id: 'sys', name: 'Sys', type: 'System', parentId: null, description: 'd' },
      { ...base, id: 'c', name: 'C', type: 'Container', parentId: 'sys', description: 'd' },
      { ...base, id: 'k1', name: 'K1', type: 'Component', parentId: 'c', description: 'd' },
      { ...base, id: 'k2', name: 'K2', type: 'Component', parentId: 'c', description: 'd' },
    );
    m.connections.push({ ...edge, id: 'e1', from: 'k1', to: 'k2', type: 'Dependency' });
    return m;
  }

  it('accepts a null role and the default verb', () => {
    expect(validateModel(model(), c4Backend)).toEqual([]);
  });

  it('accepts a declared role override and a declared verb', () => {
    const m = model();
    m.nodes[2].role = 'datastore';
    m.connections[0].verb = 'reads';
    expect(validateModel(m, c4Backend)).toEqual([]);
  });

  it('flags an undeclared role', () => {
    const m = model();
    m.nodes[2].role = 'wormhole';
    const issues = validateModel(m, c4Backend).filter((i) => i.kind === 'unknown-role');
    expect(issues).toHaveLength(1);
    expect(issues[0].ref).toBe('k1');
    expect(issues[0].message).toMatch(/wormhole/);
  });

  it('flags an undeclared verb', () => {
    const m = model();
    m.connections[0].verb = 'yeets';
    const issues = validateModel(m, c4Backend).filter((i) => i.kind === 'unknown-verb');
    expect(issues).toHaveLength(1);
    expect(issues[0].ref).toBe('e1');
    expect(issues[0].message).toMatch(/yeets/);
  });

  it('reports a missing summary on a Component', () => {
    const m = model();
    m.nodes[2].fields = {};
    const issues = validateModel(m, c4Backend).filter((i) => i.kind === 'missing-required-field');
    expect(issues).toHaveLength(1);
    expect(issues[0].ref).toBe('k1');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @hyphae/schema exec vitest run test/validate.test.ts`
Expected: FAIL — the `unknown-role` / `unknown-verb` filters return empty.

- [ ] **Step 3: Implement**

In `packages/schema/src/validate.ts`, extend the import:

```ts
import { isDirectoryRef, resolveRoot } from './ref';
import { effectiveFields, roleDefOf, verbDefOf } from './profile';
```

(keep whatever `effectiveFields` import already exists — merge, do not duplicate)

Extend the `Issue` union:

```ts
    | 'unanchored-ref' | 'bad-root'
    | 'unknown-role' | 'unknown-verb';
```

In the node loop of `validateModel`, after the existing `validateRefs` push:

```ts
    if (n.role !== null && !roleDefOf(profile, n.role)) {
      issues.push({ kind: 'unknown-role', ref: n.id, message: `Unknown role "${n.role}"` });
    }
```

In the connection loop, after the `unknown-connection-kind` guard's `continue` (so it runs for connections whose type is known), add:

```ts
    if (!verbDefOf(profile, c.verb)) {
      issues.push({ kind: 'unknown-verb', ref: c.id, message: `Unknown verb "${c.verb}"` });
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @hyphae/schema exec vitest run test/validate.test.ts`
Expected: PASS.

- [ ] **Step 5: Record the fixture's issue profile (do NOT modify the fixture)**

```bash
SCRATCH="C:/Users/qwert/AppData/Local/Temp/claude/C--projects-hyphae/2e553ec9-4405-46ea-bfcb-3f31a0f75e26/scratchpad"
cd apps/server && cat > "$SCRATCH/issues.ts" <<'EOF'
import { readFileSync } from 'node:fs';
import { HyphaeModelSchema, validateModel, resolveProfile } from '@hyphae/schema';
const m = HyphaeModelSchema.parse(JSON.parse(readFileSync('hyphae-cctv-new.json','utf8')));
const by: Record<string, number> = {};
for (const i of validateModel(m, resolveProfile(m))) by[i.kind] = (by[i.kind] ?? 0) + 1;
console.log(by);
EOF
pnpm exec tsx "$SCRATCH/issues.ts"
```

Expected roughly: `{ 'unanchored-ref': 328, 'unknown-field': 517, 'missing-required-field': 105 }` and **no** `unknown-verb` (every connection defaulted to the declared `uses`). Record the actual numbers in the commit message. `unknown-verb: 0` is the check that matters — a non-zero value means the default verb is not in the vocabulary.

Confirm `git status` shows no modified `.json`.

- [ ] **Step 6: Run the full suite and commit**

```bash
pnpm -r test
git add packages/schema
git commit -m "feat(schema): validate node role and connection verb against the profile"
```

---

## Task 4: Surface role, verb, and object over MCP

**Files:**
- Modify: `apps/server/src/mcp.ts`
- Modify: `apps/server/test/mcp.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–3.
- Produces: `role` writable in the node shapes; `verb`/`object` writable in the connection shapes.

`describe_profile` returns `c4Backend` wholesale, so `roles` and `verbs` reach the LLM automatically once Task 2 lands — no change needed there. The write shapes are what still need the fields, and the descriptions are what teach the model to fill them.

Local convention: the MCP layer is an HTTP client of the running server; tool impls live in `buildTools(api)` and read via `await api.getModel()`. There is no in-process store.

- [ ] **Step 1: Write the failing test**

`apps/server/test/mcp.test.ts` uses `buildTools(fakeApi(over))` — there is no store; you assert by capturing what the fake API receives. Append:

```ts
describe('role/verb/object reach the API', () => {
  it('forwards a node role through create_nodes', async () => {
    const seen: Record<string, unknown>[] = [];
    const tools = buildTools(fakeApi({
      createNode: async (input) => { seen.push(input as Record<string, unknown>); return { node: { id: 'n1', ...(input as object) }, version: 1 }; },
    }));
    await tools.create_nodes({ nodes: [
      { name: 'Clips', type: 'Component', parentId: null, role: 'datastore', fields: { summary: 'Stores clips' } },
    ] });
    expect(seen[0]).toMatchObject({ role: 'datastore', fields: { summary: 'Stores clips' } });
  });

  it('forwards verb and object through create_connections', async () => {
    const seen: Record<string, unknown>[] = [];
    const tools = buildTools(fakeApi({
      createConnection: async (input) => { seen.push(input as Record<string, unknown>); return { connection: { id: 'c1', ...(input as object) }, version: 1 }; },
    }));
    await tools.create_connections({ connections: [
      { from: 'api', to: 'api', type: 'Dependency', verb: 'reads', object: 'camera list' },
    ] });
    expect(seen[0]).toMatchObject({ verb: 'reads', object: 'camera list' });
  });

  it('forwards a role change through update_nodes', async () => {
    const seen: Record<string, unknown>[] = [];
    const tools = buildTools(fakeApi({
      updateNode: async (id, patch) => { seen.push(patch as Record<string, unknown>); return { node: { id, ...(patch as object) }, version: 1 }; },
    }));
    await tools.update_nodes({ updates: [{ id: 'api', role: 'queue' }] });
    expect(seen[0]).toMatchObject({ role: 'queue' });
  });
});
```

**Know what this test does and does not cover.** `buildTools` forwards its argument straight to the API, so these prove the plumbing carries the fields but do **not** prove they are in the MCP zod input shape — that shape is enforced by `server.registerTool` at the protocol layer, which these tests never exercise. Step 5's live HTTP check is what covers the shape. Do not claim otherwise in your report.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hyphae/server exec vitest run test/mcp.test.ts`
Expected: these three FAIL only if `runCreate`/`runVoid` filter unknown keys. If they pass immediately because the tool forwards everything blindly, say so plainly in your report and treat Step 5 as the real gate for this task — do not weaken or delete the tests to manufacture a red-then-green cycle.

- [ ] **Step 3: Add the fields to the write shapes**

In `apps/server/src/mcp.ts`, add `role` to `coreNodeFields`:

```ts
    role: z.string().nullable().optional()
      .describe('Archetype that decides this node\'s shape on the diagram — a role id from describe_profile (actor, service, datastore, queue, external, ui). Omit or null to use the node kind\'s default. Set it when a Component is really a database, cache, or queue: that is where the diagram gains meaning, since every Component defaults to a plain service box.'),
```

Add `verb` and `object` to `coreConnFields`:

```ts
    verb: z.string().optional()
      .describe('The business action this edge performs — a verb id from describe_profile (reads, writes, publishes, invokes, views, …). Shown on the diagram and colored by verb class. Defaults to "uses"; pick something more specific whenever one fits, because "uses" carries almost no information.'),
    object: z.string().optional()
      .describe('What the action acts on — a short noun such as "camera list" or "clip". Rendered after the verb ("reads camera list"). Keep it under about 24 characters so the label stays readable.'),
```

Update the `create_nodes` tool description to mention `summary` is required, since an LLM that does not fill it now gets a 422:

```ts
    description: "Create one OR MANY nodes in a single call. Pass an array (a single write is a one-element array). Call describe_profile first. Each item: name, type (a profile node kind), parentId, and domain values in `fields` — `fields.summary` is REQUIRED on System/Actor/ExternalSystem/Container/Component and is the one-line purpose shown on the diagram. Optionally set `role` to override the shape. Containment: Component→Container, Container→System, Code (Class/Interface/Function/Module/UIComponent)→Component. Best-effort: returns {ids:[...]} if all succeed, else {results:[{id}|{issues}]} aligned to input order.",
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @hyphae/server exec vitest run test/mcp.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify end to end against a running server**

```bash
pnpm --filter @hyphae/server dev &
sleep 3
curl -s --noproxy '*' -X POST localhost:5173/api/nodes -H 'content-type: application/json' \
  -d '{"name":"Probe","type":"Component","parentId":null,"role":"datastore","fields":{"summary":"probe"}}'
```

Expected: success, echoing `"role":"datastore"`. Then confirm a bad role is rejected:

```bash
curl -s --noproxy '*' -X POST localhost:5173/api/nodes -H 'content-type: application/json' \
  -d '{"name":"Probe2","type":"Component","parentId":null,"role":"wormhole","fields":{"summary":"probe"}}'
```

Expected: `422` carrying an `unknown-role` issue. Check the real port in `apps/server/src/index.ts` if 5173 is wrong; `--noproxy '*'` matters because a global `HTTP_PROXY` otherwise routes localhost externally. Delete both probes afterwards and confirm `git status` leaves `apps/server/hyphae.json` unmodified. If the server cannot be started here, say so plainly and substitute a scripted call — do not claim curl output you did not see.

- [ ] **Step 6: Full suite, type-check, commit**

```bash
pnpm -r test
git add -u apps/server
git commit -m "feat(server): surface role, verb, and object in the MCP write shapes"
```

---

## Task 5: Role shapes and the three-line node

**Files:**
- Create: `apps/web/src/shapes.ts`
- Modify: `apps/web/src/NodeBox.tsx`
- Modify: `apps/web/src/GhostNode.tsx`
- Modify: `apps/web/src/layout.ts`
- Modify: `apps/web/src/flow.ts`
- Modify: `apps/web/test/SidePanel.test.tsx` / `apps/web/test/Canvas.test.tsx` as type fallout requires
- Test: `apps/web/test/shapes.test.ts` (create)

**Interfaces:**
- Consumes: `roleOfNode`, `roleDefOf`, `c4Backend`, `type Shape` from Task 2.
- Produces:
  - `apps/web/src/shapes.ts` → `shapeStyle(shape: Shape): CSSProperties` and `SHAPE_LABEL: Record<Shape, string>`
  - `NodeBox`/`GhostNode` `data` gains `{ name, summary, technology, shape }` alongside the existing `color`
  - `NODE_W` 160 → 190, `NODE_H` 44 → 64

The renderer must key off the **shape name from the profile**, never off a node type or role id, so a new profile with different roles renders without touching the web app.

Shapes are done with CSS on the existing div — `borderRadius` for the cylinder, `clipPath` for the hexagon, a top border band for the titled rectangle, squared open sides for the bar. This keeps the floating-edge anchoring and the existing handle setup working unchanged, which switching to raw SVG nodes would break.

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/shapes.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { shapeStyle, SHAPE_LABEL } from '../src/shapes';
import { c4Backend } from '@hyphae/schema';

describe('shapeStyle', () => {
  it('returns a distinct style for every shape the profile can name', () => {
    const shapes = [...new Set(c4Backend.roles.map((r) => r.shape))];
    const seen = new Set<string>();
    for (const s of shapes) {
      const style = JSON.stringify(shapeStyle(s));
      expect(style, `${s} produced an empty style`).not.toBe('{}');
      expect(seen.has(style), `${s} is visually identical to another shape`).toBe(false);
      seen.add(style);
    }
  });

  it('gives the cylinder rounded ends and the hexagon a clip path', () => {
    expect(shapeStyle('cylinder').borderRadius).toBeTruthy();
    expect(shapeStyle('hexagon').clipPath).toBeTruthy();
  });

  it('names every shape for the legend', () => {
    for (const r of c4Backend.roles) expect(SHAPE_LABEL[r.shape]).toMatch(/\S/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hyphae/web exec vitest run test/shapes.test.ts`
Expected: FAIL — cannot resolve `../src/shapes`.

- [ ] **Step 3: Create the shape module**

Create `apps/web/src/shapes.ts`:

```ts
import type { CSSProperties } from 'react';
import type { Shape } from '@hyphae/schema';

/**
 * Geometry for a profile-declared shape name. The profile names the shape; this module owns
 * how it draws. Keyed by shape — never by role id or node type — so a new profile with a
 * different role vocabulary renders without touching the web app.
 *
 * Implemented as CSS on the existing node div rather than SVG so the floating-edge anchoring
 * and invisible side handles keep working unchanged.
 */
export function shapeStyle(shape: Shape): CSSProperties {
  switch (shape) {
    case 'cylinder':
      return { borderRadius: '50% / 16px' };
    case 'person':
      return { borderRadius: '50% 50% 8px 8px' };
    case 'bar':
      return { borderRadius: 0, borderLeftWidth: 4, borderRightWidth: 4, borderLeftStyle: 'solid', borderRightStyle: 'solid' };
    case 'hexagon':
      return { clipPath: 'polygon(8% 0, 92% 0, 100% 50%, 92% 100%, 8% 100%, 0 50%)', borderRadius: 0 };
    case 'titled-rectangle':
      return { borderRadius: 4, borderTopWidth: 8, borderTopStyle: 'solid' };
    case 'rectangle':
    default:
      return { borderRadius: 4 };
  }
}

/** Human-readable shape names for the legend. */
export const SHAPE_LABEL: Record<Shape, string> = {
  rectangle: 'service',
  person: 'actor',
  cylinder: 'datastore',
  bar: 'queue',
  hexagon: 'external system',
  'titled-rectangle': 'UI surface',
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @hyphae/web exec vitest run test/shapes.test.ts`
Expected: PASS.

- [ ] **Step 5: Grow the node box**

In `apps/web/src/layout.ts`:

```ts
export const NODE_W = 190;
export const NODE_H = 64;
```

- [ ] **Step 6: Render the three-line body**

Replace the body of `apps/web/src/NodeBox.tsx` (keep the `sides` array and the `Handle` mapping exactly as they are):

```tsx
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { Shape } from '@hyphae/schema';
import { shapeStyle } from './shapes';

// Invisible, non-interactive side handles kept only so floating edges can anchor to the node
// (React Flow drops edges whose endpoint exposes no handle). Connection-by-dragging is disabled,
// so the dots are hidden.
const sides: Array<{ id: string; position: Position }> = [
  { id: 't', position: Position.Top },
  { id: 'r', position: Position.Right },
  { id: 'b', position: Position.Bottom },
  { id: 'l', position: Position.Left },
];

export type NodeBoxData = {
  name?: string;
  summary?: string;
  technology?: string;
  shape?: Shape;
  color?: { bg: string; border: string };
};

export function NodeBox({ data }: NodeProps) {
  const d = data as NodeBoxData;
  const color = d.color ?? { bg: '#fff', border: '#b1b1b7' };
  return (
    <div
      style={{
        width: 190,
        height: 64,
        padding: '6px 10px',
        boxSizing: 'border-box',
        border: `1px solid ${color.border}`,
        borderColor: color.border,
        background: color.bg,
        fontSize: 12,
        lineHeight: 1.25,
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 2,
        overflow: 'hidden',
        ...shapeStyle(d.shape ?? 'rectangle'),
      }}
    >
      {sides.map((s) => (
        <Handle key={s.id} id={s.id} type="source" position={s.position} style={{ opacity: 0, pointerEvents: 'none' }} />
      ))}
      <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name ?? ''}</div>
      {d.summary && (
        <div style={{ fontSize: 10, color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {d.summary}
        </div>
      )}
      {d.technology && (
        <div style={{ fontSize: 9, color: '#334155', background: 'rgba(0,0,0,0.06)', borderRadius: 3, padding: '0 4px', alignSelf: 'center', maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {d.technology}
        </div>
      )}
    </div>
  );
}
```

Apply the same three-line body to `apps/web/src/GhostNode.tsx`, keeping its distinguishing treatment — `border: 1.5px dashed`, `color: '#475569'`, `fontStyle: 'italic'`, `position: 'relative'`, and the existing expand `＋` button — and adding `...shapeStyle(d.shape ?? 'rectangle')` to its style object. Its `data` type extends `NodeBoxData` with `expandable?: boolean`.

- [ ] **Step 7: Feed the new data from flow.ts**

In `apps/web/src/flow.ts`, extend the existing `@hyphae/schema` import — `flow.ts` computes the
shape *name* and passes it in `data`; the renderers call `shapeStyle` themselves, so do **not**
import `shapeStyle` here:

```ts
import { c4Backend, layerOfType, roleOfNode, roleDefOf, type Node as ModelNode } from '@hyphae/schema';
```

Add a helper next to `layerColorOf`:

```ts
/** The node data every node renderer reads: name, the on-diagram purpose, tech chip, and shape. */
export function nodeVisual(n: ModelNode) {
  const shape = roleDefOf(c4Backend, roleOfNode(c4Backend, n))?.shape ?? 'rectangle';
  const summary = typeof n.fields.summary === 'string' ? n.fields.summary : '';
  const technology = typeof n.fields.technology === 'string' ? n.fields.technology : '';
  return { name: n.name, summary, technology, shape, color: layerColorOf(n.type) };
}
```

Replace the three `data:` literals that currently build `` `${n.name}\n(${n.type})` ``:

```ts
    // focus node with no children
      data: nodeVisual(view.focusNode),
```
```ts
  for (const n of view.children) {
    nodes.push({ id: n.id, type: 'node', position: pos[n.id] ?? { x: 0, y: 0 }, data: nodeVisual(n), initialWidth: NODE_W, initialHeight: NODE_H, draggable: false });
  }
  for (const n of view.externals) {
    nodes.push({ id: n.id, type: 'ghost', position: pos[n.id] ?? { x: 0, y: 0 }, data: { ...nodeVisual(n), expandable: view.expandableExternalIds?.has(n.id) ?? false }, initialWidth: NODE_W, initialHeight: NODE_H, draggable: false });
  }
```

- [ ] **Step 8: Fix web tests that assert the old label**

Existing tests assert on the `name\n(type)` label text. Update those assertions to the new structure — a test that looked for `'Alpha\n(Component)'` should look for `'Alpha'`. Do not delete a test to make it pass; adjust its expectation and say which you changed.

Run: `pnpm --filter @hyphae/web exec vitest run`
Expected: PASS.

- [ ] **Step 9: Full suite, type-check, commit**

```bash
pnpm -r test
# -u alone stages only tracked files, so name this task's two NEW files explicitly.
git add -u apps/web
git add apps/web/src/shapes.ts apps/web/test/shapes.test.ts
git status --short          # confirm no .json is staged before committing
git commit -m "feat(web): render role shapes with name, purpose, and tech chip"
```

---

## Task 6: Verb-labeled, verb-colored edges

**Files:**
- Modify: `apps/web/src/focusView.ts`
- Modify: `apps/web/src/flow.ts`
- Modify: `apps/web/test/focusView.test.ts`

**Interfaces:**
- Consumes: `verbClassOf` from Task 2; `Connection.verb`/`object` from Task 1.
- Produces:
  - `FocusEdge` gains `verb?: string` and `object?: string` (populated only for a 1:1 real edge, like the existing `kind` and `direction`)
  - `flow.ts` exports `VERB_CLASS_COLOR: Record<VerbClass, string>` and `edgeLabel(verb, object): string`

Derived rollup edges keep their purple dashed treatment and count label — they aggregate several connections with potentially different verbs, so a single verb label would be a lie.

- [ ] **Step 1: Write the failing test**

Append to `apps/web/test/focusView.test.ts`:

```ts
import { edgeLabel, VERB_CLASS_COLOR } from '../src/flow';

describe('edge labels', () => {
  it('joins verb and object', () => {
    expect(edgeLabel('reads', 'camera list')).toBe('reads camera list');
  });

  it('degrades to the verb alone when there is no object', () => {
    expect(edgeLabel('publishes', '')).toBe('publishes');
  });

  it('caps a long object so the label stays readable', () => {
    const label = edgeLabel('reads', 'an extremely long object name that would wreck the layout');
    expect(label.length).toBeLessThanOrEqual(36);
    expect(label.endsWith('…')).toBe(true);
  });

  it('has a colour for every verb class', () => {
    for (const c of ['dataAccess', 'messaging', 'control', 'user'] as const) {
      expect(VERB_CLASS_COLOR[c]).toMatch(/^#/);
    }
  });
});
```

Also append a test that the verb reaches the edge. This file already has a `model()` helper and calls `buildFocusView(model(), null)` with two arguments — match that exactly:

```ts
describe('buildFocusView — verb and object', () => {
  it('carries verb and object onto a 1:1 edge', () => {
    const m = model();
    m.connections[0].verb = 'reads';
    m.connections[0].object = 'clips';
    const v = buildFocusView(m, null);
    const e = v.edges.find((x) => !x.derived && x.count === 1);
    expect(e).toMatchObject({ verb: 'reads', object: 'clips' });
  });

  it('leaves verb undefined on a derived edge, which aggregates several verbs', () => {
    const v = buildFocusView(model(), null);
    for (const e of v.edges.filter((x) => x.derived)) expect(e.verb).toBeUndefined();
  });
});
```

This file's shared `e` const (line 6) builds connection literals, so it needs the new keys:

```ts
const e = { verb: 'uses', object: '', description: '', direction: 'Unidirectional' as const, realizedBy: [], codeRefs: [], fields: {} };
```

and its `base` const (line 5) needs `role: null`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hyphae/web exec vitest run test/focusView.test.ts`
Expected: FAIL — `edgeLabel is not exported`.

- [ ] **Step 3: Carry verb/object through the focus view**

In `apps/web/src/focusView.ts`, extend `FocusEdge`:

```ts
export type FocusEdge = {
  id: string;
  from: string;
  to: string;
  kind: string | null; // connection type for a 1:1 real edge; null when aggregated
  count: number;       // underlying connections represented
  derived: boolean;    // aggregated/collapsed (dashed) edge
  realizedBy: string[]; // ids of the model connections this edge represents (length === count)
  direction?: string;  // the connection's direction for a real edge (e.g. 'Bidirectional')
  verb?: string;       // the connection's verb for a 1:1 real edge
  object?: string;     // the connection's object for a 1:1 real edge
};
```

Find the `Pair.direct` type (around line 178) and add the two fields, then populate them wherever `direct` is built and wherever a real (non-derived) `FocusEdge` is emitted:

```ts
    direct?: { id: string; kind: string; from: string; to: string; direction: string; verb: string; object: string };
```

Set `verb: c.verb, object: c.object` at the site that assigns `direct` from a connection `c`, and pass them through to the emitted edge alongside the existing `kind` and `direction`.

- [ ] **Step 4: Label and color the edge**

In `apps/web/src/flow.ts`, add the import and the two exports:

```ts
import { c4Backend, layerOfType, roleOfNode, roleDefOf, verbClassOf, type VerbClass, type Node as ModelNode } from '@hyphae/schema';
```

```ts
/** Verb classes get distinct colors. Violet is deliberately absent — it already means
 *  "derived rollup edge" here and in the legend, and one color should mean one thing. */
export const VERB_CLASS_COLOR: Record<VerbClass, string> = {
  dataAccess: '#0369a1',
  messaging: '#b45309',
  control: '#475569',
  user: '#be185d',
};

const OBJECT_CAP = 24;

/** "reads camera list" — the verb, plus the object when there is one, capped so a long
 *  object cannot wreck the layout. */
export function edgeLabel(verb: string, object: string): string {
  const obj = object.trim();
  if (!obj) return verb;
  const clipped = obj.length > OBJECT_CAP ? `${obj.slice(0, OBJECT_CAP - 1)}…` : obj;
  return `${verb} ${clipped}`;
}
```

Replace `realEdge`:

```ts
function realEdge(e: FocusEdge): FlowEdge {
  const verb = e.verb ?? 'uses';
  const color = VERB_CLASS_COLOR[verbClassOf(c4Backend, verb) ?? 'control'];
  return {
    id: e.id,
    type: 'floating',
    source: e.from,
    target: e.to,
    label: edgeLabel(verb, e.object ?? ''),
    style: { stroke: color },
    labelStyle: { fill: color, fontWeight: 500 },
    ...markers(e.direction, color),
  };
}
```

Leave `derivedEdge` exactly as it is.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @hyphae/web exec vitest run`
Expected: PASS. Any existing test asserting an edge label of `'Dependency'` must be updated to `'uses'` — say which you changed.

- [ ] **Step 6: Full suite, type-check, commit**

```bash
pnpm -r test
git add -u apps/web
git commit -m "feat(web): label edges with verb and object, colored by verb class"
```

---

## Task 7: Legend and side-panel split

**Files:**
- Modify: `apps/web/src/Legend.tsx`
- Modify: `apps/web/src/SidePanel.tsx`
- Modify: `apps/web/test/SidePanel.test.tsx`

**Interfaces:**
- Consumes: `SHAPE_LABEL`/`shapeStyle` (Task 5), `VERB_CLASS_COLOR` (Task 6), `c4Backend.roles`/`verbs` (Task 2).
- Produces: no new exports.

The panel reorganizes into **On diagram** (what a reader sees on the canvas) and **Detail** (everything else). This is a regrouping of existing controls plus `role`, `verb`, and `object` — not a rewrite, and every existing `aria-label` must survive because the tests select by accessible label.

- [ ] **Step 1: Update the API mock, then write the failing test**

`apps/web/test/SidePanel.test.tsx` has no render helper — each test does
`await useStore.getState().addNode('Component'); render(<SidePanel />);` and asserts inside
`waitFor`. It also `vi.mock`s `../src/api` at the top of the file, and that mock's object
literals must gain the new fields or the store round-trip drops them. Update the mock first:

```ts
  const base = (over: Record<string, unknown>) => ({
    id: 'x', name: 'X', type: 'Component', description: '', parentId: null, root: null, role: null,
    codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {}, ...over,
  });
```

and in the mocked `updateConnection`, add `verb: 'uses', object: '',` before the `...patch` spread:

```ts
    updateConnection: vi.fn(async (id: string, patch: Record<string, unknown>) => ({ connection: { id, from: 'a', to: 'b', type: 'Dependency', verb: 'uses', object: '', description: '', direction: 'Unidirectional', realizedBy: [], codeRefs: [], fields: {}, ...patch }, version: ++v })),
```

Then append the tests, following the file's existing `addNode` + `waitFor` idiom:

```tsx
  it('edits a node role', async () => {
    await useStore.getState().addNode('Component');
    render(<SidePanel />);
    fireEvent.change(screen.getByLabelText('role') as HTMLSelectElement, { target: { value: 'datastore' } });
    await waitFor(() => expect(useStore.getState().model.nodes[0].role).toBe('datastore'));
  });

  it('clears a role back to the kind default', async () => {
    await useStore.getState().addNode('Component');
    render(<SidePanel />);
    fireEvent.change(screen.getByLabelText('role') as HTMLSelectElement, { target: { value: 'datastore' } });
    await waitFor(() => expect(useStore.getState().model.nodes[0].role).toBe('datastore'));
    fireEvent.change(screen.getByLabelText('role') as HTMLSelectElement, { target: { value: '' } });
    await waitFor(() => expect(useStore.getState().model.nodes[0].role).toBe(null));
  });

  it('edits the summary shown on the diagram', async () => {
    await useStore.getState().addNode('Component');
    render(<SidePanel />);
    fireEvent.change(screen.getByLabelText('summary') as HTMLInputElement, { target: { value: 'Stores clips' } });
    await waitFor(() => expect(useStore.getState().model.nodes[0].fields.summary).toBe('Stores clips'));
  });
```

For the connection controls, find how this file already selects a connection (it has existing
connection-panel tests — reuse that exact setup) and add:

```tsx
  it('edits a connection verb and object', async () => {
    // ...this file's existing connection selection setup...
    render(<SidePanel />);
    fireEvent.change(screen.getByLabelText('verb') as HTMLSelectElement, { target: { value: 'reads' } });
    await waitFor(() => expect(useStore.getState().model.connections[0].verb).toBe('reads'));
    fireEvent.change(screen.getByLabelText('object') as HTMLInputElement, { target: { value: 'clips' } });
    await waitFor(() => expect(useStore.getState().model.connections[0].object).toBe('clips'));
  });
```

If no connection-panel test exists in this file, build the selection the same way the
`ConnectionList.test.tsx` tests do rather than inventing a new pattern.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hyphae/web exec vitest run test/SidePanel.test.tsx`
Expected: FAIL — `Unable to find a label with the text of: role`.

- [ ] **Step 3: Add the controls and the split**

In `apps/web/src/SidePanel.tsx`, in the node branch, put an `<h3>On diagram</h3>` before `name` and add the role control after `name`:

```tsx
        <label className="field" title="Shape archetype. Empty = this node kind's default.">
          <span>role</span>
          <select aria-label="role" value={node.role ?? ''}
            onChange={(e) => updateNode(node.id, { role: e.target.value || null })}>
            <option value="">(kind default)</option>
            {c4Backend.roles.map((r) => <option key={r.id} value={r.id} title={r.description}>{r.id}</option>)}
          </select></label>
```

Move `description`, `codeRefs`, `docRefs`, `root`, and the parent selector below an `<h3>Detail</h3>`. Keep `summary` and `technology` above it — they are rendered by the existing `effectiveFields` map, so split that map into the on-diagram keys and the rest:

```tsx
        {effectiveFields(c4Backend, node.type, 'node')
          .filter((def) => def.key === 'summary' || def.key === 'technology')
          .map((def) => (
            <FieldInput key={def.key} def={def} value={node.fields[def.key]} nodes={nodes} onChange={(v) => setField(def.key, v)} />
          ))}
        <h3>Detail</h3>
        {effectiveFields(c4Backend, node.type, 'node')
          .filter((def) => def.key !== 'summary' && def.key !== 'technology')
          .map((def) => (
            <FieldInput key={def.key} def={def} value={node.fields[def.key]} nodes={nodes} onChange={(v) => setField(def.key, v)} />
          ))}
```

In the connection branch, add `verb` and `object` under an `<h3>On diagram</h3>` before `type`:

```tsx
        <label className="field" title="The business action shown on the edge.">
          <span>verb</span>
          <select aria-label="verb" value={conn.verb}
            onChange={(e) => updateConnection(conn.id, { verb: e.target.value })}>
            {c4Backend.verbs.map((v) => <option key={v.id} value={v.id} title={v.description}>{v.id}</option>)}
          </select></label>
        <label className="field" title="Short noun the action acts on, e.g. &quot;camera list&quot;.">
          <span>object</span>
          <input aria-label="object" value={conn.object}
            onChange={(e) => updateConnection(conn.id, { object: e.target.value })} /></label>
```

and put `<h3>Detail</h3>` before `description`.

- [ ] **Step 4: Extend the legend**

In `apps/web/src/Legend.tsx`, add two sections after the existing Layers block, reusing the profile so nothing is hardcoded:

```tsx
          <div style={{ fontWeight: 600, margin: '6px 0 2px' }}>Roles</div>
          {c4Backend.roles.map((r) => (
            <div key={r.id} title={r.description}>
              <span style={{ display: 'inline-block', width: 14, height: 12, marginRight: 6, verticalAlign: 'middle', background: '#f8fafc', border: '1px solid #64748b', ...shapeStyle(r.shape) }} />
              {SHAPE_LABEL[r.shape]}
            </div>
          ))}
          <div style={{ fontWeight: 600, margin: '6px 0 2px' }}>Edge verbs</div>
          {(['dataAccess', 'messaging', 'control', 'user'] as const).map((cls) => (
            <div key={cls}>
              <span style={{ ...line(false), borderColor: VERB_CLASS_COLOR[cls] }} />
              {cls} — {c4Backend.verbs.filter((v) => v.class === cls).map((v) => v.id).slice(0, 3).join(', ')}…
            </div>
          ))}
```

with imports:

```tsx
import { c4Backend } from '@hyphae/schema';
import { LAYER_COLOR, VERB_CLASS_COLOR } from './flow';
import { shapeStyle, SHAPE_LABEL } from './shapes';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @hyphae/web exec vitest run`
Expected: PASS.

- [ ] **Step 6: Look at it**

```bash
pnpm --filter @hyphae/server dev &
pnpm --filter @hyphae/web dev &
sleep 4
```

Open the web app, load a model with a few nodes, and confirm by eye: role shapes are distinguishable, the purpose line and tech chip fit inside the box without clipping the name, edge labels read as `verb object`, and the legend explains every shape and color actually on screen. Report what you saw — including anything that looks wrong at realistic node counts, especially label crowding on a high-degree node. If you cannot run a browser here, say so plainly rather than claiming a visual check you did not perform.

- [ ] **Step 7: Full suite, type-check, commit**

```bash
pnpm -r test
git add -u apps/web
git commit -m "feat(web): split panel into on-diagram vs detail, extend legend"
```

---

## Task 8: Teach the modeling skill the visual vocabulary

**Files:**
- Modify: `plugins/hyphae-modeling/skills/building-architecture-models/SKILL.md`
- Modify: `plugins/hyphae-modeling/skills/building-architecture-models/references/subagent-prompt.md`

**Interfaces:**
- Consumes: the shipped behavior of Tasks 1–7.
- Produces: no code.

Without this, agents keep writing `intent` (now an `unknown-field` error), omit `summary` (now a `missing-required-field` error), and leave every edge labeled `uses` — which defeats the phase.

- [ ] **Step 1: Find every place the skill teaches connection or node fields**

```bash
grep -rn "intent\|transport\|fields\|description" plugins/hyphae-modeling/ --include=*.md
```

- [ ] **Step 2: Update SKILL.md**

Add a section next to *Refs and roots*:

````markdown
## The visual vocabulary

The diagram is meant to be readable without opening the side panel, which puts three
obligations on every write. Call `describe_profile` for the exact vocabularies.

- **`fields.summary` is required** on System / Actor / ExternalSystem / Container / Component.
  One line, under ~70 characters, saying what the thing is *for* — it is what the node shows on
  the canvas. `description` is still where the long explanation goes; it is side-panel only.
  Omitting `summary` is a `missing-required-field` issue.
- **Every connection carries a `verb`** from the profile's verb vocabulary, plus a short
  `object` noun where one applies — "reads camera list", "publishes frame". The verb defaults to
  `uses`, which renders but says nothing; a diagram full of `uses` is the failure mode this
  replaces. Pick the specific verb.
- **Set `role`** when a Component is really a datastore, a queue, an external system, or a UI
  surface. Otherwise leave it unset and it inherits its node kind's default shape.

`intent` no longer exists — it was 73% the generic `Use`. Use `verb` instead. Writing `intent`
is now an `unknown-field` issue.
````

Add to the red flags list:

```markdown
- Creating a Component / Container / System without `fields.summary` → `missing-required-field`; the node renders as a bare box.
- Leaving every connection on the default `uses` verb → the diagram carries no more meaning than before; pick real verbs.
- Writing `intent` → retired; it is now an `unknown-field` issue. Use `verb`.
```

Update Phase 1 step 2 so the System and Container writes include `summary` alongside `root`, and Phase 3's `validate_model` note so it mentions `unknown-role` and `unknown-verb` among the issue kinds.

- [ ] **Step 3: Update the subagent prompts**

In `references/subagent-prompt.md`, in the Phase 2 template step that creates Components, require `summary`:

```markdown
3. Create all your Components in one `mcp__hyphae__create_nodes` call (domain values in each
   item's `fields`), each `parentId` = {{CONTAINER_ID}}, create-or-skip by name. `fields.summary`
   is REQUIRED — one line under ~70 characters saying what the component is for; it is what the
   diagram shows. Put the long form in `description`. Set `role` only when the component is
   really a datastore, queue, or UI surface.
```

And in the step that creates connections:

```markdown
4. Create all intra-container edges in one `mcp__hyphae__create_connections` call, ONLY when BOTH
   endpoints are your own Components. Set the connection `type`, a `verb` from the profile's verb
   vocabulary, and a short `object` noun where one applies ("reads camera list"). Do not leave the
   verb at its `uses` default when a specific verb fits. Put `transport` in the `fields` bag.
   There is no `intent` field any more.
```

Apply the same `summary` requirement to the Phase 4 Code-layer template's `create_nodes` step **only if** `describe_profile` shows `summary` on the Code kinds — per this phase's profile it is **not** required there, so the Code-layer step should say so explicitly:

```markdown
   (Code nodes do not require `summary` — only Component and above do.)
```

- [ ] **Step 4: Verify the guidance against the shipped schema**

Build a model exactly as the skill now instructs and confirm it validates clean:

```bash
SCRATCH="C:/Users/qwert/AppData/Local/Temp/claude/C--projects-hyphae/2e553ec9-4405-46ea-bfcb-3f31a0f75e26/scratchpad"
cd apps/server && cat > "$SCRATCH/skillcheck.ts" <<'EOF'
import { emptyModel, validateModel, c4Backend } from '@hyphae/schema';
const base = { root: null, role: null, description: 'd', codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't' };
const edge = { object: '', description: '', direction: 'Unidirectional' as const, realizedBy: [], codeRefs: [], fields: {} };
const m = emptyModel();
m.nodes.push(
  { ...base, id: 'sys', name: 'Sys', type: 'System', parentId: null, fields: { summary: 'The system' } },
  { ...base, id: 'c', name: 'Svc', type: 'Container', parentId: 'sys', root: 'apps/server/', fields: { summary: 'Backend service', technology: 'Hono' } },
  { ...base, id: 'k1', name: 'API', type: 'Component', parentId: 'c', fields: { summary: 'HTTP surface' } },
  { ...base, id: 'k2', name: 'Store', type: 'Component', parentId: 'c', role: 'datastore', fields: { summary: 'Persists clips' } },
);
m.connections.push({ ...edge, id: 'e', from: 'k1', to: 'k2', type: 'Dependency', verb: 'writes', object: 'clip' });
console.log('issues:', validateModel(m, c4Backend));
EOF
pnpm exec tsx "$SCRATCH/skillcheck.ts"
```

Expected: `issues: []`. Then confirm the red flags really fire: drop `summary` from `k1` and expect one `missing-required-field`; set `verb` to `'yeets'` and expect one `unknown-verb`; set `role` to `'wormhole'` and expect one `unknown-role`. Paste all four results.

- [ ] **Step 5: Commit**

```bash
git add plugins/
git commit -m "docs(skill): teach summary, verbs, and roles; drop retired intent"
```

---

## Phase acceptance criteria

Checked after Task 8:

- [ ] A reader can name what each node is and what each edge does from the canvas alone.
- [ ] Every node renders its role shape, name, purpose line, and tech chip within the box.
- [ ] Every edge is labeled `verb` (+ `object`) and colored by verb class; derived rollup edges are unchanged.
- [ ] The legend explains every shape and every color actually used.
- [ ] `intent` is gone from the profile; `summary` is required on exactly the five non-Code kinds.
- [ ] An undeclared role or verb is an `Issue`; a defaulted connection (`verb: 'uses'`) is valid.
- [ ] No model `.json` file was modified in any commit of this plan.
- [ ] `pnpm -r test` passes and all three packages type-check.

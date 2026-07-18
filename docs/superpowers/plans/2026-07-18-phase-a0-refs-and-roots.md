# Phase A0 — Refs and Roots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every `codeRefs`/`docRefs` string in a Hyphae model resolvable to exactly one path, by adding an optional `root` on nodes that refs resolve against via the containment tree, and by reporting unresolvable refs as validation issues.

**Architecture:** A Ref stays a plain string; its kind (directory / file / symbol / line-range / glob) is inferred from syntax by a new `packages/schema/src/ref.ts`. A node may declare `root` — a directory Ref — and any ref resolves against the nearest ancestor (self included) that declares one, walking `parentId`. Roots themselves chain, so a Container's `root` resolves against its System's. `validateModel` gains issue kinds for a ref with no anchoring root and for a malformed `root`; `modelGaps` gains an opt-in filesystem check for refs that no longer exist on disk. The `hyphae-cctv-new.json` fixture is backfilled: each Container declares a root, and its refs are rewritten root-relative.

**Tech Stack:** pnpm workspaces · TypeScript · Zod (`packages/schema`) · Vitest · Hono (`apps/server`) · React 18 (`apps/web`) · MCP (`apps/server/src/mcp.ts`)

## Global Constraints

- **Zod schemas in `packages/schema/src` are the single source of truth.** TS types, JSON Schema (`json-schema.ts`), the server API, and the MCP tool shapes all derive from them. Never hand-write a JSON Schema or duplicate a type.
- **`schemaVersion` stays `1` for this phase.** `root` is an *optional* new field with a default, so existing files parse unchanged. No migration bump.
- **No whole-model write endpoint.** All writes stay granular and validated; an invalid write returns `422` with specific issues.
- **Every new field is described.** Any `FieldDef.description` added is required and is what the LLM and editor tooltips read.
- **Optional-by-default.** `root` is optional on every node kind. Do not make it required.
- **`modelGaps` stays filesystem-free by default.** Disk access is opt-in via an explicit argument, because the server validates models without necessarily having the modeled repo checked out.
- **Tests:** `pnpm -r test` must pass at the end of every task.
- **Type-check separately — `pnpm -r test` does NOT type-check.** Vitest compiles with esbuild and strips types without checking them, so a type regression passes the suite silently. This bit Task 2: adding one field to `NodeSchema` broke 29 pre-existing node literals across all three packages while every test stayed green. At the end of every task also run, and require clean:
  ```bash
  pnpm --filter @hyphae/schema exec tsc -p tsconfig.json
  pnpm --filter @hyphae/server exec tsc -p tsconfig.json
  pnpm --filter @hyphae/web exec tsc --noEmit -p tsconfig.json
  ```
  Note that a Zod `.default(...)` makes a field **required in the inferred output type**: anything built by `NodeSchema.parse()` is unaffected, but hand-built object literals typed as `Node` must add the new key explicitly. Most test files spread a shared `nodeBase`/`base` const — fix that one const rather than each literal.
- **Backward compatibility:** `apps/server/hyphae-cctv-new.json` (404 nodes / 567 connections) must keep loading at every task boundary.

---

## Deviation from the program plan (read before starting)

The program plan lists three new `Issue` kinds: *unanchored ref*, *ambiguous ref*, and *`root` that is not a directory Ref*. This plan ships **two** of them (`unanchored-ref`, `bad-root`) and deliberately does not add a separate `ambiguous-ref` kind.

Reason: ambiguity is a property of an *unanchored* ref. The 16 known ambiguities in the fixture (`src/main.ts` resolving to both Full Client and Streaming Client) exist precisely because no ancestor declares a root, so the string is interpreted against an implied base. Once every ref resolves against the nearest ancestor `root`, resolution is deterministic by construction — a ref on a node under Full Client cannot also resolve under Streaming Client. Adding an `ambiguous-ref` kind would produce a check that can never fire.

Ambiguity is still *observable*, and Task 4 exposes it where it actually lives: a reverse lookup (`refOwners`) that answers "which nodes claim this path," which legitimately returns more than one. Task 3 carries the regression test proving all 16 fixture cases are caught by `unanchored-ref`.

---

## File Structure

| Path | Status | Responsibility |
|------|--------|----------------|
| `packages/schema/src/ref.ts` | **create** | Ref syntax: `refKind`, `parseRef`, `joinRef`, `isDirectoryRef`; root resolution: `resolveRoot`, `resolveRef`, `refOwners` |
| `packages/schema/test/ref.test.ts` | **create** | Unit tests for the above |
| `packages/schema/src/node.ts` | modify | add `root: z.string().nullable().default(null)` |
| `packages/schema/src/validate.ts` | modify | add `unanchored-ref` + `bad-root` issue kinds |
| `packages/schema/src/gaps.ts` | modify | add opt-in `missingRefs` section |
| `packages/schema/src/index.ts` | modify | `export * from './ref'` |
| `packages/schema/test/validate.test.ts` | modify | tests for the new issue kinds |
| `packages/schema/test/gaps.test.ts` | modify | tests for `missingRefs` |
| `apps/server/src/mcp.ts` | modify | `root` in node write shapes; `resolve_refs` read tool; `model_gaps` disk flag |
| `apps/server/scripts/migrate-model.ts` | modify | carry `root` through migration |
| `apps/server/scripts/backfill-roots.ts` | **create** | one-shot fixture backfill (roots + root-relative refs) |
| `apps/web/src/SidePanel.tsx` | modify | edit `root`, list `codeRefs`/`docRefs` |
| `plugins/hyphae-modeling/SKILL.md` | modify | teach roots + the ref convention |

---

## Task 1: Ref syntax module

**Files:**
- Create: `packages/schema/src/ref.ts`
- Create: `packages/schema/test/ref.test.ts`
- Modify: `packages/schema/src/index.ts`

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces:
  - `type RefKind = 'directory' | 'file' | 'symbol' | 'lineRange' | 'glob'`
  - `type ParsedRef = { kind: RefKind; path: string; symbol?: string; startLine?: number; endLine?: number }`
  - `parseRef(ref: string): ParsedRef`
  - `refKind(ref: string): RefKind`
  - `isDirectoryRef(ref: string): boolean`
  - `joinRef(root: string | null, ref: string): string`

Classification order matters and is fixed: glob (contains `*`) wins over everything; then a `#` fragment splits into symbol vs line-range; then a trailing `/` means directory; otherwise file. A glob is checked first because `src/**/*.vue` has no `#` and no trailing `/` but must not be called a file.

- [ ] **Step 1: Write the failing test**

Create `packages/schema/test/ref.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseRef, refKind, isDirectoryRef, joinRef } from '../src/ref';

describe('refKind', () => {
  it('classifies each documented syntax', () => {
    expect(refKind('src/views/cctv/')).toBe('directory');
    expect(refKind('src/main.ts')).toBe('file');
    expect(refKind('src/main.ts#getRouter')).toBe('symbol');
    expect(refKind('src/main.ts#L10-L40')).toBe('lineRange');
    expect(refKind('src/views/**/*.vue')).toBe('glob');
  });

  it('treats a glob as a glob even with a trailing slash or fragment', () => {
    expect(refKind('src/**/')).toBe('glob');
    expect(refKind('src/**/*.ts#Foo')).toBe('glob');
  });
});

describe('parseRef', () => {
  it('splits a symbol ref into path + symbol', () => {
    expect(parseRef('WebService/Program.cs#Program')).toEqual({
      kind: 'symbol', path: 'WebService/Program.cs', symbol: 'Program',
    });
  });

  it('splits a line-range ref into path + numeric bounds', () => {
    expect(parseRef('src/main.ts#L10-L40')).toEqual({
      kind: 'lineRange', path: 'src/main.ts', startLine: 10, endLine: 40,
    });
  });

  it('strips the trailing slash from a directory path', () => {
    expect(parseRef('src/views/cctv/')).toEqual({ kind: 'directory', path: 'src/views/cctv' });
  });

  it('keeps a plain file path intact', () => {
    expect(parseRef('src/main.ts')).toEqual({ kind: 'file', path: 'src/main.ts' });
  });

  it('rejects an empty ref', () => {
    expect(() => parseRef('')).toThrow(/empty/i);
  });
});

describe('isDirectoryRef', () => {
  it('is true only for a trailing-slash ref', () => {
    expect(isDirectoryRef('endpoints/media_gateway/')).toBe(true);
    expect(isDirectoryRef('endpoints/media_gateway')).toBe(false);
    expect(isDirectoryRef('src/**/*.ts')).toBe(false);
  });
});

describe('joinRef', () => {
  it('returns the ref unchanged when there is no root', () => {
    expect(joinRef(null, 'src/main.ts')).toBe('src/main.ts');
  });

  it('prefixes the root, normalising the slash between them', () => {
    expect(joinRef('endpoints/media_gateway/', 'src/main.ts')).toBe('endpoints/media_gateway/src/main.ts');
    expect(joinRef('endpoints/media_gateway', 'src/main.ts')).toBe('endpoints/media_gateway/src/main.ts');
  });

  it('preserves the fragment when joining', () => {
    expect(joinRef('WebService/', 'Program.cs#Program')).toBe('WebService/Program.cs#Program');
  });

  it('ignores the root for an already-absolute ref', () => {
    expect(joinRef('endpoints/mg/', '/etc/hosts')).toBe('/etc/hosts');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hyphae/schema exec vitest run test/ref.test.ts`
Expected: FAIL — `Failed to resolve import "../src/ref"`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/schema/src/ref.ts`:

```ts
/**
 * A Ref is a plain string pointing at an artifact outside the model. Its kind is
 * inferred from syntax — there is no structured Ref object, because every ref in a
 * real model already fits `path` or `path#Symbol`, and a string stays cheap for an
 * LLM to write and readable in a git diff.
 *
 *   trailing `/`        directory   src/views/cctv/
 *   plain path          file        src/main.ts
 *   path#Symbol         symbol      src/main.ts#getRouter
 *   path#Lstart-Lend    lineRange   src/main.ts#L10-L40
 *   contains `*`        glob        src/views/**\/*.vue
 */
export type RefKind = 'directory' | 'file' | 'symbol' | 'lineRange' | 'glob';

export type ParsedRef = {
  kind: RefKind;
  path: string;
  symbol?: string;
  startLine?: number;
  endLine?: number;
};

const LINE_RANGE = /^L(\d+)-L(\d+)$/;

/** Parse a Ref string into its kind and parts. Throws on an empty ref. */
export function parseRef(ref: string): ParsedRef {
  const trimmed = ref.trim();
  if (trimmed === '') throw new Error('Ref is empty');

  // A glob is decided first: `src/**/*.vue` has no fragment and no trailing slash,
  // but is not a file.
  if (trimmed.includes('*')) return { kind: 'glob', path: trimmed };

  const hash = trimmed.indexOf('#');
  if (hash !== -1) {
    const path = trimmed.slice(0, hash);
    const fragment = trimmed.slice(hash + 1);
    const range = LINE_RANGE.exec(fragment);
    if (range) {
      return { kind: 'lineRange', path, startLine: Number(range[1]), endLine: Number(range[2]) };
    }
    return { kind: 'symbol', path, symbol: fragment };
  }

  if (trimmed.endsWith('/')) return { kind: 'directory', path: trimmed.slice(0, -1) };
  return { kind: 'file', path: trimmed };
}

export const refKind = (ref: string): RefKind => parseRef(ref).kind;

/** True only for the trailing-slash directory syntax. A `root` must be one of these. */
export const isDirectoryRef = (ref: string): boolean => {
  const trimmed = ref.trim();
  return trimmed !== '' && !trimmed.includes('*') && !trimmed.includes('#') && trimmed.endsWith('/');
};

/**
 * Prefix `ref` with `root`, collapsing the slash between them. A ref that is already
 * absolute is returned untouched — a root only anchors relative refs.
 */
export function joinRef(root: string | null, ref: string): string {
  if (!root) return ref;
  if (ref.startsWith('/')) return ref;
  const base = root.endsWith('/') ? root.slice(0, -1) : root;
  return base === '' ? ref : `${base}/${ref}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @hyphae/schema exec vitest run test/ref.test.ts`
Expected: PASS — 12 tests.

- [ ] **Step 5: Export the module**

In `packages/schema/src/index.ts`, add `export * from './ref';` immediately after the `export * from './ids';` line, so the ordering stays leaf-modules-first:

```ts
export * from './ids';
export * from './ref';
export * from './node';
```

- [ ] **Step 6: Run the full suite**

Run: `pnpm -r test`
Expected: PASS, all packages.

- [ ] **Step 7: Commit**

```bash
git add packages/schema/src/ref.ts packages/schema/test/ref.test.ts packages/schema/src/index.ts
git commit -m "feat(schema): add Ref syntax module (kind inference, join)"
```

---

## Task 2: `root` on the node schema and root resolution

**Files:**
- Modify: `packages/schema/src/node.ts`
- Modify: `packages/schema/src/ref.ts`
- Modify: `packages/schema/test/ref.test.ts`
- Modify: `packages/schema/test/node.test.ts`

**Interfaces:**
- Consumes: `parseRef`, `joinRef`, `isDirectoryRef` from Task 1.
- Produces:
  - `NodeSchema` gains `root: z.string().nullable().default(null)`
  - `type RootBearer = { id: string; parentId: string | null; root: string | null }` — the minimal node shape root resolution needs, so callers can pass plain nodes without a full model.
  - `resolveRoot(nodes: RootBearer[], nodeId: string): string | null` — the accumulated root for a node, walking `parentId` and chaining every declared root from the outermost ancestor inwards. `null` when no ancestor declares one.
  - `resolveRef(nodes: RootBearer[], nodeId: string, ref: string): string | null` — the ref joined to its resolved root; `null` when the node has no anchoring root (the caller decides whether that is an error).

Root **chaining** is the subtle part: if a System declares `endpoints/` and a Container under it declares `media_gateway/`, the Container's effective root is `endpoints/media_gateway/`. Resolution therefore collects roots from the node up to the tree top, then joins them top-down.

- [ ] **Step 1: Write the failing test**

Append to `packages/schema/test/ref.test.ts`:

```ts
import { resolveRoot, resolveRef, type RootBearer } from '../src/ref';

/** sys(root endpoints/) > mg(root media_gateway/) > comp(no root); and loose(no root anywhere) */
const tree: RootBearer[] = [
  { id: 'sys', parentId: null, root: 'endpoints/' },
  { id: 'mg', parentId: 'sys', root: 'media_gateway/' },
  { id: 'comp', parentId: 'mg', root: null },
  { id: 'abs', parentId: 'sys', root: '/opt/thing/' },
  { id: 'loose', parentId: null, root: null },
  { id: 'child-of-loose', parentId: 'loose', root: null },
];

describe('resolveRoot', () => {
  it('chains roots from the outermost ancestor inwards', () => {
    expect(resolveRoot(tree, 'mg')).toBe('endpoints/media_gateway/');
  });

  it('inherits the nearest ancestor root when the node declares none', () => {
    expect(resolveRoot(tree, 'comp')).toBe('endpoints/media_gateway/');
  });

  it('returns the top root for a node that declares it', () => {
    expect(resolveRoot(tree, 'sys')).toBe('endpoints/');
  });

  it('returns null when no ancestor declares a root', () => {
    expect(resolveRoot(tree, 'child-of-loose')).toBe(null);
  });

  it('stops chaining at an absolute root', () => {
    expect(resolveRoot(tree, 'abs')).toBe('/opt/thing/');
  });

  it('returns null for an unknown node id', () => {
    expect(resolveRoot(tree, 'nope')).toBe(null);
  });

  it('does not hang on a parentId cycle', () => {
    const cyclic: RootBearer[] = [
      { id: 'a', parentId: 'b', root: null },
      { id: 'b', parentId: 'a', root: null },
    ];
    expect(resolveRoot(cyclic, 'a')).toBe(null);
  });
});

describe('resolveRef', () => {
  it('anchors a ref against the resolved root', () => {
    expect(resolveRef(tree, 'comp', 'src/main.ts')).toBe('endpoints/media_gateway/src/main.ts');
  });

  it('anchors a symbol ref without disturbing the fragment', () => {
    expect(resolveRef(tree, 'comp', 'src/main.ts#getRouter')).toBe('endpoints/media_gateway/src/main.ts#getRouter');
  });

  it('returns null for a ref on an unanchored node', () => {
    expect(resolveRef(tree, 'child-of-loose', 'src/main.ts')).toBe(null);
  });

  it('disambiguates the same ref string under two different roots', () => {
    const two: RootBearer[] = [
      { id: 'fc', parentId: null, root: 'endpoints/full_client/' },
      { id: 'sc', parentId: null, root: 'endpoints/streaming_client/' },
    ];
    expect(resolveRef(two, 'fc', 'src/main.ts')).toBe('endpoints/full_client/src/main.ts');
    expect(resolveRef(two, 'sc', 'src/main.ts')).toBe('endpoints/streaming_client/src/main.ts');
  });
});
```

Append to `packages/schema/test/node.test.ts`, inside the existing `describe('NodeSchema', ...)` block:

```ts
  it('defaults root to null', () => {
    const n = NodeSchema.parse({ id: 'a', name: 'A', type: 'Component', createdAt: 't', updatedAt: 't' });
    expect(n.root).toBe(null);
  });
  it('keeps a declared root', () => {
    const n = NodeSchema.parse({ id: 'a', name: 'A', type: 'Container', createdAt: 't', updatedAt: 't', root: 'endpoints/mg/' });
    expect(n.root).toBe('endpoints/mg/');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @hyphae/schema exec vitest run test/ref.test.ts test/node.test.ts`
Expected: FAIL — `resolveRoot is not exported` and `expected undefined to be null` on the `root` default.

- [ ] **Step 3: Add `root` to the node schema**

In `packages/schema/src/node.ts`, add the `root` line after `parentId`:

```ts
import { z } from 'zod';

export const NodeSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  type: z.string().min(1), // validated against active profile in validate.ts
  parentId: z.string().nullable().default(null),
  // Optional directory Ref anchoring this node's subtree on disk. Refs below it resolve
  // against it; roots chain down the containment tree. See ref.ts.
  root: z.string().nullable().default(null),
  description: z.string().default(''),
  codeRefs: z.array(z.string()).default([]),
  docRefs: z.array(z.string()).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
  fields: z.record(z.string(), z.unknown()).default({}),
});

export type Node = z.infer<typeof NodeSchema>;
```

- [ ] **Step 4: Implement root resolution**

Append to `packages/schema/src/ref.ts`:

```ts
/** The minimal node shape root resolution needs — so callers can pass plain nodes. */
export type RootBearer = { id: string; parentId: string | null; root: string | null };

/**
 * The accumulated root for a node: every `root` declared from the outermost ancestor
 * down to the node itself, joined together. Returns null when nothing in the chain
 * declares one — that node's refs are unanchored.
 */
export function resolveRoot(nodes: RootBearer[], nodeId: string): string | null {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const chain: string[] = [];
  const seen = new Set<string>();
  let current = byId.get(nodeId);

  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    if (current.root) {
      chain.push(current.root);
      // An absolute root is self-anchoring; nothing above it applies.
      if (current.root.startsWith('/')) break;
    }
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }

  if (chain.length === 0) return null;
  // chain is innermost-first; join outermost-first.
  const joined = chain.reverse().reduce((acc, part) => joinRef(acc, part));
  return joined.endsWith('/') ? joined : `${joined}/`;
}

/**
 * A node's ref, anchored to its resolved root. Returns null when the node has no
 * anchoring root — the caller decides whether that is an error (validateModel says yes).
 */
export function resolveRef(nodes: RootBearer[], nodeId: string, ref: string): string | null {
  const root = resolveRoot(nodes, nodeId);
  if (root === null) return null;
  return joinRef(root, ref);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @hyphae/schema exec vitest run test/ref.test.ts test/node.test.ts`
Expected: PASS.

- [ ] **Step 6: Verify the fixture still loads**

Run:

```bash
pnpm --filter @hyphae/server exec tsx -e "
import { readFileSync } from 'node:fs';
import { HyphaeModelSchema } from '@hyphae/schema';
const m = HyphaeModelSchema.parse(JSON.parse(readFileSync('hyphae-cctv-new.json','utf8')));
console.log(m.nodes.length, 'nodes;', m.nodes.filter(n => n.root !== null).length, 'with a root');
"
```

Expected: `404 nodes; 0 with a root` — the optional field defaults cleanly on a file that predates it.

- [ ] **Step 7: Run the full suite**

Run: `pnpm -r test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/schema/src/node.ts packages/schema/src/ref.ts packages/schema/test/ref.test.ts packages/schema/test/node.test.ts
git commit -m "feat(schema): add optional node root and chained ref resolution"
```

---

## Task 3: Validation — `unanchored-ref` and `bad-root`

**Files:**
- Modify: `packages/schema/src/validate.ts`
- Modify: `packages/schema/test/validate.test.ts`

**Interfaces:**
- Consumes: `isDirectoryRef`, `resolveRoot` from Tasks 1–2; `Node` from Task 2.
- Produces: `Issue['kind']` gains `'unanchored-ref' | 'bad-root'`. No signature change to `validateModel`.

Rules:
- `bad-root` — a node's `root` is set but is not a directory Ref (no trailing `/`, or contains `*`/`#`).
- `unanchored-ref` — a node has at least one `codeRefs` entry and `resolveRoot` returns `null`. Reported **once per node**, not once per ref, so a Component with thirty refs does not produce thirty issues. Absolute refs and URLs are exempt.
- `docRefs` are **not** checked: a docRef may legitimately be a URL (`https://…`), which has no root. Only `codeRefs` are anchored.
- Connections carry `codeRefs` too, but a connection has no `parentId` and therefore no containment anchor. They are out of scope for this phase — noted here so a reviewer does not read the omission as an oversight.

- [ ] **Step 1: Write the failing test**

Append to `packages/schema/test/validate.test.ts`:

```ts
import { isDirectoryRef } from '../src/ref';

describe('ref anchoring', () => {
  const base = { codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {}, root: null };

  function anchoredModel(): HyphaeModel {
    const m = emptyModel();
    m.nodes.push(
      { id: 'sys', name: 'Sys', type: 'System', parentId: null, description: 'd', ...base, root: 'endpoints/' },
      { id: 'mg', name: 'MG', type: 'Container', parentId: 'sys', description: 'd', ...base, root: 'media_gateway/' },
      { id: 'comp', name: 'C', type: 'Component', parentId: 'mg', description: 'd', ...base, codeRefs: ['src/main.ts'] },
    );
    return m;
  }

  it('accepts a ref anchored by an ancestor root', () => {
    expect(validateModel(anchoredModel(), c4Backend)).toEqual([]);
  });

  it('flags a node whose refs have no anchoring root', () => {
    const m = anchoredModel();
    m.nodes[0].root = null;
    m.nodes[1].root = null;
    const issues = validateModel(m, c4Backend).filter((i) => i.kind === 'unanchored-ref');
    expect(issues).toHaveLength(1);
    expect(issues[0].ref).toBe('comp');
    expect(issues[0].message).toMatch(/no ancestor declares a root/i);
  });

  it('reports one issue per node, not one per ref', () => {
    const m = anchoredModel();
    m.nodes[0].root = null;
    m.nodes[1].root = null;
    m.nodes[2].codeRefs = ['src/a.ts', 'src/b.ts', 'src/c.ts'];
    expect(validateModel(m, c4Backend).filter((i) => i.kind === 'unanchored-ref')).toHaveLength(1);
  });

  it('exempts an absolute ref from anchoring', () => {
    const m = anchoredModel();
    m.nodes[0].root = null;
    m.nodes[1].root = null;
    m.nodes[2].codeRefs = ['/opt/vendor/lib.ts'];
    expect(validateModel(m, c4Backend).filter((i) => i.kind === 'unanchored-ref')).toEqual([]);
  });

  it('ignores docRefs, which may be URLs', () => {
    const m = anchoredModel();
    m.nodes[0].root = null;
    m.nodes[1].root = null;
    m.nodes[2].codeRefs = [];
    m.nodes[2].docRefs = ['https://example.test/adr-1'];
    expect(validateModel(m, c4Backend).filter((i) => i.kind === 'unanchored-ref')).toEqual([]);
  });

  it('flags a root that is not a directory Ref', () => {
    const m = anchoredModel();
    m.nodes[1].root = 'media_gateway';   // missing trailing slash
    const issues = validateModel(m, c4Backend).filter((i) => i.kind === 'bad-root');
    expect(issues).toHaveLength(1);
    expect(issues[0].ref).toBe('mg');
    expect(issues[0].message).toMatch(/directory ref/i);
    expect(isDirectoryRef('media_gateway')).toBe(false);
  });

  it('flags a glob used as a root', () => {
    const m = anchoredModel();
    m.nodes[1].root = 'endpoints/*/';
    expect(validateModel(m, c4Backend).filter((i) => i.kind === 'bad-root')).toHaveLength(1);
  });
});
```

If `emptyModel`, `validateModel`, `c4Backend`, or the `HyphaeModel` type are not already imported at the top of `validate.test.ts`, add whichever are missing:

```ts
import { validateModel } from '../src/validate';
import { emptyModel, type HyphaeModel } from '../src/model';
import { c4Backend } from '../src/profiles/c4-backend';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @hyphae/schema exec vitest run test/validate.test.ts`
Expected: FAIL — the `unanchored-ref` and `bad-root` filters return empty arrays.

- [ ] **Step 3: Implement the checks**

In `packages/schema/src/validate.ts`, extend the import block and the `Issue` union:

```ts
import { isDirectoryRef, resolveRoot } from './ref';
```

```ts
export type Issue = {
  kind:
    | 'unknown-type' | 'bad-parent' | 'missing-parent' | 'dangling-endpoint'
    | 'unknown-connection-kind' | 'bad-endpoint'
    | 'unknown-field' | 'bad-field-type' | 'bad-enum-value' | 'missing-required-field' | 'bad-ref'
    | 'unanchored-ref' | 'bad-root';
  ref: string;       // id of the offending node/connection
  message: string;
};
```

Add this helper above `validateModel`:

```ts
/**
 * Ref anchoring for one node. `codeRefs` are relative by convention and must resolve
 * against the nearest ancestor `root`; an absolute ref is self-anchoring and exempt.
 * `docRefs` are skipped — they may be URLs, which no root applies to.
 * Reported once per node: thirty unanchored refs are one authoring mistake, not thirty.
 */
function validateRefs(node: Node, nodes: Node[]): Issue[] {
  const issues: Issue[] = [];

  if (node.root !== null && !isDirectoryRef(node.root)) {
    issues.push({
      kind: 'bad-root', ref: node.id,
      message: `root "${node.root}" is not a directory Ref (it must end with "/" and contain no "*" or "#")`,
    });
  }

  const relative = node.codeRefs.filter((r) => !r.startsWith('/'));
  if (relative.length > 0 && resolveRoot(nodes, node.id) === null) {
    issues.push({
      kind: 'unanchored-ref', ref: node.id,
      message: `${relative.length} codeRef(s) cannot be resolved: no ancestor declares a root (e.g. "${relative[0]}")`,
    });
  }

  return issues;
}
```

Then call it inside the node loop in `validateModel`, immediately after the existing `validateFields` push:

```ts
    issues.push(...validateFields(n.fields, effectiveFields(profile, n.type, 'node'), nodeById, n.id));
    issues.push(...validateRefs(n, model.nodes));
```

Note the `continue` on the `unknown-type` branch above it: a node with an unknown type is skipped entirely, which is the existing behaviour and is left alone.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @hyphae/schema exec vitest run test/validate.test.ts`
Expected: PASS.

- [ ] **Step 5: Confirm the fixture's 16 ambiguities are caught**

This is the regression proof that `unanchored-ref` subsumes `ambiguous-ref`. Run:

```bash
pnpm --filter @hyphae/server exec tsx -e "
import { readFileSync } from 'node:fs';
import { HyphaeModelSchema, validateModel, resolveProfile } from '@hyphae/schema';
const m = HyphaeModelSchema.parse(JSON.parse(readFileSync('hyphae-cctv-new.json','utf8')));
const issues = validateModel(m, resolveProfile(m)).filter(i => i.kind === 'unanchored-ref');
console.log(issues.length, 'nodes with unanchored refs');
// Every node that carries the historically ambiguous strings must be among them.
const flagged = new Set(issues.map(i => i.ref));
const ambiguous = ['src/main.ts', 'WebService/Program.cs#Program', 'Contracts/Types/Feed.cs#Feed'];
const carriers = m.nodes.filter(n => n.codeRefs.some(r => ambiguous.includes(r)));
console.log('ambiguous-ref carriers:', carriers.length, '| all flagged:', carriers.every(n => flagged.has(n.id)));
"
```

Expected: a non-zero count of unanchored nodes, and `all flagged: true`. Record the exact number in the commit message — Task 6 must drive it to zero.

- [ ] **Step 6: Run the full suite**

Run: `pnpm -r test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/schema/src/validate.ts packages/schema/test/validate.test.ts
git commit -m "feat(schema): validate ref anchoring and root shape"
```

---

## Task 4: Reverse lookup and the opt-in on-disk gap

**Files:**
- Modify: `packages/schema/src/ref.ts`
- Modify: `packages/schema/src/gaps.ts`
- Modify: `packages/schema/test/ref.test.ts`
- Modify: `packages/schema/test/gaps.test.ts`

**Interfaces:**
- Consumes: `resolveRef`, `parseRef` from Tasks 1–2.
- Produces:
  - `type RefBearer = RootBearer & { codeRefs: string[] }`
  - `refOwners(nodes: RefBearer[], path: string): string[]` — ids of nodes whose resolved refs point at `path`. More than one is legitimate (a shared file) and is where genuine ambiguity is observable.
  - `type MissingRef = { nodeId: string; ref: string; resolved: string }`
  - `ModelGaps` gains `missingRefs: MissingRef[]`
  - `modelGaps(model, profile, options?: { checkDisk?: { cwd: string; exists: (p: string) => boolean } })` — **filesystem-free unless `checkDisk` is passed.** The caller injects `exists`, so `packages/schema` takes no `node:fs` dependency and stays testable without a real disk.

Per the program plan's steer, a ref that does not exist on disk is a **`model_gaps` warning**, not a validation error and not auto-repaired. Drift is a reporting concern; the model is still structurally valid.

- [ ] **Step 1: Write the failing test**

Append to `packages/schema/test/ref.test.ts`:

```ts
import { refOwners } from '../src/ref';

describe('refOwners', () => {
  const owners = [
    { id: 'fc', parentId: null, root: 'endpoints/full_client/', codeRefs: ['src/main.ts'] },
    { id: 'sc', parentId: null, root: 'endpoints/streaming_client/', codeRefs: ['src/main.ts'] },
    { id: 'shared', parentId: 'fc', root: null, codeRefs: ['src/main.ts'] },
  ];

  it('resolves a path back to the single node that claims it', () => {
    expect(refOwners(owners, 'endpoints/streaming_client/src/main.ts')).toEqual(['sc']);
  });

  it('returns every claimant when a path is genuinely shared', () => {
    expect(refOwners(owners, 'endpoints/full_client/src/main.ts').sort()).toEqual(['fc', 'shared']);
  });

  it('returns nothing for an unclaimed path', () => {
    expect(refOwners(owners, 'endpoints/other/src/main.ts')).toEqual([]);
  });

  it('matches on the path, ignoring a symbol fragment', () => {
    const withSymbol = [{ id: 'a', parentId: null, root: 'app/', codeRefs: ['src/main.ts#getRouter'] }];
    expect(refOwners(withSymbol, 'app/src/main.ts')).toEqual(['a']);
  });
});
```

Append to `packages/schema/test/gaps.test.ts`:

```ts
describe('missingRefs', () => {
  function refModel(): HyphaeModel {
    const m = emptyModel();
    m.nodes.push(
      { id: 'sys', name: 'Sys', type: 'System', parentId: null, description: 'The system', ...nodeBase, root: 'app/' },
      { id: 'ca', name: 'Alpha', type: 'Container', parentId: 'sys', description: 'Alpha container', ...nodeBase },
      { id: 'a1', name: 'A1', type: 'Component', parentId: 'ca', description: 'Handles alpha ingest',
        ...nodeBase, codeRefs: ['src/present.ts', 'src/gone.ts'] },
    );
    return m;
  }

  it('is empty when no disk check is requested', () => {
    expect(modelGaps(refModel(), c4Backend).missingRefs).toEqual([]);
  });

  it('reports a ref whose resolved path is absent from disk', () => {
    const present = new Set(['app/src/present.ts']);
    const gaps = modelGaps(refModel(), c4Backend, {
      checkDisk: { cwd: '.', exists: (p) => present.has(p) },
    });
    expect(gaps.missingRefs).toEqual([
      { nodeId: 'a1', ref: 'src/gone.ts', resolved: 'app/src/gone.ts' },
    ]);
  });

  it('does not check globs, which need a matcher rather than an existence test', () => {
    const m = refModel();
    m.nodes[2].codeRefs = ['src/**/*.ts'];
    const gaps = modelGaps(m, c4Backend, { checkDisk: { cwd: '.', exists: () => false } });
    expect(gaps.missingRefs).toEqual([]);
  });

  it('skips unanchored refs, which validateModel already reports', () => {
    const m = refModel();
    m.nodes[0].root = null;
    const gaps = modelGaps(m, c4Backend, { checkDisk: { cwd: '.', exists: () => false } });
    expect(gaps.missingRefs).toEqual([]);
  });
});
```

The existing `nodeBase` const at the top of `gaps.test.ts` must gain the new field so these objects type-check. Change it to:

```ts
const nodeBase = { root: null, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {} };
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @hyphae/schema exec vitest run test/ref.test.ts test/gaps.test.ts`
Expected: FAIL — `refOwners is not exported`, and `missingRefs` is undefined on `ModelGaps`.

- [ ] **Step 3: Implement `refOwners`**

Append to `packages/schema/src/ref.ts`:

```ts
/** A node as ref ownership sees it: a root bearer that also carries codeRefs. */
export type RefBearer = RootBearer & { codeRefs: string[] };

/**
 * Ids of every node whose resolved codeRefs point at `path` (fragments ignored).
 * More than one owner is legitimate — a shared file — and this is where genuine
 * ambiguity is observable. Anchoring makes forward resolution deterministic, so
 * ambiguity is a reverse-lookup property, not a validation error.
 */
export function refOwners(nodes: RefBearer[], path: string): string[] {
  const target = parseRef(path).path;
  return nodes
    .filter((n) => n.codeRefs.some((r) => {
      const resolved = resolveRef(nodes, n.id, r);
      return resolved !== null && parseRef(resolved).path === target;
    }))
    .map((n) => n.id);
}
```

- [ ] **Step 4: Implement `missingRefs`**

In `packages/schema/src/gaps.ts`, add to the imports:

```ts
import { parseRef, resolveRef } from './ref';
```

Add the type and extend `ModelGaps`:

```ts
export type MissingRef = { nodeId: string; ref: string; resolved: string };

export type ModelGaps = {
  orphanNodes: OrphanNode[];
  unboundCodeEdges: UnboundCodeEdge[];
  thinDescriptions: ThinDescription[];
  missingRefs: MissingRef[];
};

/** Disk access is injected, so this package never imports node:fs and stays testable. */
export type GapOptions = { checkDisk?: { cwd: string; exists: (path: string) => boolean } };
```

Change the signature and add the section. The new parameter is optional, so every existing caller compiles untouched:

```ts
export function modelGaps(model: HyphaeModel, profile: Profile, options: GapOptions = {}): ModelGaps {
```

Insert before the final `return`:

```ts
  // 4. Missing refs: resolved codeRefs absent from disk. Opt-in — drift is a reporting
  //    concern, not a validity one, and the server may not have the modeled repo checked out.
  const missingRefs: MissingRef[] = [];
  const disk = options.checkDisk;
  if (disk) {
    for (const n of model.nodes) {
      for (const ref of n.codeRefs) {
        // A glob needs a matcher, not an existence test; an unanchored ref is already
        // an Issue from validateModel and would only produce a duplicate complaint here.
        if (ref.includes('*')) continue;
        const resolved = resolveRef(model.nodes, n.id, ref);
        if (resolved === null) continue;
        if (!disk.exists(parseRef(resolved).path)) {
          missingRefs.push({ nodeId: n.id, ref, resolved });
        }
      }
    }
  }
```

And extend the return:

```ts
  return { orphanNodes, unboundCodeEdges, thinDescriptions, missingRefs };
```

Also update the docblock above `modelGaps` — append a sentence to the existing comment:

```
 * Missing refs (codeRefs whose resolved path is absent from disk) are reported only when
 * `options.checkDisk` is supplied; without it this function touches no filesystem.
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @hyphae/schema exec vitest run test/ref.test.ts test/gaps.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the full suite**

Run: `pnpm -r test`
Expected: PASS. If `apps/server` tests assert on the exact `ModelGaps` shape, add `missingRefs: []` to those expectations.

- [ ] **Step 7: Commit**

```bash
git add packages/schema/src/ref.ts packages/schema/src/gaps.ts packages/schema/test/ref.test.ts packages/schema/test/gaps.test.ts
git commit -m "feat(schema): add refOwners reverse lookup and opt-in missing-ref gap"
```

---

## Task 5: Surface `root` in MCP and the side panel

**Files:**
- Modify: `apps/server/src/mcp.ts:362-367` (the `coreNodeFields` block) and the `model_gaps` registration
- Modify: `apps/server/scripts/migrate-model.ts:21` and `:51-63`
- Modify: `apps/web/src/SidePanel.tsx`

**Interfaces:**
- Consumes: `NodeSchema.root` (Task 2), `refOwners` (Task 4), `GapOptions` (Task 4).
- Produces: `root` writable via `create_nodes`/`update_nodes`; a `resolve_refs` MCP read tool; `root` editable in the web side panel.

An LLM cannot author what it cannot see: without `root` in the write shape and in `describe_profile`'s neighbourhood, every model built after this phase reintroduces unanchored refs.

- [ ] **Step 1: Add `root` to the MCP node write shape**

In `apps/server/src/mcp.ts`, replace the `coreNodeFields` object:

```ts
  const coreNodeFields = {
    parentId: z.string().nullable().optional(),
    root: z.string().nullable().optional()
      .describe('Optional directory Ref (must end with "/") anchoring this node\'s subtree on disk, e.g. "endpoints/media_gateway/". Refs on this node and its descendants resolve against it, and roots chain down the containment tree — a System declares the repo root, a Container its subtree, and Components stay short and relative. A codeRef on a node with no anchoring root anywhere in its ancestors is a validation issue.'),
    description: z.string().optional(),
    codeRefs: z.array(z.string()).optional()
      .describe('Refs into the source, relative to the nearest ancestor root. Syntax decides the kind: "src/views/cctv/" directory, "src/main.ts" file, "src/main.ts#getRouter" symbol, "src/main.ts#L10-L40" line range, "src/views/**/*.vue" glob.'),
    docRefs: z.array(z.string()).optional(),
    fields: z.object(fieldsShape('node')).partial().optional(),
  };
```

- [ ] **Step 2: Add the `resolve_refs` read tool**

In `apps/server/src/mcp.ts`, register this immediately after the existing `validate_model` registration:

```ts
  server.registerTool('resolve_refs', {
    description: 'Resolve a node\'s codeRefs to full repo-relative paths through its inherited root, or reverse-look-up which nodes claim a given path. Pass nodeId to resolve that node\'s refs (and see its effective root); pass path to list every node whose refs point there — more than one owner means the path is genuinely shared. Use before editing code to find what models a file, and after writing refs to confirm they anchor where you expect.',
    inputSchema: {
      nodeId: z.string().optional().describe('Resolve this node\'s codeRefs and report its effective root.'),
      path: z.string().optional().describe('Repo-relative path to reverse-look-up, e.g. "endpoints/media_gateway/src/main.ts".'),
    },
  }, async (a) => text(await tools.resolve_refs(a)));
```

- [ ] **Step 3: Implement the `resolve_refs` tool body**

The tool implementations live in the object returned by `buildTools(api: HyphaeApi)` in `apps/server/src/mcp.ts` (around line 51). Note the local convention, which every sibling follows: the MCP layer is an **HTTP client of the running server**, so it reads the model with `await api.getModel()` — there is no in-process store to reach for. Add this alongside `validate_model` / `model_gaps` (around line 210):

```ts
    resolve_refs: async ({ nodeId, path }: { nodeId?: string; path?: string }) => {
      const model = await api.getModel();
      if (path) return { path, owners: refOwners(model.nodes, path) };
      if (!nodeId) return { error: 'Pass either nodeId or path.' };
      const node = model.nodes.find((n) => n.id === nodeId);
      if (!node) return { error: `node ${nodeId} not found` };
      return {
        nodeId,
        root: resolveRoot(model.nodes, nodeId),
        refs: node.codeRefs.map((ref) => ({ ref, resolved: resolveRef(model.nodes, nodeId, ref) })),
      };
    },
```

Add `refOwners, resolveRoot, resolveRef` to the existing `@hyphae/schema` import at the top of the file.

- [ ] **Step 4: Carry `root` through the migration script**

In `apps/server/scripts/migrate-model.ts`, add `'root'` to the core-node set so it is never mistaken for a legacy domain field and swept into `fields`:

```ts
const CORE_NODE = new Set(['id', 'name', 'type', 'parentId', 'root', 'description', 'codeRefs', 'docRefs', 'createdAt', 'updatedAt', 'fields']);
```

And preserve it in the node mapping, right after `parentId`:

```ts
      parentId: n.parentId ?? null,
      root: n.root ?? null,
```

- [ ] **Step 5: Add `root` and refs to the side panel**

In `apps/web/src/SidePanel.tsx`, inside the `if (node)` branch, insert after the `description` label and before the `effectiveFields(...)` map:

```tsx
        <label className="field" title='Directory Ref anchoring this subtree on disk, e.g. "endpoints/media_gateway/". Descendants resolve their refs against it.'>
          <span>root</span>
          <input aria-label="root" value={node.root ?? ''}
            onChange={(e) => updateNode(node.id, { root: e.target.value || null })} /></label>
        <label className="field" title="One Ref per line, relative to the nearest ancestor root.">
          <span>codeRefs</span>
          <textarea aria-label="codeRefs" value={node.codeRefs.join('\n')}
            onChange={(e) => updateNode(node.id, { codeRefs: lines(e.target.value) })} /></label>
        <label className="field" title="One Ref or URL per line.">
          <span>docRefs</span>
          <textarea aria-label="docRefs" value={node.docRefs.join('\n')}
            onChange={(e) => updateNode(node.id, { docRefs: lines(e.target.value) })} /></label>
```

`lines` is the existing helper at the top of the file (`const lines = (s: string) => ...`); reuse it rather than adding a second splitter.

- [ ] **Step 6: Verify end to end**

Start the server and exercise a write:

```bash
pnpm --filter @hyphae/server dev &
sleep 3
curl -s -X POST localhost:3001/api/nodes -H 'content-type: application/json' \
  -d '{"name":"Probe","type":"Container","parentId":null,"root":"probe/"}'
```

Expected: a `200` with the created node echoing `"root":"probe/"`. Then confirm a bad root is rejected:

```bash
curl -s -X POST localhost:3001/api/nodes -H 'content-type: application/json' \
  -d '{"name":"Probe2","type":"Container","parentId":null,"root":"probe","codeRefs":["src/x.ts"]}'
```

Expected: `422` with a `bad-root` issue. Delete both probes afterwards, or discard the working copy of `hyphae.json`. Check the port against `apps/server/src/index.ts` if `3001` is wrong.

- [ ] **Step 7: Run the full suite**

Run: `pnpm -r test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/mcp.ts apps/server/scripts/migrate-model.ts apps/web/src/SidePanel.tsx
git commit -m "feat(server,web): surface node root and ref resolution in MCP and side panel"
```

---

## Task 6: Backfill roots and rewrite refs on the fixture

**Files:**
- Create: `apps/server/scripts/backfill-roots.ts`
- Modify: `apps/server/hyphae-cctv-new.json` (via the script)

**Interfaces:**
- Consumes: everything from Tasks 1–4.
- Produces: a fixture where `validateModel` reports zero `unanchored-ref` issues.

**Measured starting state** (re-measure rather than trusting these):

| Container | refs | dominant top-level segment |
|---|---|---|
| Media Gateway (MG) | 72 | `endpoints/` |
| Full Client (FC) | 56 | `src/` |
| Layout Manager Client Lib | 53 | `endpoints/` (28), `src/` (25) |
| Stream Keeper (SK) | 47 | `Contracts/`, `RtspClientSharp/`, … |
| Media Gateway Client Lib | 40 | `endpoints/` (22), `src/` (18) |
| Camera Manager (CM) | 40 | `Contracts/`, `OnvifCamera/`, … |
| Client Components | 33 | `src/` |
| Stream Keeper Client Lib | 29 | `src/` (16), `endpoints/` (13) |
| Layout Manager (LM) | 27 | `Contracts/`, `WebService/`, … |
| Streaming Client (SC) | 19 | `src/` |

The mixed containers are the crux. Inside e.g. Stream Keeper Client Lib both `endpoints/stream_keeper/frontend/src/api/SignalRClientApi.ts` (long form) and `src/api/SignalRClientApi.ts#SignalRClientApi` (short form) appear — the **same file** written two ways, and the short form is exactly what collides with the other client libs. The backfill resolves both to one path: declare the container's root as the long-form prefix, then strip that prefix from long-form refs. Short-form refs are already root-relative and stay as they are.

Strategy, per container: `root` = the longest common directory prefix of that container's *long-form* refs (those sharing the container's dominant multi-segment prefix). Refs already relative to that root are left alone. This is derived from the data, not hardcoded, so re-running after fixture edits still works.

**This task rewrites a large untracked file.** `hyphae-cctv-new.json` and `hyphae-cctv.json` are currently untracked. Commit them *before* running the backfill so the diff is reviewable and the pre-backfill state is recoverable.

- [ ] **Step 1: Commit the fixture as-is, before touching it**

```bash
git add apps/server/hyphae-cctv-new.json apps/server/hyphae-cctv.json
git commit -m "chore(server): commit cctv model fixtures before ref backfill"
```

- [ ] **Step 2: Write the backfill script**

Create `apps/server/scripts/backfill-roots.ts`:

```ts
/**
 * One-shot backfill: declare a `root` on every Container and rewrite its subtree's
 * codeRefs to be root-relative.
 *
 *   pnpm --filter @hyphae/server exec tsx scripts/backfill-roots.ts <file.json> [--write]
 *
 * Without --write it prints the plan and changes nothing. The root for a container is
 * derived from its own refs (the longest common directory prefix of its long-form refs),
 * never hardcoded, so re-running after fixture edits still works.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { HyphaeModelSchema, validateModel, resolveProfile, parseRef, type Node } from '@hyphae/schema';

const [file, ...flags] = process.argv.slice(2);
if (!file) {
  console.error('usage: tsx scripts/backfill-roots.ts <file.json> [--write]');
  process.exit(2);
}
const write = flags.includes('--write');

const model = HyphaeModelSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
const byId = new Map(model.nodes.map((n) => [n.id, n]));

/** The nearest Container-typed ancestor of a node, or null. */
function containerOf(id: string): Node | null {
  let node = byId.get(id);
  const seen = new Set<string>();
  while (node && !seen.has(node.id)) {
    seen.add(node.id);
    if (node.type === 'Container') return node;
    node = node.parentId ? byId.get(node.parentId) : undefined;
  }
  return null;
}

// Group every node under its container.
const subtree = new Map<string, Node[]>();
for (const n of model.nodes) {
  const c = containerOf(n.id);
  if (!c) continue;
  if (!subtree.has(c.id)) subtree.set(c.id, []);
  subtree.get(c.id)!.push(n);
}

const dirOf = (ref: string) => {
  const { path } = parseRef(ref);
  const cut = path.lastIndexOf('/');
  return cut === -1 ? '' : path.slice(0, cut);
};

/** Longest common directory prefix of a list of paths, on segment boundaries. */
function commonPrefix(dirs: string[]): string {
  if (dirs.length === 0) return '';
  let parts = dirs[0].split('/');
  for (const d of dirs.slice(1)) {
    const other = d.split('/');
    let i = 0;
    while (i < parts.length && i < other.length && parts[i] === other[i]) i++;
    parts = parts.slice(0, i);
    if (parts.length === 0) break;
  }
  return parts.join('/');
}

let rewritten = 0;
for (const [containerId, nodes] of subtree) {
  const container = byId.get(containerId)!;
  const refs = nodes.flatMap((n) => n.codeRefs);
  if (refs.length === 0) continue;

  // Long form = refs sharing the deepest prefix the majority agrees on. We take the
  // common prefix of the most frequent top-level segment's refs.
  const byTop = new Map<string, string[]>();
  for (const r of refs) {
    const top = parseRef(r).path.split('/')[0];
    if (!byTop.has(top)) byTop.set(top, []);
    byTop.get(top)!.push(r);
  }
  const [topSegment, longForm] = [...byTop].sort((a, b) => b[1].length - a[1].length)[0];
  const root = commonPrefix(longForm.map(dirOf));
  if (root === '' || root === topSegment && byTop.size === 1 && !root.includes('/')) {
    // A single flat segment like "Contracts" is a source directory, not a container root.
    // Fall back to the container having no derivable root; report it for manual handling.
    console.log(`? ${container.name}: no multi-segment common prefix (top "${topSegment}") — set root by hand`);
    continue;
  }

  container.root = root.endsWith('/') ? root : `${root}/`;
  for (const n of nodes) {
    n.codeRefs = n.codeRefs.map((r) => {
      if (r.startsWith(`${root}/`)) { rewritten++; return r.slice(root.length + 1); }
      return r; // already root-relative (the short form) — leave it
    });
  }
  console.log(`✓ ${container.name}: root "${container.root}" (${nodes.flatMap((n) => n.codeRefs).length} refs)`);
}

const issues = validateModel(model, resolveProfile(model));
const unanchored = issues.filter((i) => i.kind === 'unanchored-ref');
console.log(`\n${rewritten} refs rewritten; ${unanchored.length} nodes still unanchored; ${issues.length} total issues.`);
for (const i of unanchored.slice(0, 20)) console.log(`  [${i.kind}] ${i.ref}: ${i.message}`);

if (!write) { console.log('\n(dry run — pass --write to save)'); process.exit(0); }
if (issues.length) { console.error('\nrefusing to write: model has validation issues'); process.exit(1); }
writeFileSync(file, JSON.stringify(model, null, 2) + '\n', 'utf8');
console.log(`\nwrote ${file}`);
```

- [ ] **Step 3: Dry-run the backfill**

Run:

```bash
pnpm --filter @hyphae/server exec tsx scripts/backfill-roots.ts hyphae-cctv-new.json
```

Expected: a root reported per container, and a residual count of unanchored nodes. The containers whose refs start with a flat segment (Stream Keeper, Camera Manager, Layout Manager — `Contracts/`, `WebApi/`, …) will print `? … set root by hand`. That is expected: those are .NET project directories inside a container, not the container root.

- [ ] **Step 4: Set the hand-held roots**

For each container the dry run flagged, determine its root from the long-form refs elsewhere in the model. From the measured data, the backend containers live under `endpoints/<service>/backend/`; confirm this by inspecting an actual long-form ref:

```bash
node -e "
const m=JSON.parse(require('fs').readFileSync('apps/server/hyphae-cctv-new.json','utf8'));
const s=new Set();
for(const n of m.nodes) for(const r of n.codeRefs) if(r.startsWith('endpoints/')) s.add(r.split('/').slice(0,4).join('/'));
console.log([...s].sort().join('\n'));
"
```

Then add an explicit override map near the top of `backfill-roots.ts`, keyed by container name, and consult it before deriving:

```ts
/** Containers whose refs are written relative to a project dir inside them, so no
 *  multi-segment prefix is derivable. Values confirmed against the long-form refs. */
const ROOT_OVERRIDES: Record<string, string> = {
  // Fill from Step 4's output, e.g.:
  // 'Stream Keeper (SK)': 'endpoints/stream_keeper/backend/',
};
```

and at the top of the per-container loop:

```ts
  const override = ROOT_OVERRIDES[container.name];
  if (override) {
    container.root = override;
    for (const n of nodes) {
      const base = override.endsWith('/') ? override.slice(0, -1) : override;
      n.codeRefs = n.codeRefs.map((r) => (r.startsWith(`${base}/`) ? (rewritten++, r.slice(base.length + 1)) : r));
    }
    console.log(`✓ ${container.name}: root "${override}" (override)`);
    continue;
  }
```

Re-run the dry run until it reports `0 nodes still unanchored`.

- [ ] **Step 5: Spot-check the known-ambiguous cases by hand**

Before writing, confirm the 16 ambiguities resolve to distinct paths. Run the dry run with a temporary write to a scratch copy:

```bash
cp apps/server/hyphae-cctv-new.json "$TMPDIR/check.json" 2>/dev/null || cp apps/server/hyphae-cctv-new.json /tmp/check.json
pnpm --filter @hyphae/server exec tsx scripts/backfill-roots.ts /tmp/check.json --write
pnpm --filter @hyphae/server exec tsx -e "
import { readFileSync } from 'node:fs';
import { HyphaeModelSchema, resolveRef } from '@hyphae/schema';
const m = HyphaeModelSchema.parse(JSON.parse(readFileSync('/tmp/check.json','utf8')));
const seen = new Map();
for (const n of m.nodes) for (const r of n.codeRefs) {
  const res = resolveRef(m.nodes, n.id, r);
  if (!seen.has(res)) seen.set(res, []);
  seen.get(res).push(n.name);
}
const shared = [...seen].filter(([, ns]) => new Set(ns).size > 1);
console.log('distinct resolved paths:', seen.size);
console.log('paths claimed by >1 node:', shared.length);
for (const [p, ns] of shared.slice(0, 20)) console.log('  ', p, '<-', [...new Set(ns)].join(', '));
"
```

Expected: `distinct resolved paths` around 399, and every entry in the shared list is a *genuinely* shared file (a Contracts type used by two components in the same container), **not** two different files that collapsed onto one path. Read the list. If `src/main.ts` from Full Client and Streaming Client still resolve to the same path, their roots are wrong — fix the overrides and repeat.

- [ ] **Step 6: Write the backfill**

Run:

```bash
pnpm --filter @hyphae/server exec tsx scripts/backfill-roots.ts hyphae-cctv-new.json --write
git diff --stat apps/server/hyphae-cctv-new.json
```

Expected: the file is rewritten, and the script reports zero issues (it refuses to write otherwise).

- [ ] **Step 7: Confirm the acceptance criteria**

Run:

```bash
pnpm --filter @hyphae/server exec tsx -e "
import { readFileSync } from 'node:fs';
import { HyphaeModelSchema, validateModel, resolveProfile, resolveRef } from '@hyphae/schema';
const m = HyphaeModelSchema.parse(JSON.parse(readFileSync('hyphae-cctv-new.json','utf8')));
const issues = validateModel(m, resolveProfile(m));
const refs = m.nodes.flatMap(n => n.codeRefs.map(r => resolveRef(m.nodes, n.id, r)));
console.log('nodes:', m.nodes.length, 'connections:', m.connections.length);
console.log('total issues:', issues.length);
console.log('refs:', refs.length, '| unresolvable:', refs.filter(r => r === null).length);
console.log('containers with a root:', m.nodes.filter(n => n.type === 'Container' && n.root).length);
"
```

Expected: `total issues: 0`, `unresolvable: 0`, and all 11 containers carrying a root.

- [ ] **Step 8: Run the full suite**

Run: `pnpm -r test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/server/scripts/backfill-roots.ts apps/server/hyphae-cctv-new.json
git commit -m "chore(server): backfill container roots and rewrite refs root-relative"
```

---

## Task 7: Teach the convention to the modeling skill and docs

**Files:**
- Modify: `plugins/hyphae-modeling/SKILL.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: the shipped behaviour of Tasks 1–6.
- Produces: no code.

The program plan is explicit that `plugins/hyphae-modeling/` encodes the current ref convention, so without this task every model built after the phase reintroduces unanchored refs. This is not documentation polish — it is the thing that keeps the validation from firing constantly.

- [ ] **Step 1: Read the skill to find where refs are taught**

Run:

```bash
grep -rn "codeRefs\|ref" plugins/hyphae-modeling/ --include=*.md
```

Note every place that shows a `codeRefs` example or describes the path convention.

- [ ] **Step 2: Update the skill**

At each location found, make the guidance say:

- Declare `root` on the System (the repo root, often `""` — omit it) and on **every Container** (its subtree, e.g. `endpoints/media_gateway/backend/`). Components normally inherit and declare no root.
- Write every `codeRefs` entry **relative to the nearest ancestor root** — `src/api/Client.ts`, never `endpoints/stream_keeper/frontend/src/api/Client.ts`.
- The syntax table (directory / file / symbol / line range / glob) from `docs/MODEL.md` §3.7.
- Prefer a directory or glob Ref over a long list of file Refs.
- After a modeling pass, call `validate_model` and fix every `unanchored-ref` and `bad-root` issue; use `resolve_refs` to confirm a ref anchors where intended.

- [ ] **Step 3: Update the README**

In `README.md`, wherever the node fields or the MCP tool list are documented, add `root` to the node field list with a one-line description, and `resolve_refs` to the read-tool list. Leave the rest of the README alone — the program plan says to refresh it per phase, not to rewrite it.

- [ ] **Step 4: Verify nothing contradicts**

Run:

```bash
grep -rn "endpoints/.*\.ts\|endpoints/.*\.cs" plugins/hyphae-modeling/ README.md docs/
```

Expected: no remaining example teaching a long repo-relative ref as the thing to write in `codeRefs`. Fix any that survive.

- [ ] **Step 5: Run the full suite**

Run: `pnpm -r test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add plugins/hyphae-modeling README.md
git commit -m "docs: teach roots and root-relative refs in the modeling skill and README"
```

---

## Phase acceptance criteria

Checked after Task 7:

- [ ] Every ref in `hyphae-cctv-new.json` resolves to exactly one path (`unresolvable: 0` from Task 6 Step 7).
- [ ] The 16 known ambiguities are gone, and reintroducing one — a codeRef on a node whose ancestors declare no root — is caught by `validateModel` as `unanchored-ref` (Task 3 Step 5).
- [ ] A `root` that is not a directory Ref is caught as `bad-root`.
- [ ] `modelGaps` performs no filesystem access unless `checkDisk` is passed.
- [ ] `root` is writable over MCP and editable in the side panel.
- [ ] `pnpm -r test` passes and the fixture loads without migration errors.

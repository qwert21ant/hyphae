# Codebase Structure Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure `apps/web` into a feature-first hierarchy and split the four files that have outgrown a single reading, without changing any behaviour.

**Architecture:** `apps/web/src` becomes `features/{canvas,outline,inspector,toolbar}` + `core/` + `state/` + `styles/`, reached through a `@/` path alias. One new class, `NodeTree`, absorbs five duplicated cycle-guarded parent walks. `focusView.ts`, `Canvas.tsx` and `apps/server/src/mcp.ts` split by job. CSS moves next to its feature behind one ordered index.

**Tech Stack:** pnpm workspaces, Vite, React 18, @xyflow/react 12, Zustand, Zod, Vitest + jsdom, Hono, MCP SDK.

**Spec:** `docs/superpowers/specs/2026-07-31-codebase-structure-design.md`

## Global Constraints

- **`pnpm -r test` must end every task at 662 green** — 147 schema, 107 server, 408 web, 44 test files. Baseline verified on `master` at `20a74f4`.
- **No test's assertions may change.** Only import paths, file locations, and two `readFileSync` paths (Task 7). **If a test needs its assertions rewritten, behaviour moved — stop and report rather than adjusting the test.** This is the only guard on a large mechanical diff.
- **Never run bare `pnpm vitest run` from the repo root** — there is no root vitest config, so web tests run without jsdom and report dozens of bogus failures. Use `pnpm -r test`, or `cd apps/web` first.
- **`apps/server/hyphae-baritone.json` is permanently untracked — never `git add` it.** Stage explicit paths, never `git add -A`. Verify with `git status --short` before every commit.
- **Comments move verbatim with the code they explain.** The granularity-reconciliation comment in `focusView.ts` and the `!important` / no-border-radius notes in `Canvas.tsx` are not re-derivable from the code. Losing them is a task failure.
- **No colour literal anywhere in `apps/web/src` outside `tokens.css`** — no hex, no `rgb()`/`hsl()`. Enforced by `tokens.test.ts`.
- Branch is `refactor/web-structure`, already cut. Commit per task, conventional commits with a scope, ending with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Roughly 80 `act(...)` warnings in the web suite are pre-existing noise, not a regression.

**This plan refines spec §10:** it adds the NUL-byte fix (Task 1) and the `verbColors` extraction (Task 4), which the spec folded into other commits. Task count is 10, not 9.

---

### Task 1: Make `reactflow.ts` greppable, add the `@/` alias

`apps/web/src/reactflow.ts` contains two **raw NUL bytes** at line 186 — a literal `\0` character was typed into a template literal instead of the escape sequence:

```ts
const key = e.source < e.target ? `${e.source}<NUL>${e.target}` : `${e.target}<NUL>${e.source}`;
```

This makes `file` report `data` and makes grep/ripgrep classify the file as **binary and skip it silently**. Every later task in this plan uses grep sweeps to rewrite imports; a skipped file means a missed rename with no error. Fix this first.

**Files:**
- Modify: `apps/web/src/reactflow.ts:186`
- Modify: `apps/web/tsconfig.json`, `apps/web/vite.config.ts`, `apps/web/vitest.config.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: the `@/` alias resolving to `apps/web/src/`, usable in both `src` and `test` files, in tsc, Vite and Vitest.

- [ ] **Step 1: Confirm the NUL bytes exist and locate them**

```bash
node -e "const b=require('fs').readFileSync('apps/web/src/reactflow.ts');const s=b.toString('latin1');let l=1;for(let i=0;i<s.length;i++){if(s[i]==='\n')l++;if(s.charCodeAt(i)===0)console.log('NUL line',l);}"
```

Expected: `NUL line 186` twice.

- [ ] **Step 2: Replace the raw NUL bytes with the `\0` escape**

Rewrite line 186 so the separator is the two-character escape `\0` inside the template literal. The resulting string value is byte-identical at runtime — this is a source-encoding fix, not a behaviour change.

```ts
const key = e.source < e.target ? `${e.source}\0${e.target}` : `${e.target}\0${e.source}`;
```

- [ ] **Step 3: Verify the file is now plain text**

```bash
file apps/web/src/reactflow.ts
grep -c "export" apps/web/src/reactflow.ts
```

Expected: `ASCII text` (or `UTF-8 Unicode text`), NOT `data`. The grep prints a count, NOT "Binary file ... matches".

- [ ] **Step 4: Run the tests — the pair-key behaviour must be unchanged**

```bash
pnpm -r test
```

Expected: 662 passed. `reactflow.test.ts` (249 lines) covers this key-building path.

- [ ] **Step 5: Add the alias to all three configs**

All three, or tests and build disagree about what `@/` means.

`apps/web/tsconfig.json` — add to `compilerOptions`:

```json
"baseUrl": ".",
"paths": { "@/*": ["src/*"] }
```

`apps/web/vite.config.ts` — add alongside `plugins`:

```ts
import { fileURLToPath, URL } from 'node:url';
// ...
resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
```

`apps/web/vitest.config.ts` — the same `resolve` block. Vitest does not inherit `vite.config.ts` here because this project has a separate `vitest.config.ts`; it must be declared twice.

- [ ] **Step 6: Prove the alias resolves from both `src` and `test`**

Temporarily add to `apps/web/test/domStubs.test.ts`:

```ts
import { VERB_CLASS_COLOR } from '@/reactflow';
it('resolves the @ alias', () => { expect(VERB_CLASS_COLOR).toBeTruthy(); });
```

```bash
cd apps/web && pnpm test
```

Expected: PASS (409 web tests with the temporary one). Then **remove the temporary test and its import**, and re-run to confirm 408.

- [ ] **Step 7: Typecheck and build**

```bash
pnpm -r build
```

Expected: clean, no TS errors.

- [ ] **Step 8: Commit**

```bash
git status --short
git add apps/web/src/reactflow.ts apps/web/tsconfig.json apps/web/vite.config.ts apps/web/vitest.config.ts
git commit -m "$(cat <<'EOF'
refactor(web): make reactflow.ts greppable, add the @/ alias

Two raw NUL bytes sat in a template literal on line 186 — a literal control
character where the \0 escape was meant. The value is identical at runtime, but
grep and ripgrep classify the file as binary and skip it WITHOUT error, so any
mechanical import sweep silently missed it. That is a landmine under a refactor
built on sweeps, so it goes first.

The @/ alias is declared in tsconfig, vite and vitest — all three, since this
project has a standalone vitest config that does not inherit vite's resolve.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Move `apps/web/src` into the feature tree

Pure relocation. **No file's contents change except its import statements.** Do not rename anything, do not split anything, do not "improve" anything encountered along the way.

**Files:** every file in `apps/web/src` and `apps/web/test`. Use `git mv` so history follows.

**Interfaces:**
- Consumes: the `@/` alias from Task 1.
- Produces: the tree below. Every later task addresses files by these paths.

**Source moves:**

| From `apps/web/src/` | To `apps/web/src/` |
|---|---|
| `Canvas.tsx` | `features/canvas/Canvas.tsx` |
| `GroupNode.tsx` | `features/canvas/nodes/GroupNode.tsx` |
| `NodeBox.tsx` | `features/canvas/nodes/NodeBox.tsx` |
| `NodeShape.tsx` | `features/canvas/nodes/NodeShape.tsx` |
| `GhostNode.tsx` | `features/canvas/nodes/GhostNode.tsx` |
| `GhostGroupNode.tsx` | `features/canvas/nodes/GhostGroupNode.tsx` |
| `PatternMemberNode.tsx` | `features/canvas/nodes/PatternMemberNode.tsx` |
| `FloatingEdge.tsx` | `features/canvas/edges/FloatingEdge.tsx` |
| `floating.ts` | `features/canvas/edges/floating.ts` |
| `Legend.tsx` | `features/canvas/overlay/Legend.tsx` |
| `FilterPanel.tsx` | `features/canvas/overlay/FilterPanel.tsx` |
| `layout.ts` | `features/canvas/layout.ts` |
| `reactflow.ts` | `features/canvas/reactflow.ts` |
| `shapes.ts` | `features/canvas/shapes.ts` |
| `patternView.ts` | `features/canvas/patternView.ts` |
| `flowOverlay.ts` | `features/canvas/flowOverlay.ts` |
| `TreePanel.tsx` | `features/outline/TreePanel.tsx` |
| `SidePanel.tsx` | `features/inspector/SidePanel.tsx` |
| `ConnectionList.tsx` | `features/inspector/ConnectionList.tsx` |
| `FieldRows.tsx` | `features/inspector/FieldRows.tsx` |
| `fieldLayout.ts` | `features/inspector/fieldLayout.ts` |
| `Toolbar.tsx` | `features/toolbar/Toolbar.tsx` |
| `Altimeter.tsx` | `features/toolbar/Altimeter.tsx` |
| `SearchBox.tsx` | `features/toolbar/SearchBox.tsx` |
| `focusView.ts` | `core/focusView.ts` |
| `hashRoute.ts` | `core/hashRoute.ts` |
| `store.ts` | `state/store.ts` |
| `api.ts` | `state/api.ts` |
| `theme.ts` | `state/theme.ts` |

`main.tsx`, `App.tsx`, `styles.css` and `styles/*.css` stay where they are. `core/focusView.ts` stays a single file in this task — Task 5 splits it.

**Test moves** (mirror the source):

| From `apps/web/test/` | To `apps/web/test/` |
|---|---|
| `Canvas.test.tsx` | `features/canvas/Canvas.test.tsx` |
| `NodeBox.test.tsx` | `features/canvas/nodes/NodeBox.test.tsx` |
| `NodeShape.test.tsx` | `features/canvas/nodes/NodeShape.test.tsx` |
| `PatternMemberNode.test.tsx` | `features/canvas/nodes/PatternMemberNode.test.tsx` |
| `floating.test.ts` | `features/canvas/edges/floating.test.ts` |
| `Legend.test.tsx` | `features/canvas/overlay/Legend.test.tsx` |
| `layout.test.ts` | `features/canvas/layout.test.ts` |
| `reactflow.test.ts` | `features/canvas/reactflow.test.ts` |
| `shapes.test.ts` | `features/canvas/shapes.test.ts` |
| `patternView.test.ts` | `features/canvas/patternView.test.ts` |
| `flowOverlay.test.ts` | `features/canvas/flowOverlay.test.ts` |
| `TreePanel.test.tsx` | `features/outline/TreePanel.test.tsx` |
| `SidePanel.test.tsx` | `features/inspector/SidePanel.test.tsx` |
| `ConnectionList.test.tsx` | `features/inspector/ConnectionList.test.tsx` |
| `FieldRows.test.tsx` | `features/inspector/FieldRows.test.tsx` |
| `fieldLayout.test.ts` | `features/inspector/fieldLayout.test.ts` |
| `Toolbar.test.tsx` | `features/toolbar/Toolbar.test.tsx` |
| `Altimeter.test.tsx` | `features/toolbar/Altimeter.test.tsx` |
| `SearchBox.test.tsx` | `features/toolbar/SearchBox.test.tsx` |
| `focusView.test.ts` | `core/focusView.test.ts` |
| `hashRoute.test.ts` | `core/hashRoute.test.ts` |
| `store.test.ts` | `state/store.test.ts` |
| `theme.test.ts` | `state/theme.test.ts` |
| `tokens.test.ts` | `styles/tokens.test.ts` |
| `contrast.test.ts` | `styles/contrast.test.ts` |

`App.test.tsx`, `domStubs.test.ts` and `setup.ts` stay at `test/`.

`setup.ts` is referenced by `vitest.config.ts` as `./test/setup.ts` — it does not move, so that path stays correct.

- [ ] **Step 1: Create the directories and `git mv` every file**

```bash
cd apps/web
mkdir -p src/features/canvas/nodes src/features/canvas/edges src/features/canvas/overlay \
         src/features/outline src/features/inspector src/features/toolbar src/core src/state
mkdir -p test/features/canvas/nodes test/features/canvas/edges test/features/canvas/overlay \
         test/features/outline test/features/inspector test/features/toolbar test/core test/state test/styles
```

Then one `git mv` per row of both tables above.

- [ ] **Step 2: Rewrite every intra-package import to the `@/` alias**

Every relative import between moved files becomes an alias import. In `src`, `./store` becomes `@/state/store`, `./focusView` becomes `@/core/focusView`, `./NodeBox` becomes `@/features/canvas/nodes/NodeBox`, and so on. In `test`, `../src/focusView` becomes `@/core/focusView`.

Do **not** alias `@hyphae/schema` or any node_modules import. Do not alias `App.tsx`'s `import './styles.css'` — it is a sibling and stays relative.

The full pre-move import graph, to check your work against:

```
Altimeter    → store, focusView(breadcrumbPath)
App          → store, api, hashRoute, Canvas, SidePanel, TreePanel, Toolbar, ./styles.css
Canvas       → store, focusView, layout, reactflow, flowOverlay, patternView,
               GroupNode, NodeBox, GhostNode, GhostGroupNode, PatternMemberNode,
               FloatingEdge, FilterPanel, Legend
ConnectionList → store, reactflow(VERB_CLASS_COLOR)
FieldRows    → fieldLayout
FilterPanel  → store, reactflow(VERB_CLASS_COLOR)
FloatingEdge → floating
GhostGroupNode → store
GhostNode    → store, NodeBox(type), shapes, NodeShape, layout
GroupNode    → (nothing)
Legend       → reactflow(LAYER_COLOR, VERB_CLASS_COLOR), shapes, NodeShape
NodeBox      → shapes, NodeShape, layout
NodeShape    → shapes
PatternMemberNode → patternView(type), layout, store
SearchBox    → store
SidePanel    → store, focusView, ConnectionList, FieldRows, fieldLayout
Toolbar      → store, Altimeter, SearchBox, theme
TreePanel    → store
main         → App
layout       → focusView(type)
patternView  → layout
store        → focusView(stepReveal), theme, api
```

- [ ] **Step 3: Verify no relative cross-directory imports survived**

```bash
cd apps/web && grep -rn "from '\.\./\.\." src test | grep -v node_modules
```

Expected: no output. A `../..` import means a file was moved but its import was not converted.

- [ ] **Step 4: Run the tests**

```bash
pnpm -r test
```

Expected: 662 passed, 44 test files. A "Cannot find module" failure means a missed import rewrite.

- [ ] **Step 5: Confirm the CSS tests still resolve their fixed paths**

`tokens.test.ts` and `contrast.test.ts` build paths from `process.cwd()`, not from `import.meta.url` (which is an **http** URL under jsdom). `process.cwd()` is the package root regardless of how deep the test file sits, so moving them into `test/styles/` is safe. The test run in Step 4 proves it — confirm `styles/tokens.test.ts` and `styles/contrast.test.ts` appear as passed in the output, not skipped.

- [ ] **Step 6: Build**

```bash
pnpm -r build
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
git status --short
git add apps/web/src apps/web/test
git commit -m "$(cat <<'EOF'
refactor(web): move src into a feature-first tree

The flat src directory gave no signal about what belonged to what. Components,
their pure logic and (from a later commit) their CSS now sit together under
features/{canvas,outline,inspector,toolbar}; core/ holds what more than one
feature imports, state/ holds the store and its two collaborators.

Relocation only — no file's contents changed beyond its import statements, and
no test's assertions changed. test/ mirrors src/ so a test sits where its
subject does; both reach each other through the @/ alias rather than ../../..

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Verify the move changed nothing (checkpoint)

A safety gate, not a code change. The Task 2 diff is large and mechanical; this proves it was *only* mechanical before anything semantic happens on top of it.

**Files:** none modified.

- [ ] **Step 1: Diff every moved file against its pre-move content, ignoring import lines**

```bash
cd /c/projects/hyphae
for f in $(git diff --name-only --diff-filter=R HEAD~1 HEAD 2>/dev/null || true); do :; done
git diff HEAD~1 HEAD -M --stat
```

Then, for each moved file, confirm the only changed lines are `import` lines:

```bash
git diff HEAD~1 HEAD -M -- apps/web/src apps/web/test \
  | grep -E '^[+-]' | grep -vE '^[+-]{3}' | grep -vE "^[+-]\s*import" | grep -vE "^[+-]\s*$"
```

Expected: **no output.** Any line printed is a non-import change that slipped into a pure-move commit — investigate it before continuing.

- [ ] **Step 2: Confirm the file inventory is complete**

```bash
cd apps/web && ls src/*.ts src/*.tsx 2>/dev/null
```

Expected: only `main.tsx` and `App.tsx`. Anything else was left behind by the move.

- [ ] **Step 3: Record the result**

No commit. Report to the reviewer whether Step 1 produced output. If it did, stop and fix in a follow-up commit before Task 4.

---

### Task 4: Extract `core/verbColors.ts`

`VERB_CLASS_COLOR` and `LAYER_COLOR` live in `reactflow.ts`, which is now canvas code — but `ConnectionList` and `FilterPanel` (inspector) and `Legend` import them. Two of those are not canvas. The colour maps are plain data with no React Flow dependency, so they move to `core/`; the React Flow adapters stay behind.

**Files:**
- Create: `apps/web/src/core/verbColors.ts`
- Modify: `apps/web/src/features/canvas/reactflow.ts`
- Modify: `apps/web/src/features/inspector/ConnectionList.tsx`, `apps/web/src/features/canvas/overlay/FilterPanel.tsx`, `apps/web/src/features/canvas/overlay/Legend.tsx`
- Modify: `apps/web/test/features/canvas/reactflow.test.ts` (import path only)

**Interfaces:**
- Consumes: the tree from Task 2.
- Produces: `@/core/verbColors` exporting `LAYER_COLOR: Record<string, { bg: string; border: string }>`, `VERB_CLASS_COLOR: Record<VerbClass, string>`, and `layerColorOf(type: string): { bg: string; border: string }`.

- [ ] **Step 1: Move the three declarations into the new file**

Cut `LAYER_COLOR` (currently `reactflow.ts:10`), `layerColorOf` (`:15`) and `VERB_CLASS_COLOR` (`:40`) verbatim into `apps/web/src/core/verbColors.ts`, with their comments and their `@hyphae/schema` imports. `layerColorOf` goes with `LAYER_COLOR` because it is that map's only reader.

- [ ] **Step 2: Re-export from `reactflow.ts` for its own callers**

`reactflow.ts` still uses these internally (`nodeVisual`, `focusViewToFlow`). Import them from `@/core/verbColors`. Do **not** re-export them from `reactflow.ts` — the point is that non-canvas code stops importing canvas code, and a re-export would leave that path open.

- [ ] **Step 3: Repoint the three consumers**

`ConnectionList.tsx`, `FilterPanel.tsx` and `Legend.tsx` import from `@/core/verbColors` instead of `@/features/canvas/reactflow`. `Legend.tsx` imports both `LAYER_COLOR` and `VERB_CLASS_COLOR`.

- [ ] **Step 4: Repoint the test**

`test/features/canvas/reactflow.test.ts` imports these names — point those imports at `@/core/verbColors`. **Its assertions do not change.**

- [ ] **Step 5: Verify no non-canvas file imports canvas internals**

```bash
cd apps/web && grep -rn "features/canvas" src/features/inspector src/features/outline src/features/toolbar src/core src/App.tsx
```

Expected: no output.

- [ ] **Step 6: Run tests and build**

```bash
pnpm -r test && pnpm -r build
```

Expected: 662 passed, clean build. `tokens.test.ts` must still pass — it asserts every `var()` resolves and every token is referenced, and these maps are where several `--verb-*` and `--alt-*` tokens are referenced. If a token becomes unreferenced, a declaration was dropped rather than moved.

- [ ] **Step 7: Commit**

```bash
git status --short
git add apps/web/src/core/verbColors.ts apps/web/src/features apps/web/test/features
git commit -m "$(cat <<'EOF'
refactor(web): lift the colour maps out of canvas code

LAYER_COLOR and VERB_CLASS_COLOR are plain data with no React Flow dependency,
but they sat in reactflow.ts — so the inspector's ConnectionList and the two
canvas overlays all reached into canvas internals to read a colour. They move to
core/, which is exactly what core/ is for: the things more than one feature
needs.

reactflow.ts imports them rather than re-exporting them, so the old path stays
closed.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Extract `core/NodeTree.ts`

The one new class. Today five functions each rebuild `new Map(model.nodes.map((n) => [n.id, n]))` and each re-implement the same `seen`-guarded parent walk. `buildFocusView` then threads that map through every helper by hand.

**Files:**
- Create: `apps/web/src/core/NodeTree.ts`
- Create: `apps/web/test/core/NodeTree.test.ts`
- Modify: `apps/web/src/core/focusView.ts`

**Interfaces:**
- Consumes: `HyphaeModel`, `Node` from `@hyphae/schema`; `c4Backend`, `layerOfType`.
- Produces:

```ts
export class NodeTree {
  constructor(model: HyphaeModel);
  get(id: string): Node | undefined;
  has(id: string): boolean;
  parentOf(node: Node): string | null;
  ancestors(id: string): Node[];
  depthOf(node: Node): number;
  rootAncestor(id: string): string;
  childOf(id: string, ancestorId: string): string | null;
  layerOf(id: string): string;
  representativeAt(id: string, focusId: string | null, focusLayer: string): string;
  focusLayerOf(focusId: string | null): string;
  representativeWith(endpointId: string, focusLayer: string): string;
}
```

Later tasks call these exact names.

**Semantics to preserve exactly** (read the current `focusView.ts` before writing):

- `parentOf(node)` returns `node.parentId` only when that id **exists in the model**; otherwise `null`. `stepReveal` relies on this — a dangling `parentId` counts as top-level.
- `ancestors(id)` walks parents from the node's parent upward, guarded by a `seen` set, stopping on a cycle. This is the single place the guard now lives.
- `rootAncestor(id)` returns the **last resolvable** ancestor id, and returns `id` itself when the node is missing.
- `childOf(id, ancestorId)` returns the descendant of `ancestorId` on the path to `id` — i.e. the node whose `parentId === ancestorId` — or `null` when `id` is not in that subtree. Returns `id` itself when it is already a direct child.
- `layerOf(id)` is `layerOfType(c4Backend, node.type) ?? ''`.
- `focusLayerOf(focusId)` is the focus node's layer, or `c4Backend.layers[0]` at the root view (`focusId === null`).
- `representativeWith(endpointId, focusLayer)`: returns the endpoint unchanged when its layer index is **at or above** the focus layer index (`<=`, since index 0 is the top layer); otherwise walks up to the ancestor **on** `focusLayer`, falling back to the highest resolvable ancestor.
- `representativeAt(id, focusId, focusLayer)`: root view (`!focusId`) → `rootAncestor(id)`; `id === focusId` → `focusId`; inside the focus subtree → `childOf(id, focusId)`; otherwise → `representativeWith(id, focusLayer)`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/core/NodeTree.test.ts`. These cover the behaviours the five call sites depend on, including the two that are easy to get wrong (the cycle guard and the dangling-parent rule).

```ts
import { describe, expect, it } from 'vitest';
import { emptyModel, type HyphaeModel, type Node } from '@hyphae/schema';
import { NodeTree } from '@/core/NodeTree';

const node = (id: string, type: string, parentId?: string): Node => ({
  id, name: id, type, description: '', parentId: parentId ?? null,
  fields: {}, tags: [], refs: [],
} as unknown as Node);

const modelOf = (...nodes: Node[]): HyphaeModel => ({ ...emptyModel(), nodes });

describe('NodeTree', () => {
  it('treats a parentId absent from the model as top-level', () => {
    const t = new NodeTree(modelOf(node('a', 'Container', 'ghost')));
    expect(t.parentOf(t.get('a')!)).toBeNull();
    expect(t.depthOf(t.get('a')!)).toBe(0);
  });

  it('stops walking on a parent cycle instead of hanging', () => {
    const t = new NodeTree(modelOf(
      node('a', 'Container', 'b'),
      node('b', 'Container', 'a'),
    ));
    expect(t.ancestors('a').length).toBeLessThanOrEqual(2);
    expect(t.rootAncestor('a')).toBeDefined();
  });

  it('returns the direct child of an ancestor, or null outside the subtree', () => {
    const t = new NodeTree(modelOf(
      node('sys', 'System'),
      node('con', 'Container', 'sys'),
      node('cmp', 'Component', 'con'),
      node('other', 'System'),
    ));
    expect(t.childOf('cmp', 'sys')).toBe('con');
    expect(t.childOf('con', 'sys')).toBe('con');
    expect(t.childOf('other', 'sys')).toBeNull();
  });

  it('reports depth as the number of resolvable ancestors', () => {
    const t = new NodeTree(modelOf(
      node('sys', 'System'),
      node('con', 'Container', 'sys'),
      node('cmp', 'Component', 'con'),
    ));
    expect(t.depthOf(t.get('sys')!)).toBe(0);
    expect(t.depthOf(t.get('cmp')!)).toBe(2);
  });

  it('leaves an endpoint at or above the focus layer as itself', () => {
    const t = new NodeTree(modelOf(node('ext', 'ExternalSystem')));
    expect(t.representativeWith('ext', 'Container')).toBe('ext');
  });

  it('rolls a deeper endpoint up to its ancestor on the focus layer', () => {
    const t = new NodeTree(modelOf(
      node('sys', 'System'),
      node('con', 'Container', 'sys'),
      node('cmp', 'Component', 'con'),
    ));
    expect(t.representativeWith('cmp', 'Container')).toBe('con');
  });

  it('uses the top layer as the focus layer at the root view', () => {
    const t = new NodeTree(modelOf(node('sys', 'System')));
    expect(t.focusLayerOf(null)).toBeTruthy();
    expect(t.rootAncestor('sys')).toBe('sys');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd apps/web && pnpm test -- core/NodeTree
```

Expected: FAIL — `Cannot find module '@/core/NodeTree'`.

- [ ] **Step 3: Write `NodeTree`**

Build the id→node `Map` once in the constructor. Implement `ancestors()` as the one guarded walk and express `depthOf`, `rootAncestor` and `childOf` in terms of it where that does not change their semantics — but **preserve each function's exact current return value in every edge case listed above**, including the missing-node fallbacks. When in doubt, copy the current loop body rather than generalising.

- [ ] **Step 4: Run the new test**

```bash
cd apps/web && pnpm test -- core/NodeTree
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Rewrite `focusView.ts` to use it**

Delete `representativeWith`, `childOfFocus`, `rootAncestor`, `focusLayerOf` and `representativeAtFocus` from `focusView.ts` and call the `NodeTree` methods instead. Inside `stepReveal`, delete the local `parentOf` and `depthOf` and use the tree's. In `buildFocusView`, construct `const tree = new NodeTree(model)` once and stop threading `nodes` through helpers — but keep the local `nodes` Map if it is still used for direct lookups, or replace those with `tree.get()`.

`export function representative(model, endpointId, focusLayer)` stays exported with its current signature; it constructs a `NodeTree` internally.

- [ ] **Step 6: Run the full suite**

```bash
pnpm -r test
```

Expected: 669 passed (662 + the 7 new `NodeTree` tests), 45 test files. **`focusView.test.ts` (556 lines) must pass with zero edits.** If it fails, a walk's semantics changed — fix `NodeTree`, do not touch the test.

- [ ] **Step 7: Build**

```bash
pnpm -r build
```

- [ ] **Step 8: Commit**

```bash
git status --short
git add apps/web/src/core/NodeTree.ts apps/web/test/core/NodeTree.test.ts apps/web/src/core/focusView.ts
git commit -m "$(cat <<'EOF'
refactor(web): collapse five parent walks into NodeTree

representativeWith, childOfFocus, rootAncestor, breadcrumbPath and stepReveal's
local depthOf each rebuilt the id->node Map and each re-implemented the same
seen-guarded ancestor walk. Five copies of one loop, and buildFocusView threaded
the Map through every helper by hand.

NodeTree builds the Map once and owns the walk once. The cycle guard now lives in
exactly one place instead of five, which is the actual win — a guard duplicated
five times is a guard that will eventually be forgotten in one.

Semantics are unchanged, including the awkward ones the call sites depend on: a
parentId absent from the model counts as top-level, and rootAncestor returns the
last resolvable ancestor. focusView.test.ts passes unedited.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Split `core/focusView.ts` into its four jobs

**Files:**
- Create: `apps/web/src/core/focusView/index.ts`, `buildFocusView.ts`, `edges.ts`, `types.ts`
- Create: `apps/web/src/core/stepReveal.ts`, `apps/web/src/core/connections.ts`, `apps/web/src/core/breadcrumb.ts`
- Delete: `apps/web/src/core/focusView.ts`
- Modify: importers — `state/store.ts`, `features/canvas/Canvas.tsx`, `features/canvas/layout.ts`, `features/inspector/SidePanel.tsx`, `features/toolbar/Altimeter.tsx`
- Modify: `apps/web/test/core/focusView.test.ts` (import paths only)

**Interfaces:**
- Consumes: `NodeTree` from Task 5.
- Produces:
  - `@/core/focusView` (index) re-exports `buildFocusView`, `representative`, and the types `FocusView`, `FocusEdge`, `ConnFilter`, `Audience`. Existing importers of `@/core/focusView` keep working unchanged.
  - `@/core/stepReveal` exports `stepReveal(model, step)` and `type StepReveal`.
  - `@/core/connections` exports `partitionConnections(model, nodeId)` and `externalConnections(model, nodeId)`.
  - `@/core/breadcrumb` exports `breadcrumbPath(model, focusId)` and `type Crumb`.

**A type lives with the function that produces it.** `types.ts` holds only what `buildFocusView.ts` and `edges.ts` both need — `FocusView`, `FocusEdge`, `ConnFilter`, `Audience`. `StepReveal` goes with `stepReveal.ts`; `Crumb` goes with `breadcrumb.ts`.

- [ ] **Step 1: Create `types.ts`**

Move `ConnFilter`, `Audience`, `FocusEdge` and `FocusView` verbatim, with their per-field comments (`count`, `derived`, `realizedBy`, `direction`, `verb`, `object` each carry one).

- [ ] **Step 2: Create `edges.ts`**

Move `matchesFilter`, the `Entry`/`Pair` types, `realEdgeOf` and `aggregateEdgeOf`. Export them. **Move the long comment block above the pair grouping verbatim** — the paragraph explaining DIRECT vs ROLLED-UP edges and why several direct connections are drawn separately rather than collapsed to a count. It is the rationale for the whole edge model.

- [ ] **Step 3: Create `buildFocusView.ts`**

Move `buildFocusView` and `representative`. **Move the granularity-reconciliation comment verbatim** — the block explaining `expanded` ("a parent shown via its children") and `absorbed` ("a child hidden, represented by its parent"). Also keep the comments on `expandableExternalIds` and `externalGroups`.

- [ ] **Step 4: Create `index.ts`**

```ts
export { buildFocusView, representative } from './buildFocusView';
export type { FocusView, FocusEdge, ConnFilter, Audience } from './types';
```

- [ ] **Step 5: Create `stepReveal.ts`, `connections.ts`, `breadcrumb.ts`**

Move `stepReveal` + `StepReveal`, `partitionConnections` + `externalConnections`, and `breadcrumbPath` + `Crumb` respectively. **`stepReveal`'s 16-line doc comment moves verbatim** — it explains why the focus is the deeper endpoint's parent, and why only a node outside the focus is ever expanded. That rationale is not recoverable from the code, and the invariant it protects (`expandedExternals` is for nodes OUTSIDE the focus) is one CLAUDE.md calls out as biting.

Likewise `partitionConnections`'s doc comment defining outgoing/incoming relative to the subtree.

- [ ] **Step 6: Delete `core/focusView.ts` and repoint importers**

- `state/store.ts`: `stepReveal` now from `@/core/stepReveal`; `ConnFilter`/`Audience` still from `@/core/focusView`.
- `features/toolbar/Altimeter.tsx`: `breadcrumbPath` from `@/core/breadcrumb`.
- `features/inspector/SidePanel.tsx`: `partitionConnections` from `@/core/connections`; `buildFocusView` still from `@/core/focusView`.
- `features/canvas/Canvas.tsx` and `features/canvas/layout.ts`: unchanged — they import `buildFocusView` and the `FocusView` type, which the index still provides.

- [ ] **Step 7: Repoint the test's imports**

`test/core/focusView.test.ts` imports `buildFocusView`, `stepReveal`, `partitionConnections`, `breadcrumbPath` and `representative`. Point each at its new module. **No assertion changes.** Optionally split the test file to mirror the new modules — but only if it is a pure move of `describe` blocks; do not rewrite any test.

- [ ] **Step 8: Run tests and build**

```bash
pnpm -r test && pnpm -r build
```

Expected: 669 passed, clean build.

- [ ] **Step 9: Verify the comments survived**

```bash
cd apps/web && grep -rn "absorbed\|rolled-up\|ROLLED-UP\|deeper endpoint" src/core | head
```

Expected: the granularity and `stepReveal` rationale comments are present in the new files. If they are gone, restore them from `git show HEAD~1:apps/web/src/core/focusView.ts`.

- [ ] **Step 10: Commit**

```bash
git status --short
git add apps/web/src/core apps/web/test/core apps/web/src/state apps/web/src/features
git commit -m "$(cat <<'EOF'
refactor(web): split focusView into its four jobs

focusView.ts held four unrelated things behind one name: building the focus
view, navigating to a flow step, listing a node's boundary-crossing connections,
and computing a breadcrumb. Only the first is a focus view; the other three were
imported by the store, the inspector and the altimeter respectively.

Split by job rather than by size. core/focusView/ keeps the view pipeline and
re-exports through an index, so its existing importers are untouched; stepReveal,
connections and breadcrumb become their own modules next to it.

Types moved to the function that produces them, not to a shared types file:
StepReveal with stepReveal, Crumb with breadcrumbPath. types.ts holds only what
buildFocusView and edges both need.

The long comments moved verbatim with their code. The granularity reconciliation
and the stepReveal rationale are the most valuable lines in the original file and
are not re-derivable from it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Split `Canvas.tsx` into hooks and pure modules

**Files:**
- Create: `apps/web/src/features/canvas/useCanvasView.ts`, `useDrillNavigation.ts`, `highlight.ts`, `flowEdges.ts`
- Modify: `apps/web/src/features/canvas/Canvas.tsx`
- Test: `apps/web/test/features/canvas/Canvas.test.tsx` — **unchanged**

**Interfaces:**
- Consumes: `buildFocusView` (`@/core/focusView`), `layoutFocusView`/`resolveViewPositions` (`@/features/canvas/layout`), `focusViewToFlow`/`highlightSets` (`./reactflow`), `computeFlowOverlay` (`./flowOverlay`), `patternViewToFlow` (`./patternView`), `EDGE_LABEL_CLASS` (`./edges/FloatingEdge`).
- Produces:

```ts
// useCanvasView.ts
export function useCanvasView(): {
  view: FocusView;
  nodes: FlowNode[];
  edges: FlowEdge[];
  overlay: FlowOverlay | null;
  flowActive: boolean;
  patternFlow: { nodes: FlowNode[]; edges: FlowEdge[] } | null;
};

// flowEdges.ts
export function decorateFlowEdges(edges: FlowEdge[], overlay: FlowOverlay | null): FlowEdge[];

// highlight.ts
export function highlightCss(args: {
  hi: { nodes: Set<string>; edges: Set<string> };
  activeId: string | null;
  flowActive: boolean;
  patternActive: boolean;
  strong: boolean;
  accent: string;
  dimEdge: number;
  dimNode: number;
}): string;

// useDrillNavigation.ts
export function useDrillNavigation(): { onNodeClick: (e: unknown, node: FlowNode) => void };
```

- [ ] **Step 1: Extract `highlight.ts` first**

`highlightCss` is already a pure function trapped in a `useMemo` (`Canvas.tsx:154-198`). Move the body into `highlight.ts` with the signature above. **These comments move verbatim and are load-bearing:**

- the `!important` note — the dim rule's two `:not()` pseudo-classes give it specificity (0,4,0), which outranks the `[data-id]` restore (0,3,0), so without `!important` the active node stays dimmed;
- the "No border-radius here" note — the ring's corners are the node wrapper's corners, and a radius that only exists while highlighted snaps back to 0 while the shadow is still fading out, so it lives permanently in `canvas.css` per node type;
- the 4.2s / 84px pulse pairing note.

In `Canvas.tsx`, the `useMemo` becomes a call to `highlightCss({...})`. Note `patternActive` replaces the inlined `patternFlow` truthiness check — pass `!!patternFlow`.

- [ ] **Step 2: Run the tests after the first extraction alone**

```bash
cd apps/web && pnpm test -- Canvas
```

Expected: PASS, 31 tests. `Canvas.test.tsx` asserts the generated CSS via the `hlCss(container)` pattern (React Flow renders zero edges in jsdom, so the CSS *is* the observable). It must pass with **zero edits** — it is the only thing verifying this extraction.

- [ ] **Step 3: Extract `flowEdges.ts`**

Move the `displayEdges` body (`Canvas.tsx:94-124`) into `decorateFlowEdges(edges, overlay)`. This includes the `STEP_NUM`/`stepBadge` constants (`:25-26`) and the ephemeral-edge construction. Keep the comment explaining that only edges change reference, never nodes — "that is what blanks the canvas".

- [ ] **Step 4: Extract `useCanvasView.ts`**

Move the memo chain (`Canvas.tsx:57-89`) plus the `setOffViewSteps` effect (`:81-84`). **Preserve the memo dependency arrays exactly.** The base-layout memo is keyed on `[model, focusId]` **only** — this is what stops the connection filter, the audience toggle and expanding an external from reflowing the graph. `EMPTY_EXPANDED` must stay a `useMemo`-stabilised empty Set, or the base view rebuilds every render. Move the comment stating all of this.

`theme` is deliberately read outside every dependency array — keep it out of the hook, or move it with its comment intact.

- [ ] **Step 5: Extract `useDrillNavigation.ts`**

Move `drill` (`:205-209`), the `lastClick` ref, `DOUBLE_CLICK_MS` and `onNodeClick` (`:214-225`). Keep both comments: React Flow suppresses `onNodeDoubleClick` while `nodesDraggable={false}`, and pattern member nodes are keyed by member **name** not node id, so a focus id must be confirmed against `model.nodes` before it is set.

- [ ] **Step 6: Reduce `Canvas.tsx` to composition**

What remains: the store reads it still needs, `hoveredId` state and its reset-on-focus effect, `nodeTypes`/`edgeTypes`/`miniMapColor`, the `activeId`/`strong`/`accent`/`dim*` derivations, the calls into the four new modules, and the JSX. Target ~80 lines.

- [ ] **Step 7: Run the full suite**

```bash
pnpm -r test && pnpm -r build
```

Expected: 669 passed, clean build, `Canvas.test.tsx` unedited.

- [ ] **Step 8: Commit**

```bash
git status --short
git add apps/web/src/features/canvas
git commit -m "$(cat <<'EOF'
refactor(web): split Canvas into hooks and pure modules

Canvas.tsx held four concerns: the memoized view pipeline, the generated
highlight stylesheet, the flow-edge decoration, and double-click drill detection.
The memo chain was longer than the JSX.

highlightCss was already a pure function — it was only trapped inside a useMemo.
It is now directly callable, though Canvas.test.tsx still exercises it through
the rendered DOM and is unchanged: React Flow draws zero edges under jsdom, so
the generated CSS is the only observable, and that test is what verified this
whole split.

The memo dependency arrays are preserved exactly. The base layout stays keyed on
[model, focusId] alone, which is what keeps the connection filter, the audience
toggle and expanding an external from reflowing the graph.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Split the CSS and add the ordered index

**Files:**
- Create: `apps/web/src/features/outline/outline.css`, `features/inspector/inspector.css`, `features/toolbar/toolbar.css`, `app.css`
- Move: `apps/web/src/styles/canvas.css` → `apps/web/src/features/canvas/canvas.css`
- Delete: `apps/web/src/styles/chrome.css`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/test/features/outline/TreePanel.test.tsx` — **`readFileSync` path only, no assertion changes**

`tokens.css` and `base.css` stay in `styles/`.

**Interfaces:**
- Consumes: nothing.
- Produces: the cascade order declared in `styles.css`.

**How `chrome.css` (349 lines) divides.** Read the file; it is already sectioned by comment blocks.

| Destination | Rules |
|---|---|
| `toolbar.css` | `.toolbar`, `.segmented`, the `aria-pressed` rule, `.altimeter` + all `.altimeter-*` band/tag/ring rules, `.search*` (`:1-72`, `:325-337`) |
| `outline.css` | `.tree-panel`, `.tree-panel--collapsed`, `.tree-toggle`, `.tree-row*`, `.tree-guide`, `.tree-twisty`, `.tree-label`, `.tree-steps`, `.tree-step`, `.tree-offview`, `.tree-anchor`, `.tree-members`, `.tree-member*`, `.tree-dim`, `.tree-empty`, `.tree-invalid` (`:73-202`) |
| `inspector.css` | `.panel`, `.chip`, `.tree-kind`, `.field--grid`, `.field--stack`, `.rollup-*` (`:204-273`) |
| `canvas.css` | `.float`, `.filter`, `.legend*` rules (`:275-324`) — appended to the existing `canvas.css` |
| `app.css` | `.app`, `.body`, `[data-separator]*`, `.sep--v`, `.sep--h` (`:338-349`) |

**`.tree-kind` is the ordering trap.** It is a `.chip` modifier and its comment says so explicitly: *"it has to be declared after the class it narrows"*. `.chip` lands in `inspector.css`, so `.tree-kind` **must go to `inspector.css` too** — directly after `.chip` — and must **not** go to `outline.css` despite its name. Putting it in `outline.css` would place it *before* `.chip` in the cascade and silently break the chip. Its comment moves with it.

- [ ] **Step 1: Create the four new files and move the rules**

Move rules **verbatim**, comments included. The comments in this file explain design decisions (why `aria-pressed` drives styling, why the selection ring is inset rather than filled, why `--current` gets no luminance lift, why the tree guides are one hairline per depth) — they are the record of the design rule that luminance is state and hue is meaning.

Preserve **relative order within each destination file** exactly as it was in `chrome.css`.

- [ ] **Step 2: Move `canvas.css` into the canvas feature**

```bash
cd apps/web && git mv src/styles/canvas.css src/features/canvas/canvas.css
```

Then append the `.float`/`.filter`/`.legend*` block from `chrome.css`.

- [ ] **Step 3: Delete `chrome.css` and write the ordered index**

`apps/web/src/styles.css`:

```css
/* The order of these imports IS the cascade. Outside base.css every rule uses class and attribute
   selectors only, so they all have equal specificity and source order is the only thing deciding
   which one wins. A modifier that must beat a class belongs BELOW the file declaring that class —
   this is why .tree-kind sits in inspector.css next to .chip, not in outline.css with the tree. */
@import './styles/tokens.css';
@import './styles/base.css';
@import './features/canvas/canvas.css';
@import './features/outline/outline.css';
@import './features/inspector/inspector.css';
@import './features/toolbar/toolbar.css';
@import './app.css';
```

No `.tsx` imports a stylesheet. `App.tsx` keeps its single `import './styles.css'`.

- [ ] **Step 4: Verify no rule was lost**

Count declarations before and after — the split must be lossless:

```bash
cd apps/web
git show HEAD:apps/web/src/styles/chrome.css | grep -cE "^\s*[a-z-]+\s*:" 
cat src/features/outline/outline.css src/features/inspector/inspector.css \
    src/features/toolbar/toolbar.css src/app.css | grep -cE "^\s*[a-z-]+\s*:"
```

The second count, plus the declarations moved into `canvas.css`, must equal the first. Investigate any shortfall before continuing.

- [ ] **Step 5: Confirm `.tree-kind` follows `.chip`**

```bash
cd apps/web && grep -n "^\.chip\|^\.tree-kind" src/features/inspector/inspector.css
```

Expected: `.chip` on an earlier line than `.tree-kind`, both in this file, and `.tree-kind` absent from `outline.css`.

- [ ] **Step 6: Repoint the CSS-reading test**

`test/features/outline/TreePanel.test.tsx` reads `chrome.css` via `readFileSync` to assert rules with its `rule(css, selector)` helper. Repoint it at `src/features/outline/outline.css`. If it asserts a rule that moved to `inspector.css` (e.g. `.tree-kind`), read that file for that assertion.

**The selectors and assertions do not change.** Note the helper's regexes are anchored to the start of a line (`^\.tree-label\s*\{`) — unanchored, `.tree-label {` also matches inside `.tree-row:hover .tree-label {`. Keep the anchoring.

- [ ] **Step 7: Run tests and build**

```bash
pnpm -r test && pnpm -r build
```

Expected: 669 passed, clean build. `tokens.test.ts` is the real gate here — it walks `src/` recursively and fails if any token declared in `:root` is no longer referenced, or if any `var()` no longer resolves. **Moving a rule's last use of a token kills the token**, so a dropped rule surfaces as a token failure rather than a visual one.

- [ ] **Step 8: Commit**

```bash
git status --short
git add apps/web/src/styles.css apps/web/src/app.css apps/web/src/features apps/web/src/styles apps/web/test/features/outline
git commit -m "$(cat <<'EOF'
refactor(web): co-locate the CSS with its feature

chrome.css was 349 lines covering the toolbar, the outline, the inspector and
the app shell. Each block now sits next to the components it styles; canvas.css
moves into the canvas feature. tokens.css and base.css stay global.

styles.css becomes the ordered index, and its order IS the cascade — that is now
stated in the file. Per-component CSS imports were rejected for exactly this
reason: they would make the cascade the module-graph order, which shifts when
anyone reorders an import, and jsdom loads no stylesheet so the suite could never
catch the regression.

.tree-kind went to inspector.css, not outline.css, despite its name: it is a
.chip modifier and equal specificity means it must be declared after .chip.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Split `apps/server/src/mcp.ts` into `mcp/`

**Files:**
- Create: `apps/server/src/mcp/index.ts`, `api.ts`, `params.ts`, `tools/{nodes,connections,flows,patterns,query,validate}.ts`
- Delete: `apps/server/src/mcp.ts`
- Modify: `apps/server/test/mcp.test.ts` (import path only), `apps/server/package.json` if it names `src/mcp.ts`

**Interfaces:**
- Consumes: `@hyphae/schema`.
- Produces: `@/mcp` — but this package has no alias; use relative paths. `mcp/index.ts` exports `buildTools(api: HyphaeApi)` and the `HyphaeApi` interface, preserving today's public surface.

**The current structure**, which the split follows:

| Lines | Contents | Destination |
|---|---|---|
| 1–72 | imports, `HyphaeApi`, `CreatedEntity`/`ApiResult`, `flowStepSchema`, `flowItemSchema`, `patternMemberSchema` | `api.ts` (interface + types), `params.ts` (zod schemas) |
| 73–109 | `identityOf`, `runVoid` | `tools/shared.ts` |
| 110–325 | `buildTools(api)` — the tool implementations | `tools/*.ts`, recomposed in `tools/index.ts` |
| 326–360 | `httpApi(base)` — HTTP client of the running server | `api.ts` |
| 361–393 | `text`, `fieldDesc`, `fieldToZod`, `fieldsShape` | `params.ts` |
| 394–600 | `registerTool` calls with descriptions | `register.ts` |
| 601–603 | `main()` + the run-directly guard | `index.ts` |

**Critical constraint: `buildTools` must keep returning one flat object with every tool key.** `apps/server/test/mcp.test.ts` (553 lines, 107 tests) calls `buildTools(fakeApi).list_nodes({...})` and friends directly. Split the implementations across `tools/*.ts` as `buildNodeTools(api)`, `buildConnectionTools(api)`, etc., then:

```ts
export function buildTools(api: HyphaeApi) {
  return {
    ...buildNodeTools(api), ...buildConnectionTools(api), ...buildFlowTools(api),
    ...buildPatternTools(api), ...buildQueryTools(api), ...buildValidateTools(api),
  };
}
```

**Tool descriptions and parameter schemas change not at all** — they are the MCP contract, and agents depend on their exact wording.

- [ ] **Step 1: Find how `mcp.ts` is entered**

```bash
grep -rn "mcp" apps/server/package.json package.json .mcp.json apps/server/test/mcp.test.ts | head -20
```

The run-directly guard is `process.argv[1].endsWith('mcp.ts')`. Moving the entry to `mcp/index.ts` **breaks that check** — it must become `endsWith('index.ts')` or, better, a check against the new path. Note what `package.json`'s `mcp` script and `.mcp.json` point at; both may need updating.

- [ ] **Step 2: Create `api.ts` and `params.ts`**

`api.ts`: the `HyphaeApi` interface, `CreatedEntity`, `ApiResult`, and `httpApi`. `params.ts`: `flowStepSchema`, `flowItemSchema`, `patternMemberSchema` and the other exported zod schemas, plus `text`, `fieldDesc`, `fieldToZod`, `fieldsShape`. Keep every `.describe()` string byte-for-byte.

- [ ] **Step 3: Create `tools/shared.ts` and the six tool modules**

`shared.ts` holds `identityOf` and `runVoid`. Each `tools/<group>.ts` exports `build<Group>Tools(api: HyphaeApi)` returning its slice of the object. Grouping:

- `nodes.ts` — `get_node`, `list_nodes`, `create_nodes`, `update_nodes`, `delete_nodes`
- `connections.ts` — `list_connections`, `create_connections`, `update_connections`, `delete_connections`, `rollup_connections`
- `flows.ts` — `list_flows`, `get_flow`, `create_flows`, `update_flows`, `delete_flows`
- `patterns.ts` — `list_patterns`, `get_pattern`, `create_patterns`, `update_patterns`, `delete_patterns`
- `query.ts` — `model_overview`, `get_subgraph`, `resolve_refs`
- `validate.ts` — `validate_model`, `model_gaps`, `describe_profile`

Verify against the real file — the grouping above is derived from the tool names at `mcp.ts:394-600` and must match what `buildTools` actually returns.

- [ ] **Step 4: Create `tools/index.ts` with the recomposed `buildTools`**

As shown above. Then run the server tests alone, before touching registration:

```bash
cd apps/server && pnpm test
```

Expected: 107 passed. `mcp.test.ts` needs only its import path changed, from `../src/mcp` to `../src/mcp/index` (or `../src/mcp`, which resolves to `mcp/index.ts` — prefer whichever the existing style suggests). **No assertion changes.**

- [ ] **Step 5: Create `register.ts` and `index.ts`**

`register.ts` exports `registerAll(server, tools)` containing every `registerTool` call verbatim. `index.ts` holds `main()` — building `httpApi`, `buildTools`, the `McpServer`, `registerAll`, `server.connect(new StdioServerTransport())` — plus the corrected run-directly guard, and re-exports `buildTools` and `HyphaeApi` so importers keep working.

- [ ] **Step 6: Delete `mcp.ts`, update the entry points**

Update `apps/server/package.json`'s `mcp` script and the repo `.mcp.json` if either names `src/mcp.ts`.

- [ ] **Step 7: Run the full suite and build**

```bash
pnpm -r test && pnpm -r build
```

Expected: 669 passed, clean build.

- [ ] **Step 8: Smoke-test the MCP server actually starts**

The test suite exercises `buildTools` but never starts the transport, so a broken run-directly guard or entry path passes every test and fails only in Claude Code. Verify by hand:

```bash
cd /c/projects/hyphae && HYPHAE_FILE=$PWD/apps/server/hyphae-baritone.json pnpm server &
sleep 3
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | pnpm mcp 2>&1 | head -5
```

Expected: a JSON-RPC response listing tools, not a "cannot find module" error or silence. Kill the server afterwards. If `pnpm mcp` produces no output at all, the run-directly guard is still checking for `mcp.ts`.

- [ ] **Step 9: Commit**

```bash
git status --short
git add apps/server/src apps/server/test apps/server/package.json .mcp.json
git commit -m "$(cat <<'EOF'
refactor(server): split mcp.ts into mcp/

603 lines holding four things: the HyphaeApi interface and its HTTP client, the
shared zod tool params, the tool implementations, and 200 lines of registerTool
calls carrying the descriptions agents actually read.

buildTools still returns one flat object with every tool key — mcp.test.ts calls
those keys directly, and its 107 tests are the guard on this split. The tool
names, descriptions and parameter schemas are the MCP contract and are unchanged
byte-for-byte.

The run-directly guard tested process.argv[1].endsWith('mcp.ts'), which no test
covers because the suite never starts the transport. Updated for the new entry
and smoke-tested against a running server.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Update `CLAUDE.md` and the living docs

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md` if it names any moved path

**Interfaces:**
- Consumes: the finished tree.
- Produces: documentation matching the code. Per `CLAUDE.md`, the living docs change in the same branch as the behaviour.

- [ ] **Step 1: Add the structural conventions**

A new section recording the three principles the refactor followed, since these are what future work should follow:

1. **A file has one job.** Components render; pure modules compute; hooks bind the two. A component whose `useMemo` chain is longer than its JSX is hiding a hook or a pure module.
2. **A class earns its place by deleting duplication, not by being a class.** Reach for one when several functions share derived state and each re-derive it — that is why `NodeTree` exists and why nothing else in `apps/web` is a class. Components stay functions (class components cannot use hooks); so do the store and the stateless transforms.
3. **A feature folder owns its components, its pure logic and its CSS.** `core/` holds only what two or more features import. A non-canvas file importing `features/canvas/*` is a layering bug — that is what `core/verbColors.ts` exists to prevent.

- [ ] **Step 2: Add the tree map**

A compact `apps/web/src` tree, and the note that imports use the `@/` alias declared in **three** places — `tsconfig.json`, `vite.config.ts` and `vitest.config.ts` — because this project has a standalone vitest config that does not inherit vite's `resolve`.

- [ ] **Step 3: Rewrite the Styling section's cascade rule**

Replace the `chrome.css`/`canvas.css` convention with: `base.css` is the reset layer and may use element/ID/pseudo selectors; every other stylesheet is class-and-attribute only. **The `@import` order in `styles.css` is the cascade** — equal specificity means source order is the only thing deciding, so a modifier belongs in a file listed below the one declaring the class it narrows. Cite `.tree-kind` living in `inspector.css` next to `.chip`, not in `outline.css`, as the worked example.

Keep the four test-enforced rules (no colour literals outside `tokens.css`, every token referenced and every `var()` resolving, both themes, 33 pairs at 4.5:1) unchanged — they still hold.

- [ ] **Step 4: Update Testing gotchas**

- Repoint the `hlCss(container)` reference to `apps/web/test/features/canvas/Canvas.test.tsx`, and note `highlightCss` in `features/canvas/highlight.ts` is now directly callable for new tests.
- Repoint the `rule(css, selector)` reference to `test/features/outline/TreePanel.test.tsx` reading `features/outline/outline.css`. Keep the line-anchoring warning.
- Add: **`process.cwd()` is what makes the mirrored test tree safe.** Fixture and CSS paths resolve from the package root, not the test file, so a test can sit at any depth. `import.meta.url` is an http URL under jsdom and must not be used.
- Add: **a raw NUL byte makes a file invisible to grep.** `reactflow.ts` had two; a mechanical sweep skips such a file without error. If a rename sweep seems to have missed a file, check `file <path>` for `data`.

- [ ] **Step 5: Update Invariants that bite**

Keep every invariant's content; update the file names. The focus-view pipeline now spans `core/focusView/`, `features/canvas/layout.ts` and `features/canvas/reactflow.ts`. The `expandedExternals` invariant now points at `core/stepReveal.ts`. `BOUNDARY_Z` is in `features/canvas/reactflow.ts`. The memo-key invariant now lives in `features/canvas/useCanvasView.ts`.

- [ ] **Step 6: Update the pnpm test baseline**

`pnpm -r test` baseline becomes **669 green: schema 147, server 107, web 415** (408 + 7 `NodeTree` tests). Verify the real numbers from the last run rather than trusting this line.

- [ ] **Step 7: Check README.md for stale paths**

```bash
grep -n "src/\|apps/web\|mcp\.ts" README.md | head -20
```

Update any path that moved.

- [ ] **Step 8: Verify the docs match reality**

```bash
pnpm -r test
```

Confirm the count in the docs equals the count in the output.

- [ ] **Step 9: Commit**

```bash
git status --short
git add CLAUDE.md README.md
git commit -m "$(cat <<'EOF'
docs: record the structure the refactor settled on

CLAUDE.md gains the three conventions the refactor followed — one job per file,
a class only when it deletes duplication, a feature folder owns its CSS — plus a
map of the new tree and the fact that the @/ alias is declared in three configs.

The styling rule is restated: the @import order in styles.css IS the cascade,
with .tree-kind next to .chip in inspector.css as the worked example of why.

Two gotchas added that cost real time this branch: process.cwd() is what makes
the mirrored test tree safe (import.meta.url is an http URL under jsdom), and a
raw NUL byte makes a file invisible to grep without any error.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §3 target tree | 2 |
| §3 `@/` alias | 1 |
| §3 `core/verbColors.ts` | 4 |
| §4 `NodeTree` | 5 |
| §5.1 `focusView` split | 6 |
| §5.2 `Canvas` split | 7 |
| §5.3 `mcp.ts` split | 9 |
| §5.4 left alone | not a task — `TreePanel`, `packages/schema`, server store are never touched |
| §6 what stays a function | 10 (recorded in `CLAUDE.md`) |
| §7 CSS | 8 |
| §8 verification | Global Constraints + every task's test step; Task 3 is the dedicated gate |
| §9 `CLAUDE.md` | 10 |
| §10 commit sequence | refined: 10 tasks, noted at the top |

**Additions beyond the spec**, both justified inline: the NUL-byte fix (Task 1) and the Task 3 checkpoint.

**Known deviation:** the spec's §8 says "662 green" throughout. Tasks 5–10 expect **669**, because Task 5 adds 7 `NodeTree` tests. The constraint's intent — no existing test's assertions change — holds unchanged.

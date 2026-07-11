# Search-to-focus + Side-panel Direction Split — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a toolbar search box that jumps to any node by name, and split the node side panel's connection list into Incoming/Outgoing sections.

**Architecture:** Two independent web-only features. (A) A `revealNode(id)` store action + a standalone `SearchBox` component in the toolbar. (B) A `partitionConnections` helper in `focusView.ts` that `externalConnections` is re-expressed in terms of, plus a two-section render in `SidePanel`. No graph/layout/MCP/schema changes.

**Tech Stack:** React 18, Zustand, Vitest + @testing-library/react, TypeScript. Tests run with `pnpm --filter @hyphae/web test`.

## Global Constraints

- Package for all commands: `@hyphae/web` (run `pnpm --filter @hyphae/web test`).
- Node/Connection shapes come from `@hyphae/schema`; use `emptyModel()` in tests and the
  `base`/`e` spread helpers already used by the test files.
- The store is a module-level singleton; `beforeEach` resets it with `useStore.getState().setModel(emptyModel(), 0)`.
- Do NOT modify `ConnectionList.tsx` — it is reused by three panels.
- Match existing code style: no semicolyphs beyond current conventions, keep files focused.

---

### Task 1: `partitionConnections` helper in `focusView.ts`

**Files:**
- Modify: `apps/web/src/focusView.ts` (the `externalConnections` function, ~line 269)
- Test: `apps/web/test/focusView.test.ts` (add a `describe('partitionConnections', ...)`)

**Interfaces:**
- Consumes: `HyphaeModel`, `Connection` from `@hyphae/schema`.
- Produces: `export function partitionConnections(model: HyphaeModel, nodeId: string): { outgoing: Connection[]; incoming: Connection[] }`.
  `outgoing` = connections whose `from` is inside the subtree rooted at `nodeId` and `to` is outside;
  `incoming` = `to` inside, `from` outside. Same boundary + non-`realizedBy`-child scoping as
  `externalConnections`. `externalConnections` returns `[...outgoing, ...incoming]`.

- [ ] **Step 1: Write the failing test**

Add to `apps/web/test/focusView.test.ts` (uses the file's existing `model()`, `base`, `e` helpers):

```ts
describe('partitionConnections', () => {
  it('splits boundary connections into outgoing (from inside) and incoming (to inside)', () => {
    const m = model(); // sys › ca › (a1,a2); a1 › k1; cb › b1; ext
    m.connections.push(
      { id: 'out1', from: 'a1', to: 'ext', type: 'Dependency', ...e },  // from inside ca → outgoing
      { id: 'out2', from: 'k1', to: 'b1', type: 'Dependency', ...e },   // k1 under a1, inside → outgoing
      { id: 'in1', from: 'ext', to: 'a1', type: 'Dependency', ...e },   // to inside ca → incoming
    );
    const { outgoing, incoming } = partitionConnections(m, 'ca');
    expect(outgoing.map((c) => c.id).sort()).toEqual(['out1', 'out2']);
    expect(incoming.map((c) => c.id)).toEqual(['in1']);
  });

  it('excludes inner and realizedBy-child connections, and externalConnections is the union', () => {
    const m = model();
    m.connections.push(
      { id: 'kid', from: 'a1', to: 'a2', type: 'Dependency', ...e },    // both inside → excluded
      { id: 'p', from: 'a1', to: 'ext', type: 'Dependency', ...e, realizedBy: ['x'] },
      { id: 'x', from: 'k1', to: 'ext', type: 'Dependency', ...e },     // realized child → excluded
      { id: 'in', from: 'ext', to: 'b1', type: 'Dependency', ...e },    // b1 not under ca → excluded
    );
    const { outgoing, incoming } = partitionConnections(m, 'ca');
    expect(outgoing.map((c) => c.id)).toEqual(['p']);
    expect(incoming).toEqual([]);
    expect(externalConnections(m, 'ca').map((c) => c.id)).toEqual(['p']);
  });
});
```

Also add `partitionConnections` to the import on line 2.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @hyphae/web test -- focusView`
Expected: FAIL — `partitionConnections is not a function` / not exported.

- [ ] **Step 3: Implement**

In `apps/web/src/focusView.ts`, replace the body of `externalConnections` with a thin wrapper and add `partitionConnections` above it. Keep the existing subtree-building logic in the new function:

```ts
export function partitionConnections(model: HyphaeModel, nodeId: string): { outgoing: Connection[]; incoming: Connection[] } {
  const kids = new Map<string, string[]>();
  for (const n of model.nodes) {
    if (n.parentId) (kids.get(n.parentId) ?? kids.set(n.parentId, []).get(n.parentId)!).push(n.id);
  }
  const inSubtree = new Set<string>();
  const stack = [nodeId];
  while (stack.length) {
    const id = stack.pop()!;
    if (inSubtree.has(id)) continue;
    inSubtree.add(id);
    for (const k of kids.get(id) ?? []) stack.push(k);
  }
  const realizedChildren = new Set<string>(model.connections.flatMap((c) => c.realizedBy));
  const outgoing: Connection[] = [];
  const incoming: Connection[] = [];
  for (const c of model.connections) {
    if (realizedChildren.has(c.id)) continue;
    const fromIn = inSubtree.has(c.from);
    const toIn = inSubtree.has(c.to);
    if (fromIn === toIn) continue;     // both in or both out → not a boundary crossing
    if (fromIn) outgoing.push(c); else incoming.push(c);
  }
  return { outgoing, incoming };
}

export function externalConnections(model: HyphaeModel, nodeId: string): Connection[] {
  const { outgoing, incoming } = partitionConnections(model, nodeId);
  return [...outgoing, ...incoming];
}
```

Delete the old `externalConnections` body (the duplicated subtree loop) — keep only the wrapper above.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @hyphae/web test -- focusView`
Expected: PASS — new `partitionConnections` block and the existing `externalConnections` block both green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/focusView.ts apps/web/test/focusView.test.ts
git commit -m "feat(web): add partitionConnections; externalConnections as its union"
```

---

### Task 2: `revealNode` store action

**Files:**
- Modify: `apps/web/src/store.ts` (State type ~line 20, action body ~line 69)
- Test: `apps/web/test/store.test.ts`

**Interfaces:**
- Consumes: existing store `model`, `setFocus`/`select` semantics.
- Produces: `revealNode(id: string): void` on the store. Sets `focusId` to the node's
  `parentId` (or `null` when top-level or the parent is absent from the model), `selectedId`
  to `id`, and resets `expandedExternals` to a new empty `Set`. A missing id is a no-op.

- [ ] **Step 1: Write the failing test**

Add to `apps/web/test/store.test.ts` inside the `describe('editor store', ...)` block:

```ts
it('revealNode focuses the parent and selects a child node', () => {
  const mk = (over: Record<string, unknown>) => ({
    id: 'x', name: 'X', type: 'Component', description: '', parentId: null, codeRefs: [],
    docRefs: [], createdAt: 't', updatedAt: 't', fields: {}, ...over,
  });
  useStore.setState((s) => ({ model: { ...s.model, nodes: [mk({ id: 'ca', type: 'Container' }), mk({ id: 'comp', parentId: 'ca' })] as any } }));
  useStore.getState().toggleExternal('ghost');
  useStore.getState().revealNode('comp');
  expect(useStore.getState().focusId).toBe('ca');
  expect(useStore.getState().selectedId).toBe('comp');
  expect(useStore.getState().expandedExternals.size).toBe(0);
});

it('revealNode on a top-level node focuses root (null) and selects it', () => {
  const mk = (over: Record<string, unknown>) => ({
    id: 'x', name: 'X', type: 'System', description: '', parentId: null, codeRefs: [],
    docRefs: [], createdAt: 't', updatedAt: 't', fields: {}, ...over,
  });
  useStore.setState((s) => ({ model: { ...s.model, nodes: [mk({ id: 'sys' })] as any } }));
  useStore.getState().revealNode('sys');
  expect(useStore.getState().focusId).toBe(null);
  expect(useStore.getState().selectedId).toBe('sys');
});

it('revealNode is a no-op for an unknown id', () => {
  useStore.getState().setFocus('keep');
  useStore.getState().revealNode('nope');
  expect(useStore.getState().focusId).toBe('keep');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @hyphae/web test -- store`
Expected: FAIL — `revealNode is not a function`.

- [ ] **Step 3: Implement**

In `apps/web/src/store.ts`, add to the `State` type (near `setFocus`, ~line 22):

```ts
  revealNode: (id: string) => void;
```

Add the action in the returned object, right after `setFocus` (~line 69):

```ts
    revealNode: (id) => {
      const n = get().model.nodes.find((x) => x.id === id);
      if (!n) return;
      const nodes = get().model.nodes;
      const parentId = n.parentId && nodes.some((x) => x.id === n.parentId) ? n.parentId : null;
      set({ focusId: parentId, selectedId: id, expandedExternals: new Set<string>() });
    },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @hyphae/web test -- store`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/store.ts apps/web/test/store.test.ts
git commit -m "feat(web): add revealNode store action (focus parent + select node)"
```

---

### Task 3: `SearchBox` component

**Files:**
- Create: `apps/web/src/SearchBox.tsx`
- Test: `apps/web/test/SearchBox.test.tsx`

**Interfaces:**
- Consumes: `useStore` (`model.nodes`, `revealNode` from Task 2).
- Produces: `export function SearchBox(): JSX.Element`. Renders an input with
  `aria-label="search nodes"`; a results dropdown of up to 10 nodes matched by
  case-insensitive name substring, ranked exact → prefix → substring; `Enter` picks the
  active result, `ArrowUp`/`ArrowDown` move it, `Escape` clears. Picking calls
  `revealNode(id)` and clears the query.

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/SearchBox.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SearchBox } from '../src/SearchBox';
import { useStore } from '../src/store';
import { emptyModel, type Node } from '@hyphae/schema';

const mk = (over: Partial<Node>): Node => ({
  id: 'n', name: 'N', type: 'Component', description: '', parentId: null, codeRefs: [],
  docRefs: [], createdAt: 't', updatedAt: 't', fields: {}, ...over,
});

beforeEach(() => {
  const m = emptyModel();
  m.nodes.push(
    mk({ id: 'sys', name: 'Media Gateway', type: 'System' }),
    mk({ id: 'ca', name: 'Media Store', type: 'Container', parentId: 'sys' }),
    mk({ id: 'other', name: 'Billing', type: 'Container' }),
  );
  useStore.setState({ model: m, focusId: null, selectedId: null });
});

describe('SearchBox', () => {
  it('shows name-matching results and hides non-matches', () => {
    render(<SearchBox />);
    fireEvent.change(screen.getByLabelText('search nodes'), { target: { value: 'media' } });
    expect(screen.getByText('Media Gateway')).toBeTruthy();
    expect(screen.getByText('Media Store')).toBeTruthy();
    expect(screen.queryByText('Billing')).toBeNull();
  });

  it('clicking a result reveals the node (focus parent + select)', () => {
    render(<SearchBox />);
    fireEvent.change(screen.getByLabelText('search nodes'), { target: { value: 'store' } });
    fireEvent.click(screen.getByText('Media Store'));
    expect(useStore.getState().focusId).toBe('sys');
    expect(useStore.getState().selectedId).toBe('ca');
  });

  it('Enter picks the first (highest-ranked) result', () => {
    render(<SearchBox />);
    const input = screen.getByLabelText('search nodes');
    fireEvent.change(input, { target: { value: 'Billing' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(useStore.getState().selectedId).toBe('other');
  });

  it('Escape clears the query and closes the dropdown', () => {
    render(<SearchBox />);
    const input = screen.getByLabelText('search nodes') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'media' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input.value).toBe('');
    expect(screen.queryByText('Media Gateway')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @hyphae/web test -- SearchBox`
Expected: FAIL — cannot resolve `../src/SearchBox`.

- [ ] **Step 3: Implement**

Create `apps/web/src/SearchBox.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { useStore } from './store';
import type { Node } from '@hyphae/schema';

/** Rank a node against a lowercased query: 0 exact name, 1 prefix, 2 substring, 3 no match. */
function rank(name: string, q: string): number {
  const n = name.toLowerCase();
  if (n === q) return 0;
  if (n.startsWith(q)) return 1;
  if (n.includes(q)) return 2;
  return 3;
}

export function SearchBox() {
  const nodes = useStore((s) => s.model.nodes);
  const revealNode = useStore((s) => s.revealNode);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [] as Node[];
    return nodes
      .map((n) => ({ n, r: rank(n.name, q) }))
      .filter((x) => x.r < 3)
      .sort((a, b) => a.r - b.r)
      .slice(0, 10)
      .map((x) => x.n);
  }, [nodes, query]);

  const nameOf = (id: string | null) => (id ? nodes.find((n) => n.id === id)?.name : null);

  const pick = (n: Node | undefined) => {
    if (!n) return;
    revealNode(n.id);
    setQuery('');
    setActive(0);
  };

  const onKeyDown = (ev: React.KeyboardEvent) => {
    if (!results.length) return;
    if (ev.key === 'ArrowDown') { ev.preventDefault(); setActive((a) => (a + 1) % results.length); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); setActive((a) => (a - 1 + results.length) % results.length); }
    else if (ev.key === 'Enter') { ev.preventDefault(); pick(results[active] ?? results[0]); }
    else if (ev.key === 'Escape') { setQuery(''); setActive(0); }
  };

  return (
    <div className="search" style={{ position: 'relative' }}>
      <input
        aria-label="search nodes"
        placeholder="Search nodes…"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setActive(0); }}
        onKeyDown={onKeyDown}
      />
      {results.length > 0 && (
        <ul className="search-results" style={{ position: 'absolute', zIndex: 10, background: '#fff', border: '1px solid #ccc', margin: 0, padding: 0, listStyle: 'none', maxHeight: 280, overflowY: 'auto', minWidth: 220 }}>
          {results.map((n, i) => (
            <li
              key={n.id}
              onMouseDown={(e) => { e.preventDefault(); pick(n); }}
              onMouseEnter={() => setActive(i)}
              style={{ padding: '2px 8px', cursor: 'pointer', background: i === active ? '#eef' : undefined }}
            >
              {n.name} <small>· {n.type}{nameOf(n.parentId) ? ` · ${nameOf(n.parentId)}` : ''}</small>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @hyphae/web test -- SearchBox`
Expected: PASS. (`onMouseDown` with `preventDefault` is used so the click fires before input blur.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/SearchBox.tsx apps/web/test/SearchBox.test.tsx
git commit -m "feat(web): add SearchBox component (name search → revealNode)"
```

---

### Task 4: Mount `SearchBox` in the toolbar

**Files:**
- Modify: `apps/web/src/App.tsx` (import + toolbar JSX ~line 88-90)
- Test: `apps/web/test/App.test.tsx` (add one assertion)

**Interfaces:**
- Consumes: `SearchBox` from Task 3.
- Produces: the search input rendered in the toolbar.

- [ ] **Step 1: Write the failing test**

Inspect `apps/web/test/App.test.tsx` for its render helper, then add a test asserting the
search input is present after the app loads. Minimal addition:

```tsx
it('renders the node search box in the toolbar', async () => {
  render(<App />);
  await waitFor(() => expect(screen.getByLabelText('search nodes')).toBeTruthy());
});
```

(Reuse the file's existing imports/mocks; add `waitFor`/`screen` to the import if not present.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @hyphae/web test -- App`
Expected: FAIL — no element labeled `search nodes`.

- [ ] **Step 3: Implement**

In `apps/web/src/App.tsx`: add `import { SearchBox } from './SearchBox';` near the other
imports, and place `<SearchBox />` in the toolbar just before the audience toggle `<div>`:

```tsx
        <SearchBox />
        <div className="audience-toggle" role="group" aria-label="detail level" style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @hyphae/web test -- App`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/App.tsx apps/web/test/App.test.tsx
git commit -m "feat(web): mount SearchBox in the toolbar"
```

---

### Task 5: Side-panel Incoming/Outgoing split

**Files:**
- Modify: `apps/web/src/SidePanel.tsx` (node branch: import ~line 3, render ~line 68 & 87-92)
- Test: `apps/web/test/SidePanel.test.tsx`

**Interfaces:**
- Consumes: `partitionConnections` from Task 1.
- Produces: node panel renders `Connections (N)` where `N = outgoing.length + incoming.length`,
  followed by an `Outgoing (n)` block and an `Incoming (m)` block, each shown only when non-empty,
  each rendering `<ConnectionList>`.

- [ ] **Step 1: Write the failing test**

Add to `apps/web/test/SidePanel.test.tsx` inside `describe('SidePanel', ...)`:

```tsx
it('splits the selected node connections into Outgoing and Incoming sections', () => {
  const mk = (over: Partial<Node>): Node => ({
    id: 'x', name: 'X', type: 'Component', description: '', parentId: null, codeRefs: [],
    docRefs: [], createdAt: 't', updatedAt: 't', fields: {}, ...over,
  });
  const conn = (over: Partial<Connection>): Connection => ({
    id: 'c', from: 'a1', to: 'ext', type: 'Dependency', description: '', direction: 'Unidirectional',
    realizedBy: [], codeRefs: [], fields: {}, ...over,
  });
  useStore.setState((s) => ({
    model: {
      ...s.model,
      nodes: [mk({ id: 'ca', name: 'Alpha', type: 'Container' }), mk({ id: 'a1', name: 'A1', parentId: 'ca' }), mk({ id: 'ext', name: 'Ext', type: 'System' })],
      connections: [conn({ id: 'o1', from: 'a1', to: 'ext' }), conn({ id: 'i1', from: 'ext', to: 'a1' })],
    },
    selectedId: 'ca',
  }));
  render(<SidePanel />);
  expect(screen.getByText(/connections \(2\)/i)).toBeTruthy();
  expect(screen.getByText(/outgoing \(1\)/i)).toBeTruthy();
  expect(screen.getByText(/incoming \(1\)/i)).toBeTruthy();
});

it('omits a direction subsection when it has no connections', () => {
  const mk = (over: Partial<Node>): Node => ({
    id: 'x', name: 'X', type: 'Component', description: '', parentId: null, codeRefs: [],
    docRefs: [], createdAt: 't', updatedAt: 't', fields: {}, ...over,
  });
  const conn = (over: Partial<Connection>): Connection => ({
    id: 'c', from: 'a1', to: 'ext', type: 'Dependency', description: '', direction: 'Unidirectional',
    realizedBy: [], codeRefs: [], fields: {}, ...over,
  });
  useStore.setState((s) => ({
    model: {
      ...s.model,
      nodes: [mk({ id: 'ca', name: 'Alpha', type: 'Container' }), mk({ id: 'a1', name: 'A1', parentId: 'ca' }), mk({ id: 'ext', name: 'Ext', type: 'System' })],
      connections: [conn({ id: 'o1', from: 'a1', to: 'ext' })],
    },
    selectedId: 'ca',
  }));
  render(<SidePanel />);
  expect(screen.getByText(/outgoing \(1\)/i)).toBeTruthy();
  expect(screen.queryByText(/incoming/i)).toBeNull();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @hyphae/web test -- SidePanel`
Expected: FAIL — no "Outgoing (1)" / "Incoming (1)" text (current panel renders one flat list).

- [ ] **Step 3: Implement**

In `apps/web/src/SidePanel.tsx`:

Change the import on line 3 from `externalConnections` to `partitionConnections`:

```tsx
import { buildFocusView, partitionConnections } from './focusView';
```

Replace the node-branch connection block. Change line 68 from:

```tsx
    const nodeConns = externalConnections(model, node.id);
```

to:

```tsx
    const { outgoing, incoming } = partitionConnections(model, node.id);
    const total = outgoing.length + incoming.length;
```

Replace the render block (lines ~87-92):

```tsx
        {total > 0 && (
          <>
            <h3>Connections ({total})</h3>
            {outgoing.length > 0 && (
              <>
                <h4 className="conn-dir">Outgoing ({outgoing.length})</h4>
                <ConnectionList connections={outgoing} />
              </>
            )}
            {incoming.length > 0 && (
              <>
                <h4 className="conn-dir">Incoming ({incoming.length})</h4>
                <ConnectionList connections={incoming} />
              </>
            )}
          </>
        )}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @hyphae/web test -- SidePanel`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/SidePanel.tsx apps/web/test/SidePanel.test.tsx
git commit -m "feat(web): split node panel connections into Outgoing/Incoming"
```

---

### Task 6: Full suite + typecheck + finish

- [ ] **Step 1: Run the full web suite**

Run: `pnpm --filter @hyphae/web test`
Expected: PASS — all suites green.

- [ ] **Step 2: Typecheck / build**

Run: `pnpm --filter @hyphae/web build`
Expected: no TypeScript errors.

- [ ] **Step 3: Final commit (only if anything remains uncommitted)**

```bash
git status
```

## Self-Review notes

- Spec Part A → Tasks 2,3,4. Spec Part B → Tasks 1,5. All spec testing bullets covered.
- Type consistency: `revealNode(id: string): void`, `partitionConnections(model, nodeId): { outgoing; incoming }`, `SearchBox()` — names identical across tasks and matching the spec.
- `ConnectionList` untouched (constraint honored). `externalConnections` kept as a union wrapper so its existing tests/callers stay green.

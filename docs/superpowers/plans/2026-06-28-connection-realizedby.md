# Connection realizedBy Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a real connection's `realizedBy` child connections in the side panel — each row's endpoint names focus their node, and the row selects the child connection to drill the realization chain — via a shared `ConnectionList` component reused by the rollup-edge panel.

**Architecture:** A new presentational `ConnectionList` component renders a resolved `Connection[]` as rows (endpoint `setFocus` buttons + row `select`). `SidePanel`'s real-connection branch gains a read-only "Realized by (N)" section using it over `conn.realizedBy`; the existing rollup-edge branch is refactored to reuse it (DRY; its rows gain row-select).

**Tech Stack:** React 18 + TypeScript, Zustand, Vitest + @testing-library/react.

## Global Constraints

- Package manager pnpm workspaces. Web tests: `pnpm --filter @hyphae/web test`; full: `pnpm -r test`.
- Connection kind = `type`; transport is `fields.transport`. A connection's children = `connection.realizedBy` (array of connection ids).
- The list is **read-only** (no editing/deleting of children). The connection editor above it stays editable.
- Endpoint-name buttons MUST `stopPropagation` so focusing a node does not also trigger the row's `select`.
- `select(id)` and `setFocus(id)` are existing store actions; `setFocus` also clears the selection.
- A `realizedBy` id with no matching `model.connections` entry is skipped; the displayed count reflects only resolved children.
- `tsc --noEmit` must stay clean (repo sets `noUnusedLocals`): `pnpm --filter @hyphae/web exec tsc --noEmit`.
- Match the existing test style in `apps/web/test`.

---

### Task 1: `ConnectionList` shared component

**Files:**
- Create: `apps/web/src/ConnectionList.tsx`
- Test: `apps/web/test/ConnectionList.test.tsx`

**Interfaces:**
- Consumes: store `model.nodes`, `select`, `setFocus`.
- Produces: `ConnectionList({ connections }: { connections: Connection[] })` — a `<ul>` of rows; each row `onClick` selects the connection; each endpoint name is a button that `stopPropagation`s then `setFocus`es the node.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/test/ConnectionList.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConnectionList } from '../src/ConnectionList';
import { useStore } from '../src/store';
import { emptyModel, type Node, type Connection } from '@hyphae/schema';

const mkNode = (over: Partial<Node>): Node => ({
  id: 'n', name: 'N', type: 'Component', description: '', parentId: null, codeRefs: [],
  docRefs: [], createdAt: 't', updatedAt: 't', fields: {}, ...over,
});

const conns: Connection[] = [
  { id: 'x', from: 'a1', to: 'b1', type: 'Dependency', description: '', direction: 'Unidirectional', realizedBy: [], codeRefs: [], fields: { transport: 'Sync' } },
];

beforeEach(() => {
  const m = emptyModel();
  m.nodes.push(
    mkNode({ id: 'ca', name: 'Alpha', type: 'Container' }),
    mkNode({ id: 'a1', name: 'A1', parentId: 'ca' }),
    mkNode({ id: 'b1', name: 'B1', parentId: 'ca' }),
  );
  useStore.setState({ model: m, selectedId: null, focusId: null });
});

describe('ConnectionList', () => {
  it('renders a row per connection with endpoint names and kind/transport', () => {
    render(<ConnectionList connections={conns} />);
    expect(screen.getByRole('button', { name: 'A1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'B1' })).toBeTruthy();
    expect(screen.getByText(/Dependency/)).toBeTruthy();
    expect(screen.getByText(/Sync/)).toBeTruthy();
  });

  it('clicking the row selects the connection', () => {
    const { container } = render(<ConnectionList connections={conns} />);
    fireEvent.click(container.querySelector('li')!);
    expect(useStore.getState().selectedId).toBe('x');
  });

  it('clicking an endpoint focuses its node without selecting the row', () => {
    useStore.setState({ selectedId: 'orig' });
    render(<ConnectionList connections={conns} />);
    fireEvent.click(screen.getByRole('button', { name: 'A1' }));
    expect(useStore.getState().focusId).toBe('a1');
    // stopPropagation: the row's select('x') never fired (setFocus cleared selection to null).
    expect(useStore.getState().selectedId).not.toBe('x');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @hyphae/web test ConnectionList`
Expected: FAIL — module `../src/ConnectionList` does not exist.

- [ ] **Step 3: Implement `ConnectionList.tsx`**

Create `apps/web/src/ConnectionList.tsx`:

```tsx
import { useStore } from './store';
import type { Connection } from '@hyphae/schema';

/** A read-only list of connections: each endpoint name focuses its node, and the row selects the
 *  connection (to inspect it / drill its own realizedBy). Reused by the rollup-edge and the
 *  connection "Realized by" panels. */
export function ConnectionList({ connections }: { connections: Connection[] }) {
  const nodes = useStore((s) => s.model.nodes);
  const select = useStore((s) => s.select);
  const setFocus = useStore((s) => s.setFocus);

  const nameOf = (id: string) => nodes.find((n) => n.id === id)?.name ?? id;
  const parentNameOf = (id: string) => {
    const n = nodes.find((x) => x.id === id);
    const p = n?.parentId ? nodes.find((x) => x.id === n.parentId) : null;
    return p?.name;
  };

  return (
    <ul className="rollup-list">
      {connections.map((c) => (
        <li key={c.id} onClick={() => select(c.id)} style={{ cursor: 'pointer' }}>
          <button onClick={(ev) => { ev.stopPropagation(); setFocus(c.from); }}>{nameOf(c.from)}</button>
          {parentNameOf(c.from) && <small> ({parentNameOf(c.from)})</small>}
          {' → '}
          <button onClick={(ev) => { ev.stopPropagation(); setFocus(c.to); }}>{nameOf(c.to)}</button>
          {parentNameOf(c.to) && <small> ({parentNameOf(c.to)})</small>}
          <small> · {c.type}{c.fields.transport ? ` · ${String(c.fields.transport)}` : ''}</small>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @hyphae/web test ConnectionList`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/ConnectionList.tsx apps/web/test/ConnectionList.test.tsx
git commit -m "feat(web): shared ConnectionList (endpoint focus + row select)"
```

---

### Task 2: Wire `ConnectionList` into both side-panel branches

**Files:**
- Modify: `apps/web/src/SidePanel.tsx` (connection branch gains "Realized by (N)"; rollup branch reuses `ConnectionList`)
- Test: `apps/web/test/SidePanel.test.tsx`

**Interfaces:**
- Consumes: `ConnectionList` (Task 1); existing store `model`, `select`, `setFocus`, `selectedId`.

- [ ] **Step 1: Write the failing test**

Append to `apps/web/test/SidePanel.test.tsx` inside the `describe('SidePanel', ...)` block (before its closing `});`):

```ts
  it('lists a connection\'s realizedBy children and selects a child on row click', () => {
    const mk = (over: Partial<Node>): Node => ({
      id: 'x', name: 'X', type: 'Component', description: '', parentId: null, codeRefs: [],
      docRefs: [], createdAt: 't', updatedAt: 't', fields: {}, ...over,
    });
    const conn = (over: Partial<Connection>): Connection => ({
      id: 'c', from: 'a1', to: 'b1', type: 'Dependency', description: '', direction: 'Unidirectional',
      realizedBy: [], codeRefs: [], fields: {}, ...over,
    });
    useStore.setState((s) => ({
      model: {
        ...s.model,
        nodes: [mk({ id: 'ca', name: 'Alpha', type: 'Container' }), mk({ id: 'a1', name: 'A1', parentId: 'ca' }), mk({ id: 'b1', name: 'B1', parentId: 'ca' })],
        connections: [
          conn({ id: 'parent', realizedBy: ['child1', 'missing'] }),
          conn({ id: 'child1', type: 'DataFlow', fields: { transport: 'Async' } }),
        ],
      },
      selectedId: 'parent',
    }));
    render(<SidePanel />);
    // missing child id is skipped → count is 1, not 2
    expect(screen.getByText(/realized by \(1\)/i)).toBeTruthy();
    const list = document.querySelector('.rollup-list')!;
    fireEvent.click(list.querySelector('li')!);
    expect(useStore.getState().selectedId).toBe('child1');
  });
```

(`Connection` is already imported in this test file via `@hyphae/schema`? It is not — add `Connection` to the existing `import { emptyModel, type Node } from '@hyphae/schema';` line, making it `import { emptyModel, type Node, type Connection } from '@hyphae/schema';`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hyphae/web test SidePanel`
Expected: FAIL — no "Realized by (1)" text (the connection panel has no realizedBy section yet).

- [ ] **Step 3: Import `ConnectionList`**

In `apps/web/src/SidePanel.tsx`, add the import near the other local imports (after `import { buildFocusView } from './focusView';`):

```tsx
import { ConnectionList } from './ConnectionList';
```

- [ ] **Step 4: Add the "Realized by" section to the connection branch**

In `apps/web/src/SidePanel.tsx`, in the `if (connection) {` branch, add a resolved-children const after `const setField = ...` (currently line ~93):

```tsx
    const realizedChildren = conn.realizedBy
      .map((id) => model.connections.find((c) => c.id === id))
      .filter((c): c is Connection => !!c);
```

Then, inside that branch's returned `<aside>`, replace the delete button line:

```tsx
        <button onClick={() => deleteConnection(conn.id)}>Delete connection</button>
```

with the delete button followed by the section:

```tsx
        <button onClick={() => deleteConnection(conn.id)}>Delete connection</button>
        {realizedChildren.length > 0 && (
          <>
            <h3>Realized by ({realizedChildren.length})</h3>
            <ConnectionList connections={realizedChildren} />
          </>
        )}
```

- [ ] **Step 5: Refactor the rollup branch to reuse `ConnectionList`**

In `apps/web/src/SidePanel.tsx`, replace the entire `if (rollup) { ... }` block (currently lines ~116-145) with:

```tsx
  if (rollup) {
    const nameOf = (id: string) => nodes.find((n) => n.id === id)?.name ?? id;
    const conns = rollup.realizedBy
      .map((id) => model.connections.find((c) => c.id === id))
      .filter((c): c is Connection => !!c);
    return (
      <aside className="panel">
        <h2>Rolled-up connection</h2>
        <p className="field"><strong>{nameOf(rollup.from)} → {nameOf(rollup.to)}</strong></p>
        <p className="field">{conns.length} connection{conns.length === 1 ? '' : 's'}</p>
        <ConnectionList connections={conns} />
      </aside>
    );
  }
```

(This drops the now-unused inline `<ul>` and the `parentNameOf` helper from the rollup branch — they live in `ConnectionList` now. Keep `nameOf` here; it is still used for the header.)

- [ ] **Step 6: Run tests + typecheck to verify green**

Run: `pnpm --filter @hyphae/web test SidePanel`
Expected: PASS (new test + the existing rollup test, which now exercises the shared `ConnectionList` — its `A1` endpoint button still calls `setFocus`).

Run: `pnpm --filter @hyphae/web exec tsc --noEmit`
Expected: clean (no unused `parentNameOf`).

- [ ] **Step 7: Full verification**

Run: `pnpm -r test`
Expected: all packages green.

Run: `pnpm --filter @hyphae/web build`
Expected: build succeeds.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/SidePanel.tsx apps/web/test/SidePanel.test.tsx
git commit -m "feat(web): connection 'Realized by' detail; rollup panel reuses ConnectionList"
```

---

## Self-Review

**Spec coverage:**
- Shared `ConnectionList` (endpoint focus + row select, stopPropagation) → Task 1. ✓
- Row endpoint names `setFocus`; row click `select`s the child → Task 1 (tested). ✓
- Real-connection panel "Realized by (N)" section, read-only, only when non-empty → Task 2. ✓
- Drill the chain: selecting a child re-renders the connection branch for it (it's a model connection) → Task 2 (test asserts `selectedId` becomes the child). ✓
- Rollup panel reuses `ConnectionList` (rows become selectable) → Task 2. ✓
- Missing `realizedBy` id skipped; count reflects resolved children → Task 2 (test uses a `'missing'` id, asserts count 1). ✓
- Read-only; no canvas changes → no canvas/edit code touched. ✓
- Regression: rollup endpoint focus still works → existing SidePanel rollup test runs through `ConnectionList`. ✓

**Placeholder scan:** No TBD/TODO; every code step is concrete.

**Type consistency:** `ConnectionList({ connections: Connection[] })` defined in Task 1, called with resolved `Connection[]` in Task 2 (both branches resolve via `.map().filter((c): c is Connection => !!c)`). `Connection` imported in both source and test. `select`/`setFocus` signatures match existing store.

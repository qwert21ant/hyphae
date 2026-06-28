# Rollup Edge Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user select an aggregated ("rollup") connection in the focus view and see the underlying connections, with each endpoint clickable to drill toward it.

**Architecture:** Client-side only. `FocusEdge` carries `realizedBy` (underlying connection ids), already available in the per-pair aggregator. Derived edges become selectable and carry `realizedBy` in their React Flow `data`. `SidePanel` recomputes the focus view, finds the selected derived edge, and renders a read-only detail panel that resolves `realizedBy` against the model and offers `setFocus` buttons on each endpoint.

**Tech Stack:** React 18 + TypeScript, @xyflow/react, Zustand, Vitest + @testing-library/react.

## Global Constraints

- Package manager pnpm workspaces. Web tests: `pnpm --filter @hyphae/web test`; full: `pnpm -r test`.
- Active profile `c4-backend`. Connection kind = `type`; transport lives in `fields.transport`.
- The rollup detail panel is **read-only** — no editing or deleting an aggregate (it is not a stored entity). Keep derived edges `deletable: false`.
- Real (non-derived) edges keep the existing connection editor in `SidePanel`; only `agg:` derived ids hit the new branch.
- `count === realizedBy.length` for every `FocusEdge`.
- Match the existing test style in `apps/web/test`. `tsc --noEmit` must stay clean (the repo sets `noUnusedLocals`); the web app is verified with `pnpm --filter @hyphae/web exec tsc --noEmit`.

---

### Task 1: `FocusEdge.realizedBy` — carry the underlying connection ids

**Files:**
- Modify: `apps/web/src/focusView.ts` (the `FocusEdge` type + the aggregation loop/edge build in `buildFocusView`)
- Modify: `apps/web/test/flow.test.ts` (5-field `FocusEdge` literals need the new field — lines 15, 16, 58)
- Modify: `apps/web/test/layout.test.ts` (`FocusEdge` literals — lines 14, 15, 47)
- Test: `apps/web/test/focusView.test.ts`

**Interfaces:**
- Produces: `FocusEdge.realizedBy: string[]` — the ids of the model connections an edge represents (real edge: one id; derived edge: all aggregated ids; always `realizedBy.length === count`).

- [ ] **Step 1: Write the failing tests**

Append to `apps/web/test/focusView.test.ts` inside the existing `describe('buildFocusView — rolling connections up to the children level', ...)` block (just before its closing `});`):

```ts
  it('a real edge carries realizedBy with its single connection id', () => {
    const m = model();
    m.connections.push({ id: 'r', from: 'a1', to: 'a2', type: 'Dependency', ...e });
    const v = buildFocusView(m, 'ca');
    const edge = v.edges.find((x) => x.id === 'r')!;
    expect(edge.derived).toBe(false);
    expect(edge.realizedBy).toEqual(['r']);
    expect(edge.count).toBe(edge.realizedBy.length);
  });

  it('a derived edge carries realizedBy with every aggregated connection id', () => {
    const m = model();
    m.connections.push(
      { id: 'authored', from: 'ca', to: 'cb', type: 'Dependency', ...e },
      { id: 'realize', from: 'a1', to: 'b1', type: 'Dependency', ...e },
    );
    const v = buildFocusView(m, 'sys');
    const caCb = v.edges.find((x) => x.from === 'ca' && x.to === 'cb')!;
    expect(caCb.derived).toBe(true);
    expect([...caCb.realizedBy].sort()).toEqual(['authored', 'realize']);
    expect(caCb.count).toBe(caCb.realizedBy.length);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @hyphae/web test focusView`
Expected: FAIL — `realizedBy` is `undefined` (property does not exist on `FocusEdge`).

- [ ] **Step 3: Add `realizedBy` to the type**

In `apps/web/src/focusView.ts`, extend the `FocusEdge` type (the block starting `export type FocusEdge = {`), adding the field after `derived`:

```ts
export type FocusEdge = {
  id: string;
  from: string;
  to: string;
  kind: string | null; // connection type for a 1:1 real edge; null when aggregated
  count: number;       // underlying connections represented
  derived: boolean;    // aggregated/collapsed (dashed) edge
  realizedBy: string[]; // ids of the model connections this edge represents (length === count)
};
```

- [ ] **Step 4: Collect the connection ids in `buildFocusView`**

In `apps/web/src/focusView.ts`, in `buildFocusView`:

Change the `Pair` type and its initialisation to track the ids. Replace:

```ts
  type Pair = { from: string; to: string; count: number; fIn: boolean; tIn: boolean; direct?: { id: string; kind: string } };
```

with:

```ts
  type Pair = { from: string; to: string; count: number; fIn: boolean; tIn: boolean; connIds: string[]; direct?: { id: string; kind: string } };
```

Replace the pair-creation line:

```ts
    if (!p) { p = { from, to, count: 0, fIn, tIn }; pairs.set(key, p); }
    p.count++;
```

with:

```ts
    if (!p) { p = { from, to, count: 0, fIn, tIn, connIds: [] }; pairs.set(key, p); }
    p.count++;
    p.connIds.push(c.id);
```

Then add `realizedBy` to both edge shapes in the edge-build loop. Replace:

```ts
    if (p.fIn && p.tIn && p.count === 1 && p.direct) {
      edges.push({ id: p.direct.id, from: p.from, to: p.to, kind: p.direct.kind, count: 1, derived: false });
    } else {
      edges.push({ id: `agg:${p.from}->${p.to}`, from: p.from, to: p.to, kind: null, count: p.count, derived: true });
    }
```

with:

```ts
    if (p.fIn && p.tIn && p.count === 1 && p.direct) {
      edges.push({ id: p.direct.id, from: p.from, to: p.to, kind: p.direct.kind, count: 1, derived: false, realizedBy: p.connIds });
    } else {
      edges.push({ id: `agg:${p.from}->${p.to}`, from: p.from, to: p.to, kind: null, count: p.count, derived: true, realizedBy: p.connIds });
    }
```

- [ ] **Step 5: Update the existing `FocusEdge` literals so `tsc` stays clean**

`realizedBy` is required, so the hand-built `FocusEdge` fixtures must include it (any string array works; keep `length === count`).

In `apps/web/test/flow.test.ts`:
- line 15 → add `, realizedBy: ['i']` before the closing `}`:
  `{ id: 'i', from: 'a1', to: 'a2', kind: 'Dependency', count: 1, derived: false, realizedBy: ['i'] },`
- line 16 → `{ id: 'ext:a1->cb', from: 'a1', to: 'cb', kind: null, count: 3, derived: true, realizedBy: ['e1', 'e2', 'e3'] },`
- line 58 → `edges: [{ id: 'ext:ext->cb', from: 'ext', to: 'cb', kind: null, count: 1, derived: true, realizedBy: ['z'] }],`

In `apps/web/test/layout.test.ts`:
- line 14 → `{ id: 'i', from: 'a1', to: 'a2', kind: 'Dependency', count: 1, derived: false, realizedBy: ['i'] },`
- line 15 → `{ id: 'ext:a1->cb', from: 'a1', to: 'cb', kind: null, count: 1, derived: true, realizedBy: ['x'] },`
- line 47 → `edges: [{ id: 'ext:ext->cb', from: 'ext', to: 'cb', kind: null, count: 1, derived: true, realizedBy: ['z'] }],`

- [ ] **Step 6: Run tests + typecheck to verify green**

Run: `pnpm --filter @hyphae/web test focusView flow layout`
Expected: PASS (new realizedBy tests pass; flow/layout unaffected).

Run: `pnpm --filter @hyphae/web exec tsc --noEmit`
Expected: clean (no output).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/focusView.ts apps/web/test/focusView.test.ts apps/web/test/flow.test.ts apps/web/test/layout.test.ts
git commit -m "feat(web): FocusEdge.realizedBy carries the underlying connection ids"
```

---

### Task 2: Make rollup edges selectable + carry realizedBy to React Flow

**Files:**
- Modify: `apps/web/src/flow.ts` (`derivedEdge`)
- Modify: `apps/web/src/Canvas.tsx` (`onEdgeClick`)
- Test: `apps/web/test/flow.test.ts`

**Interfaces:**
- Consumes: `FocusEdge.realizedBy` (Task 1).
- Produces: derived React Flow edges with `selectable: true`, `focusable: true`, `deletable: false`, and `data: { derived: true, count, realizedBy }`.

- [ ] **Step 1: Write the failing test**

In `apps/web/test/flow.test.ts`, find the existing test `'renders a real edge with its kind label and a derived edge with a count label'` and add these assertions at its end (the fixture's derived edge `ext:a1->cb` already has `realizedBy: ['e1','e2','e3']` from Task 1):

```ts
    expect(derived.selectable).toBe(true);
    expect(derived.deletable).toBe(false);
    expect((derived.data as { realizedBy: string[] }).realizedBy).toEqual(['e1', 'e2', 'e3']);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hyphae/web test flow`
Expected: FAIL — `derived.selectable` is `false` and `data.realizedBy` is `undefined`.

- [ ] **Step 3: Update `derivedEdge`**

In `apps/web/src/flow.ts`, replace the `derivedEdge` function body's returned object so the edge is selectable and carries `realizedBy`:

```ts
function derivedEdge(e: FocusEdge): FlowEdge {
  return {
    id: e.id,
    type: 'floating',
    source: e.from,
    target: e.to,
    label: String(e.count),
    data: { derived: true, count: e.count, realizedBy: e.realizedBy },
    selectable: true,
    focusable: true,
    deletable: false,
    style: { stroke: '#7c3aed', strokeDasharray: '6 4', strokeWidth: 2 },
    labelStyle: { color: '#6d28d9', fontWeight: 600 },
    labelBgStyle: { background: '#ede9fe' },
  };
}
```

- [ ] **Step 4: Let the canvas select derived edges**

In `apps/web/src/Canvas.tsx`, replace the edge-click handler:

```tsx
        onEdgeClick={(_, e) => { if (!(e.data as { derived?: boolean } | undefined)?.derived) select(e.id); }}
```

with:

```tsx
        onEdgeClick={(_, e) => select(e.id)}
```

- [ ] **Step 5: Run test + typecheck to verify green**

Run: `pnpm --filter @hyphae/web test flow`
Expected: PASS.

Run: `pnpm --filter @hyphae/web exec tsc --noEmit`
Expected: clean.

(Canvas edge-click is not unit-tested: React Flow does not lay out/mount edges under jsdom, so edge DOM cannot be clicked in a test. The one-line change is covered by the `flow.ts` selectable/data test and verified manually.)

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/flow.ts apps/web/src/Canvas.tsx apps/web/test/flow.test.ts
git commit -m "feat(web): rollup edges are selectable and carry realizedBy"
```

---

### Task 3: Side-panel "Rolled-up connection" view

**Files:**
- Modify: `apps/web/src/SidePanel.tsx`
- Modify: `apps/web/src/styles.css` (small `.rollup-list` styling)
- Test: `apps/web/test/SidePanel.test.tsx`

**Interfaces:**
- Consumes: `buildFocusView(model, focusId, connFilter)` (`./focusView`), `FocusEdge.realizedBy`, store `focusId`/`connFilter`/`setFocus`/`selectedId`.

- [ ] **Step 1: Write the failing test**

Append to `apps/web/test/SidePanel.test.tsx` inside the `describe('SidePanel', ...)` block (before its closing `});`):

```ts
  it('shows a rolled-up connection with its underlying connections and drills on click', () => {
    const mk = (over: Partial<Node>): Node => ({
      id: 'x', name: 'X', type: 'Component', description: '', parentId: null, codeRefs: [],
      docRefs: [], createdAt: 't', updatedAt: 't', fields: {}, ...over,
    });
    useStore.setState((s) => ({
      model: {
        ...s.model,
        nodes: [
          mk({ id: 'sys', name: 'Sys', type: 'System' }),
          mk({ id: 'ca', name: 'Alpha', type: 'Container', parentId: 'sys' }),
          mk({ id: 'cb', name: 'Beta', type: 'Container', parentId: 'sys' }),
          mk({ id: 'a1', name: 'A1', type: 'Component', parentId: 'ca' }),
          mk({ id: 'b1', name: 'B1', type: 'Component', parentId: 'cb' }),
        ],
        connections: [{ id: 'x1', from: 'a1', to: 'b1', type: 'Dependency', description: '', direction: 'Unidirectional', realizedBy: [], codeRefs: [], fields: { transport: 'Sync' } }],
      },
      focusId: 'sys',
      selectedId: 'agg:ca->cb',
    }));
    render(<SidePanel />);
    expect(screen.getByRole('heading', { name: /rolled-up connection/i })).toBeTruthy();
    expect(screen.getByText('Alpha → Beta')).toBeTruthy();
    expect(screen.getByText(/1 connection/i)).toBeTruthy();
    expect(screen.getByText(/Dependency/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'A1' }));
    expect(useStore.getState().focusId).toBe('a1');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hyphae/web test SidePanel`
Expected: FAIL — no "Rolled-up connection" heading (the panel falls through to "No node selected.").

- [ ] **Step 3: Add the imports**

In `apps/web/src/SidePanel.tsx`, add `useMemo` and `buildFocusView`:

```tsx
import { useMemo } from 'react';
import { useStore } from './store';
import { buildFocusView } from './focusView';
```

(Add the `useMemo` import line and the `buildFocusView` import line; keep the existing `useStore` and `@hyphae/schema` imports.)

- [ ] **Step 4: Add the store selectors + view recompute at the top of `SidePanel`**

In `apps/web/src/SidePanel.tsx`, immediately after the existing selector block inside `export function SidePanel() {` (after the line `const deleteConnection = useStore((s) => s.deleteConnection);`), add:

```tsx
  const model = useStore((s) => s.model);
  const selectedId = useStore((s) => s.selectedId);
  const focusId = useStore((s) => s.focusId);
  const connFilter = useStore((s) => s.connFilter);
  const setFocus = useStore((s) => s.setFocus);
  const rollup = useMemo(() => {
    const v = buildFocusView(model, focusId, connFilter);
    return v.edges.find((edge) => edge.derived && edge.id === selectedId) ?? null;
  }, [model, focusId, connFilter, selectedId]);
```

- [ ] **Step 5: Render the rollup panel**

In `apps/web/src/SidePanel.tsx`, insert this block immediately before the final `return <aside className="panel"><p>No node selected.</p></aside>;`:

```tsx
  if (rollup) {
    const nameOf = (id: string) => nodes.find((n) => n.id === id)?.name ?? id;
    const parentNameOf = (id: string) => {
      const n = nodes.find((x) => x.id === id);
      const p = n?.parentId ? nodes.find((x) => x.id === n.parentId) : null;
      return p?.name;
    };
    const conns = rollup.realizedBy
      .map((id) => model.connections.find((c) => c.id === id))
      .filter((c): c is Connection => !!c);
    return (
      <aside className="panel">
        <h2>Rolled-up connection</h2>
        <p className="field"><strong>{nameOf(rollup.from)} → {nameOf(rollup.to)}</strong></p>
        <p className="field">{rollup.count} connection{rollup.count === 1 ? '' : 's'}</p>
        <ul className="rollup-list">
          {conns.map((c) => (
            <li key={c.id}>
              <button onClick={() => setFocus(c.from)}>{nameOf(c.from)}</button>
              {parentNameOf(c.from) && <small> ({parentNameOf(c.from)})</small>}
              {' → '}
              <button onClick={() => setFocus(c.to)}>{nameOf(c.to)}</button>
              {parentNameOf(c.to) && <small> ({parentNameOf(c.to)})</small>}
              <small> · {c.type}{c.fields.transport ? ` · ${String(c.fields.transport)}` : ''}</small>
            </li>
          ))}
        </ul>
      </aside>
    );
  }

```

- [ ] **Step 6: Add minimal styling**

Append to `apps/web/src/styles.css`:

```css
.rollup-list { list-style: none; margin: 6px 0 0; padding: 0; max-height: 320px; overflow: auto; }
.rollup-list li { padding: 4px 0; border-bottom: 1px solid #eee; font-size: 12px; }
.rollup-list button { background: none; border: none; color: #2563eb; cursor: pointer; padding: 0; font-size: 12px; }
.rollup-list button:hover { text-decoration: underline; }
.rollup-list small { color: #777; }
```

- [ ] **Step 7: Run test + typecheck to verify green**

Run: `pnpm --filter @hyphae/web test SidePanel`
Expected: PASS.

Run: `pnpm --filter @hyphae/web exec tsc --noEmit`
Expected: clean.

- [ ] **Step 8: Full verification**

Run: `pnpm -r test`
Expected: all packages green.

Run: `pnpm --filter @hyphae/web build`
Expected: build succeeds.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/SidePanel.tsx apps/web/src/styles.css apps/web/test/SidePanel.test.tsx
git commit -m "feat(web): side-panel detail for rolled-up connections with drill-to-endpoint"
```

---

## Self-Review

**Spec coverage:**
- `realizedBy` on `FocusEdge`, collected by the aggregator (real = 1, derived = all) → Task 1. ✓
- Derived edges selectable/focusable, `deletable: false`, `realizedBy` in `data` → Task 2. ✓
- `Canvas.onEdgeClick` selects derived edges → Task 2. ✓
- `SidePanel` resolution order (node → real connection → derived rollup → none); recompute view; header `from → to` + count; list of underlying connections `source (parent) → target (parent)` with kind + transport; endpoint buttons call `setFocus` → Task 3. ✓
- Edge cases: missing `realizedBy` connection skipped (`.filter(c is Connection)`); missing endpoint id falls back to raw id (`nameOf`); clicking current focus harmless → Task 3. ✓
- Read-only (no edit/delete of aggregate) → Task 3 panel has no editors/delete. ✓
- Real edges keep the existing editor (their id is a model connection id, matched before the rollup branch) → unchanged in Task 3. ✓
- Tests for `realizedBy` and the panel → Tasks 1 and 3. ✓

**Placeholder scan:** No TBD/TODO; every code step is concrete.

**Type consistency:** `realizedBy: string[]` defined in Task 1 and consumed unchanged in Tasks 2 (`e.realizedBy`) and 3 (`rollup.realizedBy`). `buildFocusView(model, focusId, connFilter)` signature matches existing usage. `Connection` type already imported in `SidePanel.tsx`. `count === realizedBy.length` holds (both built from `p.connIds`).

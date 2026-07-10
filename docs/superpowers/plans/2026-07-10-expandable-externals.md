# Expandable External Nodes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user expand an external ghost in place so its edges split out to the specific participating child nodes, rendered as a small dashed sub-cluster.

**Architecture:** A store `expandedExternals: Set<string>` threads into `buildFocusView`, whose `mapEndpoint` drops one level finer for endpoints under an expanded external (reusing `childOfFocus`). `buildFocusView` also returns `externalGroups` (the expanded box + its member ids) and `expandableExternalIds` (which collapsed ghosts can expand). `layout.ts` reserves a taller column slot for a group; `flow.ts` renders a dashed `ghostGroup` box wrapping the members (computed like the focus region); a ＋/− caret on the ghost/group toggles expansion.

**Tech Stack:** TypeScript (strict), React + Zustand + `@xyflow/react`, dagre, Vitest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-10-expandable-externals-design.md`. Every task's requirements implicitly include it.
- Web-only: no schema/`packages/schema` or MCP/`apps/server` changes.
- The new `buildFocusView` param MUST be named `expandedExternals` (NOT `expanded`) — `buildFocusView` already has an internal `const expanded = new Set<string>()` and a param named `expanded` is an illegal redeclaration.
- New `FocusView` fields (`externalGroups`, `expandableExternalIds`) are OPTIONAL on the type so existing `FocusView` test fixtures keep compiling; `buildFocusView` always returns them.
- Expansion state is NOT put in the URL hash. It resets on `setFocus`.
- Only externals shown as a collapsed focus-peer representative get a caret — never leaf `ExternalSystem`s or expanded group members. The guard is `representativeWith(nodes, extId, focusLayer) === extId` plus "has a strict descendant among its edge's `realizedBy` endpoints".
- Reuse existing helpers (`childOfFocus`, `representativeWith`) and the focus-region wrapping pattern; do not add a new layout engine.
- Test commands (from repo root): `pnpm --filter @hyphae/web test` (whole package) or `pnpm --filter @hyphae/web test <fileNameFragment>` (one file). Build/typecheck: `pnpm --filter @hyphae/web build`.
- Commit after every task.

---

### Task 1: Store — `expandedExternals` state + reset on focus change

**Files:**
- Modify: `apps/web/src/store.ts` — `State` type, initial state, `toggleExternal`, `setFocus`
- Test: `apps/web/test/store.test.ts`

**Interfaces:**
- Produces: store field `expandedExternals: Set<string>` (default empty) and `toggleExternal(id: string): void` (adds if absent, removes if present, always via a NEW Set). `setFocus` clears `expandedExternals`.

- [ ] **Step 1: Write the failing tests**

Add to `apps/web/test/store.test.ts` inside `describe('editor store', ...)`:

```ts
it('toggleExternal adds then removes an id (new Set each time)', () => {
  expect(useStore.getState().expandedExternals.size).toBe(0);
  useStore.getState().toggleExternal('cb');
  expect([...useStore.getState().expandedExternals]).toEqual(['cb']);
  useStore.getState().toggleExternal('cb');
  expect(useStore.getState().expandedExternals.size).toBe(0);
});

it('setFocus resets expandedExternals', () => {
  useStore.getState().toggleExternal('cb');
  expect(useStore.getState().expandedExternals.size).toBe(1);
  useStore.getState().setFocus('ca');
  expect(useStore.getState().expandedExternals.size).toBe(0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @hyphae/web test store`
Expected: FAIL — `toggleExternal`/`expandedExternals` do not exist.

- [ ] **Step 3: Write minimal implementation**

In `apps/web/src/store.ts`:

Add to the `State` type (near `focusId`/`selectedId`):

```ts
  expandedExternals: Set<string>;
  toggleExternal: (id: string) => void;
```

In the returned store object, add the initial value (near `selectedId: null`):

```ts
    expandedExternals: new Set<string>(),
```

Change `setFocus` to also clear expansion:

```ts
    setFocus: (focusId) => set({ focusId, selectedId: null, expandedExternals: new Set<string>() }),
```

Add the toggle (near `select`):

```ts
    toggleExternal: (id) =>
      set((s) => {
        const next = new Set(s.expandedExternals);
        if (next.has(id)) next.delete(id); else next.add(id);
        return { expandedExternals: next };
      }),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @hyphae/web test store`
Expected: PASS (new tests + existing store tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/store.ts apps/web/test/store.test.ts
git commit -m "feat(web): add expandedExternals store state with reset on focus change"
```

---

### Task 2: `buildFocusView` — expansion remap + `externalGroups` + `expandableExternalIds`

**Files:**
- Modify: `apps/web/src/focusView.ts` — `FocusView` type, `buildFocusView` signature, `mapEndpoint`, new computations + return
- Test: `apps/web/test/focusView.test.ts`

**Interfaces:**
- Consumes: existing `childOfFocus`, `representativeWith`, `rootAncestor` (module-local).
- Produces: `buildFocusView(model, focusId, filter?, audience: Audience = 'full', expandedExternals: Set<string> = new Set())`. `FocusView` gains OPTIONAL `externalGroups?: { id: string; name: string; childIds: string[] }[]` and `expandableExternalIds?: Set<string>`. When an external id is in `expandedExternals`, endpoints under it map to its direct child; the group and the finer members appear; collapsed focus-peer externals with participating descendants are flagged expandable.

- [ ] **Step 1: Write the failing tests**

Add a new describe block to `apps/web/test/focusView.test.ts` (reuse the file's `model`, `base`, `e` helpers; note `model()` has `sys › ca(a1,a2), cb(b1); a1 › k1(Class); ext`):

```ts
describe('buildFocusView — expandable externals', () => {
  it('collapsed: a peer container external that aggregates a participating child is flagged expandable', () => {
    const m = model();
    m.connections.push({ id: 'x', from: 'a1', to: 'b1', type: 'Dependency', ...e }); // a1(in ca) -> b1(in cb)
    const v = buildFocusView(m, 'ca'); // focus ca; cb is the external peer
    expect(v.externals.map((n) => n.id)).toEqual(['cb']);
    expect([...(v.expandableExternalIds ?? [])]).toEqual(['cb']); // cb aggregates b1
    expect(v.externalGroups ?? []).toEqual([]);                    // nothing expanded yet
  });

  it('expanding a peer container remaps its edge to the specific participating child and emits a group', () => {
    const m = model();
    m.connections.push({ id: 'x', from: 'a1', to: 'b1', type: 'Dependency', ...e });
    const v = buildFocusView(m, 'ca', undefined, 'full', new Set(['cb']));
    // edge now lands on b1 (the participating child of cb), not on cb
    expect(v.edges.find((ed) => ed.to === 'b1')).toBeTruthy();
    expect(v.edges.find((ed) => ed.to === 'cb')).toBeUndefined();
    expect(v.externals.map((n) => n.id)).toEqual(['b1']);          // finer member is the shown external
    expect(v.externalGroups).toEqual([{ id: 'cb', name: 'Beta', childIds: ['b1'] }]);
    expect([...(v.expandableExternalIds ?? [])]).toEqual([]);       // cb is expanded, no caret
  });

  it('a leaf ExternalSystem (no children) is never flagged expandable', () => {
    const m = model();
    m.connections.push({ id: 'x', from: 'a1', to: 'ext', type: 'Dependency', ...e });
    const v = buildFocusView(m, 'ca');
    expect(v.externals.map((n) => n.id)).toEqual(['ext']);
    expect([...(v.expandableExternalIds ?? [])]).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @hyphae/web test focusView`
Expected: FAIL — signature ignores the 5th arg; `expandableExternalIds`/`externalGroups` undefined.

- [ ] **Step 3: Write minimal implementation**

In `apps/web/src/focusView.ts`:

Extend the `FocusView` type (add the two optional fields):

```ts
export type FocusView = {
  focusId: string | null;
  focusNode: Node | null;
  children: Node[];
  externals: Node[];
  edges: FocusEdge[];
  externalGroups?: { id: string; name: string; childIds: string[] }[];
  expandableExternalIds?: Set<string>;
};
```

Change the signature:

```ts
export function buildFocusView(model: HyphaeModel, focusId: string | null, filter?: ConnFilter, audience: Audience = 'full', expandedExternals: Set<string> = new Set()): FocusView {
```

Replace `mapEndpoint` so the external branch applies the expansion remap (split the unexpanded representative into its own helper so it can be reused for the expandability check):

```ts
  const unexpandedRep = (id: string): string => {
    if (!focusId) return rootAncestor(nodes, id);
    if (id === focusId) return focusId;
    const child = childOfFocus(nodes, id, focusId);
    if (child) return child;
    return representativeWith(nodes, id, focusLayer);
  };
  const mapEndpoint = (id: string): string => {
    const rep = unexpandedRep(id);
    if (expandedExternals.has(rep)) return childOfFocus(nodes, id, rep) ?? rep;
    return rep;
  };
```

Then, immediately before the final `return`, compute the two new fields (place after `const externals = ...`):

```ts
  // Which shown, collapsed, focus-peer externals could expand: they stand in for >=1 participating
  // descendant. A group member (below the focus layer) rolls up to its parent, so it never qualifies.
  const connById = new Map(model.connections.map((c) => [c.id, c]));
  const expandableExternalIds = new Set<string>();
  for (const ed of shownEdges) {
    for (const extId of [ed.from, ed.to]) {
      if (inside.has(extId) || expandedExternals.has(extId) || expandableExternalIds.has(extId)) continue;
      if (representativeWith(nodes, extId, focusLayer) !== extId) continue; // only focus-peer reps
      const aggregates = ed.realizedBy.some((cid) => {
        const c = connById.get(cid);
        return !!c && (childOfFocus(nodes, c.from, extId) !== null || childOfFocus(nodes, c.to, extId) !== null);
      });
      if (aggregates) expandableExternalIds.add(extId);
    }
  }

  // For each currently-expanded external, the finer members that surfaced (its direct children now
  // shown as externals). An expanded id that produced no member yields no group.
  const externalGroups: { id: string; name: string; childIds: string[] }[] = [];
  for (const extId of expandedExternals) {
    const childIds = externals.filter((n) => n.parentId === extId).map((n) => n.id);
    const parent = nodes.get(extId);
    if (childIds.length && parent) externalGroups.push({ id: extId, name: parent.name, childIds });
  }

  return { focusId, focusNode, children, externals, edges: shownEdges, externalGroups, expandableExternalIds };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @hyphae/web test focusView`
Expected: PASS (new block + all existing `buildFocusView` tests — default `expandedExternals` is empty, so collapsed behavior is unchanged; `unexpandedRep` with an empty set is identical to the old `mapEndpoint`).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/focusView.ts apps/web/test/focusView.test.ts
git commit -m "feat(web): expandable-external mapping, groups, and expandable flags in buildFocusView"
```

---

### Task 3: `layout.ts` — cluster an expanded group's members and reserve column space

**Files:**
- Modify: `apps/web/src/layout.ts` — own `PAD`/`LABEL_H`, column layout handles group items
- Modify: `apps/web/src/flow.ts` — import `PAD`/`LABEL_H` from `layout` instead of declaring them
- Test: `apps/web/test/layout.test.ts`

**Interfaces:**
- Consumes: `view.externalGroups` (Task 2).
- Produces: `PAD`, `LABEL_H` exported from `layout.ts` (moved out of `flow.ts` to avoid a layout→flow import cycle, since `flow.ts` already imports `NODE_W`/`NODE_H` from `layout.ts`).
- Produces: `layoutFocusView` positions each group's members as a vertical stack sharing one column x, reserving vertical space so sibling column items do not overlap. Standalone externals keep today's single-box placement.

- [ ] **Step 1: Write the failing test**

Add to `apps/web/test/layout.test.ts` inside `describe('layoutFocusView', ...)`:

```ts
it('stacks an expanded group\'s members at one column x, reserving space above a sibling', () => {
  const grouped: FocusView = {
    focusId: 'ca', focusNode: node('ca', 'Container'),
    children: [node('a1'), node('a2')],
    externals: [node('b1'), node('b2'), node('solo', 'Container')],
    edges: [
      { id: 'g1', from: 'a1', to: 'b1', kind: null, count: 1, derived: true, realizedBy: ['x1'] },
      { id: 'g2', from: 'a1', to: 'b2', kind: null, count: 1, derived: true, realizedBy: ['x2'] },
      { id: 's', from: 'a1', to: 'solo', kind: null, count: 1, derived: true, realizedBy: ['x3'] },
    ],
    externalGroups: [{ id: 'cb', name: 'Beta', childIds: ['b1', 'b2'] }],
  };
  const pos = layoutFocusView(grouped);
  // members share a column x and are vertically separated
  expect(pos.b1.x).toBe(pos.b2.x);
  expect(pos.b1.y).not.toBe(pos.b2.y);
  // the solo external sits in the same (outgoing) column but does not overlap the group members
  const groupMinY = Math.min(pos.b1.y, pos.b2.y);
  const groupMaxY = Math.max(pos.b1.y, pos.b2.y) + NODE_H;
  expect(pos.solo.y >= groupMaxY || pos.solo.y + NODE_H <= groupMinY).toBe(true);
});
```

Also add `NODE_H` to the existing import from `../src/layout` at the top of the file (it currently imports only `layoutFocusView, NODE_W`).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hyphae/web test layout`
Expected: FAIL — members `b1`/`b2` are laid out as independent single boxes (different x or overlapping), and/or a stacking overlap.

- [ ] **Step 3: Implement**

In `apps/web/src/layout.ts`, add `PAD`/`LABEL_H` as exported constants next to the existing `NODE_W`/`NODE_H` exports (top of file):

```ts
export const PAD = 24;
export const LABEL_H = 22;
```

In `apps/web/src/flow.ts`, delete its local `const PAD = 24;` / `const LABEL_H = 22;` and import them from `layout` by extending the existing import line to: `import { NODE_W, NODE_H, PAD, LABEL_H, type XY } from './layout';`

Then in `apps/web/src/layout.ts`, rewrite the external-placement section. Replace the current `incoming`/`outgoing`/`placeColumn` block (lines that build the two arrays and call `placeColumn`) with group-aware placement:

```ts
  const MEMBER_GAP = 16; // vertical gap between stacked group members

  // A column item is either a standalone external or an expanded group (its members).
  const groups = view.externalGroups ?? [];
  const memberOf = new Map<string, string>();
  for (const g of groups) for (const cid of g.childIds) memberOf.set(cid, g.id);
  type Item = { ids: string[]; group: boolean };
  const items: Item[] = [];
  for (const ext of view.externals) if (!memberOf.has(ext.id)) items.push({ ids: [ext.id], group: false });
  for (const g of groups) items.push({ ids: g.childIds, group: true });

  const itemHeight = (it: Item) =>
    it.group ? it.ids.length * NODE_H + (it.ids.length - 1) * MEMBER_GAP + LABEL_H + 2 * PAD : NODE_H;
  const isIncoming = (it: Item) => view.edges.some((ed) => it.ids.includes(ed.from));

  const incoming = items.filter(isIncoming);
  const outgoing = items.filter((it) => !isIncoming(it));

  const placeColumn = (col: Item[], x: number) => {
    const totalH = col.reduce((h, it) => h + itemHeight(it), 0) + Math.max(0, col.length - 1) * ROW_GAP;
    let y = midY - totalH / 2;
    for (const it of col) {
      if (it.group) {
        // members stacked below the group's label band, indented by PAD
        it.ids.forEach((id, i) => { pos[id] = { x: x + PAD, y: y + LABEL_H + PAD + i * (NODE_H + MEMBER_GAP) }; });
      } else {
        pos[it.ids[0]] = { x, y };
      }
      y += itemHeight(it) + ROW_GAP;
    }
  };
  placeColumn(incoming, minX - COL_GAP - NODE_W);
  placeColumn(outgoing, maxX + COL_GAP);
```

(Delete the old `const incoming: string[] = []`, the `for (const ext of view.externals)` push loop, the two `.sort()` calls, the old `placeColumn` definition, and the two old `placeColumn(...)` calls that this replaces. Keep `midY`, `minX`, `maxX`, `COL_GAP`, `ROW_GAP` as they are.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @hyphae/web test layout`
Expected: PASS (new test + existing layout tests — with no `externalGroups`, every external is a single-box item, equivalent to before, though ordering is now edge-source order rather than sorted; the existing tests assert only presence and column side, which still hold).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/flow.ts apps/web/src/layout.ts apps/web/test/layout.test.ts
git commit -m "feat(web): lay out expanded external groups as clustered column items"
```

---

### Task 4: `flow.ts` `ghostGroup` render + `GhostGroupNode` + `GhostNode` caret

**Files:**
- Create: `apps/web/src/GhostGroupNode.tsx`
- Modify: `apps/web/src/flow.ts` — emit `ghostGroup` box nodes + `expandable` flag on ghosts
- Modify: `apps/web/src/GhostNode.tsx` — ＋ caret when `data.expandable`
- Test: `apps/web/test/flow.test.ts`

**Interfaces:**
- Consumes: `view.externalGroups`, `view.expandableExternalIds` (Task 2); `PAD`, `LABEL_H`, `NODE_W`, `NODE_H`.
- Produces: `focusViewToFlow` emits one `ghostGroup` FlowNode per group (id = group id, sized to wrap members) plus the member `ghost` nodes; every ghost's `data.expandable` reflects `expandableExternalIds`. `GhostGroupNode` and the updated `GhostNode` render a caret that calls `store.toggleExternal(id)`.

- [ ] **Step 1: Write the failing test**

Add to `apps/web/test/flow.test.ts` inside `describe('focusViewToFlow', ...)`:

```ts
it('renders an expanded external as a ghostGroup box wrapping its member ghosts', () => {
  const v: FocusView = {
    focusId: 'ca', focusNode: node('ca', 'Container'),
    children: [node('a1')],
    externals: [node('b1'), node('solo', 'Container')],
    edges: [
      { id: 'g1', from: 'a1', to: 'b1', kind: null, count: 1, derived: true, realizedBy: ['x1'] },
      { id: 's', from: 'a1', to: 'solo', kind: null, count: 1, derived: true, realizedBy: ['x2'] },
    ],
    externalGroups: [{ id: 'cb', name: 'Beta', childIds: ['b1'] }],
    expandableExternalIds: new Set(['solo']),
  };
  const pos = { a1: { x: 0, y: 0 }, b1: { x: 300, y: 40 }, solo: { x: 300, y: 200 } };
  const { nodes } = focusViewToFlow(v, pos);
  const group = nodes.find((n) => n.id === 'cb');
  expect(group?.type).toBe('ghostGroup');                        // group box emitted
  expect(nodes.find((n) => n.id === 'b1')?.type).toBe('ghost');  // member is a ghost
  // group box paints before its member
  expect(nodes.findIndex((n) => n.id === 'cb')).toBeLessThan(nodes.findIndex((n) => n.id === 'b1'));
  // group box wraps up-and-left of the member
  expect(group!.position.x).toBeLessThan(pos.b1.x);
  // the collapsed 'solo' ghost is flagged expandable, the member 'b1' is not
  expect((nodes.find((n) => n.id === 'solo')!.data as { expandable?: boolean }).expandable).toBe(true);
  expect((nodes.find((n) => n.id === 'b1')!.data as { expandable?: boolean }).expandable).toBeFalsy();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hyphae/web test flow`
Expected: FAIL — no `ghostGroup` node is emitted.

- [ ] **Step 3: Create `GhostGroupNode.tsx`**

```tsx
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useStore } from './store';

const sides: Array<{ id: string; position: Position }> = [
  { id: 't', position: Position.Top },
  { id: 'r', position: Position.Right },
  { id: 'b', position: Position.Bottom },
  { id: 'l', position: Position.Left },
];

/** An expanded external: a dashed, muted boundary wrapping the participating child ghosts. Its title
 *  bar carries a − caret that collapses it back to a single ghost. */
export function GhostGroupNode({ id, data }: NodeProps) {
  const label = String((data as { label?: string }).label ?? '');
  const toggle = useStore((s) => s.toggleExternal);
  return (
    <div className="region region--ghost" style={{ borderStyle: 'dashed' }}>
      {sides.map((s) => (
        <Handle key={s.id} id={s.id} type="source" position={s.position} style={{ opacity: 0, pointerEvents: 'none' }} />
      ))}
      <div className="region__handle" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontStyle: 'italic' }}>{label}</span>
        <button
          onClick={(ev) => { ev.stopPropagation(); toggle(id); }}
          title="Collapse"
          style={{ cursor: 'pointer', border: 'none', background: 'transparent', fontSize: 14, lineHeight: 1, padding: '0 2px' }}
        >−</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Update `GhostNode.tsx` to show the ＋ caret**

Change the component signature to also take `id`, read the store toggle, and render a caret when expandable. Replace the `export function GhostNode({ data }: NodeProps) {` block:

```tsx
export function GhostNode({ id, data }: NodeProps) {
  const d = data as { label?: string; color?: { bg: string; border: string }; expandable?: boolean };
  const label = d.label ?? '';
  const color = d.color ?? { bg: '#f1f5f9', border: '#94a3b8' };
  const toggle = useStore((s) => s.toggleExternal);
  return (
    <div
      style={{
        position: 'relative',
        width: 160,
        padding: '8px 10px',
        boxSizing: 'border-box',
        border: `1.5px dashed ${color.border}`,
        borderRadius: 4,
        background: color.bg,
        color: '#475569',
        fontSize: 12,
        lineHeight: 1.3,
        textAlign: 'center',
        whiteSpace: 'pre-wrap',
        fontStyle: 'italic',
      }}
    >
      {sides.map((s) => (
        <Handle key={s.id} id={s.id} type="source" position={s.position} style={{ opacity: 0, pointerEvents: 'none' }} />
      ))}
      {d.expandable && (
        <button
          onClick={(ev) => { ev.stopPropagation(); toggle(id); }}
          title="Expand connections"
          style={{ position: 'absolute', top: 2, right: 4, cursor: 'pointer', border: 'none', background: 'transparent', fontSize: 14, lineHeight: 1, padding: 0, fontStyle: 'normal' }}
        >＋</button>
      )}
      {label}
    </div>
  );
}
```

Add the store import at the top of `GhostNode.tsx`:

```tsx
import { useStore } from './store';
```

- [ ] **Step 5: Emit `ghostGroup` boxes + the `expandable` flag in `flow.ts`**

(`PAD`/`LABEL_H` are now imported from `./layout` per Task 3.) In `focusViewToFlow` (`apps/web/src/flow.ts`), after the focus-region block and before the `for (const n of view.children)` loop, add the group boxes (mirrors the focus-region wrapping):

```ts
  for (const g of view.externalGroups ?? []) {
    const mpos = g.childIds.map((id) => pos[id]).filter(Boolean) as XY[];
    if (!mpos.length) continue;
    const minX = Math.min(...mpos.map((p) => p.x));
    const minY = Math.min(...mpos.map((p) => p.y));
    const maxX = Math.max(...mpos.map((p) => p.x + NODE_W));
    const maxY = Math.max(...mpos.map((p) => p.y + NODE_H));
    const width = maxX - minX + 2 * PAD;
    const height = maxY - minY + LABEL_H + 2 * PAD;
    nodes.push({
      id: g.id,
      type: 'ghostGroup',
      position: { x: minX - PAD, y: minY - LABEL_H - PAD },
      data: { label: g.name },
      style: { width, height, pointerEvents: 'none' as const },
      initialWidth: width,
      initialHeight: height,
      draggable: false,
      selectable: false,
    });
  }
```

In the `for (const n of view.externals)` loop, add the `expandable` flag to the ghost node data:

```ts
  for (const n of view.externals) {
    nodes.push({ id: n.id, type: 'ghost', position: pos[n.id] ?? { x: 0, y: 0 }, data: { label: `${n.name}\n(${n.type})`, color: layerColorOf(n.type), expandable: view.expandableExternalIds?.has(n.id) ?? false }, initialWidth: NODE_W, initialHeight: NODE_H, draggable: false });
  }
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @hyphae/web test flow`
Expected: PASS (new test + existing flow tests — with no `externalGroups`/`expandableExternalIds`, no group boxes are emitted and `expandable` is `false`).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/GhostGroupNode.tsx apps/web/src/GhostNode.tsx apps/web/src/flow.ts apps/web/test/flow.test.ts
git commit -m "feat(web): render expanded external groups and an expand caret on ghosts"
```

---

### Task 5: `Canvas.tsx` — wire expansion state, register node type, caret interaction

**Files:**
- Modify: `apps/web/src/Canvas.tsx` — import + register `ghostGroup`, read `expandedExternals`, thread into `buildFocusView` memo + deps, keep the group box out of the dim backdrop
- Test: `apps/web/test/Canvas.test.tsx`

**Interfaces:**
- Consumes: `expandedExternals`/`toggleExternal` (Task 1), `buildFocusView(..., expandedExternals)` (Task 2), `GhostGroupNode` (Task 4).

- [ ] **Step 1: Write the failing test**

Add to `apps/web/test/Canvas.test.tsx` inside `describe('Canvas navigation (real React Flow)', ...)`. The file's `model()` already has `a1(in ca) -> b1(in cb)` via connection `x`, so focusing `ca` shows `cb` as an expandable external:

```ts
it('clicking a ghost\'s expand caret expands it into its participating child', () => {
  useStore.setState({ model: model(), focusId: 'ca', selectedId: null, expandedExternals: new Set() });
  const { container } = render(<Canvas />);
  const caret = node(container, 'cb')!.querySelector('button')!;
  expect(caret).toBeTruthy();                         // cb is expandable → caret present
  fireEvent.click(caret);
  expect([...useStore.getState().expandedExternals]).toEqual(['cb']);
  // after expansion the member child b1 renders and the collapsed cb ghost is gone
  expect(node(container, 'b1')).toBeTruthy();
  expect(node(container, 'cb')?.classList.contains('react-flow__node-ghost')).toBeFalsy();
});

it('double-clicking a ghost still drills (caret does not steal the gesture)', () => {
  useStore.setState({ model: model(), focusId: 'ca', selectedId: null, expandedExternals: new Set() });
  const { container } = render(<Canvas />);
  dblclick(container, 'cb');
  expect(useStore.getState().focusId).toBe('cb');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hyphae/web test Canvas`
Expected: FAIL — no caret button on the ghost (Canvas does not pass `expandedExternals`, and the `ghostGroup` type/flow flag isn't wired through the view build).

- [ ] **Step 3: Implement**

In `apps/web/src/Canvas.tsx`:

Import the new node component and register it:

```ts
import { GhostGroupNode } from './GhostGroupNode';
```

```ts
const nodeTypes = { region: GroupNode, node: NodeBox, ghost: GhostNode, ghostGroup: GhostGroupNode };
```

Read the expansion state (alongside the other `useStore` selectors):

```ts
  const expandedExternals = useStore((s) => s.expandedExternals);
```

Thread it into the view memo (update the call + deps):

```ts
  const view = useMemo(() => buildFocusView(model, focusId, connFilter, audience, expandedExternals), [model, focusId, connFilter, audience, expandedExternals]);
```

Keep the group box out of the dim backdrop: in the `highlightCss` rules, change the node-dim selector so it also excludes `ghostGroup`:

```ts
      `.hyphae-canvas .react-flow__node:not(.react-flow__node-region):not(.react-flow__node-ghostGroup){opacity:${dimNode}}`,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @hyphae/web test Canvas`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/Canvas.tsx apps/web/test/Canvas.test.tsx
git commit -m "feat(web): wire expandable externals into the canvas with caret interaction"
```

---

### Task 6: Full-suite green + manual verification

**Files:** none (verification only)

- [ ] **Step 1: Run the web package tests + build**

Run: `pnpm --filter @hyphae/web test` then `pnpm --filter @hyphae/web build`
Expected: all web tests pass; `tsc` + vite build clean.

- [ ] **Step 2: Run the whole monorepo suite** (nothing outside web changed, but confirm)

Run: `pnpm -r test`
Expected: schema/server unchanged and green; web green.

- [ ] **Step 3: Manual web check (per superpowers:verification-before-completion)**

Start the app (`pnpm dev`), open a Container focus with an inter-container edge (e.g. from the cctv model), and confirm:
- A peer-container external ghost shows a ＋ caret; a leaf ExternalSystem does not.
- Clicking ＋ replaces the single ghost with a dashed group box containing only the participating child(ren), with edges landing on the specific child; the − caret collapses it back.
- Double-clicking a ghost still drills into it; changing focus clears any expansion.

- [ ] **Step 4:** Nothing to commit unless notes/screenshots were produced.

---

## Self-Review

**Spec coverage:**
- Store `expandedExternals` + `toggleExternal` + reset on `setFocus` → Task 1. ✅
- `buildFocusView` 5th param `expandedExternals`, endpoint remap, `externalGroups`, `expandableExternalIds` → Task 2. ✅
- Layout clusters group members + reserves space → Task 3. ✅
- `ghostGroup` render + `GhostGroupNode` + `GhostNode` ＋ caret + `expandable` flag → Task 4. ✅
- Canvas registers type, threads state, dim-backdrop exclusion, caret interaction → Task 5. ✅
- Audience interplay (stakeholder filters run after remap) → inherent (no special-casing), exercised implicitly; noted in spec. ✅
- No schema/MCP changes; expansion not in hash → Global Constraints + Task 1. ✅
- Testing across store/focusView/layout/flow/Canvas + manual → each task + Task 6. ✅

**Placeholder scan:** No TBD/TODO; every code step shows the exact edit.

**Type consistency:** `expandedExternals: Set<string>` / `toggleExternal(id)` consistent across Tasks 1, 2, 5. `FocusView.externalGroups: { id; name; childIds }[]` and `expandableExternalIds: Set<string>` defined in Task 2 and consumed with the same shape in Tasks 3 (`childIds`) and 4 (`id`/`name`/`childIds`, `expandableExternalIds.has`). `buildFocusView(model, focusId, filter?, audience, expandedExternals)` 5-arg signature consistent between Task 2 (definition) and Task 5 (Canvas call). `PAD`/`LABEL_H` moved to `layout.ts` and imported by `flow.ts` in Task 3 (one-directional flow→layout imports, no cycle); used by the group-box render in Task 4. `ghostGroup` node type name consistent across Tasks 4 and 5.

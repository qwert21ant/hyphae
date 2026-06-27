# Focus View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the global layer-view with a bounded, auto-laid-out, read-only **focus view** that shows one node + its direct children + aggregated external neighbors, navigated via breadcrumbs.

**Architecture:** Pure client-side pipeline. `buildFocusView(model, focusId)` produces a semantic `FocusView` (focus node, direct children or roots, peer-aggregated external boxes, collapsed edges). `layoutFocusView` assigns positions with dagre (children) + deterministic columns (externals). `focusViewToFlow` maps that to React Flow nodes/edges. The canvas renders it read-only; the store tracks `focusId` instead of `layer`. No server/MCP changes.

**Tech Stack:** Vite + React 18 + TypeScript, @xyflow/react (React Flow), Zustand, `@dagrejs/dagre`, Vitest + @testing-library/react.

## Global Constraints

- Package manager: **pnpm workspaces**. Run web tests with `pnpm --filter @hyphae/web test`; all tests with `pnpm -r test`.
- The active profile is **`c4-backend`** with layers ordered top→bottom: `['Context','Container','Component','Code']`. Never hardcode layer names in logic — derive from `c4Backend.layers` and `layerOfType`.
- The model is the single source of truth held in the store; all writes go through the existing `api`/store actions and `recover()` on 422. Do not add a whole-model write.
- The focus canvas is **read-only for layout** in v1: no node dragging, no draw-to-connect, no reparent-by-drag, no position persistence. Side-panel editing (`SidePanel.tsx`) stays as-is.
- Reuse existing components: `NodeBox` (children), `GhostNode` (external boxes), `GroupNode` (focus region), `FloatingEdge` (edges).
- Match the existing test style in `apps/web/test` (pure-function unit tests + a couple of component tests).

---

### Task 1: Schema helpers — allowed children & top-level kinds

**Files:**
- Modify: `packages/schema/src/profile.ts` (add two exports after `allowedParentTypes`, line ~59)
- Modify: `packages/schema/src/profiles/c4-backend.ts:53` (re-export the new helpers)
- Test: `packages/schema/test/profile.test.ts` (create if absent; otherwise append)

**Interfaces:**
- Produces:
  - `allowedChildTypes(profile: Profile, type: string): string[]`
  - `topLevelTypes(profile: Profile): string[]` — node kinds whose `allowedParents` is empty.

- [ ] **Step 1: Write the failing test**

Create/append `packages/schema/test/profile.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { c4Backend, allowedChildTypes, topLevelTypes } from '../src/index';

describe('profile child/top-level helpers', () => {
  it('returns the allowed child types for a kind', () => {
    expect(allowedChildTypes(c4Backend, 'System')).toEqual(['Container']);
    expect(allowedChildTypes(c4Backend, 'Container')).toEqual(['Component']);
    expect(allowedChildTypes(c4Backend, 'Class')).toEqual([]);
  });
  it('returns the kinds that can sit at the top level', () => {
    expect(topLevelTypes(c4Backend).sort()).toEqual(['Actor', 'ExternalSystem', 'System']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hyphae/schema test`
Expected: FAIL — `allowedChildTypes`/`topLevelTypes` not exported.

- [ ] **Step 3: Implement the helpers**

In `packages/schema/src/profile.ts`, after `allowedParentTypes` (around line 59):

```ts
export const allowedChildTypes = (profile: Profile, type: string): string[] =>
  profile.nodeKinds.find((k) => k.id === type)?.allowedChildren ?? [];

export const topLevelTypes = (profile: Profile): string[] =>
  profile.nodeKinds.filter((k) => (k.allowedParents ?? []).length === 0).map((k) => k.id);
```

In `packages/schema/src/profiles/c4-backend.ts:53`, extend the re-export:

```ts
export { layerOfType, allowedParentTypes, allowedChildTypes, topLevelTypes, typesForLayer } from '../profile';
```

Confirm `packages/schema/src/index.ts` re-exports from `./profile` (it already exports the profile helpers — if it lists names explicitly, add `allowedChildTypes` and `topLevelTypes`). Check with: `grep -n "allowedParentTypes\|from './profile'" packages/schema/src/index.ts` and mirror however `allowedParentTypes` is exported.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @hyphae/schema test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/schema/src/profile.ts packages/schema/src/profiles/c4-backend.ts packages/schema/src/index.ts packages/schema/test/profile.test.ts
git commit -m "feat(schema): allowedChildTypes + topLevelTypes helpers"
```

---

### Task 2: `focusView.ts` — the pure focus-view builder

**Files:**
- Create: `apps/web/src/focusView.ts`
- Test: `apps/web/test/focusView.test.ts`

**Interfaces:**
- Consumes: `c4Backend`, `layerOfType` from `@hyphae/schema`; `allIds`/`parentId` from the model.
- Produces:
  - `type ConnFilter = { kinds: string[]; fields: Record<string, string[]> }`
  - `type FocusEdge = { id: string; from: string; to: string; kind: string | null; count: number; derived: boolean }`
  - `type FocusView = { focusId: string | null; focusNode: Node | null; children: Node[]; externals: Node[]; edges: FocusEdge[] }`
  - `type Crumb = { id: string | null; name: string }`
  - `buildFocusView(model, focusId: string | null, filter?: ConnFilter): FocusView`
  - `breadcrumbPath(model, focusId: string | null): Crumb[]`
  - `representative(model, endpointId: string, focusLayer: string): string`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/test/focusView.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildFocusView, breadcrumbPath } from '../src/focusView';
import { emptyModel } from '@hyphae/schema';

const base = { description: '', codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {} };
const e = { description: '', direction: 'Unidirectional' as const, realizedBy: [], codeRefs: [], fields: {} };

/** sys › (ca, cb containers); ca has comps a1,a2; cb has comp b1; a1 has Code k1; ext is external. */
function model() {
  const m = emptyModel();
  m.nodes.push(
    { id: 'sys', name: 'Sys', type: 'System', parentId: null, ...base },
    { id: 'ca', name: 'Alpha', type: 'Container', parentId: 'sys', ...base },
    { id: 'cb', name: 'Beta', type: 'Container', parentId: 'sys', ...base },
    { id: 'a1', name: 'A1', type: 'Component', parentId: 'ca', ...base },
    { id: 'a2', name: 'A2', type: 'Component', parentId: 'ca', ...base },
    { id: 'b1', name: 'B1', type: 'Component', parentId: 'cb', ...base },
    { id: 'k1', name: 'K1', type: 'Class', parentId: 'a1', ...base },
    { id: 'ext', name: 'Ext', type: 'ExternalSystem', parentId: null, ...base },
  );
  return m;
}

describe('buildFocusView', () => {
  it('root view shows top-level nodes', () => {
    const v = buildFocusView(model(), null);
    expect(v.focusNode).toBeNull();
    expect(v.children.map((n) => n.id).sort()).toEqual(['ext', 'sys']);
    expect(v.externals).toHaveLength(0);
  });

  it('focused view shows the focus node + its direct children only', () => {
    const v = buildFocusView(model(), 'ca');
    expect(v.focusNode?.id).toBe('ca');
    expect(v.children.map((n) => n.id).sort()).toEqual(['a1', 'a2']);
  });

  it('keeps an inner edge between two children as a real edge', () => {
    const m = model();
    m.connections.push({ id: 'i', from: 'a1', to: 'a2', type: 'Dependency', ...e });
    const v = buildFocusView(m, 'ca');
    const inner = v.edges.find((x) => x.id === 'i');
    expect(inner).toMatchObject({ from: 'a1', to: 'a2', kind: 'Dependency', derived: false, count: 1 });
  });

  it('aggregates external endpoints to a peer-level box and collapses edges with a count', () => {
    const m = model();
    // two components inside cb both depended on by a1 (focus ca): collapse cb-side to one box "cb"
    m.connections.push(
      { id: 'x1', from: 'a1', to: 'b1', type: 'Dependency', ...e },
      { id: 'x2', from: 'a2', to: 'b1', type: 'Dependency', ...e },
    );
    const v = buildFocusView(m, 'ca');
    // external box is cb (the Container peer of focus ca), not b1
    expect(v.externals.map((n) => n.id)).toEqual(['cb']);
    const a1cb = v.edges.find((x) => x.from === 'a1' && x.to === 'cb');
    const a2cb = v.edges.find((x) => x.from === 'a2' && x.to === 'cb');
    expect(a1cb).toMatchObject({ derived: true, count: 1 });
    expect(a2cb).toMatchObject({ derived: true, count: 1 });
  });

  it('shows a higher-layer neighbor (external system) as itself', () => {
    const m = model();
    m.connections.push({ id: 'x', from: 'a1', to: 'ext', type: 'Dependency', ...e });
    const v = buildFocusView(m, 'ca');
    expect(v.externals.map((n) => n.id)).toEqual(['ext']);
    expect(v.edges.find((x) => x.to === 'ext')).toMatchObject({ from: 'a1', to: 'ext', derived: true });
  });

  it('rolls cross-subtree edges up to root↔root at the root view', () => {
    const m = model();
    m.connections.push({ id: 'x', from: 'a1', to: 'ext', type: 'Dependency', ...e });
    const v = buildFocusView(m, null);
    // a1 lives under sys → maps to sys; ext is a root → sys→ext edge
    const edge = v.edges.find((x) => x.from === 'sys' && x.to === 'ext');
    expect(edge).toMatchObject({ derived: true });
  });

  it('drops dangling connections', () => {
    const m = model();
    m.connections.push({ id: 'd', from: 'a1', to: 'nope', type: 'Dependency', ...e });
    const v = buildFocusView(m, 'ca');
    expect(v.edges.find((x) => x.id === 'd')).toBeUndefined();
  });

  it('honors the connection filter', () => {
    const m = model();
    m.connections.push(
      { id: 'i1', from: 'a1', to: 'a2', type: 'Dependency', ...e },
      { id: 'i2', from: 'a2', to: 'a1', type: 'DataFlow', ...e },
    );
    const v = buildFocusView(m, 'ca', { kinds: ['Dependency'], fields: {} });
    expect(v.edges.map((x) => x.id)).toEqual(['i1']);
  });
});

describe('breadcrumbPath', () => {
  it('builds Root + ancestor chain', () => {
    expect(breadcrumbPath(model(), 'a1').map((c) => c.id)).toEqual([null, 'sys', 'ca', 'a1']);
    expect(breadcrumbPath(model(), null).map((c) => c.id)).toEqual([null]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @hyphae/web test focusView`
Expected: FAIL — module `../src/focusView` does not exist.

- [ ] **Step 3: Implement `focusView.ts`**

Create `apps/web/src/focusView.ts`:

```ts
import { c4Backend, layerOfType, type HyphaeModel, type Node, type Connection } from '@hyphae/schema';

export type ConnFilter = { kinds: string[]; fields: Record<string, string[]> };

export type FocusEdge = {
  id: string;
  from: string;
  to: string;
  kind: string | null; // connection type for a 1:1 real edge; null when aggregated
  count: number;       // underlying connections represented
  derived: boolean;    // aggregated/collapsed (dashed) edge
};

export type FocusView = {
  focusId: string | null;
  focusNode: Node | null;
  children: Node[];   // direct children, or all roots at the root view
  externals: Node[];  // representative peer-level external boxes
  edges: FocusEdge[];
};

export type Crumb = { id: string | null; name: string };

const indexOfLayer = (layer: string | undefined): number =>
  layer ? c4Backend.layers.indexOf(layer) : -1;

function matchesFilter(c: Connection, f: ConnFilter): boolean {
  if (f.kinds.length && !f.kinds.includes(c.type)) return false;
  for (const [key, vals] of Object.entries(f.fields)) {
    if (vals.length && !vals.includes(String(c.fields[key] ?? ''))) return false;
  }
  return true;
}

/**
 * The node that should represent `endpointId` in a view focused at `focusLayer`:
 * - at or above the focus layer → the endpoint itself (e.g. an ExternalSystem stays itself);
 * - below the focus layer → its ancestor on the focus layer (its peer of the focus node).
 */
export function representative(model: HyphaeModel, endpointId: string, focusLayer: string): string {
  const nodes = new Map(model.nodes.map((n) => [n.id, n]));
  const fi = indexOfLayer(focusLayer);
  let cur = nodes.get(endpointId);
  if (!cur) return endpointId;
  if (indexOfLayer(layerOfType(c4Backend, cur.type)) <= fi) return endpointId;
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    if (layerOfType(c4Backend, cur.type) === focusLayer) return cur.id;
    if (!cur.parentId) return cur.id;
    const p = nodes.get(cur.parentId);
    if (!p) return cur.id;
    cur = p;
  }
  return endpointId;
}

export function buildFocusView(model: HyphaeModel, focusId: string | null, filter?: ConnFilter): FocusView {
  const nodes = new Map(model.nodes.map((n) => [n.id, n]));
  const allIds = new Set(model.nodes.map((n) => n.id));
  const focusNode = focusId ? nodes.get(focusId) ?? null : null;

  const children = focusId
    ? model.nodes.filter((n) => n.parentId === focusId)
    : model.nodes.filter((n) => !n.parentId || !allIds.has(n.parentId));

  // The layer external endpoints are rolled up to: the focus node's own layer
  // (its peers), or the top layer at the root view.
  const focusLayer = focusNode ? layerOfType(c4Backend, focusNode.type) ?? '' : c4Backend.layers[0];

  const inside = new Set<string>(children.map((n) => n.id));
  if (focusId) inside.add(focusId);

  const conns = filter ? model.connections.filter((c) => matchesFilter(c, filter)) : model.connections;

  const innerEdges: FocusEdge[] = [];
  const agg = new Map<string, FocusEdge>(); // key `${from}->${to}`
  const externalIds = new Set<string>();

  for (const c of conns) {
    if (!allIds.has(c.from) || !allIds.has(c.to)) continue; // drop dangling
    const from = inside.has(c.from) ? c.from : representative(model, c.from, focusLayer);
    const to = inside.has(c.to) ? c.to : representative(model, c.to, focusLayer);
    const fIn = inside.has(from);
    const tIn = inside.has(to);
    if (!fIn && !tIn) continue;   // unrelated to this view
    if (from === to) continue;    // collapsed onto itself (e.g. an edge to its own descendant)

    if (fIn && tIn) {
      if (from === c.from && to === c.to) {
        innerEdges.push({ id: c.id, from, to, kind: c.type, count: 1, derived: false });
      } else {
        const key = `${from}->${to}`;
        const ex = agg.get(key);
        if (ex) ex.count++;
        else agg.set(key, { id: `agg:${key}`, from, to, kind: null, count: 1, derived: true });
      }
      continue;
    }

    if (!fIn) externalIds.add(from);
    if (!tIn) externalIds.add(to);
    const key = `${from}->${to}`;
    const ex = agg.get(key);
    if (ex) ex.count++;
    else agg.set(key, { id: `ext:${key}`, from, to, kind: null, count: 1, derived: true });
  }

  const externals = [...externalIds].map((id) => nodes.get(id)).filter((n): n is Node => !!n);
  return { focusId, focusNode, children, externals, edges: [...innerEdges, ...agg.values()] };
}

export function breadcrumbPath(model: HyphaeModel, focusId: string | null): Crumb[] {
  const nodes = new Map(model.nodes.map((n) => [n.id, n]));
  const chain: Crumb[] = [];
  let cur = focusId ? nodes.get(focusId) ?? null : null;
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    chain.unshift({ id: cur.id, name: cur.name });
    cur = cur.parentId ? nodes.get(cur.parentId) ?? null : null;
  }
  return [{ id: null, name: 'Root' }, ...chain];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @hyphae/web test focusView`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/focusView.ts apps/web/test/focusView.test.ts
git commit -m "feat(web): pure focus-view builder (children + aggregated externals)"
```

---

### Task 3: `layout.ts` — dagre auto-layout

**Files:**
- Modify: `apps/web/package.json` (add `@dagrejs/dagre`)
- Create: `apps/web/src/layout.ts`
- Test: `apps/web/test/layout.test.ts`

**Interfaces:**
- Consumes: `FocusView` from `./focusView`.
- Produces:
  - `const NODE_W = 160`, `const NODE_H = 44` (exported)
  - `type XY = { x: number; y: number }`
  - `layoutFocusView(view: FocusView): Record<string, XY>` — positions for every child id and external id.

- [ ] **Step 1: Add the dependency**

Run:

```bash
pnpm --filter @hyphae/web add @dagrejs/dagre
```

Expected: `@dagrejs/dagre` added to `apps/web/package.json` dependencies.

- [ ] **Step 2: Write the failing test**

Create `apps/web/test/layout.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { layoutFocusView, NODE_W } from '../src/layout';
import type { FocusView } from '../src/focusView';

const node = (id: string, type = 'Component') =>
  ({ id, name: id, type, parentId: null, description: '', codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {} }) as any;

const view: FocusView = {
  focusId: 'ca',
  focusNode: node('ca', 'Container'),
  children: [node('a1'), node('a2')],
  externals: [node('cb', 'Container')],
  edges: [
    { id: 'i', from: 'a1', to: 'a2', kind: 'Dependency', count: 1, derived: false },
    { id: 'ext:a1->cb', from: 'a1', to: 'cb', kind: null, count: 1, derived: true },
  ],
};

describe('layoutFocusView', () => {
  it('assigns a position to every child and external', () => {
    const pos = layoutFocusView(view);
    for (const id of ['a1', 'a2', 'cb']) {
      expect(pos[id]).toBeDefined();
      expect(typeof pos[id].x).toBe('number');
      expect(typeof pos[id].y).toBe('number');
    }
  });

  it('is deterministic for the same input', () => {
    expect(layoutFocusView(view)).toEqual(layoutFocusView(view));
  });

  it('places externals beside the children cluster, not on top of it', () => {
    const pos = layoutFocusView(view);
    const childMaxX = Math.max(pos.a1.x, pos.a2.x) + NODE_W;
    const childMinX = Math.min(pos.a1.x, pos.a2.x);
    // cb is an outgoing target → to the right of the cluster (or clearly left if incoming)
    expect(pos.cb.x >= childMaxX || pos.cb.x + NODE_W <= childMinX).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @hyphae/web test layout`
Expected: FAIL — module `../src/layout` does not exist.

- [ ] **Step 4: Implement `layout.ts`**

Create `apps/web/src/layout.ts`:

```ts
import dagre from '@dagrejs/dagre';
import type { FocusView } from './focusView';

export const NODE_W = 160;
export const NODE_H = 44;

export type XY = { x: number; y: number };

const COL_GAP = 120;  // horizontal gap between the children cluster and an external column
const ROW_GAP = 70;   // vertical gap between stacked externals

/** Children laid out by their inner edges via dagre; externals placed in incoming (left)
 *  / outgoing (right) columns beside the resulting cluster. Deterministic. */
export function layoutFocusView(view: FocusView): Record<string, XY> {
  const childIds = new Set(view.children.map((n) => n.id));
  const pos: Record<string, XY> = {};

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 80, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of view.children) g.setNode(n.id, { width: NODE_W, height: NODE_H });
  for (const e of view.edges) {
    if (childIds.has(e.from) && childIds.has(e.to)) g.setEdge(e.from, e.to);
  }
  dagre.layout(g);
  for (const n of view.children) {
    const d = g.node(n.id);
    pos[n.id] = d ? { x: d.x - NODE_W / 2, y: d.y - NODE_H / 2 } : { x: 0, y: 0 };
  }

  // Children bounding box (fall back to origin when there are no children).
  const xs = view.children.map((n) => pos[n.id].x);
  const ys = view.children.map((n) => pos[n.id].y);
  const minX = xs.length ? Math.min(...xs) : 0;
  const maxX = xs.length ? Math.max(...xs) + NODE_W : NODE_W;
  const minY = ys.length ? Math.min(...ys) : 0;
  const maxY = ys.length ? Math.max(...ys) + NODE_H : NODE_H;
  const midY = (minY + maxY) / 2;

  const incoming: string[] = []; // externals that are a source of some edge → left
  const outgoing: string[] = []; // otherwise → right
  for (const ext of view.externals) {
    (view.edges.some((e) => e.from === ext.id) ? incoming : outgoing).push(ext.id);
  }
  incoming.sort();
  outgoing.sort();

  const placeColumn = (ids: string[], x: number) => {
    const totalH = Math.max(0, ids.length - 1) * ROW_GAP;
    ids.forEach((id, i) => { pos[id] = { x, y: midY - totalH / 2 + i * ROW_GAP - NODE_H / 2 }; });
  };
  placeColumn(incoming, minX - COL_GAP - NODE_W);
  placeColumn(outgoing, maxX + COL_GAP);

  return pos;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @hyphae/web test layout`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/package.json apps/web/src/layout.ts apps/web/test/layout.test.ts pnpm-lock.yaml
git commit -m "feat(web): dagre auto-layout for the focus view"
```

---

### Task 4: `flow.ts` — map FocusView → React Flow + highlight

**Files:**
- Create: `apps/web/src/flow.ts`
- Test: `apps/web/test/flow.test.ts`

**Interfaces:**
- Consumes: `FocusView`, `FocusEdge` from `./focusView`; `XY`, `NODE_W`, `NODE_H` from `./layout`; React Flow `Node`/`Edge` types.
- Produces:
  - `focusViewToFlow(view: FocusView, pos: Record<string, XY>): { nodes: FlowNode[]; edges: FlowEdge[] }`
  - `highlightSets(selectedId: string | null, edges: FlowEdge[], childIds?: Set<string>): { nodes: Set<string>; edges: Set<string> }` (moved verbatim from `toModel.ts`).

- [ ] **Step 1: Write the failing tests**

Create `apps/web/test/flow.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { focusViewToFlow, highlightSets } from '../src/flow';
import type { FocusView } from '../src/focusView';
import type { Edge as FlowEdge } from '@xyflow/react';

const node = (id: string, type = 'Component') =>
  ({ id, name: id, type, parentId: null, description: '', codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {} }) as any;

const view: FocusView = {
  focusId: 'ca',
  focusNode: node('ca', 'Container'),
  children: [node('a1'), node('a2')],
  externals: [node('cb', 'Container')],
  edges: [
    { id: 'i', from: 'a1', to: 'a2', kind: 'Dependency', count: 1, derived: false },
    { id: 'ext:a1->cb', from: 'a1', to: 'cb', kind: null, count: 3, derived: true },
  ],
};
const pos = { a1: { x: 0, y: 0 }, a2: { x: 0, y: 100 }, cb: { x: 300, y: 50 } };

describe('focusViewToFlow', () => {
  it('renders the focus as a region, children as nodes, externals as ghosts', () => {
    const { nodes } = focusViewToFlow(view, pos);
    expect(nodes.find((n) => n.id === 'ca')?.type).toBe('region');
    expect(nodes.find((n) => n.id === 'a1')?.type).toBe('node');
    expect(nodes.find((n) => n.id === 'cb')?.type).toBe('ghost');
    // region paints before its children and wraps up-and-left of them
    expect(nodes.findIndex((n) => n.id === 'ca')).toBeLessThan(nodes.findIndex((n) => n.id === 'a1'));
    const region = nodes.find((n) => n.id === 'ca')!;
    expect(region.position.x).toBeLessThan(pos.a1.x);
    expect(region.draggable).toBe(false);
  });

  it('renders a real edge with its kind label and a derived edge with a count label', () => {
    const { edges } = focusViewToFlow(view, pos);
    const real = edges.find((e) => e.id === 'i')!;
    expect(real.label).toBe('Dependency');
    expect((real.data as { derived?: boolean } | undefined)?.derived).toBeFalsy();
    const derived = edges.find((e) => e.id === 'ext:a1->cb')!;
    expect(derived.label).toBe('3');
    expect((derived.data as { derived?: boolean }).derived).toBe(true);
    expect(derived.style?.strokeDasharray).toBeTruthy();
    expect(derived.selectable).toBe(false);
  });

  it('omits the region at the root view (no focus node)', () => {
    const root: FocusView = { focusId: null, focusNode: null, children: [node('sys', 'System')], externals: [], edges: [] };
    const { nodes } = focusViewToFlow(root, { sys: { x: 0, y: 0 } });
    expect(nodes.every((n) => n.type !== 'region')).toBe(true);
  });
});

describe('highlightSets', () => {
  const edges: FlowEdge[] = [
    { id: 'e1', source: 'a', target: 'b' },
    { id: 'e2', source: 'b', target: 'c' },
  ];
  it('highlights a node, its edges, and neighbors', () => {
    const h = highlightSets('a', edges);
    expect([...h.nodes].sort()).toEqual(['a', 'b']);
    expect([...h.edges]).toEqual(['e1']);
  });
  it('highlights a region via its children', () => {
    const h = highlightSets('ca', edges, new Set(['a', 'b']));
    expect([...h.nodes].sort()).toEqual(['a', 'b', 'ca']);
    expect([...h.edges].sort()).toEqual(['e1', 'e2']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @hyphae/web test flow`
Expected: FAIL — module `../src/flow` does not exist.

- [ ] **Step 3: Implement `flow.ts`**

Create `apps/web/src/flow.ts`:

```ts
import type { Node as FlowNode, Edge as FlowEdge } from '@xyflow/react';
import type { FocusView, FocusEdge } from './focusView';
import { NODE_W, NODE_H, type XY } from './layout';

const PAD = 24;
const LABEL_H = 22;

function realEdge(e: FocusEdge): FlowEdge {
  return { id: e.id, type: 'floating', source: e.from, target: e.to, label: e.kind ?? '' };
}

function derivedEdge(e: FocusEdge): FlowEdge {
  return {
    id: e.id,
    type: 'floating',
    source: e.from,
    target: e.to,
    label: String(e.count),
    data: { derived: true, count: e.count },
    selectable: false,
    deletable: false,
    focusable: false,
    style: { stroke: '#7c3aed', strokeDasharray: '6 4', strokeWidth: 2 },
    labelStyle: { color: '#6d28d9', fontWeight: 600 },
    labelBgStyle: { background: '#ede9fe' },
  };
}

export function focusViewToFlow(view: FocusView, pos: Record<string, XY>): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const nodes: FlowNode[] = [];

  if (view.focusNode && view.children.length) {
    const xs = view.children.map((n) => pos[n.id]?.x ?? 0);
    const ys = view.children.map((n) => pos[n.id]?.y ?? 0);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs.map((x) => x + NODE_W));
    const maxY = Math.max(...ys.map((y) => y + NODE_H));
    nodes.push({
      id: view.focusNode.id,
      type: 'region',
      position: { x: minX - PAD, y: minY - LABEL_H - PAD },
      data: { label: view.focusNode.name },
      style: { width: maxX - minX + 2 * PAD, height: maxY - minY + LABEL_H + 2 * PAD, pointerEvents: 'none' as const },
      draggable: false,
      selectable: false,
    });
  }

  for (const n of view.children) {
    nodes.push({ id: n.id, type: 'node', position: pos[n.id] ?? { x: 0, y: 0 }, data: { label: `${n.name}\n(${n.type})` }, draggable: false });
  }
  for (const n of view.externals) {
    nodes.push({ id: n.id, type: 'ghost', position: pos[n.id] ?? { x: 0, y: 0 }, data: { label: `${n.name}\n(${n.type})` }, draggable: false });
  }

  const edges = view.edges.map((e) => (e.derived ? derivedEdge(e) : realEdge(e)));
  return { nodes, edges };
}

/**
 * Given the current selection, the node/edge ids to highlight:
 * - an edge → the edge and the two nodes it connects;
 * - a region (its child ids passed in `childIds`) → the region, its children, and touching edges;
 * - a plain node → the node, its adjacent edges, and the nodes on the other end.
 */
export function highlightSets(selectedId: string | null, edges: FlowEdge[], childIds: Set<string> = new Set()): { nodes: Set<string>; edges: Set<string> } {
  if (!selectedId) return { nodes: new Set(), edges: new Set() };

  const selectedEdge = edges.find((e) => e.id === selectedId);
  if (selectedEdge) {
    return { nodes: new Set([selectedEdge.source, selectedEdge.target]), edges: new Set([selectedId]) };
  }

  if (childIds.size) {
    const nodes = new Set<string>([selectedId, ...childIds]);
    const within = edges.filter((e) => childIds.has(e.source) || childIds.has(e.target)).map((e) => e.id);
    return { nodes, edges: new Set(within) };
  }

  const adjacent = edges.filter((e) => e.source === selectedId || e.target === selectedId);
  const nodes = new Set<string>([selectedId]);
  for (const e of adjacent) {
    nodes.add(e.source);
    nodes.add(e.target);
  }
  return { nodes, edges: new Set(adjacent.map((e) => e.id)) };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @hyphae/web test flow`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/flow.ts apps/web/test/flow.test.ts
git commit -m "feat(web): map FocusView to React Flow nodes/edges + highlight"
```

---

### Task 5: Store — `focusId`, `setFocus`, add-as-child; retire layer/positions

**Files:**
- Modify: `apps/web/src/api.ts:30` (`createNode` accepts optional `parentId`)
- Modify: `apps/web/src/store.ts` (replace `layer` with `focusId`; `setFocus`; `addNode` parents to focus; remove `setLayer`, `setNodePosition`, viewports-era exports)
- Modify: `apps/web/test/store.test.ts` (update the layer/position test)

**Interfaces:**
- Consumes: `api.createNode({ id, name, type, parentId })`.
- Produces (store): `focusId: string | null`, `setFocus(id: string | null): void`. Removed: `layer`, `setLayer`, `setNodePosition`. The exports `layerTypes`/`layers` at the bottom of `store.ts` are removed (App switches to profile helpers).

- [ ] **Step 1: Update the store test (failing)**

In `apps/web/test/store.test.ts`, replace the `'stores a node position in the layer view'` test (lines ~79-86) with a focus test, and update the mocked `createNode` to record `parentId`:

```ts
  it('adds a node as a child of the current focus', async () => {
    useStore.getState().setFocus('ca');
    await useStore.getState().addNode('Component');
    expect(useStore.getState().model.nodes[0].parentId).toBe('ca');
    expect(useStore.getState().focusId).toBe('ca');
  });
```

And change the mocked `createNode` (line ~21) to thread `parentId`:

```ts
    createNode: vi.fn(async (input: { id: string; name: string; type: string; parentId?: string | null }) => ({ node: base({ id: input.id, name: input.name, type: input.type, parentId: input.parentId ?? null }), version: ++v })),
```

Remove the now-unused `setNodePosition` mock line if the test no longer references it (leave it if other tests import it — none do after this change, so delete line ~27).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hyphae/web test store`
Expected: FAIL — `setFocus`/`focusId` not defined; `addNode` does not set `parentId`.

- [ ] **Step 3: Extend `api.createNode`**

In `apps/web/src/api.ts:30`:

```ts
export function createNode(input: { id: string; name: string; type: string; parentId?: string | null }): Promise<{ node: Node; version: number }> {
  return mutate('POST', '/nodes', input) as Promise<{ node: Node; version: number }>;
}
```

Also remove `setNodePosition` from `api.ts` (lines ~48-50) and drop the now-unused `Position` import on line 1 — it is no longer used by the focus view.

- [ ] **Step 4: Rewrite the store**

In `apps/web/src/store.ts`:

- Update the import on line 2-5: drop `Position` and `typesForLayer`; keep `emptyModel, newId, c4Backend` and the `HyphaeModel, Node, Connection` types.
- In the `State` type: replace `layer: string` with `focusId: string | null`; remove `setLayer`, `setNodePosition`. Add `setFocus: (id: string | null) => void`.
- In the store body: replace the `layer: 'Component'` initial with `focusId: null`. Replace `setLayer` with:

```ts
    setFocus: (focusId) => set({ focusId, selectedId: null }),
```

- Change `addNode` to parent new nodes to the focus:

```ts
    addNode: async (type) => {
      try {
        const parentId = get().focusId;
        const { node, version } = await api.createNode({ id: newId(), name: type, type, parentId });
        set((s) => ({ model: { ...s.model, nodes: [...s.model.nodes, node] }, selectedId: node.id, ownVersion: version, error: null }));
      } catch (e) { await recover(e); }
    },
```

- Delete the entire `setNodePosition` action (lines ~129-148).
- Delete the bottom exports `layerTypes` and `layers` (lines ~152-153).

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @hyphae/web test store`
Expected: PASS.

> NOTE: `Canvas.tsx` and `App.tsx` still reference the removed `layer`/`setLayer`/`setNodePosition` and will not type-check until Tasks 6–7. That is expected; `apps/web/test store` runs in isolation. Do not "fix" the others yet.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/api.ts apps/web/src/store.ts apps/web/test/store.test.ts
git commit -m "feat(web): store tracks focusId; add-as-child; drop layer/positions"
```

---

### Task 6: Canvas — read-only focus rendering + navigation

**Files:**
- Modify: `apps/web/src/Canvas.tsx` (full rewrite of the rendering/interaction logic)
- Test: `apps/web/test/Canvas.test.tsx` (create)

**Interfaces:**
- Consumes: `buildFocusView` (`./focusView`), `layoutFocusView` (`./layout`), `focusViewToFlow` + `highlightSets` (`./flow`), store `focusId`/`setFocus`/`select`/`connFilter`/`model`.
- Produces: a read-only React Flow canvas. Double-clicking a child that has children, or any external ghost, calls `setFocus(id)`; single click selects; pane click clears selection.

- [ ] **Step 1: Write the failing navigation test**

Create `apps/web/test/Canvas.test.tsx`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { Canvas } from '../src/Canvas';
import { useStore } from '../src/store';
import { emptyModel } from '@hyphae/schema';

// React Flow needs layout/resize APIs jsdom lacks; stub the heavy parts and capture handlers.
let captured: any = {};
vi.mock('@xyflow/react', () => ({
  ReactFlow: (props: any) => { captured = props; return null; },
  Background: () => null,
  Controls: () => null,
  Panel: ({ children }: any) => children,
  useNodesState: (init: any) => [init, () => {}, () => {}],
  ConnectionMode: { Loose: 'loose' },
}));

const base = { description: '', codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {} };

beforeEach(() => {
  const m = emptyModel();
  m.nodes.push(
    { id: 'ca', name: 'Alpha', type: 'Container', parentId: null, ...base },
    { id: 'a1', name: 'A1', type: 'Component', parentId: 'ca', ...base },
    { id: 'k1', name: 'K1', type: 'Class', parentId: 'a1', ...base },
  );
  useStore.setState({ model: m, focusId: 'ca', selectedId: null });
});

describe('Canvas navigation', () => {
  it('double-clicking a child that has children focuses it', () => {
    render(<Canvas />);
    captured.onNodeDoubleClick(null, { id: 'a1', type: 'node' });
    expect(useStore.getState().focusId).toBe('a1');
  });

  it('double-clicking a leaf only selects (focus unchanged)', () => {
    useStore.setState({ focusId: 'a1' });
    render(<Canvas />);
    captured.onNodeDoubleClick(null, { id: 'k1', type: 'node' });
    expect(useStore.getState().focusId).toBe('a1');
  });

  it('double-clicking an external ghost focuses it', () => {
    render(<Canvas />);
    captured.onNodeDoubleClick(null, { id: 'somewhere', type: 'ghost' });
    expect(useStore.getState().focusId).toBe('somewhere');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hyphae/web test Canvas`
Expected: FAIL — current `Canvas` references removed store fields (`layer`) and lacks focus handlers.

- [ ] **Step 3: Rewrite `Canvas.tsx`**

Replace `apps/web/src/Canvas.tsx` with:

```tsx
import { useMemo } from 'react';
import {
  ReactFlow, Background, Controls, Panel, ConnectionMode,
  type Node as FlowNode,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useStore } from './store';
import { buildFocusView } from './focusView';
import { layoutFocusView } from './layout';
import { focusViewToFlow, highlightSets } from './flow';
import { GroupNode } from './GroupNode';
import { NodeBox } from './NodeBox';
import { GhostNode } from './GhostNode';
import { FloatingEdge } from './FloatingEdge';
import { FilterPanel } from './FilterPanel';

const nodeTypes = { region: GroupNode, node: NodeBox, ghost: GhostNode };
const edgeTypes = { floating: FloatingEdge };

export function Canvas() {
  const model = useStore((s) => s.model);
  const focusId = useStore((s) => s.focusId);
  const connFilter = useStore((s) => s.connFilter);
  const selectedId = useStore((s) => s.selectedId);
  const select = useStore((s) => s.select);
  const setFocus = useStore((s) => s.setFocus);

  const view = useMemo(() => buildFocusView(model, focusId, connFilter), [model, focusId, connFilter]);
  const positions = useMemo(() => layoutFocusView(view), [view]);
  const { nodes, edges } = useMemo(() => focusViewToFlow(view, positions), [view, positions]);

  // Highlight the selection + neighbors (a region highlights its children), dim the rest.
  const childIds = useMemo(
    () => (selectedId === view.focusId ? new Set(view.children.map((n) => n.id)) : new Set<string>()),
    [selectedId, view],
  );
  const hi = useMemo(() => highlightSets(selectedId, edges, childIds), [selectedId, edges, childIds]);

  const styledEdges = useMemo(
    () => edges.map((e) => {
      if (hi.edges.has(e.id)) return { ...e, style: { ...e.style, strokeWidth: (typeof e.style?.strokeWidth === 'number' ? e.style.strokeWidth : 1.5) + 1.5, opacity: 1 }, zIndex: 10 };
      return selectedId ? { ...e, style: { ...e.style, opacity: 0.12 } } : e;
    }),
    [edges, hi, selectedId],
  );
  const styledNodes = useMemo(
    () => nodes.map((n) => {
      if (n.type === 'region') return n.id === selectedId ? { ...n, style: { ...n.style, outline: '2px solid #2563eb', outlineOffset: 2 } } : n;
      if (hi.nodes.has(n.id)) return { ...n, style: { ...n.style, boxShadow: '0 0 0 2px #2563eb', borderRadius: 4 }, zIndex: 5 };
      return selectedId ? { ...n, style: { ...n.style, opacity: 0.4 } } : n;
    }),
    [nodes, hi, selectedId],
  );

  // Double-click drills in: a node with children, or any external ghost, becomes the new focus.
  const onNodeDoubleClick = (_: unknown, node: FlowNode) => {
    if (node.type === 'ghost') { setFocus(node.id); return; }
    const hasChildren = model.nodes.some((n) => n.parentId === node.id);
    if (hasChildren) setFocus(node.id);
  };

  return (
    <div style={{ flex: 1, height: '100%' }}>
      <ReactFlow
        key={focusId ?? '__root__'}
        nodes={styledNodes}
        edges={styledEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        connectionMode={ConnectionMode.Loose}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        onNodeClick={(_, n) => select(n.id)}
        onNodeDoubleClick={onNodeDoubleClick}
        onEdgeClick={(_, e) => { if (!(e.data as { derived?: boolean } | undefined)?.derived) select(e.id); }}
        onPaneClick={() => select(null)}
        fitView
      >
        <Panel position="top-left"><FilterPanel /></Panel>
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
```

Notes for the implementer:
- `key={focusId ?? '__root__'}` remounts React Flow on focus change so `fitView` re-frames the new view automatically — no manual viewport bookkeeping.
- All drag/region-drag/position-persist handlers from the old canvas are intentionally gone (read-only v1).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @hyphae/web test Canvas`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/Canvas.tsx apps/web/test/Canvas.test.tsx
git commit -m "feat(web): read-only focus canvas with drill-in navigation"
```

---

### Task 7: App breadcrumbs + add-as-child; retire `toModel.ts`; full verify

**Files:**
- Modify: `apps/web/src/App.tsx` (breadcrumb header replacing the layer dropdown; add buttons from profile)
- Modify: `apps/web/src/styles.css` (breadcrumb styling — small)
- Modify: `apps/web/test/App.test.tsx` (update for breadcrumbs + add-as-child)
- Delete: `apps/web/src/toModel.ts` and `apps/web/test/toModel.test.ts`

**Interfaces:**
- Consumes: `breadcrumbPath` (`./focusView`); `allowedChildTypes`, `topLevelTypes`, `c4Backend` (`@hyphae/schema`); store `focusId`/`setFocus`/`addNode`/`model`.

- [ ] **Step 1: Update the App test (failing)**

Replace `apps/web/test/App.test.tsx`'s `describe('App', ...)` block (lines ~38-54) with:

```ts
describe('App', () => {
  it('shows the Root breadcrumb at the top level', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: 'Root' })).toBeTruthy();
  });

  it('adds a top-level node at the root and parents it to null', async () => {
    render(<App />);
    await new Promise((r) => setTimeout(r, 0)); // let initial loadModel settle
    fireEvent.click(screen.getByRole('button', { name: /add system/i }));
    await waitFor(() => expect(useStore.getState().model.nodes.map((n) => n.type)).toEqual(['System']));
    expect(useStore.getState().model.nodes[0].parentId).toBeNull();
  });
});
```

(The mocked `createNode` in `App.test.tsx` must thread `parentId` like the store test — update line ~19 to `base({ id: input.id, name: input.name, type: input.type, parentId: input.parentId ?? null })` and widen its param type to include `parentId?: string | null`. Remove the `setNodePosition` mock line ~24 if present.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hyphae/web test App`
Expected: FAIL — no `Root` button; App still renders the layer dropdown.

- [ ] **Step 3: Rewrite `App.tsx`**

Replace `apps/web/src/App.tsx` with:

```tsx
import { useEffect } from 'react';
import { useStore } from './store';
import { loadModel } from './api';
import { breadcrumbPath } from './focusView';
import { c4Backend, allowedChildTypes, topLevelTypes } from '@hyphae/schema';
import { Canvas } from './Canvas';
import { SidePanel } from './SidePanel';
import './styles.css';

export function App() {
  const model = useStore((s) => s.model);
  const focusId = useStore((s) => s.focusId);
  const setFocus = useStore((s) => s.setFocus);
  const setModel = useStore((s) => s.setModel);
  const addNode = useStore((s) => s.addNode);

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

  const crumbs = breadcrumbPath(model, focusId);
  const focusNode = focusId ? model.nodes.find((n) => n.id === focusId) : null;
  const addable = focusNode ? allowedChildTypes(c4Backend, focusNode.type) : topLevelTypes(c4Backend);

  return (
    <div className="app">
      <header className="toolbar">
        <strong>Hyphae</strong>
        <nav className="breadcrumbs" aria-label="breadcrumbs">
          {crumbs.map((c, i) => (
            <span key={c.id ?? '__root__'}>
              {i > 0 && <span className="crumb-sep"> › </span>}
              <button className="crumb" onClick={() => setFocus(c.id)}>{c.name}</button>
            </span>
          ))}
        </nav>
        {addable.map((t) => (
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

- [ ] **Step 4: Add minimal breadcrumb styling**

Append to `apps/web/src/styles.css`:

```css
.breadcrumbs { display: flex; align-items: center; flex-wrap: wrap; gap: 2px; }
.breadcrumbs .crumb { background: none; border: none; color: #2563eb; cursor: pointer; padding: 2px 4px; font-size: 13px; }
.breadcrumbs .crumb:hover { text-decoration: underline; }
.breadcrumbs .crumb-sep { color: #94a3b8; }
```

- [ ] **Step 5: Delete the retired layer-view module**

```bash
git rm apps/web/src/toModel.ts apps/web/test/toModel.test.ts
```

(`highlightSets`, `regionChildIds`, `drillTarget`, `toFlowNodes`, `toFlowEdges` are all superseded by `focusView.ts` / `flow.ts`. Confirm no remaining imports: `grep -rn "toModel" apps/web/src apps/web/test` should return nothing.)

- [ ] **Step 6: Run the App test to verify it passes**

Run: `pnpm --filter @hyphae/web test App`
Expected: PASS.

- [ ] **Step 7: Full verification**

Run: `pnpm -r test`
Expected: PASS across `@hyphae/schema`, `@hyphae/web` (and server unchanged).

Run: `pnpm --filter @hyphae/web build`
Expected: build succeeds (no unresolved imports / type errors from the removed `layer`/`toModel`/`setNodePosition` references).

If `grep -rn "s.layer\|setLayer\|setNodePosition\|toModel\|layerTypes" apps/web/src` returns anything, fix the straggler and re-run.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/App.tsx apps/web/src/styles.css apps/web/test/App.test.tsx
git commit -m "feat(web): breadcrumb navigation + add-as-child; retire layer-view"
```

---

## Self-Review

**Spec coverage:**
- Navigation model (root = all top-level; focus = node + direct children) → Task 2 `buildFocusView`, Task 7 breadcrumbs. ✓
- Direct-children-only depth → Task 2 (`children` is `parentId === focusId`). ✓
- External aggregation to peer level + higher-layer neighbor shown as itself → Task 2 `representative` + tests. ✓
- Collapsed external edges with count labels → Task 2 (`agg`) + Task 4 `derivedEdge`. ✓
- Auto-layout (dagre) → Task 3. ✓
- Read-only canvas (no drag/connect/persist) → Task 6 (`nodesDraggable=false`, etc.) + Task 5 (removed `setNodePosition`). ✓
- Focus framing region (reuse `GroupNode`) → Task 4 `focusViewToFlow`. ✓
- Store `focusId` + breadcrumbs; remove `layer`/viewports → Task 5. ✓
- Side-panel editing unchanged → untouched (`SidePanel.tsx` not modified). ✓
- `add <type>` creates a child of the focus → Task 5 (`addNode`) + Task 7 (button source). ✓
- Layer dropdown removed; breadcrumb header → Task 7. ✓
- Tests matching existing style → each task ships unit/component tests. ✓
- No server/MCP changes → confirmed; `POST /nodes` already accepts `parentId`. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases"; every code step shows complete code. ✓

**Type consistency:** `FocusView`/`FocusEdge`/`ConnFilter` defined in Task 2 and consumed unchanged in Tasks 3, 4, 6. `layoutFocusView(view) → Record<string, XY>` produced in Task 3, consumed in Tasks 4/6. `focusViewToFlow(view, pos)` produced in Task 4, consumed in Task 6. `setFocus`/`focusId` defined in Task 5, consumed in Tasks 6/7. `createNode({...parentId})` extended in Task 5, mocks updated in Tasks 5/7. ✓

**Out of scope (carried from spec):** manual-layout mode, server-computed subgraph, configurable depth — intentionally deferred.

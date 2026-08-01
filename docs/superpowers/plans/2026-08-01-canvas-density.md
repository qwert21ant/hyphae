# Canvas Density Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a Container-focus diagram readable by quieting high-degree hub nodes, ordering the
external columns by barycentre, gridding the children dagre cannot rank, and letting the user drag a
node for the session.

**Architecture:** One new pure module (`core/hubs.ts`) is inserted between `buildFocusView` and
`layoutFocusView`; it removes a hub's edges from the drawn view and returns a badge map that
re-encodes them on the other endpoint. `layoutFocusView` gains barycentre ordering and a grid for
unranked children. Node box size becomes a parameter (`NodeMetrics`) threaded through layout and the
React Flow adapter so the box can grow one badge row. Dragged positions are a session-only override
layer applied after `resolveViewPositions`.

**Tech Stack:** TypeScript, React 18, Zustand, `@xyflow/react` v12, `@dagrejs/dagre`, Vitest + jsdom
+ Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-01-canvas-density-design.md`

## Global Constraints

- **Branch:** `feat/canvas-density`, already cut. Commit per task, without asking. Stage explicit
  paths — never `git add -A`. `apps/server/hyphae-baritone.json` is permanently untracked; verify
  with `git status --short` before every commit.
- **Commit trailer:** every commit message ends with
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Conventional commits with a scope:** `feat(web):`, `fix(web):`, `docs:`. Explain *why* in the body.
- **Test baseline:** `pnpm -r test` is 669 green before this plan (schema 147, server 107, web 415
  across 45 files). Every task must leave it green; the web count only ever grows.
- **Never run bare `pnpm vitest run` from the repo root** — there is no root vitest config and web
  tests then run without jsdom. Use `pnpm -r test`, or `cd apps/web` first.
- **Typecheck is separate from build.** Run `pnpm --filter @hyphae/web typecheck` after any task that
  changes a signature. It has a **pre-existing 4-error floor**, all in test files. 4 errors is clean,
  5 is yours.
- **Web imports use the `@/` alias** (`@/core/hubs`), except a file in the *same directory*, which is
  `./Name`. A child directory is not a sibling.
- **No colour literal anywhere in `apps/web/src` outside `tokens.css`** — no hex, no `rgb()`/`hsl()`.
  `test/styles/tokens.test.ts` walks `src/` recursively and fails on one. Use `var(--token)`.
- **Every token declared in `:root` must be referenced somewhere, and every `var()` must resolve.**
  Both directions fail the suite. Do not introduce a new colour token in this plan — reuse
  `--chip`, `--tx-2`, `--tx-3`, `--surface-2`, `--rule` and the five `--verb-*`.
- **Do not add a new foreground/background pair to `test/styles/contrast.test.ts`.** Where a verb
  colour must appear, use it as a **swatch** (a small filled block), never as text colour — a swatch
  is not text and carries no 4.5:1 obligation. This is why the badge in Task 7 is
  `[swatch] ↳ Name` in `--tx-2` on `--chip`, not coloured text.
- **Session-only.** No schema change, no server write path, no MCP surface, and **no `localStorage`**
  anywhere in this feature.
- Roughly 80 `act(...)` warnings in the web suite are pre-existing noise, not your change.

---

## File Structure

**Created**

| File | Responsibility |
|---|---|
| `apps/web/src/core/hubs.ts` | Pure hub detection over a `FocusView`, and the edge-removal + badge-map transform. Knows only `@hyphae/schema` and `@/core/focusView` types. |
| `apps/web/test/core/hubs.test.ts` | Its tests. |

**Modified**

| File | Change |
|---|---|
| `apps/web/src/features/canvas/layout.ts` | `NodeMetrics` parameter; barycentre external ordering; grid for unranked children; `applyDragOverrides`. |
| `apps/web/src/features/canvas/reactflow.ts` | `focusViewToFlow` takes an options object (metrics, badges, hub degrees) and puts box size + badges + hub degree in node `data`; `node`/`ghost` become draggable. |
| `apps/web/src/features/canvas/nodes/NodeBox.tsx` | Reads box size from `data`; renders the badge row. |
| `apps/web/src/features/canvas/nodes/GhostNode.tsx` | Same, plus the hub chip. |
| `apps/web/src/features/canvas/useCanvasView.ts` | Wires hub detection/quieting into the memo pipeline and applies drag overrides. |
| `apps/web/src/features/canvas/Canvas.tsx` | `useNodesState`, `nodesDraggable`, `onNodeDragStop`. |
| `apps/web/src/features/canvas/overlay/FilterPanel.tsx` | A "Density" group: quiet-hubs checkbox, threshold stepper, reset-layout button. |
| `apps/web/src/features/canvas/canvas.css` | Styles for the new FilterPanel controls only. |
| `apps/web/src/state/store.ts` | `quietHubsOn`, `hubThreshold`, `hubOverrides`, `nodePositions` + their setters; reset on focus change. |
| `README.md`, `docs/SPEC.md`, `CLAUDE.md` | Documentation (Task 9). |

**Deliberately not modified:** `patternView.ts` and `PatternMemberNode.tsx` keep using the `NODE_W` /
`NODE_H` constants directly. The pattern view is out of scope and must stay at the default size.

---

## Task 1: `core/hubs.ts` — detection and quieting

**Files:**
- Create: `apps/web/src/core/hubs.ts`
- Test: `apps/web/test/core/hubs.test.ts`

**Interfaces:**
- Consumes: `FocusView`, `FocusEdge` from `@/core/focusView`; `verbClassOf`, `c4Backend`,
  `type VerbClass` from `@hyphae/schema`.
- Produces:
  ```ts
  export type HubBadge = { hubId: string; hubName: string; verb: string; verbClass: VerbClass };
  export function hubDegrees(view: FocusView): Map<string, number>;
  export function detectHubs(view: FocusView, threshold: number,
                             overrides?: Record<string, boolean>): Set<string>;
  export function quietHubs(view: FocusView, hubs: Set<string>):
    { view: FocusView; badges: Map<string, HubBadge[]> };
  ```

**Rules this task implements:**
- Degree counts **drawn `FocusView` edges**, so a rolled-up derived edge counts once, not once per
  underlying connection. A self-loop cannot occur (`buildFocusView` drops them).
- `detectHubs` = degree ≥ threshold, then `overrides` wins in both directions: `false` un-quiets a
  node over threshold, `true` quiets one under it.
- `quietHubs` drops every edge with a hub endpoint, and drops any **external** left with no remaining
  edge — unless it is itself a hub, which stays visible. Children are **never** dropped: removing a
  child from its own region box would make the containment read false.
- An edge between **two** hubs is removed and produces **no** badge (a badge on a quieted node
  pointing at another quieted node is noise).
- A derived edge has no `verb`; badge verb falls back to `'uses'`, matching `realEdge` in
  `reactflow.ts`.
- Badges are deduplicated per (neighbour, hub, verb) so a fanned pair of identical edges yields one
  badge, and ordered by hub name for determinism.

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/core/hubs.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { hubDegrees, detectHubs, quietHubs } from '@/core/hubs';
import type { FocusView, FocusEdge } from '@/core/focusView';

const node = (id: string, type = 'Component') =>
  ({ id, name: id, type, parentId: null, description: '', codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {} }) as any;

const edge = (from: string, to: string, verb?: string): FocusEdge =>
  ({ id: `${from}->${to}`, from, to, count: 1, derived: !verb, realizedBy: ['r'], verb });

/** focus `f` with children c1..c4 plus hub `h`, and one external `x` reachable only through `h`. */
const view = (): FocusView => ({
  focusId: 'f',
  focusNode: node('f', 'Container'),
  children: [node('c1'), node('c2'), node('c3'), node('c4'), node('h')],
  externals: [node('x', 'Container')],
  edges: [
    edge('c1', 'h', 'reads'), edge('c2', 'h', 'reads'), edge('c3', 'h', 'reads'),
    edge('c4', 'h', 'writes'), edge('h', 'x'), edge('c1', 'c2', 'uses'),
  ],
});

describe('hubDegrees', () => {
  it('counts drawn edges per endpoint', () => {
    const d = hubDegrees(view());
    expect(d.get('h')).toBe(5);
    expect(d.get('c1')).toBe(2);
    expect(d.get('x')).toBe(1);
  });
});

describe('detectHubs', () => {
  it('selects nodes at or above the threshold', () => {
    expect([...detectHubs(view(), 5)]).toEqual(['h']);
    expect([...detectHubs(view(), 6)]).toEqual([]);
  });

  it('lets an override un-quiet a node over the threshold', () => {
    expect([...detectHubs(view(), 5, { h: false })]).toEqual([]);
  });

  it('lets an override quiet a node under the threshold', () => {
    expect([...detectHubs(view(), 5, { c1: true })].sort()).toEqual(['c1', 'h']);
  });
});

describe('quietHubs', () => {
  it('removes every edge touching a hub', () => {
    const { view: v } = quietHubs(view(), new Set(['h']));
    expect(v.edges.map((e) => e.id)).toEqual(['c1->c2']);
  });

  it('keeps the hub itself as a child but drops an external orphaned by the removal', () => {
    const { view: v } = quietHubs(view(), new Set(['h']));
    expect(v.children.map((n) => n.id)).toContain('h');
    expect(v.externals.map((n) => n.id)).toEqual([]);
  });

  it('badges each neighbour with the hub, its verb and its verb class', () => {
    const { badges } = quietHubs(view(), new Set(['h']));
    expect(badges.get('c1')).toEqual([{ hubId: 'h', hubName: 'h', verb: 'reads', verbClass: 'dataAccess' }]);
    expect(badges.get('c4')).toEqual([{ hubId: 'h', hubName: 'h', verb: 'writes', verbClass: 'dataAccess' }]);
    expect(badges.has('h')).toBe(false);
  });

  it('falls back to "uses" for a derived edge with no verb', () => {
    const v: FocusView = { ...view(), edges: [edge('c1', 'h')] };
    const { badges } = quietHubs(v, new Set(['h']));
    expect(badges.get('c1')?.[0].verb).toBe('uses');
  });

  it('emits no badge for an edge between two hubs', () => {
    const { badges } = quietHubs(view(), new Set(['h', 'c1']));
    expect(badges.get('c1')).toBeUndefined();
    expect(badges.get('c2')).toBeUndefined(); // c2's only edge was to the hub h
  });

  it('deduplicates identical badges from a fanned pair', () => {
    const v: FocusView = { ...view(), edges: [edge('c1', 'h', 'reads'), { ...edge('c1', 'h', 'reads'), id: 'dup' }] };
    const { badges } = quietHubs(v, new Set(['h']));
    expect(badges.get('c1')).toHaveLength(1);
  });

  it('returns the view unchanged when there are no hubs', () => {
    const v = view();
    const out = quietHubs(v, new Set());
    expect(out.view.edges).toHaveLength(6);
    expect(out.badges.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd apps/web && pnpm vitest run test/core/hubs.test.ts`
Expected: FAIL — `Failed to resolve import "@/core/hubs"`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/core/hubs.ts`:

```ts
import { c4Backend, verbClassOf, type Node, type VerbClass } from '@hyphae/schema';
import type { FocusView, FocusEdge } from '@/core/focusView';

/** One quieted edge, re-encoded as a chip on the endpoint that is NOT the hub. */
export type HubBadge = { hubId: string; hubName: string; verb: string; verbClass: VerbClass };

/** Drawn-edge degree per endpoint. A rolled-up derived edge counts ONCE — it is one line on the
 *  canvas, and this measures how tangled the canvas is, not how many connections the model holds. */
export function hubDegrees(view: FocusView): Map<string, number> {
  const deg = new Map<string, number>();
  for (const e of view.edges) {
    deg.set(e.from, (deg.get(e.from) ?? 0) + 1);
    deg.set(e.to, (deg.get(e.to) ?? 0) + 1);
  }
  return deg;
}

/**
 * The nodes whose edges should leave the drawn graph: degree >= `threshold`, with `overrides`
 * winning in both directions (`false` keeps a busy node in the graph, `true` quiets a quiet one).
 *
 * Call this on the BASE view — unfiltered, full-audience, collapsed. Detecting on the rendered view
 * would mean filtering out `dataAccess` un-hubs a settings node and reflows the whole graph on a
 * filter toggle, which is exactly what the layout-stability invariant exists to prevent.
 */
export function detectHubs(view: FocusView, threshold: number, overrides: Record<string, boolean> = {}): Set<string> {
  const deg = hubDegrees(view);
  const hubs = new Set<string>();
  for (const [id, d] of deg) if (d >= threshold) hubs.add(id);
  for (const [id, on] of Object.entries(overrides)) {
    if (on) hubs.add(id); else hubs.delete(id);
  }
  return hubs;
}

const badgeKey = (b: HubBadge) => `${b.hubId}\0${b.verb}`;

/**
 * Remove every edge touching a hub and hand back the badges that replace them.
 *
 * A hub node stays on the canvas — dimmed, with a degree chip — it just stops attracting lines.
 * Parking hubs off-graph was rejected: a region box showing 12 of its 14 children reads as a lie.
 * An external left with no edge at all IS dropped, since a ghost box with nothing attached is pure
 * noise; a hub external stays, because it is the thing being explained.
 */
export function quietHubs(view: FocusView, hubs: Set<string>): { view: FocusView; badges: Map<string, HubBadge[]> } {
  const badges = new Map<string, HubBadge[]>();
  if (!hubs.size) return { view, badges };

  const nameOf = new Map<string, string>();
  for (const n of [...view.children, ...view.externals, ...(view.focusNode ? [view.focusNode] : [])]) nameOf.set(n.id, n.name);

  const kept: FocusEdge[] = [];
  for (const e of view.edges) {
    const fromHub = hubs.has(e.from);
    const toHub = hubs.has(e.to);
    if (!fromHub && !toHub) { kept.push(e); continue; }
    if (fromHub && toHub) continue; // both ends quieted — a badge here would point at nothing shown
    const hubId = fromHub ? e.from : e.to;
    const otherId = fromHub ? e.to : e.from;
    const verb = e.verb ?? 'uses'; // a derived edge carries no verb; realEdge() uses the same default
    const badge: HubBadge = {
      hubId,
      hubName: nameOf.get(hubId) ?? hubId,
      verb,
      verbClass: verbClassOf(c4Backend, verb) ?? 'control',
    };
    const list = badges.get(otherId);
    if (!list) badges.set(otherId, [badge]);
    else if (!list.some((b) => badgeKey(b) === badgeKey(badge))) list.push(badge);
  }

  for (const list of badges.values()) list.sort((a, b) => (a.hubName < b.hubName ? -1 : a.hubName > b.hubName ? 1 : 0));

  const attached = new Set<string>();
  for (const e of kept) { attached.add(e.from); attached.add(e.to); }
  const externals: Node[] = view.externals.filter((n) => hubs.has(n.id) || attached.has(n.id));

  return { view: { ...view, edges: kept, externals }, badges };
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `cd apps/web && pnpm vitest run test/core/hubs.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
cd /c/projects/hyphae
pnpm --filter @hyphae/web typecheck   # expect exactly 4 pre-existing errors
git status --short                     # only the two new files + the untracked model
git add apps/web/src/core/hubs.ts apps/web/test/core/hubs.test.ts
git commit -m "$(cat <<'EOF'
feat(web): detect and quiet hub nodes

At a Container focus most drawn edges are one node's fan-in: on the real Baritone
model, Settings carries 16 connections of which 14 use the verb `reads`. As lines
those carry no information — identical verb, identical target, differing only in
where they start — while crossing the whole diagram.

quietHubs removes a hub's edges from the drawn view and returns the badges that
re-encode them on the other endpoint. Detection is separate from application so
the caller can detect on the stable base view and apply to the rendered one; that
is what keeps the connection filter from reflowing the graph.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Node size as a parameter

**Files:**
- Modify: `apps/web/src/features/canvas/layout.ts`
- Modify: `apps/web/src/features/canvas/reactflow.ts:82-171`
- Modify: `apps/web/src/features/canvas/nodes/NodeBox.tsx`
- Modify: `apps/web/src/features/canvas/nodes/GhostNode.tsx`
- Test: `apps/web/test/features/canvas/layout.test.ts` (append)
- Test: `apps/web/test/features/canvas/nodes/NodeBox.test.tsx` (append)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces:
  ```ts
  // layout.ts
  export type NodeMetrics = { width: number; height: number };
  export const DEFAULT_METRICS: NodeMetrics;          // { width: NODE_W, height: NODE_H }
  export const BADGE_ROW_H = 16;
  export function withBadgeRow(m: NodeMetrics): NodeMetrics;   // height + BADGE_ROW_H
  export function rowGap(m: NodeMetrics): number;              // m.height + 12
  export function groupBoxHeight(n: number, m?: NodeMetrics): number;
  export function layoutFocusView(view: FocusView, m?: NodeMetrics): Record<string, XY>;
  export function resolveViewPositions(view: FocusView, base: Record<string, XY>, m?: NodeMetrics): Record<string, XY>;

  // reactflow.ts
  export type FlowOptions = { metrics?: NodeMetrics; badges?: Map<string, HubBadge[]>; hubDegrees?: Map<string, number> };
  export function focusViewToFlow(view: FocusView, pos: Record<string, XY>, opts?: FlowOptions): { nodes: FlowNode[]; edges: FlowEdge[] };
  ```
  Node `data` for the `node` and `ghost` types gains `width: number; height: number`.

**Why:** a badge row does not fit in `NODE_H = 92`, which is sized for exactly a name line, two
summary lines and the technology chip. Every existing export keeps its current value and every
existing call site keeps working — the parameters are optional with the current constants as defaults.

- [ ] **Step 1: Write the failing tests**

Append to `apps/web/test/features/canvas/layout.test.ts`:

```ts
import { DEFAULT_METRICS, BADGE_ROW_H, withBadgeRow, rowGap } from '@/features/canvas/layout';

describe('NodeMetrics', () => {
  it('defaults to the exported constants', () => {
    expect(DEFAULT_METRICS).toEqual({ width: NODE_W, height: NODE_H });
  });

  it('withBadgeRow adds exactly one badge row of height', () => {
    expect(withBadgeRow(DEFAULT_METRICS)).toEqual({ width: NODE_W, height: NODE_H + BADGE_ROW_H });
  });

  it('rowGap stays a PITCH larger than the box it stacks', () => {
    const tall = withBadgeRow(DEFAULT_METRICS);
    expect(rowGap(tall)).toBeGreaterThan(tall.height);
    expect(rowGap(DEFAULT_METRICS)).toBe(ROW_GAP);
  });

  it('stacks externals at the taller pitch when metrics grow', () => {
    const v: FocusView = {
      focusId: 'ca', focusNode: node('ca', 'Container'),
      children: [node('a1')],
      externals: [node('x1', 'Container'), node('x2', 'Container')],
      edges: [
        { id: 'e1', from: 'x1', to: 'a1', count: 1, derived: true, realizedBy: ['p'] },
        { id: 'e2', from: 'x2', to: 'a1', count: 1, derived: true, realizedBy: ['q'] },
      ],
    };
    const tall = withBadgeRow(DEFAULT_METRICS);
    const pos = layoutFocusView(v, tall);
    expect(Math.abs(pos.x1.y - pos.x2.y)).toBe(rowGap(tall));
  });

  it('grows the group box by the taller member pitch', () => {
    const tall = withBadgeRow(DEFAULT_METRICS);
    expect(groupBoxHeight(3, tall)).toBeGreaterThan(groupBoxHeight(3));
  });
});
```

Append to `apps/web/test/features/canvas/nodes/NodeBox.test.tsx` (inside the existing top-level
`describe`, reusing that file's existing render helper — read the file first and match its wrapper,
which supplies a `ReactFlowProvider`):

```ts
  it('sizes the box from data when a taller metric is passed', () => {
    const { container } = renderBox({ name: 'n', width: 300, height: 120 });
    const box = container.querySelector('div') as HTMLElement;
    expect(box.style.width).toBe('300px');
    expect(box.style.height).toBe('120px');
  });
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `cd apps/web && pnpm vitest run test/features/canvas/layout.test.ts test/features/canvas/nodes/NodeBox.test.tsx`
Expected: FAIL — `DEFAULT_METRICS` is not exported; the NodeBox box is still `220x92`.

- [ ] **Step 3: Implement in `layout.ts`**

Add below the existing constants, keeping `NODE_W`, `NODE_H`, `ROW_GAP` and `MEMBER_PITCH` exactly as
they are:

```ts
/** The rendered size of one node box. A parameter rather than a constant because turning hub
 *  quieting on adds a badge row to every box, and dagre, the external columns, the group boxes and
 *  the region box all have to agree about it. */
export type NodeMetrics = { width: number; height: number };
export const DEFAULT_METRICS: NodeMetrics = { width: NODE_W, height: NODE_H };

/** Height of the hub-badge row NodeBox/GhostNode render when quieting is on. */
export const BADGE_ROW_H = 16;
export const withBadgeRow = (m: NodeMetrics): NodeMetrics => ({ ...m, height: m.height + BADGE_ROW_H });

/** Vertical PITCH (not gap) between stacked boxes — must stay larger than the box height. */
export const rowGap = (m: NodeMetrics = DEFAULT_METRICS): number => m.height + 12;
```

Then thread `m: NodeMetrics = DEFAULT_METRICS` through `groupBoxHeight`, `layoutFocusView` and
`resolveViewPositions`, replacing every `NODE_W` with `m.width`, every `NODE_H` with `m.height`, and
every `ROW_GAP` / `MEMBER_PITCH` with `rowGap(m)`:

```ts
export function groupBoxHeight(n: number, m: NodeMetrics = DEFAULT_METRICS): number {
  return LABEL_H + 2 * PAD + Math.max(0, n - 1) * rowGap(m) + m.height;
}

export function layoutFocusView(view: FocusView, m: NodeMetrics = DEFAULT_METRICS): Record<string, XY> { /* … */ }

export function resolveViewPositions(view: FocusView, base: Record<string, XY>, m: NodeMetrics = DEFAULT_METRICS): Record<string, XY> { /* … */ }
```

Inside `layoutFocusView`, `g.setNode(n.id, { width: m.width, height: m.height })`, the bounding-box
maths and `placeColumn` all use `m`. Inside `resolveViewPositions`, the member stacking uses
`rowGap(m)` and the reserve uses `groupBoxHeight(it.members.length, m) - m.height`.

- [ ] **Step 4: Implement in `reactflow.ts`**

Replace the `focusViewToFlow` signature and the constants it reads:

```ts
import { NODE_W, NODE_H, PAD, LABEL_H, DEFAULT_METRICS, type NodeMetrics, type XY } from './layout';
import type { HubBadge } from '@/core/hubs';

export type FlowOptions = {
  metrics?: NodeMetrics;
  /** Quieted edges, re-encoded per neighbour id. */
  badges?: Map<string, HubBadge[]>;
  /** Drawn-edge degree per node, so a quieted hub can show what it is standing in for. */
  hubDegrees?: Map<string, number>;
};

export function focusViewToFlow(view: FocusView, pos: Record<string, XY>, opts: FlowOptions = {}): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const m = opts.metrics ?? DEFAULT_METRICS;
  // …every NODE_W becomes m.width and every NODE_H becomes m.height…
```

and give the `node` / `ghost` pushes the size and the badges:

```ts
  for (const n of view.children) {
    nodes.push({
      id: n.id, type: 'node', position: pos[n.id] ?? { x: 0, y: 0 },
      data: { ...nodeVisual(n), width: m.width, height: m.height, badges: opts.badges?.get(n.id) },
      initialWidth: m.width, initialHeight: m.height, draggable: false,
    });
  }
  for (const n of view.externals) {
    nodes.push({
      id: n.id, type: 'ghost', position: pos[n.id] ?? { x: 0, y: 0 },
      data: {
        ...nodeVisual(n), width: m.width, height: m.height, badges: opts.badges?.get(n.id),
        expandable: view.expandableExternalIds?.has(n.id) ?? false,
      },
      initialWidth: m.width, initialHeight: m.height, draggable: false,
    });
  }
```

The childless-focus branch (`type: 'node'`) gets `width`/`height` in `data` too. `NODE_W`/`NODE_H`
remain imported only if still referenced; if not, drop them from the import to avoid an unused-import
error.

- [ ] **Step 5: Implement in `NodeBox.tsx` and `GhostNode.tsx`**

In both, extend the data type and read the size from it:

```ts
export type NodeBoxData = {
  name?: string;
  summary?: string;
  technology?: string;
  shape?: Shape;
  color?: { bg: string; border: string };
  width?: number;
  height?: number;
};
```

```ts
  const w = d.width ?? NODE_W;
  const h = d.height ?? NODE_H;
```

and replace `NODE_W` → `w`, `NODE_H` → `h` in the wrapper `style`, in `shapePadding(shape, w, h)` and
in `<NodeShape w={w} h={h} …>`. `GhostNodeData` extends `NodeBoxData`, so it inherits the two fields.

- [ ] **Step 6: Run the full web suite**

Run: `cd apps/web && pnpm test`
Expected: PASS — all previously-green tests plus the 5 new layout tests and 1 new NodeBox test.
The existing `layout.test.ts` assertions on `ROW_GAP`/`MEMBER_PITCH` must still pass unchanged;
if one fails, a default was dropped somewhere.

- [ ] **Step 7: Typecheck and commit**

```bash
cd /c/projects/hyphae
pnpm --filter @hyphae/web typecheck   # still exactly 4 errors
git status --short
git add apps/web/src/features/canvas/layout.ts apps/web/src/features/canvas/reactflow.ts \
        apps/web/src/features/canvas/nodes/NodeBox.tsx apps/web/src/features/canvas/nodes/GhostNode.tsx \
        apps/web/test/features/canvas/layout.test.ts apps/web/test/features/canvas/nodes/NodeBox.test.tsx
git commit -m "$(cat <<'EOF'
refactor(web): make the node box size a layout parameter

NODE_H is sized for exactly a name line, two summary lines and the technology
chip, so the hub badges that are about to land have nowhere to go. dagre, the
external columns, the group boxes and the region box all derive from the same
two constants, so growing the box means all of them have to agree — which is
what a shared NodeMetrics parameter buys and a second constant would not.

Every export keeps its current value and every call site keeps working: the
parameters are optional and default to the constants. patternView is left on the
constants deliberately — the pattern view keeps the default size.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Order the external columns by barycentre

**Files:**
- Modify: `apps/web/src/features/canvas/layout.ts:64-76`
- Test: `apps/web/test/features/canvas/layout.test.ts` (append)

**Interfaces:**
- Consumes: `NodeMetrics` from Task 2.
- Produces: no new export. `layoutFocusView`'s column order changes from a UUID sort to a
  barycentre sort with an id tie-break.

**Why:** externals are currently sorted by `byId` — that is, randomly with respect to the graph. On
the real model that is where most of the crossings come from.

- [ ] **Step 1: Write the failing test**

Append to `apps/web/test/features/canvas/layout.test.ts`:

```ts
describe('external column ordering', () => {
  // Three children stacked by dagre (a chain gives them distinct ranks, hence distinct y), and
  // three incoming externals deliberately id-sorted into the WRONG vertical order.
  const chain: FocusView = {
    focusId: 'f', focusNode: node('f', 'Container'),
    children: [node('k1'), node('k2'), node('k3')],
    externals: [node('xa', 'Container'), node('xb', 'Container'), node('xc', 'Container')],
    edges: [
      { id: 'c1', from: 'k1', to: 'k2', count: 1, derived: false, realizedBy: ['a'] },
      { id: 'c2', from: 'k2', to: 'k3', count: 1, derived: false, realizedBy: ['b'] },
      // xa→k3 (bottom), xb→k2 (middle), xc→k1 (top): id order is the exact reverse of graph order
      { id: 'e1', from: 'xa', to: 'k3', count: 1, derived: true, realizedBy: ['p'] },
      { id: 'e2', from: 'xb', to: 'k2', count: 1, derived: true, realizedBy: ['q'] },
      { id: 'e3', from: 'xc', to: 'k1', count: 1, derived: true, realizedBy: ['r'] },
    ],
  };

  it('orders a column by its neighbours vertical position, not by id', () => {
    const pos = layoutFocusView(chain);
    // k1 is above k3, so xc (which feeds k1) must sit above xa (which feeds k3).
    expect(pos.k1.y).toBeLessThan(pos.k3.y);
    expect(pos.xc.y).toBeLessThan(pos.xb.y);
    expect(pos.xb.y).toBeLessThan(pos.xa.y);
  });

  it('falls back to the id order for externals with no placed neighbour', () => {
    const orphaned: FocusView = {
      ...chain,
      edges: [
        { id: 'o1', from: 'xb', to: 'f', count: 1, derived: true, realizedBy: ['p'] },
        { id: 'o2', from: 'xa', to: 'f', count: 1, derived: true, realizedBy: ['q'] },
      ],
    };
    const pos = layoutFocusView(orphaned);
    expect(pos.xa.y).toBeLessThan(pos.xb.y);
  });

  it('is still deterministic', () => {
    expect(layoutFocusView(chain)).toEqual(layoutFocusView(chain));
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd apps/web && pnpm vitest run test/features/canvas/layout.test.ts -t 'external column ordering'`
Expected: FAIL on the first test — the UUID sort puts `xa` above `xb` above `xc`.

- [ ] **Step 3: Implement**

In `layoutFocusView`, replace the two `sort(byId)` calls. The children are already positioned at this
point, so one pass is enough — no iterative sweep:

```ts
  // Barycentre: the mean y of the already-placed in-view neighbours. Sorting the column this way
  // instead of by id is where most of the crossing reduction comes from — a UUID sort is random
  // with respect to the graph. An external with no placed neighbour keeps the id order, so the
  // result stays fully deterministic.
  const barycentre = (id: string): number | null => {
    const ys: number[] = [];
    for (const e of view.edges) {
      const other = e.from === id ? e.to : e.to === id ? e.from : null;
      if (other === null || other === id) continue;
      const p = pos[other];
      if (p) ys.push(p.y);
    }
    return ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : null;
  };
  const byBarycentre = (a: string, b: string) => {
    const ba = barycentre(a);
    const bb = barycentre(b);
    if (ba === null || bb === null || ba === bb) return byId(a, b);
    return ba - bb;
  };
  incoming.sort(byBarycentre);
  outgoing.sort(byBarycentre);
```

`byId` stays exactly where it is — it is now the tie-break rather than the primary key.

- [ ] **Step 4: Run the tests and verify they pass**

Run: `cd apps/web && pnpm test`
Expected: PASS, including every pre-existing `layout.test.ts` and `Canvas.test.tsx` assertion.
If an old test asserted a specific external `y`, re-derive the expectation from the new order — do
**not** revert the sort.

- [ ] **Step 5: Commit**

```bash
cd /c/projects/hyphae
git status --short
git add apps/web/src/features/canvas/layout.ts apps/web/test/features/canvas/layout.test.ts
git commit -m "$(cat <<'EOF'
fix(web): order the external columns by barycentre, not by UUID

Externals were placed by an id sort, which is random with respect to the graph:
on the real model an external feeding the topmost child could sit at the bottom
of its column, so its edge crossed every other edge in the view. Sorting each
column by the mean y of its already-placed neighbours costs one pass — the
children are positioned before the columns are built — and an external with no
placed neighbour keeps the id order, so the layout stays deterministic.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Grid the children dagre cannot rank

**Files:**
- Modify: `apps/web/src/features/canvas/layout.ts:37-53`
- Test: `apps/web/test/features/canvas/layout.test.ts` (append)

**Interfaces:**
- Consumes: `NodeMetrics` from Task 2.
- Produces: `export const GRID_COLS = 4;` from `layout.ts`. No signature change.

**Why:** at Process Layer, 12 children share 7 intra-cluster edges, so most children get no rank and
dagre lands them all in rank 0 — one ~2530px row that every external edge has to cross. Gridding
only the *unranked* children targets exactly that, and unlike post-hoc rank wrapping it cannot
disturb a node dagre actually ranked.

- [ ] **Step 1: Write the failing test**

Append to `apps/web/test/features/canvas/layout.test.ts`:

```ts
import { GRID_COLS } from '@/features/canvas/layout';

describe('isolated children', () => {
  const isolated = (n: number): FocusView => ({
    focusId: 'f', focusNode: node('f', 'Container'),
    children: Array.from({ length: n }, (_, i) => node(`i${i}`)),
    externals: [],
    edges: [],
  });

  it('packs children with no intra-cluster edge into a grid, not one row', () => {
    const pos = layoutFocusView(isolated(12));
    const rows = new Set(Object.values(pos).map((p) => Math.round(p.y)));
    const cols = new Set(Object.values(pos).map((p) => Math.round(p.x)));
    expect(cols.size).toBe(GRID_COLS);
    expect(rows.size).toBe(3);
  });

  it('keeps the grid narrower than the equivalent row', () => {
    const pos = layoutFocusView(isolated(12));
    const xs = Object.values(pos).map((p) => p.x);
    const width = Math.max(...xs) + NODE_W - Math.min(...xs);
    expect(width).toBeLessThan(12 * NODE_W);
  });

  it('leaves dagre-ranked children alone and puts the grid below them', () => {
    const mixed: FocusView = {
      focusId: 'f', focusNode: node('f', 'Container'),
      children: [node('c1'), node('c2'), node('lone')],
      externals: [],
      edges: [{ id: 'e', from: 'c1', to: 'c2', count: 1, derived: false, realizedBy: ['a'] }],
    };
    const pos = layoutFocusView(mixed);
    expect(pos.c1.y).toBeLessThan(pos.c2.y);       // dagre's TB rank order survives
    expect(pos.lone.y).toBeGreaterThan(pos.c2.y);  // the grid sits below the ranked core
  });

  it('is deterministic', () => {
    expect(layoutFocusView(isolated(7))).toEqual(layoutFocusView(isolated(7)));
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd apps/web && pnpm vitest run test/features/canvas/layout.test.ts -t 'isolated children'`
Expected: FAIL — `GRID_COLS` is not exported, and all 12 children currently land in one row.

- [ ] **Step 3: Implement**

Add the constant near `COL_GAP`:

```ts
/** Columns in the grid that holds children dagre could not rank. */
export const GRID_COLS = 4;
```

and replace the dagre block in `layoutFocusView` with a partitioned one:

```ts
  // Partition: a child dagre can rank (it has at least one edge to a sibling) versus one it cannot.
  // An unranked child gets no useful position from dagre — they all land together in rank 0, which
  // is what turned a 12-child focus into a single ~2500px row that every external edge crossed.
  const connected = view.children.filter((n) =>
    view.edges.some((e) => (e.from === n.id && childIds.has(e.to)) || (e.to === n.id && childIds.has(e.from))));
  const isolatedKids = view.children.filter((n) => !connected.includes(n));

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: NODE_SEP, ranksep: RANK_SEP, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of connected) g.setNode(n.id, { width: m.width, height: m.height });
  for (const e of view.edges) if (childIds.has(e.from) && childIds.has(e.to)) g.setEdge(e.from, e.to);
  if (connected.length) dagre.layout(g);
  for (const n of connected) {
    const d = g.node(n.id);
    pos[n.id] = d ? { x: d.x - m.width / 2, y: d.y - m.height / 2 } : { x: 0, y: 0 };
  }

  // The unranked remainder, packed into a GRID_COLS-wide block below the ranked core and centred
  // on it. Ordered by id so the block is stable across runs.
  if (isolatedKids.length) {
    const rankedXs = connected.map((n) => pos[n.id].x);
    const rankedYs = connected.map((n) => pos[n.id].y);
    const coreLeft = rankedXs.length ? Math.min(...rankedXs) : 0;
    const coreRight = rankedXs.length ? Math.max(...rankedXs) + m.width : m.width;
    const coreBottom = rankedYs.length ? Math.max(...rankedYs) + m.height + RANK_SEP : 0;
    const cols = Math.min(GRID_COLS, isolatedKids.length);
    const pitchX = m.width + NODE_SEP;
    const gridW = (cols - 1) * pitchX + m.width;
    const left = (coreLeft + coreRight) / 2 - gridW / 2;
    const ids = isolatedKids.map((n) => n.id).sort(byId);
    ids.forEach((id, i) => {
      pos[id] = { x: left + (i % cols) * pitchX, y: coreBottom + Math.floor(i / cols) * rowGap(m) };
    });
  }
```

Move the `byId` declaration above this block (it is currently declared further down, next to the
column sort) and hoist the two dagre spacing values to named constants beside `COL_GAP`:

```ts
const NODE_SEP = 56;  // was 40 — the grid packing buys back the width this costs
const RANK_SEP = 104; // was 80
```

- [ ] **Step 4: Run the full web suite**

Run: `cd apps/web && pnpm test`
Expected: PASS. `Canvas.test.tsx` and `reactflow.test.ts` may assert positions that shift with the
new `nodesep`/`ranksep`; re-derive those expectations from the constants rather than hardcoding new
numbers.

- [ ] **Step 5: Verify against the real model, then delete the probe**

Create `apps/web/test/zz-probe.test.ts`, run it, read the output, then **delete the file** — it is a
throwaway, and `pnpm -r test` must not end up with it committed:

```ts
import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { HyphaeModel } from '@hyphae/schema';
import { buildFocusView } from '@/core/focusView';
import { layoutFocusView, NODE_W, NODE_H } from '@/features/canvas/layout';

const model = JSON.parse(readFileSync(resolve(process.cwd(), '../server/hyphae-baritone.json'), 'utf8')) as HyphaeModel;

describe('probe', () => {
  it('reports canvas size per focus', () => {
    const foci = [null, ...model.nodes.filter((n) => model.nodes.some((c) => c.parentId === n.id)).map((n) => n.id)];
    for (const f of foci) {
      const pos = layoutFocusView(buildFocusView(model, f));
      const xs = Object.values(pos).map((p) => p.x);
      const ys = Object.values(pos).map((p) => p.y);
      const name = f ? model.nodes.find((n) => n.id === f)!.name : '(root)';
      console.log(name.padEnd(24),
        `${Math.round(Math.max(...xs) + NODE_W - Math.min(...xs))}x${Math.round(Math.max(...ys) + NODE_H - Math.min(...ys))}`);
    }
  });
});
```

Run: `cd apps/web && pnpm vitest run test/zz-probe.test.ts`
Expected: Process Layer and Utilities & Schematics drop well below their pre-change widths of
2530 and 2610. Record the numbers in the commit body. Then: `rm apps/web/test/zz-probe.test.ts`.

- [ ] **Step 6: Commit**

```bash
cd /c/projects/hyphae
git status --short   # zz-probe.test.ts must NOT appear
git add apps/web/src/features/canvas/layout.ts apps/web/test/features/canvas/layout.test.ts
git commit -m "$(cat <<'EOF'
fix(web): grid the children dagre cannot rank

At Process Layer 12 children share 7 intra-cluster edges, so most of them get no
rank at all and dagre lands the lot in rank 0 — one ~2530px row that every
external edge then has to cross. Partitioning the children and packing the
unranked remainder into a 4-wide grid below the ranked core targets exactly that,
and unlike post-hoc rank wrapping it cannot disturb a node dagre did rank.

nodesep 40 -> 56 and ranksep 80 -> 104; the grid packing buys back the width.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Store state for quieting and dragging

**Files:**
- Modify: `apps/web/src/state/store.ts`
- Test: `apps/web/test/state/store.test.ts` (exists — append a new `describe`)

**Interfaces:**
- Consumes: nothing.
- Produces, on the store:
  ```ts
  quietHubsOn: boolean;                       // default true
  hubThreshold: number;                       // default 8
  hubOverrides: Record<string, boolean>;      // id -> force-quiet (true) / force-show (false)
  nodePositions: Record<string, XY>;          // session-only drag overrides
  toggleQuietHubs: () => void;
  setHubThreshold: (n: number) => void;
  setHubOverride: (id: string, quiet: boolean) => void;
  setNodePosition: (id: string, p: XY) => void;
  resetNodePositions: () => void;
  ```
  `XY` is imported from `@/features/canvas/layout`.

**Rules:**
- `quietHubsOn` defaults to **true**. The feature exists because the default picture is bad; the
  `FilterPanel` states the setting plainly and every quieted node carries a visible degree chip.
- `setFocus`, `revealNode` and `revealStep` clear **both** `nodePositions` and `hubOverrides`, on
  exactly the same terms as the existing `expandedExternals` reset — a new focus opens on the
  auto-layout.
- `setHubThreshold` clamps to 2..40. Below 2 every node is a hub and the canvas empties.
- No `localStorage`. The audience toggle persists; this does not.
- `hubOverrides` supports **both** directions in the store and in `detectHubs`, but the only UI in
  this plan is **un-quiet** (the chip on a quieted node, Task 7) plus the threshold. A
  "quiet this node" action for an under-threshold node has no button yet and is deliberately left
  for later — the mechanism is in place, so adding one is a component change, not a redesign.

- [ ] **Step 1: Write the failing test**

Append to `apps/web/test/state/store.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '@/state/store';

describe('density state', () => {
  beforeEach(() => {
    useStore.setState({
      quietHubsOn: true, hubThreshold: 8, hubOverrides: {}, nodePositions: {},
      focusId: null, expandedExternals: new Set(),
    });
  });

  it('defaults to quieting on at a threshold of 8', () => {
    expect(useStore.getState().quietHubsOn).toBe(true);
    expect(useStore.getState().hubThreshold).toBe(8);
  });

  it('toggles quieting', () => {
    useStore.getState().toggleQuietHubs();
    expect(useStore.getState().quietHubsOn).toBe(false);
  });

  it('clamps the threshold to 2..40', () => {
    useStore.getState().setHubThreshold(0);
    expect(useStore.getState().hubThreshold).toBe(2);
    useStore.getState().setHubThreshold(99);
    expect(useStore.getState().hubThreshold).toBe(40);
  });

  it('records a hub override in both directions', () => {
    useStore.getState().setHubOverride('a', false);
    useStore.getState().setHubOverride('b', true);
    expect(useStore.getState().hubOverrides).toEqual({ a: false, b: true });
  });

  it('records and resets a dragged position', () => {
    useStore.getState().setNodePosition('a', { x: 10, y: 20 });
    expect(useStore.getState().nodePositions).toEqual({ a: { x: 10, y: 20 } });
    useStore.getState().resetNodePositions();
    expect(useStore.getState().nodePositions).toEqual({});
  });

  it('clears drag positions and hub overrides when the focus changes', () => {
    useStore.getState().setNodePosition('a', { x: 1, y: 2 });
    useStore.getState().setHubOverride('a', false);
    useStore.getState().setFocus('other');
    expect(useStore.getState().nodePositions).toEqual({});
    expect(useStore.getState().hubOverrides).toEqual({});
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd apps/web && pnpm vitest run test/state/store.test.ts`
Expected: FAIL — `quietHubsOn` is `undefined`, `toggleQuietHubs` is not a function.

- [ ] **Step 3: Implement**

Add to the `State` type and to the store body:

```ts
  // Density controls. Session-only by design: the auto-layout owns the durable picture, and these
  // exist to make the diagram in front of you readable right now. Nothing here is persisted.
  quietHubsOn: boolean;
  hubThreshold: number;
  hubOverrides: Record<string, boolean>;
  nodePositions: Record<string, XY>;
```

```ts
    quietHubsOn: true,
    hubThreshold: 8,
    hubOverrides: {},
    nodePositions: {},

    toggleQuietHubs: () => set((s) => ({ quietHubsOn: !s.quietHubsOn })),
    // Below 2 every node is a hub and the canvas empties; above 40 nothing in a real model qualifies.
    setHubThreshold: (n) => set({ hubThreshold: Math.max(2, Math.min(40, Math.round(n))) }),
    setHubOverride: (id, quiet) => set((s) => ({ hubOverrides: { ...s.hubOverrides, [id]: quiet } })),
    setNodePosition: (id, p) => set((s) => ({ nodePositions: { ...s.nodePositions, [id]: p } })),
    resetNodePositions: () => set({ nodePositions: {} }),
```

and add `nodePositions: {}, hubOverrides: {}` to the `set({…})` payload of `setFocus`, `revealNode`
and `revealStep`, beside the existing `expandedExternals` reset.

- [ ] **Step 4: Run the tests and verify they pass**

Run: `cd apps/web && pnpm test`
Expected: PASS. The store is a module-level singleton — if an unrelated test now fails, it is because
it did not reset the slice it touches in `beforeEach`.

- [ ] **Step 5: Commit**

```bash
cd /c/projects/hyphae
git status --short
git add apps/web/src/state/store.ts apps/web/test/state/store.test.ts
git commit -m "$(cat <<'EOF'
feat(web): session state for hub quieting and dragged positions

Quieting defaults to ON at a threshold of 8 — the feature exists because the
default picture is unreadable, and the setting is stated plainly in the filter
panel with a degree chip on every quieted node, so nothing is hidden silently.

Both slices reset on a focus change, on the same terms as expandedExternals: a
new focus opens on the auto-layout. Nothing is persisted — unlike the audience
toggle, these are about the diagram in front of you, not a preference.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Wire quieting and drag overrides into the view pipeline

**Files:**
- Modify: `apps/web/src/features/canvas/useCanvasView.ts`
- Modify: `apps/web/src/features/canvas/layout.ts` (add `applyDragOverrides`)
- Test: `apps/web/test/features/canvas/layout.test.ts` (append)
- Test: `apps/web/test/features/canvas/Canvas.test.tsx` (append)

**Interfaces:**
- Consumes: `hubDegrees`, `detectHubs`, `quietHubs`, `HubBadge` (Task 1);
  `NodeMetrics`, `DEFAULT_METRICS`, `withBadgeRow` (Task 2); the store slice (Task 5).
- Produces:
  ```ts
  // layout.ts
  export function applyDragOverrides(base: Record<string, XY>, overrides: Record<string, XY>): Record<string, XY>;
  // useCanvasView.ts — CanvasView gains:
  hubIds: Set<string>;
  degrees: Map<string, number>;
  ```

**The memo chain, in order.** Hub detection runs on the **base** view (unfiltered, full-audience,
collapsed), so the connection filter and audience toggle still never reflow. Toggling quieting or
moving the threshold *does* reflow — it changes what is drawn, not what is shown of a fixed drawing.

```ts
  const quietHubsOn = useStore((s) => s.quietHubsOn);
  const hubThreshold = useStore((s) => s.hubThreshold);
  const hubOverrides = useStore((s) => s.hubOverrides);
  const nodePositions = useStore((s) => s.nodePositions);

  const baseView = useMemo(…, [model, focusId, EMPTY_EXPANDED]);          // unchanged
  const degrees = useMemo(() => hubDegrees(baseView), [baseView]);
  const hubIds = useMemo(
    () => (quietHubsOn ? detectHubs(baseView, hubThreshold, hubOverrides) : new Set<string>()),
    [quietHubsOn, baseView, hubThreshold, hubOverrides],
  );
  const metrics = useMemo(
    () => (hubIds.size ? withBadgeRow(DEFAULT_METRICS) : DEFAULT_METRICS),
    [hubIds],
  );
  const quietBase = useMemo(() => quietHubs(baseView, hubIds).view, [baseView, hubIds]);
  const basePositions = useMemo(() => layoutFocusView(quietBase, metrics), [quietBase, metrics]);

  const rawView = useMemo(() => buildFocusView(model, focusId, connFilter, audience, expandedExternals), […]);
  const { view, badges } = useMemo(() => quietHubs(rawView, hubIds), [rawView, hubIds]);
  const resolved = useMemo(() => resolveViewPositions(view, basePositions, metrics), [view, basePositions, metrics]);
  const positions = useMemo(() => applyDragOverrides(resolved, nodePositions), [resolved, nodePositions]);
  const { nodes, edges } = useMemo(
    () => focusViewToFlow(view, positions, { metrics, badges, hubDegrees: degrees }),
    [view, positions, metrics, badges, degrees],
  );
```

`metrics` keys off `hubIds.size`, not `quietHubsOn`, so a view with no hub at all keeps the compact
box. Everything downstream of `nodes`/`edges` (the flow overlay, `visibleNodeIds`, the pattern view)
is unchanged.

- [ ] **Step 1: Write the failing tests**

Append to `apps/web/test/features/canvas/layout.test.ts`:

```ts
import { applyDragOverrides } from '@/features/canvas/layout';

describe('applyDragOverrides', () => {
  it('overrides a laid-out position with the dragged one', () => {
    const out = applyDragOverrides({ a: { x: 0, y: 0 }, b: { x: 10, y: 10 } }, { a: { x: 99, y: 98 } });
    expect(out).toEqual({ a: { x: 99, y: 98 }, b: { x: 10, y: 10 } });
  });

  it('ignores an override for a node not in the view', () => {
    const out = applyDragOverrides({ a: { x: 0, y: 0 } }, { gone: { x: 5, y: 5 } });
    expect(out).toEqual({ a: { x: 0, y: 0 } });
  });

  it('returns the base object untouched when there is nothing to override', () => {
    const base = { a: { x: 1, y: 2 } };
    expect(applyDragOverrides(base, {})).toBe(base);
  });
});
```

Append to `apps/web/test/features/canvas/Canvas.test.tsx`. That file already has a `model()` factory,
a `base`/`e` spread pair for node and connection defaults, and a `node(container, id)` query helper —
**reuse them, do not invent new names.** Seeding is `useStore.setState({ model: …, focusId: … })`.
The assertion is on the **rendered node set** and on badge text, never on edges (React Flow renders
zero edges in jsdom):

```tsx
describe('hub quieting', () => {
  /** `hub` is read by three siblings inside container `ca`. */
  function hubModel() {
    const m = emptyModel();
    m.nodes.push(
      { id: 'ca', name: 'Alpha', type: 'Container', parentId: null, ...base },
      { id: 'hub', name: 'Hub', type: 'Component', parentId: 'ca', ...base },
      { id: 'k1', name: 'K1', type: 'Component', parentId: 'ca', ...base },
      { id: 'k2', name: 'K2', type: 'Component', parentId: 'ca', ...base },
      { id: 'k3', name: 'K3', type: 'Component', parentId: 'ca', ...base },
    );
    m.connections.push(
      { id: 'r1', from: 'k1', to: 'hub', ...e, verb: 'reads' },
      { id: 'r2', from: 'k2', to: 'hub', ...e, verb: 'reads' },
      { id: 'r3', from: 'k3', to: 'hub', ...e, verb: 'reads' },
    );
    return m;
  }

  it('keeps the hub node but replaces its edges with badges on the readers', () => {
    useStore.setState({ model: hubModel(), focusId: 'ca', quietHubsOn: true, hubThreshold: 3, hubOverrides: {} });
    const { container, getAllByText } = render(<Canvas />);
    expect(node(container, 'hub')).toBeTruthy();
    expect(getAllByText('↳ Hub')).toHaveLength(3);
  });

  it('draws no badge when quieting is off', () => {
    useStore.setState({ model: hubModel(), focusId: 'ca', quietHubsOn: false, hubOverrides: {} });
    const { container, queryByText } = render(<Canvas />);
    expect(node(container, 'hub')).toBeTruthy();
    expect(queryByText('↳ Hub')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `cd apps/web && pnpm vitest run test/features/canvas/layout.test.ts test/features/canvas/Canvas.test.tsx`
Expected: FAIL — `applyDragOverrides` is not exported; no `↳ hub` text is rendered.

- [ ] **Step 3: Implement `applyDragOverrides` in `layout.ts`**

```ts
/**
 * Session-only manual positions layered over the computed ones. Applied LAST, after
 * resolveViewPositions, so a dragged node keeps its place while the connection filter and the
 * audience toggle go on leaving the rest of the graph alone. An override for a node that is not in
 * the view is ignored rather than added, so a stale id from a previous focus cannot create a
 * position for a node that has no slot.
 */
export function applyDragOverrides(base: Record<string, XY>, overrides: Record<string, XY>): Record<string, XY> {
  const ids = Object.keys(overrides).filter((id) => id in base);
  if (!ids.length) return base;
  const out = { ...base };
  for (const id of ids) out[id] = overrides[id];
  return out;
}
```

- [ ] **Step 4: Implement the pipeline in `useCanvasView.ts`**

Apply the memo chain shown above, add the four store selectors, and extend the returned type:

```ts
export type CanvasView = {
  view: FocusView;
  nodes: FlowNode[];
  edges: FlowEdge[];
  overlay: FlowOverlay | null;
  flowActive: boolean;
  patternFlow: { nodes: FlowNode[]; edges: FlowEdge[] } | null;
  /** Quieted node ids, and drawn-edge degree per node — the canvas shows both on the node itself. */
  hubIds: Set<string>;
  degrees: Map<string, number>;
};
```

Update the comment above `basePositions` to record the new memo key: it is now
`[quietBase, metrics]`, i.e. `[model, focusId, hubIds]` transitively — the filter and the audience
toggle are still absent from it, which is the invariant that matters.

- [ ] **Step 5: Run the full web suite**

Run: `cd apps/web && pnpm test`
Expected: PASS. Existing `Canvas.test.tsx` fixtures are small, so at the default threshold of 8 no
node in them qualifies as a hub and their assertions are unaffected. If one *does* change, check the
fixture's degree before touching the threshold default.

- [ ] **Step 6: Typecheck and commit**

```bash
cd /c/projects/hyphae
pnpm --filter @hyphae/web typecheck   # still exactly 4 errors
git status --short
git add apps/web/src/features/canvas/useCanvasView.ts apps/web/src/features/canvas/layout.ts \
        apps/web/test/features/canvas/layout.test.ts apps/web/test/features/canvas/Canvas.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): quiet hubs in the view pipeline and layer drag overrides on top

Detection runs on the BASE view, not the rendered one. Detecting on the rendered
view would mean filtering out dataAccess un-hubs a settings node and reflows the
whole graph on a filter toggle — the exact thing the layout-stability invariant
exists to prevent. The base-position memo key therefore becomes [model, focusId,
hubIds]: toggling quieting reflows, because it changes what is DRAWN, while the
filter and the audience toggle still only change what is SHOWN of a fixed drawing.

applyDragOverrides runs last, after resolveViewPositions, and ignores an id with
no slot in the current view so a stale position cannot place a node at the origin.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Render the badges and the hub chip

**Files:**
- Modify: `apps/web/src/features/canvas/nodes/NodeBox.tsx`
- Modify: `apps/web/src/features/canvas/nodes/GhostNode.tsx`
- Create: `apps/web/src/features/canvas/nodes/HubBadges.tsx`
- Test: `apps/web/test/features/canvas/nodes/HubBadges.test.tsx`
- Test: `apps/web/test/features/canvas/nodes/NodeBox.test.tsx` (append)

**Interfaces:**
- Consumes: `HubBadge` from `@/core/hubs`; `VERB_CLASS_COLOR` from `@/core/verbColors`;
  `setHubOverride` from the store.
- Produces:
  ```ts
  export const MAX_BADGES = 2;
  export function HubBadges({ badges }: { badges?: HubBadge[] }): JSX.Element | null;
  export function HubChip({ id, degree }: { id: string; degree: number }): JSX.Element;
  ```
  Both live in `HubBadges.tsx` — they are the two halves of one idea and change together.

**Visual rules — read these before writing any style:**
- **A badge is `[swatch] ↳ Name`**: a 3px-wide filled block in `VERB_CLASS_COLOR[verbClass]`,
  followed by text in `var(--tx-2)` on a `var(--chip)` background. The verb colour must be a
  **swatch, not the text colour** — `test/styles/contrast.test.ts` measures 33 foreground/background
  pairs at 4.5:1 and a coloured-text badge would need a new pair for every verb class. A swatch is
  not text. `FilterPanel`'s `.filter__swatch` already establishes this idiom.
- Hue still means meaning: the badge carries the same verb-class hue the line it replaces carried.
- At most `MAX_BADGES` badges, then a `+N` chip in `var(--tx-3)`. Hub names truncate at 14 chars
  with `…`.
- The hub chip reads `hub ×11` and is a `<button>` that un-quiets on click. It **must**
  `stopPropagation` — the row/box owns the click and would otherwise drill. `GhostNode`'s existing
  expand button is the worked example.
- Everything is inline-styled with `var()` tokens, matching how `NodeBox` already works. **No new
  entry in `canvas.css`** for these — no stylesheet is observable in jsdom anyway.

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/features/canvas/nodes/HubBadges.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HubBadges, HubChip, MAX_BADGES } from '@/features/canvas/nodes/HubBadges';
import { useStore } from '@/state/store';

const badge = (hubName: string, verbClass = 'dataAccess') =>
  ({ hubId: hubName, hubName, verb: 'reads', verbClass }) as any;

describe('HubBadges', () => {
  it('renders nothing without badges', () => {
    const { container } = render(<HubBadges />);
    expect(container.firstChild).toBeNull();
  });

  it('renders one chip per badge', () => {
    render(<HubBadges badges={[badge('Settings')]} />);
    expect(screen.getByText('↳ Settings')).toBeInTheDocument();
  });

  it('caps the row and shows an overflow count', () => {
    render(<HubBadges badges={[badge('A'), badge('B'), badge('C'), badge('D')]} />);
    expect(screen.getAllByText(/^↳ /)).toHaveLength(MAX_BADGES);
    expect(screen.getByText(`+${4 - MAX_BADGES}`)).toBeInTheDocument();
  });

  it('truncates a long hub name', () => {
    render(<HubBadges badges={[badge('Player & World Utilities')]} />);
    expect(screen.getByText(/^↳ .{0,14}…$/)).toBeInTheDocument();
  });

  it('carries the verb class hue as a swatch, never as the text colour', () => {
    const { container } = render(<HubBadges badges={[badge('Settings', 'messaging')]} />);
    const swatch = container.querySelector('[data-verb-class="messaging"]') as HTMLElement;
    expect(swatch.style.background).toBe('var(--verb-messaging)');
    expect(screen.getByText('↳ Settings').style.color).toBe('var(--tx-2)');
  });
});

describe('HubChip', () => {
  beforeEach(() => useStore.setState({ hubOverrides: {} }));

  it('shows the degree it stands in for', () => {
    render(<HubChip id="h" degree={11} />);
    expect(screen.getByText('hub ×11')).toBeInTheDocument();
  });

  it('un-quiets the node on click without bubbling to the box', () => {
    const onParentClick = vi.fn();
    render(<div onClick={onParentClick}><HubChip id="h" degree={11} /></div>);
    fireEvent.click(screen.getByText('hub ×11'));
    expect(useStore.getState().hubOverrides).toEqual({ h: false });
    expect(onParentClick).not.toHaveBeenCalled();
  });
});
```

(Add `vi` to the vitest import.)

Append to `apps/web/test/features/canvas/nodes/NodeBox.test.tsx`. That file's `renderBox(data)` helper
returns the Testing Library result and its tests destructure `getByText` from it — match that style,
it does not import `screen`:

```tsx
  it('renders hub badges passed through data', () => {
    const { getByText } = renderBox({
      name: 'n',
      badges: [{ hubId: 'h', hubName: 'Settings', verb: 'reads', verbClass: 'dataAccess' }],
    });
    expect(getByText('↳ Settings')).toBeTruthy();
  });
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `cd apps/web && pnpm vitest run test/features/canvas/nodes/`
Expected: FAIL — `Failed to resolve import "@/features/canvas/nodes/HubBadges"`.

- [ ] **Step 3: Write `HubBadges.tsx`**

```tsx
import { useStore } from '@/state/store';
import { VERB_CLASS_COLOR } from '@/core/verbColors';
import type { HubBadge } from '@/core/hubs';

/** Badges shown on a node before the row overflows into a "+N" count. */
export const MAX_BADGES = 2;
const NAME_CAP = 14;

const clip = (s: string) => (s.length > NAME_CAP ? `${s.slice(0, NAME_CAP)}…` : s);

const chip = {
  fontSize: 9,
  lineHeight: '12px',
  background: 'var(--chip)',
  borderRadius: 3,
  padding: '0 4px',
  whiteSpace: 'nowrap' as const,
  overflow: 'hidden',
  textOverflow: 'ellipsis' as const,
};

/**
 * A quieted hub's edges, re-encoded on the node at the other end. The verb class is carried by a
 * SWATCH, not by the text colour: hue still means meaning, but a coloured 9px label would need its
 * own entry in the 33-pair contrast suite for every verb class, and a swatch is not text.
 */
export function HubBadges({ badges }: { badges?: HubBadge[] }) {
  if (!badges?.length) return null;
  const shown = badges.slice(0, MAX_BADGES);
  const extra = badges.length - shown.length;
  return (
    <div style={{ position: 'relative', display: 'flex', gap: 3, justifyContent: 'center', alignItems: 'center', maxWidth: '100%', overflow: 'hidden' }}>
      {shown.map((b) => (
        <span key={`${b.hubId}\0${b.verb}`} style={{ ...chip, display: 'inline-flex', alignItems: 'center', gap: 3 }} title={`${b.verb} — ${b.hubName}`}>
          <span
            data-verb-class={b.verbClass}
            style={{ width: 3, height: 8, borderRadius: 1, background: VERB_CLASS_COLOR[b.verbClass], flex: 'none' }}
          />
          <span style={{ color: 'var(--tx-2)' }}>{`↳ ${clip(b.hubName)}`}</span>
        </span>
      ))}
      {extra > 0 && <span style={{ ...chip, color: 'var(--tx-3)' }}>{`+${extra}`}</span>}
    </div>
  );
}

/** The chip on a quieted node itself: what it is standing in for, and the way back. */
export function HubChip({ id, degree }: { id: string; degree: number }) {
  const setHubOverride = useStore((s) => s.setHubOverride);
  return (
    <button
      // The box owns the click and would drill on it — anything inside that does something else
      // has to stop the bubble. GhostNode's expand button is the same case.
      onClick={(ev) => { ev.stopPropagation(); setHubOverride(id, false); }}
      title="Show this node's connections again"
      style={{ ...chip, position: 'relative', color: 'var(--tx-3)', border: '1px solid var(--rule)', cursor: 'pointer', fontStyle: 'normal', alignSelf: 'center' }}
    >
      {`hub ×${degree}`}
    </button>
  );
}
```

- [ ] **Step 4: Wire into `NodeBox.tsx` and `GhostNode.tsx`**

Extend `NodeBoxData` with `badges?: HubBadge[]; hubDegree?: number;`, then render — after the
technology chip in both components:

```tsx
      <HubBadges badges={d.badges} />
      {d.hubDegree != null && <HubChip id={id} degree={d.hubDegree} />}
```

`NodeBox` does not currently destructure `id` from `NodeProps` — add it. (`NodeBox.test.tsx`'s
`renderBox` passes only `data`, so `id` is `undefined` there; that is harmless because `HubChip` only
renders when `hubDegree` is set, which no `renderBox` test does.) Dim a quieted node by adding
`opacity: d.hubDegree != null ? 0.55 : 1` to the wrapper `style` in both components.

In `reactflow.ts`, pass the degree for a quieted node only. `focusViewToFlow` does not know the hub
set, so add it to `FlowOptions`:

```ts
export type FlowOptions = {
  metrics?: NodeMetrics;
  badges?: Map<string, HubBadge[]>;
  hubDegrees?: Map<string, number>;
  hubIds?: Set<string>;
};
```

and in both node pushes: `hubDegree: opts.hubIds?.has(n.id) ? opts.hubDegrees?.get(n.id) : undefined`.
Pass `hubIds` from `useCanvasView`'s `focusViewToFlow` call and add it to that memo's dependency array.

- [ ] **Step 5: Run the full web suite**

Run: `cd apps/web && pnpm test`
Expected: PASS, including the two `Canvas.test.tsx` tests from Task 6 which assert `↳ hub` text.

- [ ] **Step 6: Verify the styling suite specifically**

Run: `cd apps/web && pnpm vitest run test/styles/`
Expected: PASS. A failure here means either a colour literal slipped into `src/` or a `var()` does
not resolve. **Never loosen a contrast threshold** — retune, or move the colour to a swatch.

- [ ] **Step 7: Typecheck and commit**

```bash
cd /c/projects/hyphae
pnpm --filter @hyphae/web typecheck   # still exactly 4 errors
git status --short
git add apps/web/src/features/canvas/nodes/HubBadges.tsx apps/web/src/features/canvas/nodes/NodeBox.tsx \
        apps/web/src/features/canvas/nodes/GhostNode.tsx apps/web/src/features/canvas/reactflow.ts \
        apps/web/src/features/canvas/useCanvasView.ts \
        apps/web/test/features/canvas/nodes/HubBadges.test.tsx apps/web/test/features/canvas/nodes/NodeBox.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): render quieted hub edges as badges on the other endpoint

The badge IS the edge, re-encoded in a different form, so it keeps the same hue
the line carried — but as a 3px swatch, not as the text colour. A coloured 9px
label would need its own entry in the 33-pair contrast suite for every verb
class, and a swatch is not text.

A quieted node stays put, dimmed, carrying a `hub xN` chip that says what it is
standing in for and un-quiets it on click. Nothing is hidden without a way back:
the chip restores the edges, and the inspector still lists every connection.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Dragging and the density controls

**Files:**
- Modify: `apps/web/src/features/canvas/Canvas.tsx`
- Modify: `apps/web/src/features/canvas/reactflow.ts` (drop `draggable: false` from `node`/`ghost`)
- Modify: `apps/web/src/features/canvas/overlay/FilterPanel.tsx`
- Modify: `apps/web/src/features/canvas/canvas.css`
- Modify: `apps/web/src/features/canvas/useDrillNavigation.ts` (comment only — see the ⚠ rule below)
- Create: `apps/web/test/features/canvas/overlay/FilterPanel.test.tsx` (the directory holds only
  `Legend.test.tsx` today — follow its render setup)
- Test: `apps/web/test/features/canvas/Canvas.test.tsx` (append)

**Interfaces:**
- Consumes: the store slice from Task 5; `useCanvasView`'s output from Task 6.
- Produces: no new module exports.

**Rules:**
- `nodesDraggable` becomes `true` on `<ReactFlow>`. `region` and `ghostGroup` keep their per-node
  `draggable: false` — both are *derived* from the positions of their contents and must not move
  independently. Remove `draggable: false` from the `node` and `ghost` pushes only.
- The pattern view stays static: when `patternFlow` is non-null, pass `patternFlow.nodes` and no
  `onNodesChange`/`onNodeDragStop`.
- React Flow will not move a fully controlled node without an `onNodesChange` handler, so `Canvas`
  keeps a `useNodesState` mirror synced from the derived nodes by effect.
- **Commit on `onNodeDragStop`, not per frame.** Writing every drag frame would re-run
  `focusViewToFlow` at frame rate. Accepted consequence: the region box resizes on drop, not
  continuously during the drag.
- Do **not** add a `onNodeDrag` handler.
- **⚠ This task flips the premise of an existing workaround.** `useDrillNavigation.ts` detects a
  double-click from the `onNodeClick` stream, and its comment says why: *"React Flow suppresses
  onNodeDoubleClick while nodesDraggable={false} (double-click rides on the node drag machinery)"*.
  Turning drag on makes `onNodeDoubleClick` fire again. **Keep the click-stream detection** — it is
  covered by nine `dblclick(...)` assertions in `Canvas.test.tsx` and works either way — but update
  that comment so it no longer states a condition that is now false. If any of those nine drill tests
  goes red, that is the real risk of this task surfacing: investigate it as a bug, do not weaken the
  test.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/test/features/canvas/overlay/FilterPanel.test.tsx`, following
`test/features/canvas/overlay/Legend.test.tsx` for the imports and render setup:

```tsx
  describe('density controls', () => {
    beforeEach(() => useStore.setState({ quietHubsOn: true, hubThreshold: 8, nodePositions: {} }));

    it('toggles quieting from the panel', () => {
      render(<FilterPanel />);
      fireEvent.click(screen.getByLabelText('Quiet hubs'));
      expect(useStore.getState().quietHubsOn).toBe(false);
    });

    it('sets the threshold from the stepper', () => {
      render(<FilterPanel />);
      fireEvent.change(screen.getByLabelText('Hub threshold'), { target: { value: '12' } });
      expect(useStore.getState().hubThreshold).toBe(12);
    });

    it('shows reset layout only once something has been dragged', () => {
      const { rerender } = render(<FilterPanel />);
      expect(screen.queryByText('reset layout')).toBeNull();
      useStore.getState().setNodePosition('a', { x: 1, y: 2 });
      rerender(<FilterPanel />);
      fireEvent.click(screen.getByText('reset layout'));
      expect(useStore.getState().nodePositions).toEqual({});
    });
  });
```

Append to `apps/web/test/features/canvas/Canvas.test.tsx`, reusing its existing `model()` and
`node(container, id)` helpers:

```tsx
  it('makes child boxes draggable and leaves the region fixed', () => {
    useStore.setState({ model: model(), focusId: 'ca' });
    const { container } = render(<Canvas />);
    // React Flow v12 NodeWrapper puts a `draggable` class on a node it will drag, and omits it for
    // one with draggable:false. Verified in @xyflow/react's NodeWrapper class list.
    expect(node(container, 'a1')!.className).toContain('draggable');
    expect(node(container, 'ca')!.className).not.toContain('draggable');
  });
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `cd apps/web && pnpm vitest run test/features/canvas/`
Expected: FAIL — no `Quiet hubs` control exists; the region assertion is inconclusive until the
`nodesDraggable` change lands.

- [ ] **Step 3: Implement the FilterPanel group**

```tsx
function DensityGroup() {
  const quietHubsOn = useStore((s) => s.quietHubsOn);
  const toggleQuietHubs = useStore((s) => s.toggleQuietHubs);
  const hubThreshold = useStore((s) => s.hubThreshold);
  const setHubThreshold = useStore((s) => s.setHubThreshold);
  const dragged = useStore((s) => s.nodePositions);
  const resetNodePositions = useStore((s) => s.resetNodePositions);
  return (
    <div className="filter__group">
      <div className="filter__label">Density</div>
      <label className="filter__option">
        <input type="checkbox" aria-label="Quiet hubs" checked={quietHubsOn} onChange={toggleQuietHubs} />
        Quiet hubs
      </label>
      <label className="filter__option filter__stepper" title="A node with at least this many drawn edges is quieted">
        ≥
        <input
          type="number" min={2} max={40} aria-label="Hub threshold"
          value={hubThreshold} disabled={!quietHubsOn}
          onChange={(e) => setHubThreshold(Number(e.target.value))}
        />
        edges
      </label>
      {Object.keys(dragged).length > 0 && (
        <button className="filter__clear" onClick={resetNodePositions}>reset layout</button>
      )}
    </div>
  );
}
```

Render `<DensityGroup />` in `FilterPanel` after `<VerbClassGroup />`.

Add to `canvas.css`, next to the other `.filter__*` rules (class selectors only — element and ID
selectors are `base.css`-only), and place it **after** `.filter__option` so it wins on equal
specificity:

```css
.filter__stepper input {
  width: 3.2em;
  margin: 0 0.25em;
}
```

- [ ] **Step 4: Implement dragging in `Canvas.tsx`**

```tsx
import { useNodesState } from '@xyflow/react';
…
  const setNodePosition = useStore((s) => s.setNodePosition);
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<FlowNode>([]);
  // The derived nodes are the source of truth; React Flow's copy exists only so it can animate a
  // drag. It will not move a fully controlled node without an onNodesChange handler.
  useEffect(() => { setRfNodes(nodes); }, [nodes, setRfNodes]);
```

and on `<ReactFlow>`:

```tsx
        nodes={patternFlow ? patternFlow.nodes : rfNodes}
        onNodesChange={patternFlow ? undefined : onNodesChange}
        nodesDraggable={!patternFlow}
        // Commit on drop, not per frame: writing every frame would re-run focusViewToFlow at frame
        // rate. The region box therefore resizes when the node lands, not continuously.
        onNodeDragStop={(_, n) => setNodePosition(n.id, n.position)}
```

Delete the existing `nodesDraggable={false}` line, and delete `draggable: false` from the `node` and
`ghost` pushes in `reactflow.ts` — leaving it on `region`, `ghostGroup` and the childless-focus node.

- [ ] **Step 5: Run the full web suite**

Run: `cd apps/web && pnpm test`
Expected: PASS. Do **not** attempt to simulate a drag — jsdom measures nothing and React Flow's
pointer handling needs `setPointerCapture`, which `test/setup.ts` only stubs. The drag path is
covered by `applyDragOverrides` (Task 6) and the store (Task 5); this task's tests cover the
controls and the draggable flag.

- [ ] **Step 6: Typecheck and commit**

```bash
cd /c/projects/hyphae
pnpm --filter @hyphae/web typecheck   # still exactly 4 errors
git status --short
git add apps/web/src/features/canvas/Canvas.tsx apps/web/src/features/canvas/reactflow.ts \
        apps/web/src/features/canvas/overlay/FilterPanel.tsx apps/web/src/features/canvas/canvas.css \
        apps/web/test/features/canvas/overlay/FilterPanel.test.tsx apps/web/test/features/canvas/Canvas.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): drag a node, and control density from the filter panel

Positions are session-only and reset on a focus change: auto-layout owns the
durable picture, and dragging exists to untangle the diagram in front of you.
Regions and ghost groups stay fixed because both are DERIVED from the positions
of their contents — a group that could move independently of its members would
just detach from them.

The commit happens on drag stop rather than per frame, since writing each frame
would re-run focusViewToFlow at frame rate; the region box consequently resizes
when the node lands rather than continuously.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Documentation and full verification

**Files:**
- Modify: `README.md`
- Modify: `docs/SPEC.md`
- Modify: `CLAUDE.md`

**Interfaces:** none.

- [ ] **Step 1: Verify the whole repo first**

```bash
cd /c/projects/hyphae
pnpm -r test
pnpm -r build
pnpm --filter @hyphae/web typecheck
```

Expected: all green; web test count above the 415 baseline; typecheck at exactly 4 errors. **Paste
the real output into the final report** — do not claim green without it.

- [ ] **Step 2: Update `README.md`**

In the section describing the viewer's behaviour, add:

- **Drag a node** to untangle a view. Positions are session-only and reset when the focus changes;
  **reset layout** in the Connections panel clears them.
- **Quiet hubs** (on by default): a node with at least *N* drawn edges (default 8) keeps its box but
  drops its lines, which reappear as `↳ Name` badges on the nodes at the other end. The quieted node
  carries a `hub ×N` chip; click it to bring the edges back. The threshold is in the Connections
  panel. The inspector always lists every connection regardless.

- [ ] **Step 3: Update `docs/SPEC.md` §9**

Add to the styling section: the hub badge is a **form** distinction (a chip), carrying the verb-class
hue as a swatch rather than as text colour, so it re-encodes the edge it replaces without adding a
foreground/background pair to the contrast suite.

- [ ] **Step 4: Update `CLAUDE.md`**

Three edits:

1. In the file map under `core/`, add `hubs.ts` beside `stepReveal.ts`; under
   `features/canvas/nodes/`, add `HubBadges`.
2. In "Invariants that bite", amend the focus-view pipeline entry: the chain is now
   `buildFocusView` → `quietHubs` → `layoutFocusView` → `resolveViewPositions` →
   `applyDragOverrides` → `focusViewToFlow`, and **base positions are memoized on
   `[model, focusId, hubIds]`** — the connection filter and the audience toggle are still absent from
   the key, which is the part that matters; hub detection runs on the *base* view for exactly that
   reason.
3. Add an invariant: `NODE_W`/`NODE_H` are the *defaults* of a `NodeMetrics` parameter threaded
   through `layoutFocusView`, `resolveViewPositions`, `groupBoxHeight` and `focusViewToFlow`. Quieting
   adds `BADGE_ROW_H` to the box height, and every one of those must agree or the boxes overlap.
   `patternView.ts` deliberately stays on the constants.

- [ ] **Step 5: Commit**

```bash
cd /c/projects/hyphae
git status --short
git add README.md docs/SPEC.md CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: record hub quieting, node dragging and the metrics parameter

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: Check the result against the real model**

Start the server on the Baritone model and look at the container foci that were worst —
Baritone API, Process Layer, Utilities & Schematics:

```bash
HYPHAE_FILE=$PWD/apps/server/hyphae-baritone.json pnpm dev
```

There is no screenshot tooling here, so this step is the user's to judge. Report the measured
canvas sizes from Task 4's probe and ask them to confirm the picture reads better before the branch
is treated as finished.

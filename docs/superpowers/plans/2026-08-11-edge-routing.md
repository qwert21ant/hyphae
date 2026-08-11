# Edge Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the free-anchor bezier edge with a router that attaches edges to discrete ports, sends cluster↔column runs down ordered gutter lanes, and draws them in one of two styles.

**Architecture:** Edge geometry splits in two. *Assignment* (`routeEdges`) is pure, global and memoized per view: it decides a side, a port index and a lane for every edge, using no absolute node coordinates other than the lane's gutter x. *Resolution* happens in `FloatingEdge` against React Flow's live measured geometry. Because node positions only reach the store on `onNodeDragStop`, routes freeze during a drag while endpoints track the node — ports snap on release instead of sliding.

**Tech Stack:** TypeScript, React 18, `@xyflow/react`, `@dagrejs/dagre`, Zustand, Vitest + jsdom + Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-11-edge-routing-design.md`

## Global Constraints

- **Constants, verbatim:** `PORT_PITCH = 24`, `LANE_PITCH = 18`, `LANE_MARGIN = 12`, `COL_GAP` floor `120`.
- **Default edge style is `squared`.** The other is `curved`. No third mode; free-anchor bezier is deleted.
- **No colour literal anywhere in `apps/web/src` outside `tokens.css`** — no hex, no `rgb()`/`hsl()`. Enforced by `test/styles/tokens.test.ts`, which walks `src/` recursively.
- **Every token declared in `:root` must be referenced, and every `var()` must resolve**, in both themes. Both directions fail the suite.
- **No `.tsx` imports a stylesheet.** The `@import` order in `src/styles.css` is the cascade.
- **Web imports use the `@/` alias**, except a file in the *same directory*, which is `./Name`. A child directory is not a sibling.
- **Never run bare `pnpm vitest run` from the repo root** — there is no root vitest config, so web tests run without jsdom. Always `cd apps/web` first.
- **Test baseline:** `pnpm -r test` is 693 green before this work (schema 147, server 107, web 439). It must stay green; new tests add to it.
- **Typecheck floor:** `pnpm --filter @hyphae/web typecheck` has a pre-existing 4-error floor, all in test files. 4 is clean, 5 is yours. It is not part of `pnpm -r build`.
- **`apps/server/hyphae-baritone.json` is permanently untracked.** Never `git add` it. Run `git status --short` before every commit and stage explicit paths — never `git add -A`.
- **Commits:** conventional with a scope (`feat(web):`, `fix(web):`, `test(web):`, `docs:`), explaining *why* in the body, ending with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **React Flow renders zero edges under jsdom** and portals labels out of the edge's `<g>`. Never assert edge or label DOM; test the pure functions, or assert the injected `<style data-hyphae-hl>` via the `hlCss` pattern.
- **Roughly 80 `act(...)` warnings** in the web suite are pre-existing noise.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/features/canvas/edges/ports.ts` | *(renamed from `floating.ts` in Task 8)* Box geometry, port counts and points, side selection, overflow fan |
| `src/features/canvas/edges/lanes.ts` | Channel assignment: y-spans → lane indices, and lane index → x |
| `src/features/canvas/edges/paths.ts` | `squaredPoints`/`squaredPath`, `curvedPath`, label anchor and angle |
| `src/features/canvas/edges/routeEdges.ts` | The per-view pass: ports + lanes → `Record<string, Route>`, plus `fallbackRoute` |
| `src/features/canvas/edges/FloatingEdge.tsx` | Resolves a `Route` against live geometry, renders path + rotated label |
| `src/features/canvas/layout.ts` | Gains `colGap` derived per gutter from lane demand |
| `src/features/canvas/useCanvasView.ts` | Gains the `routeEdges` memo; absorbs `decorateFlowEdges` |
| `src/features/canvas/reactflow.ts` | Loses the same-pair fanning block |
| `src/state/store.ts` | Gains `edgeStyle` + `setEdgeStyle` |
| `src/features/canvas/overlay/FilterPanel.tsx` | Layout group restructured; gains the style toggle |
| `test/support/realModel.ts` | Loads `hyphae-baritone.json`, or signals absence so tests skip |
| `test/support/crossings.ts` | Counts segment intersections across a set of polylines |

---

## Task 1: Real-model harness and baseline measurement

Produces the two numbers everything else is sized against: current crossing counts, and channel density per gutter. Also produces the reusable loader that Task 10 needs.

**Files:**
- Create: `apps/web/test/support/realModel.ts`
- Create: `apps/web/test/support/crossings.ts`
- Create: `apps/web/test/support/crossings.test.ts`
- Create (temporary, deleted in Step 8): `apps/web/test/zz-density-probe.test.ts`
- Modify: `docs/superpowers/plans/2026-08-11-edge-routing.md` (record the measurements below)

**Interfaces:**
- Consumes: `layoutFocusView`, `buildFocusView`, `getEdgeParams` (all existing).
- Produces: `loadRealModel(): HyphaeModel | null`, `REAL_FOCUSES: string[]`, `countCrossings(polylines: XY[][]): number`.

- [ ] **Step 1: Write the failing test for the crossing counter**

Create `apps/web/test/support/crossings.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { countCrossings } from './crossings';

describe('countCrossings', () => {
  it('counts a single X as one crossing', () => {
    expect(countCrossings([
      [{ x: 0, y: 0 }, { x: 10, y: 10 }],
      [{ x: 0, y: 10 }, { x: 10, y: 0 }],
    ])).toBe(1);
  });

  it('does not count parallel polylines', () => {
    expect(countCrossings([
      [{ x: 0, y: 0 }, { x: 10, y: 0 }],
      [{ x: 0, y: 5 }, { x: 10, y: 5 }],
    ])).toBe(0);
  });

  it('does not count segments that only share an endpoint', () => {
    expect(countCrossings([
      [{ x: 0, y: 0 }, { x: 5, y: 5 }],
      [{ x: 5, y: 5 }, { x: 10, y: 0 }],
    ])).toBe(0);
  });

  it('counts each crossing pair once for multi-segment polylines', () => {
    expect(countCrossings([
      [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 10 }],
      [{ x: 0, y: 5 }, { x: 10, y: 5 }],
    ])).toBe(1);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd apps/web && pnpm vitest run test/support/crossings.test.ts`
Expected: FAIL — `Failed to resolve import "./crossings"`.

- [ ] **Step 3: Implement the crossing counter**

Create `apps/web/test/support/crossings.ts`:

```ts
import type { XY } from '@/features/canvas/layout';

type Seg = { a: XY; b: XY };

const orient = (p: XY, q: XY, r: XY): number => {
  const v = (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return Math.abs(v) < 1e-9 ? 0 : Math.sign(v);
};

/** Proper intersection only: shared endpoints and collinear overlap do not count. Two edges that
 *  meet at a node port touch by design, and counting that would swamp the real signal. */
function crosses(s: Seg, t: Seg): boolean {
  const shared = [s.a, s.b].some((p) => [t.a, t.b].some((q) => p.x === q.x && p.y === q.y));
  if (shared) return false;
  const d1 = orient(s.a, s.b, t.a);
  const d2 = orient(s.a, s.b, t.b);
  const d3 = orient(t.a, t.b, s.a);
  const d4 = orient(t.a, t.b, s.b);
  return d1 !== d2 && d3 !== d4 && d1 !== 0 && d2 !== 0 && d3 !== 0 && d4 !== 0;
}

/** Number of proper intersections between segments belonging to DIFFERENT polylines. */
export function countCrossings(polylines: XY[][]): number {
  const perLine: Seg[][] = polylines.map((pts) => {
    const segs: Seg[] = [];
    for (let i = 1; i < pts.length; i++) segs.push({ a: pts[i - 1], b: pts[i] });
    return segs;
  });
  let n = 0;
  for (let i = 0; i < perLine.length; i++) {
    for (let j = i + 1; j < perLine.length; j++) {
      for (const s of perLine[i]) for (const t of perLine[j]) if (crosses(s, t)) n++;
    }
  }
  return n;
}
```

- [ ] **Step 4: Run it to make sure it passes**

Run: `cd apps/web && pnpm vitest run test/support/crossings.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the real-model loader**

Create `apps/web/test/support/realModel.ts`. The model file is untracked, so it may be absent on a clean checkout; the loader must signal that rather than throw, and callers use `it.skipIf`.

```ts
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { HyphaeModel } from '@hyphae/schema';

// process.cwd() is the PACKAGE root (apps/web), which is what makes the mirrored test tree safe —
// a test can sit at any depth without its paths changing. import.meta.url is an http URL under
// jsdom, so it must not be used here.
const MODEL_PATH = resolve(process.cwd(), '../server/hyphae-baritone.json');

/** The real Baritone model, or null when the (permanently untracked) file is not present. */
export function loadRealModel(): HyphaeModel | null {
  if (!existsSync(MODEL_PATH)) return null;
  return JSON.parse(readFileSync(MODEL_PATH, 'utf8')) as HyphaeModel;
}

/** The four reference focuses the spec measures against, by node NAME (ids are UUIDs). */
export const REAL_FOCUS_NAMES = [
  'Baritone API',
  'Process Layer',
  'Utilities & Schematics',
  'Command System',
];

/** Resolve those names to ids in a given model, skipping any that are absent. */
export function realFocusIds(model: HyphaeModel): { name: string; id: string }[] {
  return REAL_FOCUS_NAMES
    .map((name) => ({ name, id: model.nodes.find((n) => n.name === name)?.id ?? '' }))
    .filter((f) => f.id !== '');
}
```

- [ ] **Step 6: Write the throwaway density probe**

Create `apps/web/test/zz-density-probe.test.ts`. This measures the two baselines and prints them; it is deleted in Step 8.

```ts
import { describe, it } from 'vitest';
import { buildFocusView } from '@/core/focusView';
import { layoutFocusView, NODE_W, NODE_H, type XY } from '@/features/canvas/layout';
import { getEdgeParams } from '@/features/canvas/edges/floating';
import { countCrossings } from './support/crossings';
import { loadRealModel, realFocusIds } from './support/realModel';

const model = loadRealModel();

describe('baseline probe', () => {
  it.skipIf(!model)('prints crossings and channel density per focus', () => {
    const m = model!;
    for (const { name, id } of realFocusIds(m)) {
      const view = buildFocusView(m, id, undefined, 'full', new Set<string>());
      const pos = layoutFocusView(view);
      const box = (nid: string) => ({ ...(pos[nid] ?? { x: 0, y: 0 }), width: NODE_W, height: NODE_H });

      // OLD crossing baseline: approximate each bezier by its chord, which is what the crossing
      // metric compares against in Task 10.
      const lines: XY[][] = [];
      for (const e of view.edges) {
        if (!pos[e.from] || !pos[e.to]) continue;
        const p = getEdgeParams(box(e.from), box(e.to));
        lines.push([{ x: p.sx, y: p.sy }, { x: p.tx, y: p.ty }]);
      }

      // Channel density: for edges touching an external, the y-span of the run, bucketed by which
      // gutter (left of the cluster or right of it) the external sits in.
      const childIds = new Set(view.children.map((n) => n.id));
      const xs = view.children.map((n) => pos[n.id]?.x ?? 0);
      const midX = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0;
      const spans: { side: 'L' | 'R'; y0: number; y1: number }[] = [];
      for (const e of view.edges) {
        const ext = childIds.has(e.from) ? (childIds.has(e.to) ? null : e.to) : e.from;
        if (!ext || !pos[e.from] || !pos[e.to]) continue;
        const y0 = pos[e.from].y + NODE_H / 2;
        const y1 = pos[e.to].y + NODE_H / 2;
        spans.push({ side: pos[ext].x < midX ? 'L' : 'R', y0: Math.min(y0, y1), y1: Math.max(y0, y1) });
      }
      const density = (side: 'L' | 'R') => {
        const ev = spans.filter((s) => s.side === side)
          .flatMap((s) => [{ y: s.y0, d: 1 }, { y: s.y1, d: -1 }])
          .sort((a, b) => a.y - b.y || a.d - b.d);
        let cur = 0; let max = 0;
        for (const e of ev) { cur += e.d; max = Math.max(max, cur); }
        return max;
      };

      console.log(JSON.stringify({
        focus: name,
        edges: view.edges.length,
        crossings: countCrossings(lines),
        gutterEdges: { L: spans.filter((s) => s.side === 'L').length, R: spans.filter((s) => s.side === 'R').length },
        density: { L: density('L'), R: density('R') },
        colGap: { L: Math.max(120, density('L') * 18 + 24), R: Math.max(120, density('R') * 18 + 24) },
      }));
    }
  });
});
```

- [ ] **Step 7: Run the probe and record the numbers**

Run: `cd apps/web && pnpm vitest run test/zz-density-probe.test.ts`
Expected: PASS, with one JSON line per focus in the output.

Paste the output into the table below, replacing this row. These become the budgets Task 10 asserts against.

| focus | edges | crossings (old) | density L / R | derived colGap L / R |
|---|---|---|---|---|
| Baritone API | 85 | 402 | 20 / 2 | 384 / 120 |
| Process Layer | 68 | 346 | 25 / 10 | 474 / 204 |
| Utilities & Schematics | 53 | 138 | 13 / 3 | 258 / 120 |
| Command System | 46 | 80 | 7 / 6 | 150 / 132 |

**Read:** lane sharing works. Process Layer sends 39 edges across its left gutter but only 25 are
ever open at once, and Baritone API 37 for a density of 20 — so the widest gutter is 474px against
the ~588px the spec named as the accepted worst case. Traffic is also strongly asymmetric (37 left
vs 3 right at Baritone API), which is exactly what independent gutter sizing is for.

- [ ] **Step 8: Delete the probe**

```bash
rm apps/web/test/zz-density-probe.test.ts
```

- [ ] **Step 9: Verify the suite and commit**

Run: `cd apps/web && pnpm vitest run`
Expected: 439 pre-existing + 4 new = 443 web tests green.

```bash
cd /c/projects/hyphae
git status --short   # hyphae-baritone.json must still be listed as untracked and NOT staged
git add apps/web/test/support/realModel.ts apps/web/test/support/crossings.ts apps/web/test/support/crossings.test.ts docs/superpowers/plans/2026-08-11-edge-routing.md
git commit -m "$(cat <<'EOF'
test(web): add a real-model loader and a crossing counter

Turns "better edge pathing" into a number before any of it is built. The
crossing counter ignores shared endpoints, because every edge meeting at a
port touches by design and counting that would swamp the signal. The loader
returns null rather than throwing when hyphae-baritone.json is absent, so a
clean checkout skips the measurements instead of failing.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Port geometry

**Files:**
- Create: `apps/web/src/features/canvas/edges/ports.ts`
- Create: `apps/web/test/features/canvas/edges/ports.test.ts`

**Interfaces:**
- Consumes: `Position` from `@xyflow/react`; `Box` from `./floating` (re-exported here, moved for real in Task 8).
- Produces:
  - `PORT_PITCH = 24`
  - `portCount(sideLength: number): number`
  - `portPoint(box: Box, side: Position, index: number, count: number): { x: number; y: number }`
  - `type NodeKind = 'child' | 'external'`
  - `chooseSides(source: Box, target: Box, sourceKind: NodeKind, targetKind: NodeKind): { sourceSide: Position; targetSide: Position }`

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/features/canvas/edges/ports.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { Position } from '@xyflow/react';
import { PORT_PITCH, portCount, portPoint, chooseSides } from '@/features/canvas/edges/ports';

const box = (x: number, y: number, width = 220, height = 92) => ({ x, y, width, height });

describe('portCount', () => {
  it('fits as many whole PORT_PITCH steps as the side allows', () => {
    expect(portCount(220)).toBe(9);   // 220 / 24 = 9.16
    expect(portCount(92)).toBe(3);    //  92 / 24 = 3.83
  });

  it('never returns zero, however short the side', () => {
    expect(portCount(4)).toBe(1);
    expect(portCount(0)).toBe(1);
  });

  it('uses PORT_PITCH as a MINIMUM pitch — real pitch fills the side', () => {
    const n = portCount(220);
    expect(220 / n).toBeGreaterThanOrEqual(PORT_PITCH);
  });
});

describe('portPoint', () => {
  it('spaces ports evenly down a left side, centred, first at half a pitch', () => {
    const b = box(100, 200);
    expect(portPoint(b, Position.Left, 0, 3)).toEqual({ x: 100, y: 200 + 92 / 6 });
    expect(portPoint(b, Position.Left, 1, 3)).toEqual({ x: 100, y: 200 + 92 / 2 });
    expect(portPoint(b, Position.Left, 2, 3)).toEqual({ x: 100, y: 200 + (5 * 92) / 6 });
  });

  it('puts a right-side port on the far edge at the same heights', () => {
    const b = box(100, 200);
    expect(portPoint(b, Position.Right, 1, 3)).toEqual({ x: 320, y: 246 });
  });

  it('spaces ports across the top and bottom by x', () => {
    const b = box(0, 0);
    expect(portPoint(b, Position.Top, 0, 2)).toEqual({ x: 55, y: 0 });
    expect(portPoint(b, Position.Bottom, 1, 2)).toEqual({ x: 165, y: 92 });
  });

  it('clamps an out-of-range index rather than leaving the box', () => {
    const b = box(0, 0);
    expect(portPoint(b, Position.Left, 9, 3)).toEqual(portPoint(b, Position.Left, 2, 3));
    expect(portPoint(b, Position.Left, -4, 3)).toEqual(portPoint(b, Position.Left, 0, 3));
  });
});

describe('chooseSides', () => {
  it('sends an external on the left in through its right face', () => {
    const s = chooseSides(box(0, 100), box(400, 100), 'external', 'child');
    expect(s).toEqual({ sourceSide: Position.Right, targetSide: Position.Left });
  });

  it('sends an external on the right in through its left face', () => {
    const s = chooseSides(box(400, 100), box(0, 100), 'external', 'child');
    expect(s).toEqual({ sourceSide: Position.Left, targetSide: Position.Right });
  });

  it('uses top and bottom between two children, matching dagre TB ranks', () => {
    const s = chooseSides(box(0, 0), box(0, 300), 'child', 'child');
    expect(s).toEqual({ sourceSide: Position.Bottom, targetSide: Position.Top });
  });

  it('uses left and right between two children on the same rank', () => {
    const s = chooseSides(box(0, 0), box(500, 0), 'child', 'child');
    expect(s).toEqual({ sourceSide: Position.Right, targetSide: Position.Left });
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd apps/web && pnpm vitest run test/features/canvas/edges/ports.test.ts`
Expected: FAIL — `Failed to resolve import "@/features/canvas/edges/ports"`.

- [ ] **Step 3: Implement `ports.ts`**

Create `apps/web/src/features/canvas/edges/ports.ts`:

```ts
import { Position } from '@xyflow/react';
import type { Box } from './floating';

export type { Box };

/**
 * MINIMUM spacing between two ports on the same side. The real pitch is `side / portCount(side)`,
 * which is always >= this — ports fill the side rather than clustering at its centre, because the
 * whole point is to keep arriving edges apart.
 */
export const PORT_PITCH = 24;

/** How many ports a side of the given length carries. Never zero: a tiny node still needs one. */
export function portCount(sideLength: number): number {
  return Math.max(1, Math.floor(sideLength / PORT_PITCH));
}

/** The `index`-th of `count` ports on `side`, at (index + 0.5) / count along it. */
export function portPoint(box: Box, side: Position, index: number, count: number): { x: number; y: number } {
  const n = Math.max(1, count);
  const i = Math.min(n - 1, Math.max(0, index));
  const t = (i + 0.5) / n;
  switch (side) {
    case Position.Left:   return { x: box.x, y: box.y + box.height * t };
    case Position.Right:  return { x: box.x + box.width, y: box.y + box.height * t };
    case Position.Top:    return { x: box.x + box.width * t, y: box.y };
    default:              return { x: box.x + box.width * t, y: box.y + box.height };
  }
}

export type NodeKind = 'child' | 'external';

const opposite = (p: Position): Position =>
  p === Position.Left ? Position.Right : p === Position.Right ? Position.Left
    : p === Position.Top ? Position.Bottom : Position.Top;

/**
 * Which face each end uses. Rule-based rather than nearest-point, because a nearest-point anchor
 * gives every edge a different exit angle and that is what makes shallow crossings unreadable.
 *
 * - An external always uses the face pointing at the cluster, and the child answers on the
 *   opposite face — that is what gives the diagram its left-to-right grain.
 * - Two children use top/bottom, matching dagre's TB rank direction, unless they share a rank
 *   (comparable y), in which case left/right reads better than a U-turn.
 */
export function chooseSides(
  source: Box, target: Box, sourceKind: NodeKind, targetKind: NodeKind,
): { sourceSide: Position; targetSide: Position } {
  const dx = (target.x + target.width / 2) - (source.x + source.width / 2);
  const dy = (target.y + target.height / 2) - (source.y + source.height / 2);
  const horizontal = (): { sourceSide: Position; targetSide: Position } =>
    dx >= 0
      ? { sourceSide: Position.Right, targetSide: Position.Left }
      : { sourceSide: Position.Left, targetSide: Position.Right };

  if (sourceKind === 'external' || targetKind === 'external') return horizontal();
  if (Math.abs(dy) <= source.height) return horizontal();
  return dy >= 0
    ? { sourceSide: Position.Bottom, targetSide: Position.Top }
    : { sourceSide: Position.Top, targetSide: Position.Bottom };
}

export { opposite };
```

- [ ] **Step 4: Run it to make sure it passes**

Run: `cd apps/web && pnpm vitest run test/features/canvas/edges/ports.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
cd /c/projects/hyphae
git status --short
git add apps/web/src/features/canvas/edges/ports.ts apps/web/test/features/canvas/edges/ports.test.ts
git commit -m "$(cat <<'EOF'
feat(web): add port geometry and rule-based side selection

Ports quantise where an edge may touch a node. PORT_PITCH is a minimum, not
the actual pitch: ports fill the side, so a 220px side carries 9 and a 92px
side 3, and arriving edges stay apart instead of converging on one border
point. Side selection is rule-based because a nearest-point anchor gives every
edge its own exit angle, which is exactly what makes shallow crossings hard to
read.

Nothing consumes this yet; it is wired in Task 7.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Lane assignment

**Files:**
- Create: `apps/web/src/features/canvas/edges/lanes.ts`
- Create: `apps/web/test/features/canvas/edges/lanes.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `LANE_PITCH = 18`, `LANE_MARGIN = 12`
  - `type Span = { id: string; y0: number; y1: number }`
  - `assignLanes(spans: Span[]): Record<string, number>`
  - `laneSlots(assign: Record<string, number>): number`
  - `gutterWidth(lanes: number): number`
  - `laneX(gutterLeft: number, lane: number): number`

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/features/canvas/edges/lanes.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { assignLanes, laneSlots, gutterWidth, laneX, LANE_PITCH, LANE_MARGIN } from '@/features/canvas/edges/lanes';

describe('assignLanes', () => {
  it('gives disjoint spans the SAME lane — density, not edge count, drives width', () => {
    const a = assignLanes([
      { id: 'a', y0: 0, y1: 100 },
      { id: 'b', y0: 200, y1: 300 },
      { id: 'c', y0: 400, y1: 500 },
    ]);
    expect(a).toEqual({ a: 0, b: 0, c: 0 });
    expect(laneSlots(a)).toBe(1);
  });

  it('gives overlapping spans different lanes', () => {
    const a = assignLanes([
      { id: 'a', y0: 0, y1: 300 },
      { id: 'b', y0: 100, y1: 400 },
      { id: 'c', y0: 200, y1: 500 },
    ]);
    expect(new Set(Object.values(a)).size).toBe(3);
    expect(laneSlots(a)).toBe(3);
  });

  it('uses exactly as many lanes as the peak overlap, not the edge count', () => {
    // Two overlap at a time, six spans total.
    const a = assignLanes([
      { id: 'a', y0: 0, y1: 100 }, { id: 'b', y0: 50, y1: 150 },
      { id: 'c', y0: 200, y1: 300 }, { id: 'd', y0: 250, y1: 350 },
      { id: 'e', y0: 400, y1: 500 }, { id: 'f', y0: 450, y1: 550 },
    ]);
    expect(laneSlots(a)).toBe(2);
  });

  it('is deterministic regardless of input order', () => {
    const spans = [
      { id: 'a', y0: 0, y1: 300 },
      { id: 'b', y0: 100, y1: 400 },
      { id: 'c', y0: 500, y1: 600 },
    ];
    expect(assignLanes([...spans].reverse())).toEqual(assignLanes(spans));
  });

  it('normalises an inverted span rather than dropping it', () => {
    const a = assignLanes([{ id: 'a', y0: 400, y1: 100 }, { id: 'b', y0: 200, y1: 300 }]);
    expect(new Set(Object.values(a)).size).toBe(2);
  });

  it('returns an empty map for no spans', () => {
    expect(assignLanes([])).toEqual({});
    expect(laneSlots({})).toBe(0);
  });
});

describe('gutterWidth', () => {
  it('never drops below the historical 120px COL_GAP', () => {
    expect(gutterWidth(0)).toBe(120);
    expect(gutterWidth(1)).toBe(120);
  });

  it('grows to fit the lanes once they need more than the floor', () => {
    expect(gutterWidth(20)).toBe(20 * LANE_PITCH + 2 * LANE_MARGIN);
  });
});

describe('laneX', () => {
  it('places lane 0 one margin in from the gutter edge and steps by LANE_PITCH', () => {
    expect(laneX(1000, 0)).toBe(1000 + LANE_MARGIN);
    expect(laneX(1000, 2)).toBe(1000 + LANE_MARGIN + 2 * LANE_PITCH);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd apps/web && pnpm vitest run test/features/canvas/edges/lanes.test.ts`
Expected: FAIL — `Failed to resolve import "@/features/canvas/edges/lanes"`.

- [ ] **Step 3: Implement `lanes.ts`**

Create `apps/web/src/features/canvas/edges/lanes.ts`:

```ts
/** Horizontal distance between two adjacent lanes. Must clear a rotated label's LINE HEIGHT (~13px),
 *  not its text width — a label riding a lane is turned 90°, so its width runs down the lane. */
export const LANE_PITCH = 18;
/** Clearance between the outermost lane and each side of the gutter. */
export const LANE_MARGIN = 12;
/** The gutter never shrinks below the COL_GAP the layout used before lanes existed. */
const GUTTER_FLOOR = 120;

/** The vertical extent of one edge's run through a gutter. */
export type Span = { id: string; y0: number; y1: number };

/**
 * Assign each span a lane, sharing a lane between spans that cannot collide.
 *
 * This is left-edge channel routing: sort by the top of the span, then give each span the lowest
 * lane whose previous occupant already ended above it. The number of lanes is therefore the
 * channel DENSITY — the peak number of simultaneously open spans — not the number of edges. That
 * distinction is what makes lanes affordable at all: Process Layer sends ~61 edges across a gutter,
 * but only a fraction of them are open at any one height.
 *
 * Sorting breaks ties on y1 and then id so the result is independent of input order, which matters
 * because a memoized view must not reshuffle lanes when nothing meaningful changed.
 */
export function assignLanes(spans: Span[]): Record<string, number> {
  const norm = spans.map((s) => ({ id: s.id, y0: Math.min(s.y0, s.y1), y1: Math.max(s.y0, s.y1) }));
  norm.sort((a, b) => a.y0 - b.y0 || a.y1 - b.y1 || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const laneEnd: number[] = [];   // laneEnd[i] = y1 of the last span placed in lane i
  const out: Record<string, number> = {};
  for (const s of norm) {
    let lane = laneEnd.findIndex((end) => end < s.y0);
    if (lane === -1) { lane = laneEnd.length; laneEnd.push(s.y1); }
    else laneEnd[lane] = s.y1;
    out[s.id] = lane;
  }
  return out;
}

/** How many distinct lanes an assignment occupies. */
export function laneSlots(assign: Record<string, number>): number {
  const vals = Object.values(assign);
  return vals.length ? Math.max(...vals) + 1 : 0;
}

/** How wide a gutter must be to hold `lanes` lanes, floored at the historical COL_GAP. */
export function gutterWidth(lanes: number): number {
  return Math.max(GUTTER_FLOOR, lanes * LANE_PITCH + 2 * LANE_MARGIN);
}

/** The absolute x of a lane, measured from the gutter's left edge. */
export function laneX(gutterLeft: number, lane: number): number {
  return gutterLeft + LANE_MARGIN + lane * LANE_PITCH;
}
```

- [ ] **Step 4: Run it to make sure it passes**

Run: `cd apps/web && pnpm vitest run test/features/canvas/edges/lanes.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
cd /c/projects/hyphae
git status --short
git add apps/web/src/features/canvas/edges/lanes.ts apps/web/test/features/canvas/edges/lanes.test.ts
git commit -m "$(cat <<'EOF'
feat(web): assign gutter lanes by left-edge channel routing

One lane per edge does not fit — Process Layer sends ~61 external-touching
edges across a 120px gap. Sharing a lane between spans that are disjoint in y
makes the lane count the channel DENSITY rather than the edge count, which is
what makes the whole idea affordable.

LANE_PITCH is 18 because a lane label is rotated 90°, so what has to fit
between two lanes is its line height, not its text width.

Nothing consumes this yet; layout picks it up in Task 6.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Path generators

**Files:**
- Create: `apps/web/src/features/canvas/edges/paths.ts`
- Create: `apps/web/test/features/canvas/edges/paths.test.ts`

**Interfaces:**
- Consumes: `Position` from `@xyflow/react`, `XY` from `@/features/canvas/layout`.
- Produces:
  - `type Anchor = { x: number; y: number; side: Position }`
  - `type DrawnPath = { d: string; labelX: number; labelY: number; labelAngle: number; points: XY[] }`
  - `squaredPath(s: Anchor, t: Anchor, lane?: number): DrawnPath`
  - `curvedPath(s: Anchor, t: Anchor): DrawnPath`

`points` is the polyline the crossing metric measures; for `curvedPath` it is the chord.

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/features/canvas/edges/paths.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { Position } from '@xyflow/react';
import { squaredPath, curvedPath } from '@/features/canvas/edges/paths';

const right = (x: number, y: number) => ({ x, y, side: Position.Right });
const left = (x: number, y: number) => ({ x, y, side: Position.Left });

describe('squaredPath', () => {
  it('draws a straight horizontal when both ends share a y and there is no lane', () => {
    const p = squaredPath(right(0, 50), left(200, 50));
    expect(p.points).toEqual([{ x: 0, y: 50 }, { x: 200, y: 50 }]);
    expect(p.labelAngle).toBe(0);
  });

  it('runs out, down the lane, and in again when a lane is given', () => {
    const p = squaredPath(right(0, 20), left(200, 180), 100);
    expect(p.points).toEqual([
      { x: 0, y: 20 }, { x: 100, y: 20 }, { x: 100, y: 180 }, { x: 200, y: 180 },
    ]);
  });

  it('rides the lane with a rotated label centred on the vertical run', () => {
    const p = squaredPath(right(0, 20), left(200, 180), 100);
    expect(p.labelAngle).toBe(-90);
    expect(p.labelX).toBe(100);
    expect(p.labelY).toBe(100);
  });

  it('labels a lane-less path horizontally at the midpoint of its longest segment', () => {
    const p = squaredPath(right(0, 50), left(300, 50));
    expect(p.labelAngle).toBe(0);
    expect(p.labelX).toBe(150);
    expect(p.labelY).toBe(50);
  });

  it('emits a path string that starts at the source and contains rounded corners', () => {
    const p = squaredPath(right(0, 20), left(200, 180), 100);
    expect(p.d.startsWith('M 0,20')).toBe(true);
    expect(p.d).toContain('Q');
  });

  it('leaves top/bottom anchors vertical-first', () => {
    const p = squaredPath({ x: 50, y: 0, side: Position.Bottom }, { x: 150, y: 200, side: Position.Top });
    expect(p.points).toEqual([
      { x: 50, y: 0 }, { x: 50, y: 100 }, { x: 150, y: 100 }, { x: 150, y: 200 },
    ]);
  });
});

describe('curvedPath', () => {
  it('emits a cubic bezier between the two anchors', () => {
    const p = curvedPath(right(0, 20), left(200, 180));
    expect(p.d.startsWith('M 0,20')).toBe(true);
    expect(p.d).toContain('C');
  });

  it('never rotates its label, since it has no lane to ride', () => {
    expect(curvedPath(right(0, 20), left(200, 180)).labelAngle).toBe(0);
  });

  it('reports the chord as its polyline, for the crossing metric', () => {
    expect(curvedPath(right(0, 20), left(200, 180)).points)
      .toEqual([{ x: 0, y: 20 }, { x: 200, y: 180 }]);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd apps/web && pnpm vitest run test/features/canvas/edges/paths.test.ts`
Expected: FAIL — `Failed to resolve import "@/features/canvas/edges/paths"`.

- [ ] **Step 3: Implement `paths.ts`**

Create `apps/web/src/features/canvas/edges/paths.ts`:

```ts
import { Position } from '@xyflow/react';
import type { XY } from '@/features/canvas/layout';

export type Anchor = { x: number; y: number; side: Position };

export type DrawnPath = {
  d: string;
  labelX: number;
  labelY: number;
  /** -90 when the label rides a vertical lane, 0 otherwise. */
  labelAngle: number;
  /** The path as a polyline. The crossing metric measures this, so it must not be a decoration. */
  points: XY[];
};

const CORNER = 8;
const isVertical = (s: Position) => s === Position.Top || s === Position.Bottom;

/** `d` for a polyline with rounded corners: straight runs joined by quadratic elbows. */
function roundedD(pts: XY[]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1]; const cur = pts[i]; const next = pts[i + 1];
    const inLen = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    const outLen = Math.hypot(next.x - cur.x, next.y - cur.y);
    const r = Math.min(CORNER, inLen / 2, outLen / 2);
    if (r <= 0) { d += ` L ${cur.x},${cur.y}`; continue; }
    const a = { x: cur.x + ((prev.x - cur.x) / inLen) * r, y: cur.y + ((prev.y - cur.y) / inLen) * r };
    const b = { x: cur.x + ((next.x - cur.x) / outLen) * r, y: cur.y + ((next.y - cur.y) / outLen) * r };
    d += ` L ${a.x},${a.y} Q ${cur.x},${cur.y} ${b.x},${b.y}`;
  }
  const last = pts[pts.length - 1];
  return `${d} L ${last.x},${last.y}`;
}

/** Midpoint of the longest segment in a polyline — the only place a horizontal label reliably fits. */
function longestSegmentMid(pts: XY[]): XY {
  let best = { x: pts[0].x, y: pts[0].y };
  let bestLen = -1;
  for (let i = 1; i < pts.length; i++) {
    const len = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (len > bestLen) {
      bestLen = len;
      best = { x: (pts[i].x + pts[i - 1].x) / 2, y: (pts[i].y + pts[i - 1].y) / 2 };
    }
  }
  return best;
}

/**
 * Orthogonal route. With a lane, three runs: out of the source, down the lane, into the target —
 * and the label turns 90° to ride the lane. Without one, either a straight line (ends already
 * aligned) or a single dogleg at the midpoint.
 */
export function squaredPath(s: Anchor, t: Anchor, lane?: number): DrawnPath {
  const vertical = isVertical(s.side);
  let points: XY[];
  let labelAngle = 0;
  let label: XY;

  if (lane !== undefined && !vertical) {
    points = [{ x: s.x, y: s.y }, { x: lane, y: s.y }, { x: lane, y: t.y }, { x: t.x, y: t.y }];
    labelAngle = -90;
    label = { x: lane, y: (s.y + t.y) / 2 };
  } else if (vertical) {
    const midY = (s.y + t.y) / 2;
    points = s.x === t.x
      ? [{ x: s.x, y: s.y }, { x: t.x, y: t.y }]
      : [{ x: s.x, y: s.y }, { x: s.x, y: midY }, { x: t.x, y: midY }, { x: t.x, y: t.y }];
    label = longestSegmentMid(points);
  } else {
    const midX = (s.x + t.x) / 2;
    points = s.y === t.y
      ? [{ x: s.x, y: s.y }, { x: t.x, y: t.y }]
      : [{ x: s.x, y: s.y }, { x: midX, y: s.y }, { x: midX, y: t.y }, { x: t.x, y: t.y }];
    label = longestSegmentMid(points);
  }

  return { d: roundedD(points), labelX: label.x, labelY: label.y, labelAngle, points };
}

/** Bezier leaving and arriving perpendicular to the anchor faces. Ignores lanes by design. */
export function curvedPath(s: Anchor, t: Anchor): DrawnPath {
  const reach = Math.max(40, Math.abs(t.x - s.x) / 2, Math.abs(t.y - s.y) / 2);
  const off = (a: Anchor): XY => {
    switch (a.side) {
      case Position.Left:  return { x: a.x - reach, y: a.y };
      case Position.Right: return { x: a.x + reach, y: a.y };
      case Position.Top:   return { x: a.x, y: a.y - reach };
      default:             return { x: a.x, y: a.y + reach };
    }
  };
  const c1 = off(s);
  const c2 = off(t);
  return {
    d: `M ${s.x},${s.y} C ${c1.x},${c1.y} ${c2.x},${c2.y} ${t.x},${t.y}`,
    labelX: (s.x + t.x) / 2,
    labelY: (s.y + t.y) / 2,
    labelAngle: 0,
    points: [{ x: s.x, y: s.y }, { x: t.x, y: t.y }],
  };
}
```

- [ ] **Step 4: Run it to make sure it passes**

Run: `cd apps/web && pnpm vitest run test/features/canvas/edges/paths.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
cd /c/projects/hyphae
git status --short
git add apps/web/src/features/canvas/edges/paths.ts apps/web/test/features/canvas/edges/paths.test.ts
git commit -m "$(cat <<'EOF'
feat(web): add the squared and curved path generators

Two generators over identical input, differing only in the d string, which is
what makes an edge-style toggle one line of state rather than a second router.
Each also returns its polyline, because the crossing metric has to measure the
path actually drawn rather than a chord standing in for it.

A squared path riding a lane reports labelAngle -90: the label turns to run up
the lane, which is the only way text fits in an 18px channel.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `routeEdges` — the assignment pass

**Files:**
- Create: `apps/web/src/features/canvas/edges/routeEdges.ts`
- Create: `apps/web/test/features/canvas/edges/routeEdges.test.ts`

**Interfaces:**
- Consumes: `chooseSides`, `portCount`, `portPoint`, `NodeKind` (Task 2); `assignLanes`, `laneX`, `Span` (Task 3); `NODE_W`, `NODE_H`, `XY` from `@/features/canvas/layout`.
- Produces:
  - `type Route = { sourceSide: Position; sourcePort: number; sourcePortCount: number; targetSide: Position; targetPort: number; targetPortCount: number; lane?: number }`
  - `type RouteInput = { id: string; source: string; target: string }`
  - `type Gutters = { leftGutterX: number; rightGutterX: number; clusterMinX: number; clusterMaxX: number }`
  - `routeEdges(edges: RouteInput[], positions: Record<string, XY>, kinds: Record<string, NodeKind>, gutters: Gutters): Record<string, Route>`
  - `fallbackRoute(source: XY, target: XY): Route`

`leftGutterX` and `rightGutterX` are the absolute x at which each gutter **begins** — that is, the
right edge of the left column, and the right edge of the children cluster. `clusterMinX` /
`clusterMaxX` are the cluster's own bounds. The names are spelled out because "left" alone reads
ambiguously as either the gutter's left edge or the left-hand gutter.

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/features/canvas/edges/routeEdges.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { Position } from '@xyflow/react';
import { routeEdges, fallbackRoute } from '@/features/canvas/edges/routeEdges';
import { NODE_W, NODE_H, type XY } from '@/features/canvas/layout';
import type { NodeKind } from '@/features/canvas/edges/ports';

// A cluster of two children at x=500, an external column on each side.
const positions: Record<string, XY> = {
  c1: { x: 500, y: 0 },
  c2: { x: 500, y: 300 },
  extL: { x: 100, y: 0 },
  extL2: { x: 100, y: 400 },
  extR: { x: 900, y: 0 },
};
const kinds: Record<string, NodeKind> = {
  c1: 'child', c2: 'child', extL: 'external', extL2: 'external', extR: 'external',
};
// Left gutter runs from the right edge of the left column (100 + 220) to the cluster (500).
// Right gutter runs from the right edge of the cluster (720) to the right column (900).
const gutters = { leftGutterX: 320, rightGutterX: 720, clusterMinX: 500, clusterMaxX: 720 };

describe('routeEdges', () => {
  it('gives every edge a route', () => {
    const r = routeEdges(
      [{ id: 'e1', source: 'extL', target: 'c1' }, { id: 'e2', source: 'c1', target: 'c2' }],
      positions, kinds, gutters,
    );
    expect(Object.keys(r).sort()).toEqual(['e1', 'e2']);
  });

  it('anchors a left external on its right face and the child on its left', () => {
    const r = routeEdges([{ id: 'e1', source: 'extL', target: 'c1' }], positions, kinds, gutters);
    expect(r.e1.sourceSide).toBe(Position.Right);
    expect(r.e1.targetSide).toBe(Position.Left);
  });

  it('puts an external run in the gutter on the external side', () => {
    const r = routeEdges([{ id: 'e1', source: 'extL2', target: 'c1' }], positions, kinds, gutters);
    expect(r.e1.lane).toBeGreaterThanOrEqual(gutters.leftGutterX);
    expect(r.e1.lane).toBeLessThan(gutters.clusterMinX);
  });

  it('puts a right-hand external run in the right gutter', () => {
    const r = routeEdges([{ id: 'e3', source: 'c2', target: 'extR' }], positions, kinds, gutters);
    expect(r.e3.lane).toBeGreaterThanOrEqual(gutters.rightGutterX);
    expect(r.e3.lane).toBeLessThan(900);
  });

  it('gives a child-to-child edge no lane', () => {
    const r = routeEdges([{ id: 'e2', source: 'c1', target: 'c2' }], positions, kinds, gutters);
    expect(r.e2.lane).toBeUndefined();
  });

  it('gives two edges into the same side of a node different ports', () => {
    const r = routeEdges(
      [{ id: 'a', source: 'extL', target: 'c1' }, { id: 'b', source: 'extL2', target: 'c1' }],
      positions, kinds, gutters,
    );
    expect(r.a.targetPort).not.toBe(r.b.targetPort);
  });

  it('reports the port count that was used, so resolution cannot disagree', () => {
    const r = routeEdges([{ id: 'e1', source: 'extL', target: 'c1' }], positions, kinds, gutters);
    expect(r.e1.targetPortCount).toBe(Math.max(1, Math.floor(NODE_H / 24)));
  });

  it('orders ports on a side by the other endpoint, so arrivals do not invert', () => {
    // extL is above extL2; their ports on c1's left side must keep that order.
    const r = routeEdges(
      [{ id: 'lo', source: 'extL2', target: 'c1' }, { id: 'hi', source: 'extL', target: 'c1' }],
      positions, kinds, gutters,
    );
    expect(r.hi.targetPort).toBeLessThan(r.lo.targetPort);
  });

  it('is deterministic regardless of edge order', () => {
    const edges = [
      { id: 'a', source: 'extL', target: 'c1' },
      { id: 'b', source: 'extL2', target: 'c1' },
      { id: 'c', source: 'c1', target: 'c2' },
    ];
    expect(routeEdges([...edges].reverse(), positions, kinds, gutters))
      .toEqual(routeEdges(edges, positions, kinds, gutters));
  });

  it('skips an edge whose endpoint has no position rather than placing it at the origin', () => {
    const r = routeEdges([{ id: 'x', source: 'ghost', target: 'c1' }], positions, kinds, gutters);
    expect(r.x).toBeUndefined();
  });
});

describe('fallbackRoute', () => {
  it('faces the two boxes at each other on port 0 of 1', () => {
    const r = fallbackRoute({ x: 0, y: 0 }, { x: 500, y: 0 });
    expect(r).toEqual({
      sourceSide: Position.Right, sourcePort: 0, sourcePortCount: 1,
      targetSide: Position.Left, targetPort: 0, targetPortCount: 1,
    });
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd apps/web && pnpm vitest run test/features/canvas/edges/routeEdges.test.ts`
Expected: FAIL — `Failed to resolve import "@/features/canvas/edges/routeEdges"`.

- [ ] **Step 3: Implement `routeEdges.ts`**

Create `apps/web/src/features/canvas/edges/routeEdges.ts`:

```ts
import { Position } from '@xyflow/react';
import { NODE_W, NODE_H, type XY } from '@/features/canvas/layout';
import { chooseSides, portCount, portPoint, type Box, type NodeKind } from './ports';
import { assignLanes, laneX, type Span } from './lanes';

export type Route = {
  sourceSide: Position; sourcePort: number; sourcePortCount: number;
  targetSide: Position; targetPort: number; targetPortCount: number;
  /** Absolute x of the gutter lane this edge runs down. Absent when it needs no vertical run. */
  lane?: number;
};

export type RouteInput = { id: string; source: string; target: string };

/**
 * Absolute x, from the layout, of where each gutter BEGINS — the right edge of the left column, and
 * the right edge of the children cluster — plus the cluster's own bounds.
 */
export type Gutters = {
  leftGutterX: number; rightGutterX: number; clusterMinX: number; clusterMaxX: number;
};

const boxAt = (p: XY): Box => ({ x: p.x, y: p.y, width: NODE_W, height: NODE_H });
const centreY = (p: XY) => p.y + NODE_H / 2;
const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
/** Composite map key. `::` rather than the NUL separator focusViewToFlow used: node ids are UUIDs
 *  and the other parts are lowercase words, so `::` is already unambiguous, and a source file
 *  containing a raw NUL byte is silently skipped by ripgrep as binary. */
const key = (...parts: string[]) => parts.join('::');

/**
 * The per-view assignment pass: which face, which port, which lane, for every edge.
 *
 * It deliberately returns no absolute NODE coordinates — only sides, port indices and a gutter x.
 * FloatingEdge resolves those against React Flow's live measured geometry, which is what lets an
 * edge follow a node every frame of a drag while its port and lane stay put until the drag ends.
 *
 * Deterministic for a given input: every sort breaks ties on edge id.
 */
export function routeEdges(
  edges: RouteInput[],
  positions: Record<string, XY>,
  kinds: Record<string, NodeKind>,
  gutters: Gutters,
): Record<string, Route> {
  const drawable = edges
    .filter((e) => positions[e.source] && positions[e.target])
    .slice()
    .sort((a, b) => byId(a.id, b.id));

  // 1. Sides.
  const sides = new Map<string, { sourceSide: Position; targetSide: Position }>();
  for (const e of drawable) {
    sides.set(e.id, chooseSides(
      boxAt(positions[e.source]), boxAt(positions[e.target]),
      kinds[e.source] ?? 'child', kinds[e.target] ?? 'child',
    ));
  }

  // 2. Ports. Group by (node, side), order by the barycentre of the OTHER endpoint, then hand out
  //    indices in that order — the same trick layout.ts uses to order the external columns. It is
  //    what stops two edges inverting their order in the last few pixels and crossing at the box.
  type Slot = { edgeId: string; end: 'source' | 'target'; order: number };
  const bySide = new Map<string, { side: Position; slots: Slot[] }>();
  for (const e of drawable) {
    const s = sides.get(e.id)!;
    const push = (node: string, side: Position, end: 'source' | 'target', other: string) => {
      const k = key(node, side);
      const group = bySide.get(k) ?? { side, slots: [] };
      const horizontal = side === Position.Left || side === Position.Right;
      group.slots.push({
        edgeId: e.id, end,
        order: horizontal ? centreY(positions[other]) : positions[other].x,
      });
      bySide.set(k, group);
    };
    push(e.source, s.sourceSide, 'source', e.target);
    push(e.target, s.targetSide, 'target', e.source);
  }

  const portOf = new Map<string, number>();     // key(edgeId, end) -> port index
  const countOf = new Map<string, number>();    // key(edgeId, end) -> ports on that side
  // The side travels WITH the group rather than being parsed back out of the map key — a key is for
  // lookup, not for storage.
  for (const { side, slots } of bySide.values()) {
    const len = side === Position.Left || side === Position.Right ? NODE_H : NODE_W;
    const count = portCount(len);
    slots.sort((a, b) => a.order - b.order || byId(a.edgeId, b.edgeId));
    slots.forEach((slot, i) => {
      // Overflow shares the outermost port rather than refusing the edge; FloatingEdge fans the
      // duplicates apart. Ports quantise, they never reject.
      portOf.set(key(slot.edgeId, slot.end), Math.min(i, count - 1));
      countOf.set(key(slot.edgeId, slot.end), count);
    });
  }

  // 3. Lanes, one channel per gutter. Only an edge that both crosses a gutter and actually changes
  //    height needs one; an aligned pair is a straight horizontal and consumes nothing.
  const gutterOf = (e: RouteInput): 'left' | 'right' | null => {
    const sx = positions[e.source].x;
    const tx = positions[e.target].x;
    const extIsSource = (kinds[e.source] ?? 'child') === 'external';
    const extIsTarget = (kinds[e.target] ?? 'child') === 'external';
    if (extIsSource === extIsTarget) return null;   // both children, or both external
    const extX = extIsSource ? sx : tx;
    return extX < gutters.clusterMinX ? 'left' : extX >= gutters.clusterMaxX ? 'right' : null;
  };

  const spans: Record<'left' | 'right', Span[]> = { left: [], right: [] };
  const side0 = (e: RouteInput) => portPoint(
    boxAt(positions[e.source]), sides.get(e.id)!.sourceSide,
    portOf.get(key(e.id, 'source'))!, countOf.get(key(e.id, 'source'))!,
  );
  const side1 = (e: RouteInput) => portPoint(
    boxAt(positions[e.target]), sides.get(e.id)!.targetSide,
    portOf.get(key(e.id, 'target'))!, countOf.get(key(e.id, 'target'))!,
  );

  const needsLane = new Map<string, 'left' | 'right'>();
  for (const e of drawable) {
    const g = gutterOf(e);
    if (!g) continue;
    const a = side0(e);
    const b = side1(e);
    if (a.y === b.y) continue;   // straight horizontal: no vertical run, no lane
    needsLane.set(e.id, g);
    spans[g].push({ id: e.id, y0: a.y, y1: b.y });
  }
  const laneIdx = { left: assignLanes(spans.left), right: assignLanes(spans.right) };

  // 4. Assemble.
  const out: Record<string, Route> = {};
  for (const e of drawable) {
    const s = sides.get(e.id)!;
    const g = needsLane.get(e.id);
    out[e.id] = {
      sourceSide: s.sourceSide,
      sourcePort: portOf.get(key(e.id, 'source'))!,
      sourcePortCount: countOf.get(key(e.id, 'source'))!,
      targetSide: s.targetSide,
      targetPort: portOf.get(key(e.id, 'target'))!,
      targetPortCount: countOf.get(key(e.id, 'target'))!,
      ...(g ? { lane: laneX(gutters[g], laneIdx[g][e.id]) } : {}),
    };
  }
  return out;
}

/** For an edge the assignment pass never saw — it faces the two boxes at each other, mid-side. */
export function fallbackRoute(source: XY, target: XY): Route {
  const s = chooseSides(boxAt(source), boxAt(target), 'child', 'child');
  return {
    sourceSide: s.sourceSide, sourcePort: 0, sourcePortCount: 1,
    targetSide: s.targetSide, targetPort: 0, targetPortCount: 1,
  };
}
```

- [ ] **Step 4: Run it to make sure it passes**

Run: `cd apps/web && pnpm vitest run test/features/canvas/edges/routeEdges.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
cd /c/projects/hyphae
git status --short
git add apps/web/src/features/canvas/edges/routeEdges.ts apps/web/test/features/canvas/edges/routeEdges.test.ts
git commit -m "$(cat <<'EOF'
feat(web): assign a side, a port and a lane to every edge

The per-view assignment half of the router. It returns no absolute node
coordinates — only sides, port indices and a gutter x — which is what lets
FloatingEdge resolve against live measured geometry: an edge follows its node
every frame of a drag while its port and lane stay put until the drag ends.

Ports within a side are ordered by the barycentre of the other endpoint, the
same sort layout.ts already uses for the external columns; without it two
edges invert their order in the last few pixels and cross at the box.

Every sort breaks ties on edge id, so a memoized view cannot reshuffle lanes
when nothing meaningful changed.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Gutters sized from lane demand

`COL_GAP` stops being a constant. Lane assignment depends only on **y** spans and `COL_GAP` only affects **x**, so a provisional column placement gives an *exact* lane count, not an estimate — the columns can then be re-placed without invalidating it.

**Files:**
- Modify: `apps/web/src/features/canvas/layout.ts:17` (the `COL_GAP` constant) and `layoutFocusView`'s column placement (`:95-126`)
- Modify: `apps/web/test/features/canvas/layout.test.ts`

**Interfaces:**
- Consumes: `assignLanes`, `laneSlots`, `gutterWidth` (Task 3).
- Produces: `layoutFocusView` unchanged in signature; new export `gutterGeometry(view: FocusView, pos: Record<string, XY>): Gutters` returning the same shape `routeEdges` consumes.

- [ ] **Step 1: Write the failing test**

Append to `apps/web/test/features/canvas/layout.test.ts`:

The file already has a local `node(id, type = 'Component')` helper and builds `FocusView`s as object
literals — reuse both. Add `gutterGeometry` to the existing `@/features/canvas/layout` import at the
top of the file rather than writing a second import statement.

```ts
import { gutterWidth } from '@/features/canvas/edges/lanes';

const edge = (id: string, from: string, to: string) =>
  ({ id, from, to, count: 1, derived: false, realizedBy: [id] });

const viewOf = (externals: string[], edges: ReturnType<typeof edge>[]): FocusView => ({
  focusId: 'ca',
  focusNode: node('ca', 'Container'),
  children: [node('c1'), node('c2')],
  externals: externals.map((id) => node(id, 'Container')),
  edges,
});

describe('gutters sized from lane demand', () => {
  it('keeps the 120px gap when a single external needs one lane', () => {
    const view = viewOf(['e1'], [edge('a', 'e1', 'c1')]);
    const pos = layoutFocusView(view);
    const g = gutterGeometry(view, pos);
    expect(g.clusterMinX - g.leftGutterX).toBe(120);
  });

  it('widens the gutter when many runs overlap in y', () => {
    // Twelve incoming externals all reaching the SAME child: every span overlaps, so density is 12.
    const ids = Array.from({ length: 12 }, (_, i) => `e${i}`);
    const view = viewOf(ids, ids.map((id, i) => edge(`a${i}`, id, 'c1')));
    const pos = layoutFocusView(view);
    const g = gutterGeometry(view, pos);
    expect(g.clusterMinX - g.leftGutterX).toBeGreaterThan(120);
    expect(g.clusterMinX - g.leftGutterX).toBeLessThanOrEqual(gutterWidth(12));
  });

  it('sizes the two gutters independently', () => {
    // layoutFocusView calls an external INCOMING when it is the `from` of any edge, OUTGOING
    // otherwise — so 'out0' lands in the right-hand column.
    const ids = Array.from({ length: 10 }, (_, i) => `in${i}`);
    const view = viewOf(
      [...ids, 'out0'],
      [...ids.map((id, i) => edge(`i${i}`, id, 'c1')), edge('o', 'c1', 'out0')],
    );
    const pos = layoutFocusView(view);
    const g = gutterGeometry(view, pos);
    const left = g.clusterMinX - g.leftGutterX;
    const right = pos.out0.x - g.rightGutterX;
    expect(left).toBeGreaterThan(right);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd apps/web && pnpm vitest run test/features/canvas/layout.test.ts`
Expected: FAIL — `gutterGeometry` is not exported.

- [ ] **Step 3: Implement in `layout.ts`**

Replace the fixed `COL_GAP` usage in `layoutFocusView`'s column placement with a two-pass placement, and export `gutterGeometry`:

```ts
import { assignLanes, laneSlots, gutterWidth, type Span } from './edges/lanes';

// ...

/** The historical fixed gap, now only the floor that gutterWidth() enforces. */
const COL_GAP = 120;
```

Inside `layoutFocusView`, after `incoming` / `outgoing` are sorted by barycentre, replace the two
`placeColumn` calls with:

```ts
  // Place the columns twice. Lane demand depends only on the Y spans of the runs, and a column's y
  // is fixed by midY and ROW_GAP — COL_GAP only moves x. So a provisional placement yields the
  // EXACT lane count, and re-placing the columns at the widened gap cannot invalidate it.
  placeColumn(incoming, minX - COL_GAP - NODE_W);
  placeColumn(outgoing, maxX + COL_GAP);

  const laneDemand = (ids: string[]): number => {
    const set = new Set(ids);
    const spans: Span[] = [];
    for (const e of view.edges) {
      const ext = set.has(e.from) ? e.from : set.has(e.to) ? e.to : null;
      if (ext === null) continue;
      const a = pos[e.from];
      const b = pos[e.to];
      if (!a || !b) continue;
      const y0 = a.y + NODE_H / 2;
      const y1 = b.y + NODE_H / 2;
      if (y0 === y1) continue;   // straight horizontal: consumes no lane
      spans.push({ id: e.id, y0, y1 });
    }
    return laneSlots(assignLanes(spans));
  };

  const leftGap = gutterWidth(laneDemand(incoming));
  const rightGap = gutterWidth(laneDemand(outgoing));
  placeColumn(incoming, minX - leftGap - NODE_W);
  placeColumn(outgoing, maxX + rightGap);
```

Then add, at module level:

```ts
/**
 * Where each gutter BEGINS and where the children cluster sits, in absolute x — the shape
 * routeEdges consumes.
 *
 * The left gutter is the empty band between the right edge of the left column and the cluster; the
 * right gutter is the band between the cluster and the left edge of the right column. So
 * `rightGutterX` is simply `clusterMaxX`: the right gutter starts where the cluster ends. Both are
 * kept as named fields because "left" on its own reads as either "the left gutter" or "the left
 * edge of a gutter", and that ambiguity is worth a redundant field.
 */
export function gutterGeometry(
  view: FocusView, pos: Record<string, XY>,
): { leftGutterX: number; rightGutterX: number; clusterMinX: number; clusterMaxX: number } {
  const xs = view.children.map((n) => pos[n.id]?.x).filter((x): x is number => x !== undefined);
  const clusterMinX = xs.length ? Math.min(...xs) : 0;
  const clusterMaxX = xs.length ? Math.max(...xs) + NODE_W : NODE_W;
  const extXs = view.externals.map((n) => pos[n.id]?.x).filter((x): x is number => x !== undefined);
  const leftCol = extXs.filter((x) => x < clusterMinX);
  return {
    // Right edge of the rightmost left-column box; with no left column, the historical gap.
    leftGutterX: leftCol.length ? Math.max(...leftCol) + NODE_W : clusterMinX - COL_GAP,
    rightGutterX: clusterMaxX,
    clusterMinX,
    clusterMaxX,
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `cd apps/web && pnpm vitest run test/features/canvas/layout.test.ts`
Expected: PASS — the three new tests plus every pre-existing layout test.

- [ ] **Step 5: Run the whole web suite**

Run: `cd apps/web && pnpm vitest run`
Expected: all green. If a pre-existing test asserted an exact external x that assumed `COL_GAP === 120`, update it — the value is now derived, and the test should assert the *relationship* (gap ≥ 120) rather than the literal.

- [ ] **Step 6: Commit**

```bash
cd /c/projects/hyphae
git status --short
git add apps/web/src/features/canvas/layout.ts apps/web/test/features/canvas/layout.test.ts
git commit -m "$(cat <<'EOF'
feat(web): size each gutter from its lane demand

COL_GAP stops being a constant and becomes a per-gutter value. The columns are
placed twice: lane demand depends only on the Y spans of the runs, and a
column's y is fixed by midY and ROW_GAP while COL_GAP moves only x — so the
provisional placement yields an EXACT lane count and re-placing at the widened
gap cannot invalidate it.

The two gutters size independently, so a heavy incoming column does not push
the outgoing column out for nothing.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Wire the router into the canvas

The switchover. Renderer and provider change together so the app is never broken between tasks.

**Files:**
- Modify: `apps/web/src/features/canvas/edges/FloatingEdge.tsx` (rewrite)
- Modify: `apps/web/src/features/canvas/useCanvasView.ts` (absorb `decorateFlowEdges`, add the route memo)
- Modify: `apps/web/src/features/canvas/Canvas.tsx:101` (drop its own `decorateFlowEdges` memo)
- Modify: `apps/web/test/features/canvas/Canvas.test.tsx` (only if a test breaks)

**Interfaces:**
- Consumes: `Route`, `routeEdges`, `fallbackRoute` (Task 5); `portPoint`, `boxOf`, `fanEdgeParams` (Tasks 2 / existing); `squaredPath`, `curvedPath` (Task 4); `gutterGeometry` (Task 6).
- Produces: `CanvasView` gains `displayEdges: FlowEdge[]`; `edges` keeps its current meaning (undecorated, used by the highlight logic).

- [ ] **Step 1: Rewrite `FloatingEdge.tsx`**

```tsx
import { BaseEdge, EdgeLabelRenderer, useInternalNode, type EdgeProps } from '@xyflow/react';
import { boxOf, portPoint } from './ports';
import { squaredPath, curvedPath, type Anchor } from './paths';
import { fallbackRoute, type Route } from './routeEdges';
import { useStore } from '@/state/store';

/** Class on the portaled edge label. Shared with Canvas's highlight CSS, which cannot reach the
 *  label through `.react-flow__edge` — the label renders outside the edge's <g>. */
export const EDGE_LABEL_CLASS = 'hyphae-edge-label';

/**
 * Resolves a precomputed Route against live geometry and draws it.
 *
 * The route is ASSIGNED once per view (routeEdges) and RESOLVED here every render. That is what
 * makes dragging read well: node positions only reach the store on drag stop, so the port and lane
 * stay fixed while these endpoints track the node every frame — the edge follows the box, and its
 * port snaps at the end rather than sliding along the border throughout.
 */
export function FloatingEdge({ id, source, target, style, markerEnd, markerStart, label, labelStyle, labelBgStyle, data }: EdgeProps) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const edgeStyle = useStore((s) => s.edgeStyle);
  if (!sourceNode || !targetNode) return null;

  const sBox = boxOf(sourceNode);
  const tBox = boxOf(targetNode);
  const route = ((data ?? {}) as { route?: Route }).route
    ?? fallbackRoute({ x: sBox.x, y: sBox.y }, { x: tBox.x, y: tBox.y });

  const s: Anchor = { ...portPoint(sBox, route.sourceSide, route.sourcePort, route.sourcePortCount), side: route.sourceSide };
  const t: Anchor = { ...portPoint(tBox, route.targetSide, route.targetPort, route.targetPortCount), side: route.targetSide };

  const drawn = edgeStyle === 'curved' ? curvedPath(s, t) : squaredPath(s, t, route.lane);

  return (
    <>
      <BaseEdge id={id} path={drawn.d} markerEnd={markerEnd} markerStart={markerStart} style={style} />
      {label != null && label !== '' && (
        <EdgeLabelRenderer>
          <div
            className={EDGE_LABEL_CLASS}
            data-edge-id={id}
            style={{
              position: 'absolute',
              // The rotation goes LAST so it turns the label about its own centre, after it has
              // been moved into place. A lane is 18px wide, which fits a rotated label's line
              // height but nothing like its text width.
              transform: `translate(-50%, -50%) translate(${drawn.labelX}px, ${drawn.labelY}px) rotate(${drawn.labelAngle}deg)`,
              fontSize: 11,
              padding: '1px 5px',
              borderRadius: 3,
              background: 'var(--surface-2)',
              color: 'var(--tx-2)',
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
              ...labelBgStyle,
              ...labelStyle,
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
```

- [ ] **Step 2: Add the route memo to `useCanvasView.ts`**

Add to the imports:

```ts
import { layoutFocusView, resolveViewPositions, applyDragOverrides, gutterGeometry, type XY } from './layout';
import { routeEdges } from './edges/routeEdges';
import type { NodeKind } from './edges/ports';
import { decorateFlowEdges } from './flowEdges';
```

Add `displayEdges: FlowEdge[]` to the `CanvasView` type with this doc comment:

```ts
  /** The edges actually handed to React Flow: flow-decorated, then routed. Routing runs AFTER
   *  decoration because decoration is what creates a flow's ephemeral step edges — route first and
   *  they arrive with no Route and fall back to a mid-side anchor. */
  displayEdges: FlowEdge[];
```

After the existing `overlay` memo (line ~67), add:

```ts
  const decorated = useMemo(() => decorateFlowEdges(edges, overlay), [edges, overlay]);

  const kinds = useMemo(() => {
    const k: Record<string, NodeKind> = {};
    for (const n of view.children) k[n.id] = 'child';
    for (const n of view.externals) k[n.id] = 'external';
    return k;
  }, [view]);

  const displayEdges = useMemo(() => {
    const gutters = gutterGeometry(view, positions);
    const routes = routeEdges(
      decorated.map((e) => ({ id: e.id, source: e.source, target: e.target })),
      positions, kinds, gutters,
    );
    return decorated.map((e) => (routes[e.id] ? { ...e, data: { ...e.data, route: routes[e.id] } } : e));
  }, [decorated, positions, kinds, view]);
```

Return `displayEdges` alongside the rest:

```ts
  return { view, nodes, edges, displayEdges, overlay, flowActive, patternFlow, slots: draggedBase };
```

- [ ] **Step 3: Update `Canvas.tsx`**

Destructure `displayEdges` from `useCanvasView`, delete the local `decorateFlowEdges` memo at line 101, and delete the now-unused `decorateFlowEdges` import at line 15:

```tsx
  const { view, nodes, edges, displayEdges, overlay, flowActive, patternFlow, slots } = useCanvasView();
```

`edges` stays in use by `present`, `childIds` and `highlightSets` — do not replace those with
`displayEdges`, or the highlight sets start including ephemeral flow edges and the behaviour changes.

- [ ] **Step 4: Run the whole web suite**

Run: `cd apps/web && pnpm vitest run`
Expected: green. `edgeStyle` does not exist in the store yet, so `useStore((s) => s.edgeStyle)` returns `undefined` and `squaredPath` is used — which is the intended default. Task 8 makes it explicit.

- [ ] **Step 5: Typecheck**

Run: `cd /c/projects/hyphae && pnpm --filter @hyphae/web typecheck`
Expected: exactly 4 errors, all pre-existing and all in test files. 5 is yours.

- [ ] **Step 6: Commit**

```bash
cd /c/projects/hyphae
git status --short
git add apps/web/src/features/canvas/edges/FloatingEdge.tsx apps/web/src/features/canvas/useCanvasView.ts apps/web/src/features/canvas/Canvas.tsx
git commit -m "$(cat <<'EOF'
feat(web): draw edges through assigned ports and lanes

Switches the renderer and its provider together, so the canvas is never half
migrated. FloatingEdge no longer computes geometry from scratch: it resolves a
precomputed Route against live measured nodes, which is why an edge tracks its
node every frame of a drag while the port and lane it uses stay put until the
drag ends.

decorateFlowEdges moves from Canvas into useCanvasView because routing must
follow it — decoration is what creates a flow's ephemeral step edges, and
routing first would leave them with no Route at all.

Canvas keeps using the UNDECORATED edges for highlight sets; swapping those for
the decorated list would quietly pull ephemeral flow edges into the highlight.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Delete the free-anchor geometry, rename to `ports.ts`

Now that nothing calls it. Kept separate so a reviewer can approve the deletion on its own.

**Files:**
- Delete: `apps/web/src/features/canvas/edges/floating.ts` (contents merged into `ports.ts`)
- Delete: `apps/web/test/features/canvas/edges/floating.test.ts` (the `fanEdgeParams` cases move to `ports.test.ts`)
- Modify: `apps/web/src/features/canvas/edges/ports.ts` (absorb `Box`, `boxOf`, `fanEdgeParams`)
- Modify: `apps/web/src/features/canvas/reactflow.ts:178-187` (remove the same-pair fanning block)
- Modify: `apps/web/test/features/canvas/edges/ports.test.ts`
- Modify: `apps/web/test/features/canvas/reactflow.test.ts` (if it asserts `offsetIndex` / `offsetCount`)

**Interfaces:**
- Produces: `ports.ts` now exports `Box`, `boxOf`, `PORT_PITCH`, `portCount`, `portPoint`, `chooseSides`, `NodeKind`, `EDGE_FAN_SPREAD`, `fanEdgeParams`.
- Removed everywhere: `intersection`, `side`, `getEdgeParams`, `EdgeParams`, and edge `data.offsetIndex` / `data.offsetCount`.

- [ ] **Step 1: Move `Box`, `boxOf`, `EDGE_FAN_SPREAD` and `fanEdgeParams` into `ports.ts`**

Copy those four declarations verbatim from `floating.ts` into `ports.ts`, replacing the
`import type { Box } from './floating'` / `export type { Box }` pair at the top with the real
declaration. Update `fanEdgeParams`'s doc comment, whose current first paragraph is now wrong:

```ts
/**
 * Perpendicular offset for the `index`-th of `count` edges forced to SHARE a port.
 *
 * Ports normally keep edges apart on their own; this is the overflow case, when a side carries more
 * edges than it has ports. Offsets are centred on zero so the group stays balanced on the true
 * line, and a lone edge is returned untouched.
 */
```

- [ ] **Step 2: Move the `fanEdgeParams` tests**

Move the `fanEdgeParams (parallel edge separation)` and `fanEdgeParams on an ANTIPARALLEL pair`
`describe` blocks from `floating.test.ts` into `ports.test.ts`, changing their import to
`@/features/canvas/edges/ports`. Drop the `getEdgeParams (floating edge geometry)` block — that
function no longer exists.

- [ ] **Step 3: Delete the old files**

```bash
cd /c/projects/hyphae
rm apps/web/src/features/canvas/edges/floating.ts
rm apps/web/test/features/canvas/edges/floating.test.ts
```

- [ ] **Step 4: Remove the fanning block from `reactflow.ts`**

Delete the whole `byPair` block at `reactflow.ts:176-187` (the comment above it included) so
`focusViewToFlow` ends:

```ts
  const edges = view.edges.map((e) => (e.derived ? derivedEdge(e) : realEdge(e)));

  return { nodes, edges };
```

- [ ] **Step 5: Check for stragglers**

Run: `cd /c/projects/hyphae && rg -n "getEdgeParams|from './floating'|edges/floating|offsetIndex|offsetCount" apps/web`
Expected: no matches.

> A raw NUL byte makes a file invisible to ripgrep — it classifies the file as binary and skips it
> with **no error at all**. `features/canvas/reactflow.ts` has contained two before. If this sweep
> looks like it skipped a file, run `file <path>` and check for `data`.

- [ ] **Step 6: Run the suite and typecheck**

Run: `cd apps/web && pnpm vitest run`
Expected: green.

Run: `cd /c/projects/hyphae && pnpm --filter @hyphae/web typecheck`
Expected: exactly 4 errors.

- [ ] **Step 7: Commit**

```bash
cd /c/projects/hyphae
git status --short
git add -u apps/web/src/features/canvas/edges apps/web/test/features/canvas/edges apps/web/src/features/canvas/reactflow.ts apps/web/test/features/canvas/reactflow.test.ts
git add apps/web/src/features/canvas/edges/ports.ts apps/web/test/features/canvas/edges/ports.test.ts
git commit -m "$(cat <<'EOF'
fix(web): delete the free-anchor edge geometry

getEdgeParams, intersection and side computed a nearest-border anchor that
nothing calls any more. floating.ts becomes ports.ts, since after the deletions
its one job is where an edge touches a node.

The same-pair fanning block in focusViewToFlow goes with it. It existed only
because two edges between one pair resolved to the identical curve — ports give
them different landings, so the case no longer arises. fanEdgeParams survives,
demoted to the port-overflow path.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: The curved/squared toggle

**Files:**
- Modify: `apps/web/src/state/store.ts`
- Modify: `apps/web/src/features/canvas/overlay/FilterPanel.tsx:38-49`
- Modify: `apps/web/src/features/canvas/overlay/canvas.css` *(only if a new class is needed)*
- Create: `apps/web/test/state/edgeStyle.test.ts`
- Modify: `apps/web/test/features/canvas/overlay/FilterPanel.test.tsx`

**Interfaces:**
- Produces: `State.edgeStyle: 'squared' | 'curved'` defaulting to `'squared'`; `State.setEdgeStyle(s): void`.

- [ ] **Step 1: Write the failing store test**

Create `apps/web/test/state/edgeStyle.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '@/state/store';

describe('edgeStyle', () => {
  beforeEach(() => { useStore.setState({ edgeStyle: 'squared' }); });

  it('defaults to squared', () => {
    expect(useStore.getState().edgeStyle).toBe('squared');
  });

  it('switches to curved and back', () => {
    useStore.getState().setEdgeStyle('curved');
    expect(useStore.getState().edgeStyle).toBe('curved');
    useStore.getState().setEdgeStyle('squared');
    expect(useStore.getState().edgeStyle).toBe('squared');
  });

  it('is not reset by changing focus — it is a viewing preference, not a layout override', () => {
    useStore.getState().setEdgeStyle('curved');
    useStore.getState().setFocus('anything');
    expect(useStore.getState().edgeStyle).toBe('curved');
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd apps/web && pnpm vitest run test/state/edgeStyle.test.ts`
Expected: FAIL — `edgeStyle` is `undefined`, `setEdgeStyle` is not a function.

- [ ] **Step 3: Add it to the store**

In `apps/web/src/state/store.ts`, add to the `State` type (near `theme`):

```ts
  // How edges are drawn. Session-only and deliberately NOT reset by setFocus: unlike a dragged
  // position, this is a viewing preference about the whole canvas, not an override of one view.
  edgeStyle: 'squared' | 'curved';
```

and to the actions block:

```ts
  setEdgeStyle: (s: 'squared' | 'curved') => void;
```

In the store body, alongside `nodePositions: {}`:

```ts
    edgeStyle: 'squared',
```

and alongside `setTheme`:

```ts
    setEdgeStyle: (edgeStyle) => set({ edgeStyle }),
```

- [ ] **Step 4: Run the store test**

Run: `cd apps/web && pnpm vitest run test/state/edgeStyle.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Write the failing panel test**

Append to `apps/web/test/features/canvas/overlay/FilterPanel.test.tsx`:

```tsx
describe('edge style toggle', () => {
  beforeEach(() => { useStore.setState({ edgeStyle: 'squared', nodePositions: {} }); });

  it('is visible even when nothing has been dragged', () => {
    render(<FilterPanel />);
    expect(screen.getByRole('button', { name: /curved/i })).toBeTruthy();
  });

  it('switches the store to curved when pressed', () => {
    render(<FilterPanel />);
    fireEvent.click(screen.getByRole('button', { name: /curved/i }));
    expect(useStore.getState().edgeStyle).toBe('curved');
  });

  it('still hides "reset layout" until something has been dragged', () => {
    render(<FilterPanel />);
    expect(screen.queryByRole('button', { name: /reset layout/i })).toBeNull();
    useStore.setState({ nodePositions: { a: { x: 1, y: 1 } } });
    render(<FilterPanel />);
    expect(screen.getAllByRole('button', { name: /reset layout/i }).length).toBeGreaterThan(0);
  });
});
```

> **Note for the implementer:** `test/features/canvas/overlay/FilterPanel.test.tsx` already exists.
> Reuse the imports and render helpers already at the top of it rather than adding duplicates.

- [ ] **Step 6: Run it to make sure it fails**

Run: `cd apps/web && pnpm vitest run test/features/canvas/overlay/FilterPanel.test.tsx`
Expected: FAIL — no button matching `/curved/i`.

- [ ] **Step 7: Restructure `LayoutGroup`**

Replace `LayoutGroup` in `apps/web/src/features/canvas/overlay/FilterPanel.tsx` with:

```tsx
/**
 * The Layout group is ALWAYS rendered now, because the edge-style toggle lives here and is not
 * conditional. Only "reset layout" is — there is nothing to reset until something has been dragged.
 */
function LayoutGroup() {
  const dragged = useStore((s) => s.nodePositions);
  const resetNodePositions = useStore((s) => s.resetNodePositions);
  const edgeStyle = useStore((s) => s.edgeStyle);
  const setEdgeStyle = useStore((s) => s.setEdgeStyle);
  const next = edgeStyle === 'squared' ? 'curved' : 'squared';
  return (
    <div className="filter__group">
      <div className="filter__label">Layout</div>
      <button className="filter__clear" onClick={() => setEdgeStyle(next)}>
        {next} edges
      </button>
      {!!Object.keys(dragged).length && (
        <button className="filter__clear" onClick={resetNodePositions}>reset layout</button>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Run the panel test and the whole suite**

Run: `cd apps/web && pnpm vitest run test/features/canvas/overlay/FilterPanel.test.tsx`
Expected: PASS.

Run: `cd apps/web && pnpm vitest run`
Expected: green.

- [ ] **Step 9: Commit**

```bash
cd /c/projects/hyphae
git status --short
git add apps/web/src/state/store.ts apps/web/src/features/canvas/overlay/FilterPanel.tsx apps/web/test/state/edgeStyle.test.ts apps/web/test/features/canvas/overlay/FilterPanel.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): switch between squared and curved edges

Both styles share one port assignment and differ only in the path generator, so
this is a line of state rather than a second router.

edgeStyle is deliberately NOT cleared by setFocus. A dragged position is an
override of one particular view and resets with it; how edges are drawn is a
preference about the whole canvas.

The Layout group in the filter panel now always renders — it used to return
null until something had been dragged, which would have hidden this toggle
almost all the time. Only "reset layout" stays conditional.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Crossing regression over the real model

**Files:**
- Create: `apps/web/test/features/canvas/edges/crossings.real.test.ts`

**Interfaces:**
- Consumes: `loadRealModel`, `realFocusIds`, `countCrossings` (Task 1); `buildFocusView`, `layoutFocusView`, `gutterGeometry`; `routeEdges`, `portPoint`, `squaredPath`.

- [ ] **Step 1: Write the test**

Create `apps/web/test/features/canvas/edges/crossings.real.test.ts`. Replace `OLD_CROSSINGS` with the
numbers recorded in Task 1 Step 7.

```ts
import { describe, it, expect } from 'vitest';
import { buildFocusView } from '@/core/focusView';
import { layoutFocusView, gutterGeometry, NODE_W, NODE_H, type XY } from '@/features/canvas/layout';
import { routeEdges } from '@/features/canvas/edges/routeEdges';
import { portPoint, type NodeKind } from '@/features/canvas/edges/ports';
import { squaredPath } from '@/features/canvas/edges/paths';
import { countCrossings } from '../../../support/crossings';
import { loadRealModel, realFocusIds } from '../../../support/realModel';

/** Measured in Task 1 against the free-anchor router, before it was deleted. */
const OLD_CROSSINGS: Record<string, number> = {
  // 'Baritone API': 000,
  // 'Process Layer': 000,
  // 'Utilities & Schematics': 000,
  // 'Command System': 000,
};

const model = loadRealModel();

describe('edge crossings on the real model', () => {
  it.skipIf(!model)('draws fewer crossings than the free-anchor router did', () => {
    const m = model!;
    for (const { name, id } of realFocusIds(m)) {
      const view = buildFocusView(m, id, undefined, 'full', new Set<string>());
      const pos = layoutFocusView(view);
      const kinds: Record<string, NodeKind> = {};
      for (const n of view.children) kinds[n.id] = 'child';
      for (const n of view.externals) kinds[n.id] = 'external';

      const routes = routeEdges(
        view.edges.map((e) => ({ id: e.id, source: e.from, target: e.to })),
        pos, kinds, gutterGeometry(view, pos),
      );
      const box = (nid: string) => ({ ...pos[nid], width: NODE_W, height: NODE_H });
      const lines: XY[][] = [];
      for (const e of view.edges) {
        const r = routes[e.id];
        if (!r) continue;
        const s = { ...portPoint(box(e.from), r.sourceSide, r.sourcePort, r.sourcePortCount), side: r.sourceSide };
        const t = { ...portPoint(box(e.to), r.targetSide, r.targetPort, r.targetPortCount), side: r.targetSide };
        lines.push(squaredPath(s, t, r.lane).points);
      }

      const now = countCrossings(lines);
      const before = OLD_CROSSINGS[name];
      if (before === undefined) continue;
      expect(now, `${name}: ${now} crossings, was ${before}`).toBeLessThan(before);
    }
  });

  it.skipIf(!model)('gives every drawable edge a route', () => {
    const m = model!;
    for (const { id } of realFocusIds(m)) {
      const view = buildFocusView(m, id, undefined, 'full', new Set<string>());
      const pos = layoutFocusView(view);
      const kinds: Record<string, NodeKind> = {};
      for (const n of view.children) kinds[n.id] = 'child';
      for (const n of view.externals) kinds[n.id] = 'external';
      const drawable = view.edges.filter((e) => pos[e.from] && pos[e.to]);
      const routes = routeEdges(
        view.edges.map((e) => ({ id: e.id, source: e.from, target: e.to })),
        pos, kinds, gutterGeometry(view, pos),
      );
      expect(Object.keys(routes).length).toBe(drawable.length);
    }
  });
});
```

- [ ] **Step 2: Run it**

Run: `cd apps/web && pnpm vitest run test/features/canvas/edges/crossings.real.test.ts`
Expected: PASS.

**If the crossing test fails**, the lane index → x mapping is the first thing to try: `laneX` currently
puts lane 0 nearest the gutter's left edge. Flip it (`laneX(gutterLeft, lane)` →
`gutterLeft + LANE_MARGIN + (count - 1 - lane) * LANE_PITCH`, threading a lane count through) and
re-measure. Use `superpowers:systematic-debugging` before changing anything else — find the root
cause, do not tune blindly.

- [ ] **Step 3: Commit**

```bash
cd /c/projects/hyphae
git status --short
git add apps/web/test/features/canvas/edges/crossings.real.test.ts
git commit -m "$(cat <<'EOF'
test(web): pin edge crossings against the real model

Turns the goal into a number. The budgets are the free-anchor router's own
counts, measured in Task 1 before it was deleted, so the assertion is that the
new router genuinely beats what shipped rather than that it hits some figure
picked by hand.

Skips when hyphae-baritone.json is absent, since the model file is permanently
untracked.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Documentation

**Files:**
- Modify: `README.md` (§ Viewer)
- Modify: `CLAUDE.md` (file map + "Invariants that bite")
- Modify: `docs/SPEC.md` (§ 9, one bullet)

- [ ] **Step 1: Update `README.md` § Viewer**

Add a paragraph after the Dragging section describing: edges attach to discrete ports rather than
arbitrary border points; cluster↔column runs share ordered vertical lanes in the gutter, whose width
is derived from how many lanes it needs; a lane's label is rotated to ride it; and the filter panel's
Layout group toggles between squared and curved edges (squared is the default).

- [ ] **Step 2: Update the `CLAUDE.md` file map**

In the `apps/web/src/` tree, replace the `edges/  FloatingEdge.tsx  floating.ts` line with:

```
                     edges/    FloatingEdge.tsx  ports.ts  lanes.ts  paths.ts
                               routeEdges.ts
```

- [ ] **Step 3: Add three entries to `CLAUDE.md` "Invariants that bite"**

```markdown
- **Edge geometry is ASSIGNED globally and RESOLVED locally.** `routeEdges` (`edges/routeEdges.ts`)
  picks a side, a port index and a lane per edge, memoized per view in `useCanvasView`; it returns
  no absolute node coordinates. `FloatingEdge` resolves that against `useInternalNode` every render.
  That split is why dragging reads well: positions reach the store only on `onNodeDragStop`, so the
  port and lane stay fixed while the endpoints track the node every frame, and the port snaps on
  release instead of sliding along the border. Compute endpoints in the assignment pass and the
  edges detach from the node mid-drag.
- **Routing runs AFTER `decorateFlowEdges`.** Decoration is what creates a flow's ephemeral step
  edges, so routing first leaves them with no `Route` and they fall back to a mid-side anchor. This
  is why `decorateFlowEdges` lives in `useCanvasView` and not in `Canvas.tsx`. Canvas still uses the
  UNDECORATED `edges` for `present`, `childIds` and `highlightSets` — swap those for `displayEdges`
  and ephemeral flow edges quietly join the highlight sets.
- **`COL_GAP` is derived, not constant.** `layoutFocusView` places the external columns twice: lane
  demand depends only on the *y* spans of the runs, and a column's y is fixed by `midY` and
  `ROW_GAP` while `COL_GAP` moves only x — so the provisional placement yields an exact lane count
  and re-placing at the widened gap cannot invalidate it. A test asserting a literal external x will
  break; assert the relationship (gap ≥ 120) instead.
```

- [ ] **Step 4: Add one bullet to `docs/SPEC.md` § 9**

```markdown
- **Edge form carries routing, not meaning.** Squared and curved are the same edges drawn two ways —
  the choice is the reader's, and neither encodes anything about the connection. Hue still belongs
  entirely to the verb classes; a lane, a corner radius and a rotated label are differences in form.
```

- [ ] **Step 5: Full verification**

Run: `cd /c/projects/hyphae && pnpm -r test`
Expected: 693 pre-existing + the new tests, all green.

Run: `cd /c/projects/hyphae && pnpm --filter @hyphae/web typecheck`
Expected: exactly 4 errors.

Run: `cd /c/projects/hyphae && pnpm -r build`
Expected: success.

- [ ] **Step 6: Commit**

```bash
cd /c/projects/hyphae
git status --short
git add README.md CLAUDE.md docs/SPEC.md
git commit -m "$(cat <<'EOF'
docs: record the edge router and its invariants

The three that will bite someone: geometry is assigned globally and resolved
locally (and why dragging depends on that), routing must follow flow
decoration, and COL_GAP is now derived so a test asserting a literal external x
will break.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Verification checklist

Before calling this done:

- [ ] `cd /c/projects/hyphae && pnpm -r test` — green, output shown, not summarised.
- [ ] `pnpm --filter @hyphae/web typecheck` — exactly 4 errors.
- [ ] `pnpm -r build` — succeeds.
- [ ] `git status --short` — `apps/server/hyphae-baritone.json` still untracked and never staged.
- [ ] `rg -n "getEdgeParams|offsetIndex|edges/floating" apps/web` — no matches.
- [ ] The user has run `HYPHAE_FILE=$PWD/apps/server/hyphae-baritone.json pnpm dev` and looked at
      Process Layer and Baritone API in both edge styles. **There is no visual verification tooling
      in this environment** — no browser, no screenshots — so no claim about how it *looks* can be
      made from here. Hand them something to look at and ask.

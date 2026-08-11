import { describe, it, expect } from 'vitest';
import { buildFocusView } from '@/core/focusView';
import { layoutFocusView, gutterGeometry, NODE_W, NODE_H, type XY } from '@/features/canvas/layout';
import { routeEdges, type Route } from '@/features/canvas/edges/routeEdges';
import { portPoint, type NodeKind } from '@/features/canvas/edges/ports';
import { squaredPath } from '@/features/canvas/edges/paths';
import { countCrossings } from '../../../support/crossings';
import { loadRealModel, realFocusIds } from '../../../support/realModel';
import type { HyphaeModel } from '@hyphae/schema';

/**
 * What this file does NOT assert: that the router draws fewer crossings than the free-anchor one it
 * replaced. Measured at equal fidelity it draws more (657 vs 476 on Baritone API in `squared`, 530
 * in `curved`), because an external column feeding a cluster is a converging FAN and orthogonal
 * runs sweep across one another's lanes. That trade was made deliberately — see the store comment
 * on `edgeStyle` — so the useful guards are the invariants the design actually promises.
 */
const model = loadRealModel();

/** Crossing counts measured 2026-08-11 in `squared`, the denser of the two styles. A budget, not a
 *  target: it exists so a later change cannot silently tangle the graph further. */
const CROSSING_BUDGET: Record<string, number> = {
  'Baritone API': 725,
  'Process Layer': 475,
  'Utilities & Schematics': 260,
  'Command System': 120,
};

type Routed = { view: ReturnType<typeof buildFocusView>; pos: Record<string, XY>; routes: Record<string, Route> };

function routeFocus(m: HyphaeModel, focusId: string): Routed {
  const view = buildFocusView(m, focusId, undefined, 'full', new Set<string>());
  const pos = layoutFocusView(view);
  const kinds: Record<string, NodeKind> = {};
  for (const n of view.children) kinds[n.id] = 'child';
  for (const n of view.externals) kinds[n.id] = 'external';
  const routes = routeEdges(
    view.edges.map((e) => ({ id: e.id, source: e.from, target: e.to })),
    pos, kinds, gutterGeometry(view, pos),
  );
  return { view, pos, routes };
}

const anchors = ({ view, pos, routes }: Routed) => {
  const box = (nid: string) => ({ ...pos[nid], width: NODE_W, height: NODE_H });
  const out: { s: XY; t: XY }[] = [];
  for (const e of view.edges) {
    const r = routes[e.id];
    if (!r) continue;
    out.push({
      s: portPoint(box(e.from), r.sourceSide, r.sourcePort, r.sourcePortCount),
      t: portPoint(box(e.to), r.targetSide, r.targetPort, r.targetPortCount),
    });
  }
  return out;
};

describe('the router on the real model', () => {
  it.skipIf(!model)('gives every drawable edge a route', () => {
    const m = model!;
    for (const { name, id } of realFocusIds(m)) {
      const r = routeFocus(m, id);
      const drawable = r.view.edges.filter((e) => r.pos[e.from] && r.pos[e.to]);
      expect(Object.keys(r.routes).length, name).toBe(drawable.length);
    }
  });

  // The defect that made the first cut of this router worse than what it replaced: overflow was
  // clamped to the last port, so nine edges shared one landing point and fanned out from it.
  it.skipIf(!model)('never lands two edge ends on the same point', () => {
    const m = model!;
    for (const { name, id } of realFocusIds(m)) {
      const ends = anchors(routeFocus(m, id));
      const distinct = new Set(ends.flatMap(({ s, t }) => [`${s.x},${s.y}`, `${t.x},${t.y}`]));
      expect(distinct.size, `${name}: ${distinct.size} anchors for ${ends.length * 2} edge ends`)
        .toBe(ends.length * 2);
    }
  });

  it.skipIf(!model)('keeps crossings inside the recorded budget', () => {
    const m = model!;
    for (const { name, id } of realFocusIds(m)) {
      const budget = CROSSING_BUDGET[name];
      if (budget === undefined) continue;
      const r = routeFocus(m, id);
      const box = (nid: string) => ({ ...r.pos[nid], width: NODE_W, height: NODE_H });
      const lines: XY[][] = [];
      for (const e of r.view.edges) {
        const rt = r.routes[e.id];
        if (!rt) continue;
        const s = { ...portPoint(box(e.from), rt.sourceSide, rt.sourcePort, rt.sourcePortCount), side: rt.sourceSide };
        const t = { ...portPoint(box(e.to), rt.targetSide, rt.targetPort, rt.targetPortCount), side: rt.targetSide };
        lines.push(squaredPath(s, t, rt.lane).points);
      }
      const now = countCrossings(lines);
      expect(now, `${name}: ${now} crossings, budget ${budget}`).toBeLessThanOrEqual(budget);
    }
  });
});

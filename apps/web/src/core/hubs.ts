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

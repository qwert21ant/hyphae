import { c4Backend, verbClassOf, type Connection } from '@hyphae/schema';
import type { ConnFilter, FocusEdge } from './types';

export function matchesFilter(c: Connection, f: ConnFilter): boolean {
  if (f.verbClasses.length && !f.verbClasses.includes(verbClassOf(c4Backend, c.verb) ?? '')) return false;
  for (const [key, vals] of Object.entries(f.fields)) {
    if (vals.length && !vals.includes(String(c.fields[key] ?? ''))) return false;
  }
  return true;
}

// Group the surviving connections per *unordered* mapped pair. A connection is DIRECT when both
// of its endpoints map to themselves — nothing about it is being summarised, so it keeps its own
// solid edge with its own verb and arrow (FloatingEdge fans several apart). Only ROLLED-UP
// connections, whose endpoints stand in for deeper nodes, aggregate into one dashed count edge:
// there the count is the whole point, and the underlying verbs differ anyway.
// `a`/`b` are the canonical (id-sorted) endpoints; `ab`/`ba` record which orientations occur
// among the rolled-up ones, which is what decides the merged edge's arrow direction.
export type Entry = { id: string; from: string; to: string; direction: string; label: string; verb: string; object: string; direct: boolean };
export type Pair = { a: string; b: string; entries: Entry[] };

export const realEdgeOf = (d: Entry): FocusEdge => ({
  id: d.id, from: d.from, to: d.to, count: 1, derived: false,
  realizedBy: [d.id], direction: d.direction, label: d.label, verb: d.verb, object: d.object,
});

/** One dashed summary edge over `items`. It keeps an arrow only when every underlying connection
 *  points the same way; conflicting directions render undirected ('None'), any Bidirectional wins. */
export const aggregateEdgeOf = (p: Pair, items: Entry[]): FocusEdge => {
  let ab = false, ba = false, bidir = false;
  for (const it of items) {
    if (it.from === p.a) ab = true; else ba = true;
    if (it.direction === 'Bidirectional') bidir = true;
  }
  let from: string, to: string, direction: string;
  if (bidir || (ab && ba)) { from = p.a; to = p.b; direction = bidir ? 'Bidirectional' : 'None'; }
  else if (ba) { from = p.b; to = p.a; direction = 'Unidirectional'; }
  else { from = p.a; to = p.b; direction = 'Unidirectional'; }
  return { id: `agg:${p.a}->${p.b}`, from, to, count: items.length, derived: true, realizedBy: items.map((i) => i.id), direction };
};

import type { Node } from '@hyphae/schema';

export type ConnFilter = { fields: Record<string, string[]> };
export type Audience = 'stakeholder' | 'full';

export type FocusEdge = {
  id: string;
  from: string;
  to: string;
  count: number;       // underlying connections represented
  derived: boolean;    // aggregated/collapsed (dashed) edge
  realizedBy: string[]; // ids of the model connections this edge represents (length === count)
  direction?: string;  // the connection's direction for a real edge (e.g. 'Bidirectional')
  label?: string;       // the connection's label for a 1:1 real edge — the only text drawn
  /** Either endpoint is on the shelf: the edge is still built and still highlightable, but
   *  highlight.ts hides it until the shelved node is hovered or selected. */
  shelved?: boolean;
};

/** A foundational node parked on the shelf, with how many of this view's edges it carries. */
export type ShelfItem = { node: Node; count: number };

export type FocusView = {
  focusId: string | null;
  focusNode: Node | null;
  children: Node[];   // direct children, or all roots at the root view
  externals: Node[];  // representative peer-level external boxes
  /** Foundational externals, drawn on the shelf instead of in a column. Disjoint from `externals`. */
  shelf?: ShelfItem[];
  edges: FocusEdge[];
  externalGroups?: { id: string; name: string; childIds: string[] }[];
  expandableExternalIds?: Set<string>;
};

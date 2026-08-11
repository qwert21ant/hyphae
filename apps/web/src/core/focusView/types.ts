import type { Node } from '@hyphae/schema';

export type ConnFilter = { verbClasses: string[]; fields: Record<string, string[]> };
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
  verb?: string;        // legacy: still the colour key until the verb system is removed
  object?: string;      // legacy
};

export type FocusView = {
  focusId: string | null;
  focusNode: Node | null;
  children: Node[];   // direct children, or all roots at the root view
  externals: Node[];  // representative peer-level external boxes
  edges: FocusEdge[];
  externalGroups?: { id: string; name: string; childIds: string[] }[];
  expandableExternalIds?: Set<string>;
};

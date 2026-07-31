import { EDGE_LABEL_CLASS } from './edges/FloatingEdge';

export type HighlightArgs = {
  hi: { nodes: Set<string>; edges: Set<string> };
  activeId: string | null;
  flowActive: boolean;
  patternActive: boolean;
  strong: boolean;
  accent: string;
  dimEdge: number;
  dimNode: number;
};

/**
 * Highlight the active node/edge + neighbors (a region highlights its children), dim the rest.
 * Selection wins over hover. When a flow is active, its participating set drives the highlight
 * instead (and is treated as a strong selection).
 *
 * IMPORTANT: applied via an injected stylesheet keyed on React Flow's stable `data-id`s, NOT by
 * rebuilding the node/edge objects. React Flow drops a node's measured size on a new object
 * reference, hiding it until re-measured; restyling in CSS avoids that churn.
 */
export function highlightCss({
  hi, activeId, flowActive, patternActive, strong, accent, dimEdge, dimNode,
}: HighlightArgs): string {
  // Always-on transitions so both dimming and un-dimming animate.
  const trans =
    '.hyphae-canvas .react-flow__node{transition:opacity .15s ease,box-shadow .15s ease}'
    + '.hyphae-canvas .react-flow__edge,.hyphae-canvas .react-flow__edge .react-flow__edge-path{transition:opacity .15s ease,stroke-width .15s ease}'
    + `.hyphae-canvas .${EDGE_LABEL_CLASS}{transition:opacity .15s ease}`;
  if (patternActive || (!activeId && !flowActive)) return trans;
  const esc = (id: string) => id.replace(/["\\]/g, '\\$&');
  const nodeSel = [...hi.nodes].map((id) => `.hyphae-canvas .react-flow__node[data-id="${esc(id)}"]`);
  const edgeSel = [...hi.edges].map((id) => `.hyphae-canvas .react-flow__edge[data-id="${esc(id)}"]`);
  // Edge labels live in the portal, not in the edge's <g> — they need their own dim/restore pair
  // keyed on the same edge ids, or they stay crisp over a faded canvas.
  const labelSel = [...hi.edges].map((id) => `.hyphae-canvas .${EDGE_LABEL_CLASS}[data-edge-id="${esc(id)}"]`);
  const rules = [
    trans,
    // Dim everything except the focus-region backdrop, then restore + emphasize the highlighted set.
    `.hyphae-canvas .react-flow__node:not(.react-flow__node-region):not(.react-flow__node-ghostGroup){opacity:${dimNode}}`,
    `.hyphae-canvas .react-flow__edge{opacity:${dimEdge}}`,
    `.hyphae-canvas .${EDGE_LABEL_CLASS}{opacity:${dimEdge}}`,
  ];
  // !important: the dim rule's two :not() pseudo-classes give it specificity (0,4,0), which
  // outranks this [data-id] restore (0,3,0) — without !important the active node would stay dimmed.
  // No border-radius here: the ring's corners are the node wrapper's corners, and a radius that
  // only exists while highlighted snaps back to 0 while the shadow is still fading out. It is a
  // permanent, per-node-type rule in canvas.css instead.
  if (nodeSel.length) rules.push(`${nodeSel.join(',')}{opacity:1!important;box-shadow:0 0 0 2px ${accent}}`);
  if (labelSel.length) rules.push(`${labelSel.join(',')}{opacity:1}`);
  if (edgeSel.length) {
    rules.push(`${edgeSel.join(',')}{opacity:1}`);
    // !important beats the derived edge's inline stroke-width.
    rules.push(`${edgeSel.map((s) => `${s} .react-flow__edge-path`).join(',')}{stroke-width:${strong ? 3.5 : 3}px!important}`);
    // The design's one animated moment: a flow is a sequence, and a dash travelling along its
    // participating edges says so in a way a static highlight cannot. Only when a flow (not a
    // hover/selection) is driving the highlight.
    // Duration 4.2s pairs with the keyframe's 84px offset (see canvas.css) to keep the loop
    // seamless for both this rule's 6 6 dashes and an ephemeral edge's inline 2 5 dashes.
    if (flowActive) {
      rules.push(
        `${edgeSel.map((s) => `${s} .react-flow__edge-path`).join(',')}`
        + '{stroke-dasharray:6 6;animation:hyphae-pulse 4.2s linear infinite}',
      );
    }
  }
  return rules.join('');
}

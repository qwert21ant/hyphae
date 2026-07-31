import { MarkerType, type Edge as FlowEdge } from '@xyflow/react';
import type { FlowOverlay, StepBadge } from './flowOverlay';

const STEP_NUM = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪', '⑫'];
const stepBadge = (order: number) => STEP_NUM[order - 1] ?? `(${order})`;

/**
 * Relabel the participating edges with numbered captions; leave the rest untouched. Only the
 * edges change reference (never the nodes — that is what blanks the canvas), and only when the
 * flow selection changes, so this is not per-frame churn.
 */
export function decorateFlowEdges(edges: FlowEdge[], overlay: FlowOverlay | null): FlowEdge[] {
  if (!overlay) return edges;
  const stepLabel = (steps: StepBadge[]) => steps.map((s) => `${stepBadge(s.order)} ${s.message}`.trim()).join('   ');
  const labelled = edges.map((ed) => {
    const steps = overlay.edgeSteps.get(ed.id);
    if (!steps) return ed;
    const anyReturn = steps.some((s) => s.kind === 'Return');
    return {
      ...ed,
      label: stepLabel(steps),
      style: { ...ed.style, ...(anyReturn ? { strokeDasharray: '6 4' } : {}) },
      labelStyle: { ...(ed.labelStyle as Record<string, unknown> | undefined), fontWeight: 700 },
    };
  });
  // Steps with no structural edge behind them get one for the duration of the selection, drawn
  // dotted and in the flow accent so it never reads as an authored connection.
  const ephemeral = overlay.ephemeralEdges.map((ee) => ({
    id: ee.id,
    type: 'floating',
    source: ee.source,
    target: ee.target,
    label: stepLabel(overlay.edgeSteps.get(ee.id) ?? []),
    data: { ephemeral: true },
    selectable: false,
    deletable: false,
    style: { stroke: 'var(--accent)', strokeDasharray: '2 5', strokeWidth: 2 },
    labelStyle: { fill: 'var(--accent-text)', fontWeight: 700 },
    markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--accent)' },
  }));
  return [...labelled, ...ephemeral];
}

import { useEffect, useMemo } from 'react';
import type { Node as FlowNode, Edge as FlowEdge } from '@xyflow/react';
import { c4Backend } from '@hyphae/schema';
import { useStore } from '@/state/store';
import { buildFocusView, type FocusView } from '@/core/focusView';
import { layoutFocusView, resolveViewPositions } from './layout';
import { focusViewToFlow } from './reactflow';
import { computeFlowOverlay, type FlowOverlay } from './flowOverlay';
import { patternViewToFlow } from './patternView';

export type CanvasView = {
  view: FocusView;
  nodes: FlowNode[];
  edges: FlowEdge[];
  overlay: FlowOverlay | null;
  flowActive: boolean;
  patternFlow: { nodes: FlowNode[]; edges: FlowEdge[] } | null;
};

/**
 * The whole memoized view pipeline: focus view → layout → React Flow, plus the flow overlay and
 * the pattern view that can replace it. The dependency arrays here are load-bearing — see the
 * comment on the base layout below.
 */
export function useCanvasView(): CanvasView {
  const model = useStore((s) => s.model);
  const focusId = useStore((s) => s.focusId);
  const connFilter = useStore((s) => s.connFilter);
  const audience = useStore((s) => s.audience);
  const expandedExternals = useStore((s) => s.expandedExternals);
  const selectedFlowId = useStore((s) => s.selectedFlowId);
  const selectedPatternId = useStore((s) => s.selectedPatternId);

  // Stable base layout: positions come from the full / unfiltered / full-audience / COLLAPSED view,
  // memoized on [model, focusId] only. The connection filter, the audience toggle, and expansion
  // therefore never reflow the graph — resolveViewPositions maps the actual view onto these slots.
  const EMPTY_EXPANDED = useMemo(() => new Set<string>(), []);
  const baseView = useMemo(
    () => buildFocusView(model, focusId, undefined, 'full', EMPTY_EXPANDED),
    [model, focusId, EMPTY_EXPANDED],
  );
  const basePositions = useMemo(() => layoutFocusView(baseView), [baseView]);
  const view = useMemo(
    () => buildFocusView(model, focusId, connFilter, audience, expandedExternals),
    [model, focusId, connFilter, audience, expandedExternals],
  );
  const positions = useMemo(() => resolveViewPositions(view, basePositions), [view, basePositions]);
  const { nodes, edges } = useMemo(() => focusViewToFlow(view, positions), [view, positions]);

  // Flow overlay: when a flow is selected, map its steps onto the drawn edges.
  const flow = useMemo(() => model.flows.find((f) => f.id === selectedFlowId) ?? null, [model.flows, selectedFlowId]);
  const visibleNodeIds = useMemo(() => new Set(nodes.map((n) => n.id)), [nodes]);
  const overlay = useMemo(() => (flow ? computeFlowOverlay(flow, edges, visibleNodeIds) : null), [flow, edges, visibleNodeIds]);
  const flowActive = !!overlay && (overlay.participatingNodes.size > 0 || overlay.participatingEdges.size > 0);

  // Publish the steps this view cannot draw, so the tree can mark them as elsewhere. Which steps
  // those are depends on the drawn edges, which only exist here.
  const setOffViewSteps = useStore((s) => s.setOffViewSteps);
  useEffect(() => {
    setOffViewSteps(overlay ? overlay.offViewSteps.map((s) => s.order) : []);
  }, [overlay, setOffViewSteps]);

  // Pattern view: when a pattern is selected, replace the focus view entirely with its own
  // small diagram (member boxes + sequence/transition edges), built by patternViewToFlow.
  const pattern = useMemo(() => model.patterns.find((p) => p.id === selectedPatternId) ?? null, [model.patterns, selectedPatternId]);
  const patternFlow = useMemo(() => (pattern ? patternViewToFlow(pattern, c4Backend, model.nodes) : null), [pattern, model.nodes]);

  return { view, nodes, edges, overlay, flowActive, patternFlow };
}

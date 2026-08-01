import { useEffect, useMemo } from 'react';
import type { Node as FlowNode, Edge as FlowEdge } from '@xyflow/react';
import { c4Backend } from '@hyphae/schema';
import { useStore } from '@/state/store';
import { buildFocusView, type FocusView } from '@/core/focusView';
import { hubDegrees, detectHubs, quietHubs } from '@/core/hubs';
import { layoutFocusView, resolveViewPositions, applyDragOverrides, withBadgeRow, DEFAULT_METRICS } from './layout';
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
  /** Quieted node ids, and drawn-edge degree per node — the canvas shows both on the node itself. */
  hubIds: Set<string>;
  degrees: Map<string, number>;
};

/**
 * The whole memoized view pipeline: focus view → quiet hubs → layout → drag overrides → React Flow,
 * plus the flow overlay and the pattern view that can replace it. The dependency arrays here are
 * load-bearing — see the comment on the base layout below.
 */
export function useCanvasView(): CanvasView {
  const model = useStore((s) => s.model);
  const focusId = useStore((s) => s.focusId);
  const connFilter = useStore((s) => s.connFilter);
  const audience = useStore((s) => s.audience);
  const expandedExternals = useStore((s) => s.expandedExternals);
  const selectedFlowId = useStore((s) => s.selectedFlowId);
  const selectedPatternId = useStore((s) => s.selectedPatternId);
  const quietHubsOn = useStore((s) => s.quietHubsOn);
  const hubThreshold = useStore((s) => s.hubThreshold);
  const hubOverrides = useStore((s) => s.hubOverrides);
  const nodePositions = useStore((s) => s.nodePositions);

  // Stable base layout: positions come from the full / unfiltered / full-audience / COLLAPSED view,
  // memoized on [model, focusId] plus the hub set. The connection filter and the audience toggle are
  // deliberately absent from that key and therefore never reflow the graph — resolveViewPositions
  // maps the actual view onto these slots. Quieting IS in the key, because it changes what is
  // *drawn*, not merely what is *shown* of a fixed drawing.
  const EMPTY_EXPANDED = useMemo(() => new Set<string>(), []);
  const baseView = useMemo(
    () => buildFocusView(model, focusId, undefined, 'full', EMPTY_EXPANDED),
    [model, focusId, EMPTY_EXPANDED],
  );

  // Hub detection runs on the BASE view. Detecting on the rendered view would mean that filtering
  // out `dataAccess` un-hubs a settings node — reflowing everything on a filter toggle.
  const degrees = useMemo(() => hubDegrees(baseView), [baseView]);
  const hubIds = useMemo(
    () => (quietHubsOn ? detectHubs(baseView, hubThreshold, hubOverrides) : new Set<string>()),
    [quietHubsOn, baseView, hubThreshold, hubOverrides],
  );
  // Keyed on hubIds.size, not on quietHubsOn: a view with no hub at all keeps the compact box.
  const metrics = useMemo(() => (hubIds.size ? withBadgeRow(DEFAULT_METRICS) : DEFAULT_METRICS), [hubIds]);

  const quietBase = useMemo(() => quietHubs(baseView, hubIds).view, [baseView, hubIds]);
  const basePositions = useMemo(() => layoutFocusView(quietBase, metrics), [quietBase, metrics]);

  const rawView = useMemo(
    () => buildFocusView(model, focusId, connFilter, audience, expandedExternals),
    [model, focusId, connFilter, audience, expandedExternals],
  );
  const { view, badges } = useMemo(() => quietHubs(rawView, hubIds), [rawView, hubIds]);
  const resolved = useMemo(() => resolveViewPositions(view, basePositions, metrics), [view, basePositions, metrics]);
  const positions = useMemo(() => applyDragOverrides(resolved, nodePositions), [resolved, nodePositions]);
  const { nodes, edges } = useMemo(
    () => focusViewToFlow(view, positions, { metrics, badges, hubDegrees: degrees, hubIds }),
    [view, positions, metrics, badges, degrees, hubIds],
  );

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

  return { view, nodes, edges, overlay, flowActive, patternFlow, hubIds, degrees };
}

import { useEffect, useMemo } from 'react';
import type { Node as FlowNode, Edge as FlowEdge } from '@xyflow/react';
import { c4Backend } from '@hyphae/schema';
import { useStore } from '@/state/store';
import { buildFocusView, type FocusView } from '@/core/focusView';
import { layoutFocusView, resolveViewPositions, applyDragOverrides, gutterGeometry, type XY } from './layout';
import { focusViewToFlow } from './reactflow';
import { computeFlowOverlay, type FlowOverlay } from './flowOverlay';
import { patternViewToFlow } from './patternView';
import { decorateFlowEdges } from './flowEdges';
import { routeEdges } from './edges/routeEdges';
import type { NodeKind } from './edges/ports';

export type CanvasView = {
  view: FocusView;
  nodes: FlowNode[];
  edges: FlowEdge[];
  /** The edges actually handed to React Flow: flow-decorated, then routed. Routing runs AFTER
   *  decoration because decoration is what creates a flow's ephemeral step edges — route first and
   *  they arrive with no Route and fall back to a mid-side anchor. */
  displayEdges: FlowEdge[];
  overlay: FlowOverlay | null;
  flowActive: boolean;
  patternFlow: { nodes: FlowNode[]; edges: FlowEdge[] } | null;
  /** Base slots, drag overrides included. A ghost group is ANCHORED at its slot but DRAWN wrapping
   *  its members, so the two diverge once a member is dragged — dragging the group needs the slot. */
  slots: Record<string, XY>;
};

/**
 * The whole memoized view pipeline: focus view → layout → drag overrides → React Flow, plus the
 * flow overlay and the pattern view that can replace it. The dependency arrays here are
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
  const nodePositions = useStore((s) => s.nodePositions);

  // Stable base layout: positions come from the full / unfiltered / full-audience / COLLAPSED view,
  // memoized on [model, focusId] only. The connection filter, the audience toggle, and expansion
  // therefore never reflow the graph — resolveViewPositions maps the actual view onto these slots.
  const EMPTY_EXPANDED = useMemo(() => new Set<string>(), []);
  const baseView = useMemo(
    () => buildFocusView(model, focusId, undefined, 'full', EMPTY_EXPANDED),
    [model, focusId, EMPTY_EXPANDED],
  );
  const basePositions = useMemo(() => layoutFocusView(baseView), [baseView]);

  // Drag overrides are applied to the BASE SLOTS, before the view is resolved onto them — not only
  // to the finished positions. An expanded external is drawn as a group anchored at its collapsed
  // ghost's base slot, so overriding only the final positions left the group anchored at the slot
  // dagre computed: drag an external, expand it, and it teleported back. Overriding the slot moves
  // the group and its members with it. The second pass below covers ids that exist only in the
  // resolved view — a group's own members — which have no base slot to override.
  const draggedBase = useMemo(() => applyDragOverrides(basePositions, nodePositions), [basePositions, nodePositions]);

  const view = useMemo(
    () => buildFocusView(model, focusId, connFilter, audience, expandedExternals),
    [model, focusId, connFilter, audience, expandedExternals],
  );
  const resolved = useMemo(() => resolveViewPositions(view, draggedBase), [view, draggedBase]);
  const positions = useMemo(() => applyDragOverrides(resolved, nodePositions), [resolved, nodePositions]);
  const { nodes, edges } = useMemo(() => focusViewToFlow(view, positions), [view, positions]);

  // Flow overlay: when a flow is selected, map its steps onto the drawn edges.
  const flow = useMemo(() => model.flows.find((f) => f.id === selectedFlowId) ?? null, [model.flows, selectedFlowId]);
  const visibleNodeIds = useMemo(() => new Set(nodes.map((n) => n.id)), [nodes]);
  const overlay = useMemo(() => (flow ? computeFlowOverlay(flow, edges, visibleNodeIds) : null), [flow, edges, visibleNodeIds]);
  const flowActive = !!overlay && (overlay.participatingNodes.size > 0 || overlay.participatingEdges.size > 0);

  // Decorate first, THEN route: decoration is what mints a flow's ephemeral step edges, and an edge
  // that never reached routeEdges has no Route to resolve.
  const decorated = useMemo(() => decorateFlowEdges(edges, overlay), [edges, overlay]);

  const kinds = useMemo(() => {
    const k: Record<string, NodeKind> = {};
    for (const n of view.children) k[n.id] = 'child';
    for (const n of view.externals) k[n.id] = 'external';
    for (const s of view.shelf ?? []) k[s.node.id] = 'external';
    return k;
  }, [view]);

  const displayEdges = useMemo(() => {
    // Shelved edges are deliberately NOT routed: routing them would spend ports on the in-view nodes
    // and lanes in the gutter on lines nobody can see, which is exactly the space the shelf exists to
    // give back. They fall through to fallbackRoute (edges/routeEdges.ts) — a mid-side anchor on both
    // ends — so a reveal draws as a fan from one point on the shelved box, which reads as "these all
    // come from this one thing".
    const routable = decorated.filter((e) => !(e.data as { shelved?: boolean } | undefined)?.shelved);
    const routes = routeEdges(
      routable.map((e) => ({ id: e.id, source: e.source, target: e.target })),
      positions, kinds, gutterGeometry(view, positions),
    );
    return decorated.map((e) => (routes[e.id] ? { ...e, data: { ...e.data, route: routes[e.id] } } : e));
  }, [decorated, positions, kinds, view]);

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

  return { view, nodes, edges, displayEdges, overlay, flowActive, patternFlow, slots: draggedBase };
}

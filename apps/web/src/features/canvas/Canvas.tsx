import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow, Background, Controls, MiniMap, Panel, ConnectionMode, MarkerType,
  type Node as FlowNode,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { c4Backend } from '@hyphae/schema';
import { useStore } from '@/state/store';
import { buildFocusView } from '@/core/focusView';
import { layoutFocusView, resolveViewPositions } from '@/features/canvas/layout';
import { focusViewToFlow, highlightSets } from '@/features/canvas/reactflow';
import { computeFlowOverlay, type StepBadge } from '@/features/canvas/flowOverlay';
import { patternViewToFlow } from '@/features/canvas/patternView';
import { GroupNode } from '@/features/canvas/nodes/GroupNode';
import { NodeBox } from '@/features/canvas/nodes/NodeBox';
import { GhostNode } from '@/features/canvas/nodes/GhostNode';
import { GhostGroupNode } from '@/features/canvas/nodes/GhostGroupNode';
import { PatternMemberNode } from '@/features/canvas/nodes/PatternMemberNode';
import { FloatingEdge, EDGE_LABEL_CLASS } from '@/features/canvas/edges/FloatingEdge';
import { FilterPanel } from '@/features/canvas/overlay/FilterPanel';
import { Legend } from '@/features/canvas/overlay/Legend';

const nodeTypes = { region: GroupNode, node: NodeBox, ghost: GhostNode, ghostGroup: GhostGroupNode, patternMember: PatternMemberNode };
const edgeTypes = { floating: FloatingEdge };
const STEP_NUM = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪', '⑫'];
const stepBadge = (order: number) => STEP_NUM[order - 1] ?? `(${order})`;

// Colour minimap dots by layer (regions muted) so the overview reads like the canvas. The MiniMap
// renders each node as an SVG <rect style={{fill}}> (not a canvas 2D context), so a var() reference
// resolves exactly like any other inline CSS style — no JS-side lookup needed.
const miniMapColor = (n: FlowNode): string => {
  if (n.type === 'region') return 'var(--alt-2-bd)';
  const c = (n.data as { color?: { border: string } }).color;
  return c?.border ?? 'var(--tx-3)';
};

export function Canvas() {
  const model = useStore((s) => s.model);
  const focusId = useStore((s) => s.focusId);
  const connFilter = useStore((s) => s.connFilter);
  const selectedId = useStore((s) => s.selectedId);
  const select = useStore((s) => s.select);
  const setFocus = useStore((s) => s.setFocus);
  const audience = useStore((s) => s.audience);
  const expandedExternals = useStore((s) => s.expandedExternals);
  const selectedFlowId = useStore((s) => s.selectedFlowId);
  const selectedPatternId = useStore((s) => s.selectedPatternId);
  // Only feeds React Flow's colorMode prop below — a CSS class, not a node/edge rebuild — so it is
  // deliberately read outside of, and absent from, every useMemo dependency array in this file.
  const theme = useStore((s) => s.theme);

  // Transient hover, so a user can trace a node's neighborhood without committing a selection.
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  // Drilling changes focus (and remounts the graph); reset hover so the new view opens neutral.
  useEffect(() => setHoveredId(null), [focusId]);

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

  // Relabel the participating edges with numbered captions; leave the rest untouched. Only the
  // edges change reference (never the nodes — that is what blanks the canvas), and only when the
  // flow selection changes, so this is not per-frame churn.
  const displayEdges = useMemo(() => {
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
  }, [edges, overlay]);

  // Highlight the active node/edge + neighbors (a region highlights its children), dim the rest.
  // Selection wins over hover. When a flow is active, its participating set drives the highlight
  // instead (and is treated as a strong selection).
  //
  // IMPORTANT: applied via an injected stylesheet keyed on React Flow's stable `data-id`s, NOT by
  // rebuilding the node/edge objects. React Flow drops a node's measured size on a new object
  // reference, hiding it until re-measured; restyling in CSS avoids that churn.
  const present = useMemo(
    () => new Set<string>([...nodes.map((n) => n.id), ...edges.map((e) => e.id)]),
    [nodes, edges],
  );
  const activeId =
    (selectedId && present.has(selectedId) && selectedId) ||
    (hoveredId && present.has(hoveredId) && hoveredId) ||
    null;
  const strong = flowActive || !!(selectedId && present.has(selectedId));
  const accent = strong ? 'var(--accent)' : 'var(--accent-soft)';
  const dimEdge = strong ? 0.12 : 0.4;
  const dimNode = strong ? 0.4 : 0.65;
  const childIds = useMemo(
    () => (!flowActive && activeId === view.focusId ? new Set(view.children.map((n) => n.id)) : new Set<string>()),
    [flowActive, activeId, view],
  );
  const hi = useMemo(
    () => (flowActive && overlay ? { nodes: overlay.participatingNodes, edges: overlay.participatingEdges } : highlightSets(activeId, edges, childIds)),
    [flowActive, overlay, activeId, edges, childIds],
  );

  const highlightCss = useMemo(() => {
    // Always-on transitions so both dimming and un-dimming animate.
    const trans =
      '.hyphae-canvas .react-flow__node{transition:opacity .15s ease,box-shadow .15s ease}'
      + '.hyphae-canvas .react-flow__edge,.hyphae-canvas .react-flow__edge .react-flow__edge-path{transition:opacity .15s ease,stroke-width .15s ease}'
      + `.hyphae-canvas .${EDGE_LABEL_CLASS}{transition:opacity .15s ease}`;
    if (patternFlow || (!activeId && !flowActive)) return trans;
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
  }, [activeId, flowActive, hi, strong, accent, dimEdge, dimNode, patternFlow]);

  // Drill in: any real node becomes the new focus, children or not. A childless focus renders as
  // the node itself surrounded by its connected nodes as externals (see focusView) — a useful
  // "what touches this?" view, so a leaf Component is not a dead end.
  // Pattern member boxes are keyed by member NAME rather than a node id, and they ride the same
  // click stream, so a focus id must be confirmed against the model before it is set.
  const drill = (node: FlowNode) => {
    if (node.type === 'ghost') { setFocus(node.id); return; }
    if (!model.nodes.some((n) => n.id === node.id)) return;
    setFocus(node.id);
  };

  // React Flow suppresses onNodeDoubleClick while nodesDraggable={false} (double-click rides on
  // the node drag machinery), so we detect the double-click from the onNodeClick stream instead:
  // first click selects, a second click on the same node within the threshold drills in.
  const lastClick = useRef<{ id: string; t: number }>({ id: '', t: 0 });
  const DOUBLE_CLICK_MS = 350;
  const onNodeClick = (_: unknown, node: FlowNode) => {
    const now = Date.now();
    if (lastClick.current.id === node.id && now - lastClick.current.t < DOUBLE_CLICK_MS) {
      lastClick.current = { id: '', t: 0 };
      drill(node);
    } else {
      lastClick.current = { id: node.id, t: now };
      select(node.id);
    }
  };

  const rfNodes = patternFlow ? patternFlow.nodes : nodes;
  const rfEdges = patternFlow ? patternFlow.edges : displayEdges;

  return (
    <div className="hyphae-canvas" style={{ flex: 1, height: '100%' }}>
      <style data-hyphae-hl>{highlightCss}</style>
      <ReactFlow
        key={selectedPatternId ? `pattern:${selectedPatternId}` : (focusId ?? '__root__')}
        colorMode={theme}
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        connectionMode={ConnectionMode.Loose}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        onNodeClick={onNodeClick}
        onNodeMouseEnter={(_, node) => setHoveredId(node.id)}
        onNodeMouseLeave={() => setHoveredId(null)}
        onEdgeMouseEnter={(_, e) => setHoveredId(e.id)}
        onEdgeMouseLeave={() => setHoveredId(null)}
        onEdgeClick={(_, e) => select(e.id)}
        onPaneClick={() => select(null)}
        fitView
      >
        {/* Flows and patterns live in the left TreePanel; the canvas only keeps the filter. */}
        <Panel position="top-left"><FilterPanel /></Panel>
        <Panel position="top-right"><Legend /></Panel>
        <Background />
        <Controls />
        <MiniMap nodeColor={miniMapColor} pannable zoomable />
      </ReactFlow>
    </div>
  );
}

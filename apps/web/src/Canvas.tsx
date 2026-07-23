import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow, Background, Controls, MiniMap, Panel, ConnectionMode,
  type Node as FlowNode,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { c4Backend } from '@hyphae/schema';
import { useStore } from './store';
import { buildFocusView } from './focusView';
import { layoutFocusView, resolveViewPositions } from './layout';
import { focusViewToFlow, highlightSets } from './reactflow';
import { computeFlowOverlay } from './flowOverlay';
import { patternViewToFlow } from './patternView';
import { GroupNode } from './GroupNode';
import { NodeBox } from './NodeBox';
import { GhostNode } from './GhostNode';
import { GhostGroupNode } from './GhostGroupNode';
import { PatternMemberNode } from './PatternMemberNode';
import { FloatingEdge } from './FloatingEdge';
import { FilterPanel } from './FilterPanel';
import { FlowPicker } from './FlowPicker';
import { PatternPicker } from './PatternPicker';
import { Legend } from './Legend';

const nodeTypes = { region: GroupNode, node: NodeBox, ghost: GhostNode, ghostGroup: GhostGroupNode, patternMember: PatternMemberNode };
const edgeTypes = { floating: FloatingEdge };
const STEP_NUM = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪', '⑫'];
const stepBadge = (order: number) => STEP_NUM[order - 1] ?? `(${order})`;

// Colour minimap dots by layer (regions muted) so the overview reads like the canvas.
const miniMapColor = (n: FlowNode): string => {
  if (n.type === 'region') return '#e2e8f0';
  const c = (n.data as { color?: { border: string } }).color;
  return c?.border ?? '#94a3b8';
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

  // Pattern view: when a pattern is selected, replace the focus view entirely with its own
  // small diagram (member boxes + sequence/transition edges), built by patternViewToFlow.
  const pattern = useMemo(() => model.patterns.find((p) => p.id === selectedPatternId) ?? null, [model.patterns, selectedPatternId]);
  const patternFlow = useMemo(() => (pattern ? patternViewToFlow(pattern, c4Backend, model.nodes) : null), [pattern, model.nodes]);

  // Relabel the participating edges with numbered captions; leave the rest untouched. Only the
  // edges change reference (never the nodes — that is what blanks the canvas), and only when the
  // flow selection changes, so this is not per-frame churn.
  const displayEdges = useMemo(() => {
    if (!overlay) return edges;
    return edges.map((ed) => {
      const steps = overlay.edgeSteps.get(ed.id);
      if (!steps) return ed;
      const label = steps.map((s) => `${stepBadge(s.order)} ${s.message}`.trim()).join('   ');
      const anyReturn = steps.some((s) => s.kind === 'Return');
      return {
        ...ed,
        label,
        style: { ...ed.style, ...(anyReturn ? { strokeDasharray: '6 4' } : {}) },
        labelStyle: { ...(ed.labelStyle as Record<string, unknown> | undefined), fontWeight: 700 },
      };
    });
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
  const accent = strong ? '#2563eb' : '#93c5fd';
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
      + '.hyphae-canvas .react-flow__edge,.hyphae-canvas .react-flow__edge .react-flow__edge-path{transition:opacity .15s ease,stroke-width .15s ease}';
    if (patternFlow || (!activeId && !flowActive)) return trans;
    const esc = (id: string) => id.replace(/["\\]/g, '\\$&');
    const nodeSel = [...hi.nodes].map((id) => `.hyphae-canvas .react-flow__node[data-id="${esc(id)}"]`);
    const edgeSel = [...hi.edges].map((id) => `.hyphae-canvas .react-flow__edge[data-id="${esc(id)}"]`);
    const rules = [
      trans,
      // Dim everything except the focus-region backdrop, then restore + emphasize the highlighted set.
      `.hyphae-canvas .react-flow__node:not(.react-flow__node-region):not(.react-flow__node-ghostGroup){opacity:${dimNode}}`,
      `.hyphae-canvas .react-flow__edge{opacity:${dimEdge}}`,
    ];
    // !important: the dim rule's two :not() pseudo-classes give it specificity (0,4,0), which
    // outranks this [data-id] restore (0,3,0) — without !important the active node would stay dimmed.
    if (nodeSel.length) rules.push(`${nodeSel.join(',')}{opacity:1!important;box-shadow:0 0 0 2px ${accent};border-radius:4px}`);
    if (edgeSel.length) {
      rules.push(`${edgeSel.join(',')}{opacity:1}`);
      // !important beats the derived edge's inline stroke-width.
      rules.push(`${edgeSel.map((s) => `${s} .react-flow__edge-path`).join(',')}{stroke-width:${strong ? 3.5 : 3}px!important}`);
    }
    return rules.join('');
  }, [activeId, flowActive, hi, strong, accent, dimEdge, dimNode, patternFlow]);

  // Drill in: an external ghost, or a node with children, becomes the new focus.
  const drill = (node: FlowNode) => {
    if (node.type === 'ghost') { setFocus(node.id); return; }
    if (!model.nodes.some((n) => n.parentId === node.id)) return;
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
        <Panel position="top-left">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <FilterPanel />
            <FlowPicker />
            <PatternPicker />
          </div>
        </Panel>
        <Panel position="top-right"><Legend /></Panel>
        <Background />
        <Controls />
        <MiniMap nodeColor={miniMapColor} pannable zoomable />
      </ReactFlow>
    </div>
  );
}

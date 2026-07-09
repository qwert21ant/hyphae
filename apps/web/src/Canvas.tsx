import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow, Background, Controls, MiniMap, Panel, ConnectionMode,
  type Node as FlowNode,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useStore } from './store';
import { buildFocusView } from './focusView';
import { layoutFocusView } from './layout';
import { focusViewToFlow, highlightSets } from './flow';
import { GroupNode } from './GroupNode';
import { NodeBox } from './NodeBox';
import { GhostNode } from './GhostNode';
import { FloatingEdge } from './FloatingEdge';
import { FilterPanel } from './FilterPanel';
import { Legend } from './Legend';

const nodeTypes = { region: GroupNode, node: NodeBox, ghost: GhostNode };
const edgeTypes = { floating: FloatingEdge };

// Animate highlight/dim changes so hover and selection fade in and out instead of snapping.
const NODE_TRANS = 'opacity 0.15s ease, box-shadow 0.15s ease, outline 0.15s ease';
const EDGE_TRANS = 'opacity 0.15s ease, stroke-width 0.15s ease';

// Colour minimap dots by layer (ghosts and regions muted) so the overview reads like the canvas.
const miniMapColor = (n: FlowNode): string => {
  if (n.type === 'ghost') return '#cbd5e1';
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

  // Transient hover, so a user can trace a node's neighborhood without committing a selection.
  // Hover takes precedence; selection is the fallback (so the highlight persists after the mouse leaves).
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  // Drilling changes focus (and remounts the graph); reset hover so the new view opens neutral.
  useEffect(() => setHoveredId(null), [focusId]);

  const view = useMemo(() => buildFocusView(model, focusId, connFilter), [model, focusId, connFilter]);
  const positions = useMemo(() => layoutFocusView(view), [view]);
  const { nodes, edges } = useMemo(() => focusViewToFlow(view, positions), [view, positions]);

  // Highlight the active node + neighbors (a region highlights its children), dim the rest.
  // Selection wins over hover: once something is selected, hovering does not change the highlight.
  // A hover is a softer preview than a selection (less emphasis, gentler dimming).
  const activeId = selectedId ?? hoveredId;
  const strong = !!selectedId;
  const accent = strong ? '#2563eb' : '#93c5fd';
  const dimEdge = strong ? 0.12 : 0.4;
  const dimNode = strong ? 0.4 : 0.65;
  const childIds = useMemo(
    () => (activeId === view.focusId ? new Set(view.children.map((n) => n.id)) : new Set<string>()),
    [activeId, view],
  );
  const hi = useMemo(() => highlightSets(activeId, edges, childIds), [activeId, edges, childIds]);

  const styledEdges = useMemo(
    () => edges.map((e) => {
      const base = { ...e.style, transition: EDGE_TRANS };
      if (hi.edges.has(e.id)) {
        const w = (typeof e.style?.strokeWidth === 'number' ? e.style.strokeWidth : 1.5) + (strong ? 1.5 : 1);
        return { ...e, style: { ...base, strokeWidth: w, opacity: strong ? 1 : 0.9 }, zIndex: 10 };
      }
      return { ...e, style: { ...base, opacity: activeId ? dimEdge : 1 } };
    }),
    [edges, hi, activeId, strong, dimEdge],
  );
  const styledNodes = useMemo(
    () => nodes.map((n) => {
      const base = { ...n.style, transition: NODE_TRANS };
      if (n.type === 'region') return n.id === selectedId ? { ...n, style: { ...base, outline: `2px solid ${accent}`, outlineOffset: 2 } } : { ...n, style: base };
      if (hi.nodes.has(n.id)) return { ...n, style: { ...base, boxShadow: `0 0 0 2px ${accent}`, borderRadius: 4 }, zIndex: 5 };
      return { ...n, style: { ...base, opacity: activeId ? dimNode : 1 } };
    }),
    [nodes, hi, activeId, strong, accent, dimNode, selectedId],
  );

  // Drill in: an external ghost, or a node with children, becomes the new focus.
  const drill = (node: FlowNode) => {
    if (node.type === 'ghost') { setFocus(node.id); return; }
    if (model.nodes.some((n) => n.parentId === node.id)) setFocus(node.id);
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

  return (
    <div style={{ flex: 1, height: '100%' }}>
      <ReactFlow
        key={focusId ?? '__root__'}
        nodes={styledNodes}
        edges={styledEdges}
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
        <Panel position="top-left"><FilterPanel /></Panel>
        <Panel position="bottom-left"><Legend /></Panel>
        <Background />
        <Controls />
        <MiniMap nodeColor={miniMapColor} pannable zoomable />
      </ReactFlow>
    </div>
  );
}

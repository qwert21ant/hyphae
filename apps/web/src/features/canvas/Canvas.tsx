import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow, Background, Controls, MiniMap, Panel, ConnectionMode, useNodesState,
  type Node as FlowNode,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useStore } from '@/state/store';
import { highlightSets } from './reactflow';
import { GroupNode } from '@/features/canvas/nodes/GroupNode';
import { NodeBox } from '@/features/canvas/nodes/NodeBox';
import { GhostNode } from '@/features/canvas/nodes/GhostNode';
import { GhostGroupNode } from '@/features/canvas/nodes/GhostGroupNode';
import { PatternMemberNode } from '@/features/canvas/nodes/PatternMemberNode';
import { FloatingEdge } from '@/features/canvas/edges/FloatingEdge';
import { decorateFlowEdges } from './flowEdges';
import { highlightCss } from './highlight';
import { useCanvasView } from './useCanvasView';
import { dragCommit, type DragState } from './layout';
import { useDrillNavigation } from './useDrillNavigation';
import { FilterPanel } from '@/features/canvas/overlay/FilterPanel';
import { Legend } from '@/features/canvas/overlay/Legend';

const nodeTypes = { region: GroupNode, node: NodeBox, ghost: GhostNode, ghostGroup: GhostGroupNode, patternMember: PatternMemberNode };
const edgeTypes = { floating: FloatingEdge };

// Colour minimap dots by layer (regions muted) so the overview reads like the canvas. The MiniMap
// renders each node as an SVG <rect style={{fill}}> (not a canvas 2D context), so a var() reference
// resolves exactly like any other inline CSS style — no JS-side lookup needed.
const miniMapColor = (n: FlowNode): string => {
  if (n.type === 'region') return 'var(--alt-2-bd)';
  const c = (n.data as { color?: { border: string } }).color;
  return c?.border ?? 'var(--tx-3)';
};

export function Canvas() {
  const focusId = useStore((s) => s.focusId);
  const selectedId = useStore((s) => s.selectedId);
  const select = useStore((s) => s.select);
  const selectedPatternId = useStore((s) => s.selectedPatternId);
  // Only feeds React Flow's colorMode prop below — a CSS class, not a node/edge rebuild — so it is
  // deliberately read outside of, and absent from, every useMemo dependency array in this file.
  const theme = useStore((s) => s.theme);

  const { view, nodes, edges, overlay, flowActive, patternFlow } = useCanvasView();
  const { onNodeClick } = useDrillNavigation();

  // The derived `nodes` are the source of truth; React Flow's copy exists only so it can animate a
  // drag — it will not move a fully controlled node without an onNodesChange handler.
  const setNodePosition = useStore((s) => s.setNodePosition);
  const setNodePositions = useStore((s) => s.setNodePositions);
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<FlowNode>([]);
  useEffect(() => { setRfNodes(nodes); }, [nodes, setRfNodes]);

  // Dragging a containment box has to carry its contents. Neither box is a React Flow *parent* —
  // children are laid out as absolute siblings — so React Flow moves the box alone and we move the
  // rest. The members' start positions are captured once, on drag start, so every frame is a single
  // delta from a fixed origin and rounding cannot accumulate.
  const dragRef = useRef<DragState | null>(null);
  const membersOf = (n: FlowNode): string[] => {
    if (n.type === 'region') return view.children.map((c) => c.id);
    if (n.type === 'ghostGroup') return view.externalGroups?.find((g) => g.id === n.id)?.childIds ?? [];
    return [];
  };
  const onNodeDragStart = (_: unknown, n: FlowNode) => {
    const ids = membersOf(n);
    if (!ids.length) { dragRef.current = null; return; }
    const at = new Map(rfNodes.map((x) => [x.id, x.position]));
    dragRef.current = {
      id: n.id,
      type: n.type ?? '',
      start: { ...n.position },
      members: ids.map((id) => ({ id, start: { ...(at.get(id) ?? { x: 0, y: 0 }) } })),
    };
  };
  // Local state only — no store write per frame, which would re-run the whole view pipeline. Every
  // member moves by the same delta from a fixed origin, so the preview matches what dragCommit
  // will write and nothing jumps on release.
  const onNodeDrag = (_: unknown, n: FlowNode) => {
    const d = dragRef.current;
    if (d?.id !== n.id) return;
    const dx = n.position.x - d.start.x;
    const dy = n.position.y - d.start.y;
    const moved = new Map(d.members.map((m) => [m.id, { x: m.start.x + dx, y: m.start.y + dy }]));
    setRfNodes((ns) => ns.map((x) => (moved.has(x.id) ? { ...x, position: moved.get(x.id)! } : x)));
  };
  const onNodeDragStop = (_: unknown, n: FlowNode) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d || d.id !== n.id) { setNodePosition(n.id, n.position); return; }
    // Read through getState rather than subscribing: this needs the overrides as they are at drop,
    // and a subscription here would re-render the canvas on every committed drag for nothing.
    setNodePositions(dragCommit(d, n.position, useStore.getState().nodePositions));
  };

  // Transient hover, so a user can trace a node's neighborhood without committing a selection.
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  // Drilling changes focus (and remounts the graph); reset hover so the new view opens neutral.
  useEffect(() => setHoveredId(null), [focusId]);

  const displayEdges = useMemo(() => decorateFlowEdges(edges, overlay), [edges, overlay]);

  // Which node/edge the highlight is about: selection wins over hover, and a flow, when one is
  // active, wins over both (its participating set drives the highlight, as a strong selection).
  // highlight.ts turns this into the injected stylesheet — see the note there on why it is CSS.
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

  const css = highlightCss({
    hi, activeId, flowActive, patternActive: !!patternFlow, strong, accent, dimEdge, dimNode,
  });

  const shownNodes = patternFlow ? patternFlow.nodes : rfNodes;
  const rfEdges = patternFlow ? patternFlow.edges : displayEdges;

  return (
    <div className="hyphae-canvas" style={{ flex: 1, height: '100%' }}>
      <style data-hyphae-hl>{css}</style>
      <ReactFlow
        key={selectedPatternId ? `pattern:${selectedPatternId}` : (focusId ?? '__root__')}
        colorMode={theme}
        nodes={shownNodes}
        onNodesChange={patternFlow ? undefined : onNodesChange}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        connectionMode={ConnectionMode.Loose}
        nodesDraggable={!patternFlow}
        // Commit on drop, not per frame: writing every frame would re-run focusViewToFlow at frame
        // rate. The region box therefore resizes when the node lands, not continuously mid-drag.
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
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

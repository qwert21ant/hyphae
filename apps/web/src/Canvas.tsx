import { useEffect, useMemo, useRef } from 'react';
import {
  ReactFlow, Background, Controls, Panel, useNodesState, ConnectionMode,
  type Connection as RFConnection, type Node as FlowNode, type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useStore } from './store';
import { toFlowNodes, toFlowEdges, regionChildIds, highlightSets, drillTarget } from './toModel';
import { GroupNode } from './GroupNode';
import { NodeBox } from './NodeBox';
import { GhostNode } from './GhostNode';
import { FloatingEdge } from './FloatingEdge';
import { FloatingConnectionLine } from './FloatingConnectionLine';
import { FilterPanel } from './FilterPanel';

type XY = { x: number; y: number };
type RegionDrag = { id: string; last: XY; start: XY; childStart: Map<string, XY> };

const nodeTypes = { region: GroupNode, node: NodeBox, ghost: GhostNode };
const edgeTypes = { floating: FloatingEdge };

export function Canvas() {
  const model = useStore((s) => s.model);
  const layer = useStore((s) => s.layer);
  const connFilter = useStore((s) => s.connFilter);
  const selectedId = useStore((s) => s.selectedId);
  const select = useStore((s) => s.select);
  const setLayer = useStore((s) => s.setLayer);
  const addConnection = useStore((s) => s.addConnection);
  const deleteConnection = useStore((s) => s.deleteConnection);
  const setNodePosition = useStore((s) => s.setNodePosition);

  // Local node state so dragging is smooth (controlled nodes only repaint on commit).
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
  const edges = useMemo(() => toFlowEdges(model, layer, connFilter), [model, layer, connFilter]);

  const rf = useRef<ReactFlowInstance | null>(null);
  const pendingFocus = useRef<string | null>(null);

  // Highlight the selection + its neighbors (a region highlights its children), and dim the rest.
  const childIds = useMemo(() => (selectedId ? regionChildIds(model, layer, selectedId) : new Set<string>()), [selectedId, model, layer]);
  const hi = useMemo(() => highlightSets(selectedId, edges, childIds), [selectedId, edges, childIds]);
  const styledEdges = useMemo(
    () =>
      edges.map((e) => {
        if (hi.edges.has(e.id)) {
          return { ...e, style: { ...e.style, strokeWidth: (typeof e.style?.strokeWidth === 'number' ? e.style.strokeWidth : 1.5) + 1.5, opacity: 1 }, zIndex: 10 };
        }
        return selectedId ? { ...e, style: { ...e.style, opacity: 0.12 } } : e;
      }),
    [edges, hi, selectedId],
  );
  const styledNodes = useMemo(
    () =>
      nodes.map((n) => {
        if (n.type === 'region') {
          return n.id === selectedId ? { ...n, style: { ...n.style, outline: '2px solid #2563eb', outlineOffset: 2 } } : n;
        }
        if (hi.nodes.has(n.id)) return { ...n, style: { ...n.style, boxShadow: '0 0 0 2px #2563eb', borderRadius: 4 }, zIndex: 5 };
        return selectedId ? { ...n, style: { ...n.style, opacity: 0.4 } } : n;
      }),
    [nodes, hi, selectedId],
  );

  // Tracks an in-progress region drag so its children move with it.
  const regionDrag = useRef<RegionDrag | null>(null);

  // Re-seed from the model whenever it or the layer changes (incl. external SSE updates).
  // The model only changes on drag-stop (we persist then), so mid-drag state isn't clobbered.
  useEffect(() => {
    setNodes(toFlowNodes(model, layer, connFilter));
  }, [model, layer, connFilter, setNodes]);

  // After a drill changed the layer and re-seeded nodes, pan/zoom to the focused region.
  useEffect(() => {
    const id = pendingFocus.current;
    if (!id || !rf.current || !nodes.some((n) => n.id === id)) return;
    pendingFocus.current = null;
    const inst = rf.current;
    requestAnimationFrame(() => inst.fitView({ nodes: [{ id }], duration: 500, padding: 0.3 }));
  }, [nodes]);

  const onConnect = (c: RFConnection) => {
    if (c.source && c.target) addConnection(c.source, c.target);
  };

  // Double-click a node to drill into the layer of its children (if any), focus its region, and select it.
  const onNodeDoubleClick = (_: unknown, node: FlowNode) => {
    const target = drillTarget(model, node.id);
    if (!target || target === layer) return;
    pendingFocus.current = node.id;
    setLayer(target);
    select(node.id);
  };

  const onNodeDragStart = (_: unknown, node: FlowNode) => {
    if (node.type !== 'region') return;
    const childIds = regionChildIds(model, layer, node.id);
    regionDrag.current = {
      id: node.id,
      last: { ...node.position },
      start: { ...node.position },
      childStart: new Map(nodes.filter((n) => childIds.has(n.id)).map((n) => [n.id, { ...n.position }])),
    };
  };

  const onNodeDrag = (_: unknown, node: FlowNode) => {
    const d = regionDrag.current;
    if (!d || d.id !== node.id) return;
    const dx = node.position.x - d.last.x;
    const dy = node.position.y - d.last.y;
    if (dx === 0 && dy === 0) return;
    d.last = { ...node.position };
    setNodes((ns) => ns.map((n) => (d.childStart.has(n.id) ? { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } } : n)));
  };

  const onNodeDragStop = (_: unknown, node: FlowNode) => {
    const d = regionDrag.current;
    if (d && d.id === node.id) {
      const tdx = node.position.x - d.start.x;
      const tdy = node.position.y - d.start.y;
      d.childStart.forEach((p, id) => setNodePosition(id, { x: p.x + tdx, y: p.y + tdy }));
      regionDrag.current = null;
    } else {
      setNodePosition(node.id, node.position);
    }
  };

  return (
    <div style={{ flex: 1, height: '100%' }}>
      <ReactFlow
        nodes={styledNodes}
        edges={styledEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        connectionMode={ConnectionMode.Loose}
        connectionLineComponent={FloatingConnectionLine}
        onInit={(inst) => { rf.current = inst; }}
        onNodesChange={onNodesChange}
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onNodeClick={(_, n) => select(n.id)}
        onNodeDoubleClick={onNodeDoubleClick}
        onEdgeClick={(_, e) => { if (!(e.data as { derived?: boolean } | undefined)?.derived) select(e.id); }}
        onEdgesDelete={(es) => es.forEach((e) => deleteConnection(e.id))}
        onPaneClick={() => select(null)}
        fitView
      >
        <Panel position="top-left"><FilterPanel /></Panel>
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}

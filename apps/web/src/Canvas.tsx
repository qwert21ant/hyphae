import { useEffect, useMemo, useRef } from 'react';
import {
  ReactFlow, Background, Controls, Panel, useNodesState, ConnectionMode,
  type Connection as RFConnection, type Node as FlowNode,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useStore } from './store';
import { toFlowNodes, toFlowEdges, regionChildIds } from './toModel';
import { GroupNode } from './GroupNode';
import { NodeBox } from './NodeBox';
import { FloatingEdge } from './FloatingEdge';
import { FloatingConnectionLine } from './FloatingConnectionLine';
import { FilterPanel } from './FilterPanel';

type XY = { x: number; y: number };
type RegionDrag = { id: string; last: XY; start: XY; childStart: Map<string, XY> };

const nodeTypes = { region: GroupNode, node: NodeBox };
const edgeTypes = { floating: FloatingEdge };

export function Canvas() {
  const model = useStore((s) => s.model);
  const layer = useStore((s) => s.layer);
  const connFilter = useStore((s) => s.connFilter);
  const select = useStore((s) => s.select);
  const addConnection = useStore((s) => s.addConnection);
  const deleteConnection = useStore((s) => s.deleteConnection);
  const setNodePosition = useStore((s) => s.setNodePosition);

  // Local node state so dragging is smooth (controlled nodes only repaint on commit).
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
  const edges = useMemo(() => toFlowEdges(model, layer, connFilter), [model, layer, connFilter]);

  // Tracks an in-progress region drag so its children move with it.
  const regionDrag = useRef<RegionDrag | null>(null);

  // Re-seed from the model whenever it or the layer changes (incl. external SSE updates).
  // The model only changes on drag-stop (we persist then), so mid-drag state isn't clobbered.
  useEffect(() => {
    setNodes(toFlowNodes(model, layer));
  }, [model, layer, setNodes]);

  const onConnect = (c: RFConnection) => {
    if (c.source && c.target) addConnection(c.source, c.target);
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
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        connectionMode={ConnectionMode.Loose}
        connectionLineComponent={FloatingConnectionLine}
        onNodesChange={onNodesChange}
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onNodeClick={(_, n) => select(n.id)}
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

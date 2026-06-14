import { useEffect, useMemo } from 'react';
import {
  ReactFlow, Background, Controls, useNodesState,
  type Connection as RFConnection, type Node as FlowNode,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useStore } from './store';
import { toFlowNodes, toFlowEdges } from './toModel';
import { GroupNode } from './GroupNode';

const nodeTypes = { region: GroupNode };

export function Canvas() {
  const model = useStore((s) => s.model);
  const layer = useStore((s) => s.layer);
  const select = useStore((s) => s.select);
  const addConnection = useStore((s) => s.addConnection);
  const deleteConnection = useStore((s) => s.deleteConnection);
  const setNodePosition = useStore((s) => s.setNodePosition);

  // Local node state so dragging is smooth (controlled nodes only repaint on commit).
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
  const edges = useMemo(() => toFlowEdges(model, layer), [model, layer]);

  // Re-seed from the model whenever it or the layer changes (incl. external SSE updates).
  // The model only changes on drag-stop (we persist then), so mid-drag state isn't clobbered.
  useEffect(() => {
    setNodes(toFlowNodes(model, layer));
  }, [model, layer, setNodes]);

  const onConnect = (c: RFConnection) => {
    if (c.source && c.target) addConnection(c.source, c.target);
  };

  return (
    <div style={{ flex: 1, height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStop={(_, node) => setNodePosition(node.id, node.position)}
        onConnect={onConnect}
        onNodeClick={(_, n) => select(n.id)}
        onEdgeClick={(_, e) => select(e.id)}
        onEdgesDelete={(es) => es.forEach((e) => deleteConnection(e.id))}
        onPaneClick={() => select(null)}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}

import { useMemo } from 'react';
import {
  ReactFlow, Background, Controls,
  type Connection as RFConnection, type NodeChange, applyNodeChanges,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useStore } from './store';
import { toFlowNodes, toFlowEdges } from './toModel';

export function Canvas() {
  const model = useStore((s) => s.model);
  const layer = useStore((s) => s.layer);
  const select = useStore((s) => s.select);
  const addConnection = useStore((s) => s.addConnection);
  const deleteConnection = useStore((s) => s.deleteConnection);
  const setNodePosition = useStore((s) => s.setNodePosition);

  const nodes = useMemo(() => toFlowNodes(model, layer), [model, layer]);
  const edges = useMemo(() => toFlowEdges(model, layer), [model, layer]);

  const onNodesChange = (changes: NodeChange[]) => {
    // We only persist final drag positions; React Flow re-renders from store.
    for (const ch of changes) {
      if (ch.type === 'position' && ch.position && ch.dragging === false) {
        setNodePosition(ch.id, ch.position);
      }
    }
    applyNodeChanges(changes, nodes); // keep RF internal happy; result discarded
  };

  const onConnect = (c: RFConnection) => {
    if (c.source && c.target) addConnection(c.source, c.target);
  };

  return (
    <div style={{ flex: 1, height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
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

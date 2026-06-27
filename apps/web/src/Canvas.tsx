import { useMemo } from 'react';
import {
  ReactFlow, Background, Controls, Panel, ConnectionMode,
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

const nodeTypes = { region: GroupNode, node: NodeBox, ghost: GhostNode };
const edgeTypes = { floating: FloatingEdge };

export function Canvas() {
  const model = useStore((s) => s.model);
  const focusId = useStore((s) => s.focusId);
  const connFilter = useStore((s) => s.connFilter);
  const selectedId = useStore((s) => s.selectedId);
  const select = useStore((s) => s.select);
  const setFocus = useStore((s) => s.setFocus);

  const view = useMemo(() => buildFocusView(model, focusId, connFilter), [model, focusId, connFilter]);
  const positions = useMemo(() => layoutFocusView(view), [view]);
  const { nodes, edges } = useMemo(() => focusViewToFlow(view, positions), [view, positions]);

  // Highlight the selection + neighbors (a region highlights its children), dim the rest.
  const childIds = useMemo(
    () => (selectedId === view.focusId ? new Set(view.children.map((n) => n.id)) : new Set<string>()),
    [selectedId, view],
  );
  const hi = useMemo(() => highlightSets(selectedId, edges, childIds), [selectedId, edges, childIds]);

  const styledEdges = useMemo(
    () => edges.map((e) => {
      if (hi.edges.has(e.id)) return { ...e, style: { ...e.style, strokeWidth: (typeof e.style?.strokeWidth === 'number' ? e.style.strokeWidth : 1.5) + 1.5, opacity: 1 }, zIndex: 10 };
      return selectedId ? { ...e, style: { ...e.style, opacity: 0.12 } } : e;
    }),
    [edges, hi, selectedId],
  );
  const styledNodes = useMemo(
    () => nodes.map((n) => {
      if (n.type === 'region') return n.id === selectedId ? { ...n, style: { ...n.style, outline: '2px solid #2563eb', outlineOffset: 2 } } : n;
      if (hi.nodes.has(n.id)) return { ...n, style: { ...n.style, boxShadow: '0 0 0 2px #2563eb', borderRadius: 4 }, zIndex: 5 };
      return selectedId ? { ...n, style: { ...n.style, opacity: 0.4 } } : n;
    }),
    [nodes, hi, selectedId],
  );

  // Double-click drills in: a node with children, or any external ghost, becomes the new focus.
  const onNodeDoubleClick = (_: unknown, node: FlowNode) => {
    if (node.type === 'ghost') { setFocus(node.id); return; }
    const hasChildren = model.nodes.some((n) => n.parentId === node.id);
    if (hasChildren) setFocus(node.id);
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
        onNodeClick={(_, n) => select(n.id)}
        onNodeDoubleClick={onNodeDoubleClick}
        onEdgeClick={(_, e) => { if (!(e.data as { derived?: boolean } | undefined)?.derived) select(e.id); }}
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

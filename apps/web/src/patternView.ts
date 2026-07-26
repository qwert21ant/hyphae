import dagre from '@dagrejs/dagre';
import type { Node as FlowNode, Edge as FlowEdge } from '@xyflow/react';
import { MarkerType } from '@xyflow/react';
import { patternKindDefOf, type Pattern, type Profile, type Node as ModelNode } from '@hyphae/schema';
import { NODE_W, NODE_H } from './layout';

export type PatternMemberData = {
  name: string;
  binding: 'node' | 'ref' | 'none';
  detail: string;       // node name (node), ref string (ref), or '' (none)
  description: string;
  nodeId?: string;      // set only when the member binds to a node that EXISTS — the navigable ones.
                        // React Flow keys these nodes by member name, so navigation must use this.
};

const H_GAP = 60;   // horizontal pitch between ordered stages
const V_GAP = 40;   // vertical pitch between stacked (unordered) members

function memberData(m: Pattern['members'][number], nodes: ModelNode[]): PatternMemberData {
  if (m.nodeId !== undefined) {
    const node = nodes.find((n) => n.id === m.nodeId);
    return { name: m.name, binding: 'node', detail: node?.name ?? m.nodeId, description: m.description, nodeId: node?.id };
  }
  if (m.ref !== undefined) return { name: m.name, binding: 'ref', detail: m.ref, description: m.description };
  return { name: m.name, binding: 'none', detail: '', description: m.description };
}

function memberNode(m: Pattern['members'][number], nodes: ModelNode[], x: number, y: number): FlowNode {
  return {
    id: m.name,
    type: 'patternMember',
    position: { x, y },
    data: memberData(m, nodes),
    initialWidth: NODE_W,
    initialHeight: NODE_H,
    draggable: false,
  };
}

const arrow = { type: MarkerType.ArrowClosed, color: '#475569' };
const seqEdge = (source: string, target: string, id: string, label = ''): FlowEdge => ({
  id, source, target, label,
  sourceHandle: 'r', targetHandle: 'l',
  style: { stroke: '#475569' },
  labelStyle: { fill: '#475569', fontWeight: 500 },
  markerEnd: arrow,
});

/** Build the React-Flow nodes/edges that draw one pattern as its own diagram.
 *  Node ids and edge endpoints are member names (unique within a pattern). */
export function patternViewToFlow(pattern: Pattern, profile: Profile, nodes: ModelNode[]): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const kind = patternKindDefOf(profile, pattern.kind);
  const renderer = kind?.renderer;

  if (renderer === 'state-machine') {
    // Lay states out by their transition graph, left to right.
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: 'LR', nodesep: V_GAP, ranksep: H_GAP, marginx: 20, marginy: 20 });
    g.setDefaultEdgeLabel(() => ({}));
    for (const m of pattern.members) g.setNode(m.name, { width: NODE_W, height: NODE_H });
    for (const t of pattern.transitions) if (t.from !== t.to) g.setEdge(t.from, t.to);
    dagre.layout(g);
    const flowNodes = pattern.members.map((m) => {
      const d = g.node(m.name);
      const x = d ? d.x - NODE_W / 2 : 0;
      const y = d ? d.y - NODE_H / 2 : 0;
      return memberNode(m, nodes, x, y);
    });
    const edges = pattern.transitions.map((t, i) => seqEdge(t.from, t.to, `t-${i}`, t.trigger));
    return { nodes: flowNodes, edges };
  }

  if (kind?.ordered) {
    // pipeline / middleware: a row of stages with sequential arrows.
    const flowNodes = pattern.members.map((m, i) => memberNode(m, nodes, i * (NODE_W + H_GAP), 0));
    const edges: FlowEdge[] = [];
    for (let i = 0; i < pattern.members.length - 1; i++) {
      edges.push(seqEdge(pattern.members[i].name, pattern.members[i + 1].name, `seq-${i}`));
    }
    return { nodes: flowNodes, edges };
  }

  // Fallback (layered / event-bus / unknown): a vertical stack, no edges.
  const flowNodes = pattern.members.map((m, i) => memberNode(m, nodes, 0, i * (NODE_H + V_GAP)));
  return { nodes: flowNodes, edges: [] };
}

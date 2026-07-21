import type { Edge as FlowEdge } from '@xyflow/react';
import type { Flow, FlowStep } from '@hyphae/schema';

export type StepBadge = { order: number; message: string; kind: FlowStep['kind'] };

export type FlowOverlay = {
  edgeSteps: Map<string, StepBadge[]>;   // edge id -> the steps it hosts, in order
  participatingNodes: Set<string>;       // stay bright; the rest dims
  participatingEdges: Set<string>;
  offViewSteps: FlowStep[];              // endpoints not both visible, or no drawn edge joins them
};

/** Does this drawn edge carry connection `connId` — directly (a real edge) or via rollup? */
function edgeHostsConnection(edge: FlowEdge, connId: string): boolean {
  if (edge.id === connId) return true;
  const rb = (edge.data as { realizedBy?: string[] } | undefined)?.realizedBy;
  return Array.isArray(rb) && rb.includes(connId);
}

function edgeJoins(edge: FlowEdge, step: FlowStep): boolean {
  const ends = new Set([edge.source, edge.target]);
  return ends.has(step.from) && ends.has(step.to);
}

/** Map a flow onto the currently-drawn edges: which edge hosts which numbered step, who
 *  participates (to keep bright), and which steps cannot be drawn in this view. */
export function computeFlowOverlay(flow: Flow, edges: FlowEdge[], visibleNodeIds: Set<string>): FlowOverlay {
  const edgeSteps = new Map<string, StepBadge[]>();
  const participatingNodes = new Set<string>();
  const participatingEdges = new Set<string>();
  const offViewSteps: FlowStep[] = [];

  for (const step of [...flow.steps].sort((a, b) => a.order - b.order)) {
    if (!visibleNodeIds.has(step.from) || !visibleNodeIds.has(step.to)) { offViewSteps.push(step); continue; }
    let candidates = edges.filter((e) => edgeJoins(e, step));
    if (step.via) {
      const via = step.via;
      candidates = [...candidates].sort((a, b) => Number(edgeHostsConnection(b, via)) - Number(edgeHostsConnection(a, via)));
    }
    const host = candidates[0];
    if (!host) { offViewSteps.push(step); continue; }
    (edgeSteps.get(host.id) ?? edgeSteps.set(host.id, []).get(host.id)!).push({ order: step.order, message: step.message, kind: step.kind });
    participatingEdges.add(host.id);
    participatingNodes.add(step.from);
    participatingNodes.add(step.to);
  }
  return { edgeSteps, participatingNodes, participatingEdges, offViewSteps };
}

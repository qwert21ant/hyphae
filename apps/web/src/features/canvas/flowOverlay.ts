import type { Edge as FlowEdge } from '@xyflow/react';
import type { Flow, FlowStep } from '@hyphae/schema';

export type StepBadge = { order: number; message: string; kind: FlowStep['kind'] };

/** A step whose endpoints are both drawn but which no structural edge carries — the canvas
 *  synthesizes an edge for it so the step is visible while its flow is selected. */
export type EphemeralEdge = { id: string; source: string; target: string };

export type FlowOverlay = {
  edgeSteps: Map<string, StepBadge[]>;   // edge id -> the steps it hosts, in order
  participatingNodes: Set<string>;       // stay bright; the rest dims
  participatingEdges: Set<string>;
  ephemeralEdges: EphemeralEdge[];       // behavior with no authored connection behind it
  offViewSteps: FlowStep[];              // an endpoint is not drawn in this view at all
};

/** One ephemeral edge per unordered pair, so a call and its return share a single curve — the same
 *  way two steps on one authored connection share it. */
const ephemeralId = (a: string, b: string) => `flow-step:${a < b ? `${a}|${b}` : `${b}|${a}`}`;

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
 *  participates (to keep bright), which steps need an ephemeral edge of their own, and which
 *  steps cannot be drawn here at all. */
export function computeFlowOverlay(flow: Flow, edges: FlowEdge[], visibleNodeIds: Set<string>): FlowOverlay {
  const edgeSteps = new Map<string, StepBadge[]>();
  const participatingNodes = new Set<string>();
  const participatingEdges = new Set<string>();
  const ephemeral = new Map<string, EphemeralEdge>();
  const offViewSteps: FlowStep[] = [];

  for (const step of [...flow.steps].sort((a, b) => a.order - b.order)) {
    if (!visibleNodeIds.has(step.from) || !visibleNodeIds.has(step.to)) { offViewSteps.push(step); continue; }
    let candidates = edges.filter((e) => edgeJoins(e, step));
    if (step.via) {
      const via = step.via;
      candidates = [...candidates].sort((a, b) => Number(edgeHostsConnection(b, via)) - Number(edgeHostsConnection(a, via)));
    }
    const host = candidates[0];
    // Both endpoints are drawn but nothing joins them: the flow asserts a behavioral step the
    // structure doesn't carry (no connection authored, or the step names no `via`). Give it its own
    // ephemeral edge instead of hiding the step in a view that plainly shows both of its endpoints.
    let hostId: string;
    if (host) {
      hostId = host.id;
    } else {
      hostId = ephemeralId(step.from, step.to);
      if (!ephemeral.has(hostId)) ephemeral.set(hostId, { id: hostId, source: step.from, target: step.to });
    }
    (edgeSteps.get(hostId) ?? edgeSteps.set(hostId, []).get(hostId)!).push({ order: step.order, message: step.message, kind: step.kind });
    participatingEdges.add(hostId);
    participatingNodes.add(step.from);
    participatingNodes.add(step.to);
  }
  return { edgeSteps, participatingNodes, participatingEdges, ephemeralEdges: [...ephemeral.values()], offViewSteps };
}

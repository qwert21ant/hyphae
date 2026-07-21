import { describe, it, expect } from 'vitest';
import { computeFlowOverlay } from '../src/flowOverlay';
import type { Flow } from '@hyphae/schema';
import type { Edge as FlowEdge } from '@xyflow/react';

const flow = (steps: Flow['steps']): Flow => ({ id: 'f', name: 'F', description: '', scope: null, steps });
const edges: FlowEdge[] = [
  { id: 'c1', source: 'a', target: 'b' },
  { id: 'agg:a->c', source: 'a', target: 'c', data: { realizedBy: ['c2', 'c3'] } },
];
const visible = new Set(['a', 'b', 'c']);

describe('computeFlowOverlay', () => {
  it('badges the edge matching a step, marking participants', () => {
    const o = computeFlowOverlay(flow([{ order: 1, from: 'a', to: 'b', message: 'go', kind: 'Sync' }]), edges, visible);
    expect(o.edgeSteps.get('c1')).toEqual([{ order: 1, message: 'go', kind: 'Sync' }]);
    expect([...o.participatingNodes].sort()).toEqual(['a', 'b']);
    expect([...o.participatingEdges]).toEqual(['c1']);
    expect(o.offViewSteps).toEqual([]);
  });

  it('matches an edge regardless of step orientation (a Return)', () => {
    const o = computeFlowOverlay(flow([{ order: 1, from: 'b', to: 'a', message: 'back', kind: 'Return' }]), edges, visible);
    expect(o.edgeSteps.get('c1')).toEqual([{ order: 1, message: 'back', kind: 'Return' }]);
  });

  it('hosts multiple steps on one edge, sorted by order', () => {
    const o = computeFlowOverlay(flow([
      { order: 2, from: 'b', to: 'a', message: 'back', kind: 'Return' },
      { order: 1, from: 'a', to: 'b', message: 'go', kind: 'Sync' },
    ]), edges, visible);
    expect(o.edgeSteps.get('c1')).toEqual([
      { order: 1, message: 'go', kind: 'Sync' },
      { order: 2, message: 'back', kind: 'Return' },
    ]);
  });

  it('prefers the edge whose connection matches via', () => {
    const two: FlowEdge[] = [
      { id: 'c1', source: 'a', target: 'b' },
      { id: 'agg:a->b', source: 'a', target: 'b', data: { realizedBy: ['cX'] } },
    ];
    const o = computeFlowOverlay(flow([{ order: 1, from: 'a', to: 'b', via: 'cX', message: 'go', kind: 'Sync' }]), two, new Set(['a', 'b']));
    expect(o.edgeSteps.has('agg:a->b')).toBe(true);
    expect(o.edgeSteps.has('c1')).toBe(false);
  });

  it('lists a step off-view when an endpoint is not visible', () => {
    const o = computeFlowOverlay(flow([{ order: 1, from: 'a', to: 'z', message: 'go', kind: 'Sync' }]), edges, visible);
    expect(o.offViewSteps.map((s) => s.order)).toEqual([1]);
    expect(o.participatingEdges.size).toBe(0);
  });

  it('lists a step off-view when both endpoints are visible but no drawn edge joins them', () => {
    const o = computeFlowOverlay(flow([{ order: 1, from: 'b', to: 'c', message: 'x', kind: 'Sync' }]), edges, visible);
    expect(o.offViewSteps.map((s) => s.order)).toEqual([1]);
  });
});

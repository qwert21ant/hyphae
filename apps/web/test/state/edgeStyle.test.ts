import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '@/state/store';

describe('edgeStyle', () => {
  beforeEach(() => { useStore.setState({ edgeStyle: 'curved' }); });

  // Curved, not squared: on the real model orthogonal runs through a converging fan cross about
  // 130 times more often than curves through the same ports.
  it('defaults to curved', () => {
    expect(useStore.getState().edgeStyle).toBe('curved');
  });

  it('switches to squared and back', () => {
    useStore.getState().setEdgeStyle('squared');
    expect(useStore.getState().edgeStyle).toBe('squared');
    useStore.getState().setEdgeStyle('curved');
    expect(useStore.getState().edgeStyle).toBe('curved');
  });

  it('is not reset by changing focus — it is a viewing preference, not a layout override', () => {
    useStore.getState().setEdgeStyle('squared');
    useStore.getState().setFocus('anything');
    expect(useStore.getState().edgeStyle).toBe('squared');
  });
});

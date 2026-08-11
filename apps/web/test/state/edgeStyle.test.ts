import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '@/state/store';

describe('edgeStyle', () => {
  beforeEach(() => { useStore.setState({ edgeStyle: 'squared' }); });

  it('defaults to squared', () => {
    expect(useStore.getState().edgeStyle).toBe('squared');
  });

  it('switches to curved and back', () => {
    useStore.getState().setEdgeStyle('curved');
    expect(useStore.getState().edgeStyle).toBe('curved');
    useStore.getState().setEdgeStyle('squared');
    expect(useStore.getState().edgeStyle).toBe('squared');
  });

  it('is not reset by changing focus — it is a viewing preference, not a layout override', () => {
    useStore.getState().setEdgeStyle('curved');
    useStore.getState().setFocus('anything');
    expect(useStore.getState().edgeStyle).toBe('curved');
  });
});

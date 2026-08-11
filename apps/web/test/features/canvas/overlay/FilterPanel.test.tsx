import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FilterPanel } from '@/features/canvas/overlay/FilterPanel';
import { useStore } from '@/state/store';

describe('layout controls', () => {
  beforeEach(() => {
    useStore.setState({ nodePositions: {}, edgeStyle: 'squared' });
  });

  it('shows reset layout only once something has been dragged', () => {
    const { rerender } = render(<FilterPanel />);
    expect(screen.queryByText('reset layout')).toBeNull();
    useStore.getState().setNodePosition('a', { x: 1, y: 2 });
    rerender(<FilterPanel />);
    fireEvent.click(screen.getByText('reset layout'));
    expect(useStore.getState().nodePositions).toEqual({});
  });

  // The group used to render nothing until a drag had happened. The edge-style toggle is not
  // conditional, so it would have been invisible almost all of the time.
  it('offers the edge style toggle even when nothing has been dragged', () => {
    render(<FilterPanel />);
    expect(screen.getByText('curved edges')).toBeTruthy();
  });

  it('switches the store to curved, then offers the way back', () => {
    const { rerender } = render(<FilterPanel />);
    fireEvent.click(screen.getByText('curved edges'));
    expect(useStore.getState().edgeStyle).toBe('curved');
    rerender(<FilterPanel />);
    expect(screen.getByText('squared edges')).toBeTruthy();
  });
});

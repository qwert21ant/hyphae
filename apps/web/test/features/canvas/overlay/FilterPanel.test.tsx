import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FilterPanel } from '@/features/canvas/overlay/FilterPanel';
import { useStore } from '@/state/store';

describe('layout controls', () => {
  beforeEach(() => {
    useStore.setState({ nodePositions: {} });
  });

  it('shows reset layout only once something has been dragged', () => {
    const { rerender } = render(<FilterPanel />);
    expect(screen.queryByText('reset layout')).toBeNull();
    useStore.getState().setNodePosition('a', { x: 1, y: 2 });
    rerender(<FilterPanel />);
    fireEvent.click(screen.getByText('reset layout'));
    expect(useStore.getState().nodePositions).toEqual({});
  });
});

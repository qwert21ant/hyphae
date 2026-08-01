import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FilterPanel } from '@/features/canvas/overlay/FilterPanel';
import { useStore } from '@/state/store';

describe('density controls', () => {
  beforeEach(() => {
    useStore.setState({ quietHubsOn: true, hubThreshold: 10, nodePositions: {} });
  });

  it('toggles quieting from the panel', () => {
    render(<FilterPanel />);
    fireEvent.click(screen.getByLabelText('Quiet hubs'));
    expect(useStore.getState().quietHubsOn).toBe(false);
  });

  it('sets the threshold from the stepper', () => {
    render(<FilterPanel />);
    fireEvent.change(screen.getByLabelText('Hub threshold'), { target: { value: '12' } });
    expect(useStore.getState().hubThreshold).toBe(12);
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

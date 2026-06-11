import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { App } from './App';
import { useStore } from './store';
import { emptyModel } from '@hyphae/schema';

beforeEach(() => {
  useStore.getState().setModel(emptyModel());
  // React Flow needs layout measurement; stub it so the canvas renders in jsdom.
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});

describe('App', () => {
  it('switches the active layer via the dropdown', () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('layer'), { target: { value: 'Container' } });
    expect(useStore.getState().layer).toBe('Container');
  });

  it('adds a node of the first type for the active layer', () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('layer'), { target: { value: 'Component' } });
    fireEvent.click(screen.getByRole('button', { name: /add component/i }));
    expect(useStore.getState().model.nodes.map((n) => n.type)).toEqual(['Component']);
  });
});

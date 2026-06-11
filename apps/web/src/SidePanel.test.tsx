import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SidePanel } from './SidePanel';
import { useStore } from './store';
import { emptyModel } from '@hyphae/schema';

beforeEach(() => useStore.getState().setModel(emptyModel()));

describe('SidePanel', () => {
  it('shows a hint when nothing is selected', () => {
    render(<SidePanel />);
    expect(screen.getByText(/no node selected/i)).toBeTruthy();
  });

  it('edits the selected node name', () => {
    useStore.getState().addNode('Component');
    render(<SidePanel />);
    const input = screen.getByLabelText('name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Payments' } });
    expect(useStore.getState().model.nodes[0].name).toBe('Payments');
  });

  it('edits invariants as newline-separated list', () => {
    useStore.getState().addNode('Component');
    render(<SidePanel />);
    const ta = screen.getByLabelText('invariants') as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: 'a\nb' } });
    expect(useStore.getState().model.nodes[0].invariants).toEqual(['a', 'b']);
  });
});

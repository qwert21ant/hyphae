import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SearchBox } from '../src/SearchBox';
import { useStore } from '../src/store';
import { emptyModel, type Node } from '@hyphae/schema';

const mk = (over: Partial<Node>): Node => ({
  id: 'n', name: 'N', type: 'Component', description: '', parentId: null, root: null, role: null, codeRefs: [],
  docRefs: [], createdAt: 't', updatedAt: 't', fields: {}, ...over,
});

beforeEach(() => {
  const m = emptyModel();
  m.nodes.push(
    mk({ id: 'sys', name: 'Media Gateway', type: 'System' }),
    mk({ id: 'ca', name: 'Media Store', type: 'Container', parentId: 'sys' }),
    mk({ id: 'other', name: 'Billing', type: 'Container' }),
  );
  useStore.setState({ model: m, focusId: null, selectedId: null });
});

describe('SearchBox', () => {
  it('shows name-matching results and hides non-matches', () => {
    render(<SearchBox />);
    fireEvent.change(screen.getByLabelText('search nodes'), { target: { value: 'media' } });
    expect(screen.getByText('Media Gateway')).toBeTruthy();
    expect(screen.getByText('Media Store')).toBeTruthy();
    expect(screen.queryByText('Billing')).toBeNull();
  });

  it('clicking a result reveals the node (focus parent + select)', () => {
    render(<SearchBox />);
    fireEvent.change(screen.getByLabelText('search nodes'), { target: { value: 'store' } });
    // mouseDown (not click): fires before the input's blur so the pick isn't lost to blur-close.
    fireEvent.mouseDown(screen.getByText('Media Store'));
    expect(useStore.getState().focusId).toBe('sys');
    expect(useStore.getState().selectedId).toBe('ca');
  });

  it('Enter picks the first (highest-ranked) result', () => {
    render(<SearchBox />);
    const input = screen.getByLabelText('search nodes');
    fireEvent.change(input, { target: { value: 'Billing' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(useStore.getState().selectedId).toBe('other');
  });

  it('Escape clears the query and closes the dropdown', () => {
    render(<SearchBox />);
    const input = screen.getByLabelText('search nodes') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'media' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input.value).toBe('');
    expect(screen.queryByText('Media Gateway')).toBeNull();
  });
});

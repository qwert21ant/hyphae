import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Altimeter } from '../src/Altimeter';
import { useStore } from '../src/store';
import type { Model } from '@hyphae/schema';

const model = {
  nodes: [
    { id: 'sys', name: 'Baritone', type: 'System', parentId: null, role: null, description: '', root: null, codeRefs: [], docRefs: [], fields: {} },
    { id: 'ctr', name: 'bot core', type: 'Container', parentId: 'sys', role: null, description: '', root: null, codeRefs: [], docRefs: [], fields: {} },
    { id: 'cmp', name: 'pathing', type: 'Component', parentId: 'ctr', role: null, description: '', root: null, codeRefs: [], docRefs: [], fields: {} },
  ],
  connections: [], flows: [], patterns: [], profile: 'c4-backend',
} as unknown as Model;

describe('Altimeter', () => {
  beforeEach(() => {
    useStore.setState({ model, focusId: 'cmp' });
  });

  it('renders one crumb per ancestor, root first', () => {
    render(<Altimeter />);
    const crumbs = screen.getAllByRole('button');
    // breadcrumbPath always prepends the synthetic { id: null, name: 'Root' } entry (see
    // focusView.ts), so the rendered chain leads with it ahead of the model ancestors.
    expect(crumbs.map((b) => b.textContent)).toEqual(['Root', 'Baritone', 'bot core', 'pathing']);
  });

  // The point of the element: depth is legible without reading the names.
  it('marks the deepest crumb as the current altitude', () => {
    render(<Altimeter />);
    expect(screen.getByRole('button', { name: 'pathing' }).closest('.altimeter__band')!.classList
      .contains('altimeter__band--current')).toBe(true);
    expect(screen.getByRole('button', { name: 'Baritone' }).closest('.altimeter__band')!.classList
      .contains('altimeter__band--current')).toBe(false);
  });

  it('bands a crumb by its node type layer', () => {
    render(<Altimeter />);
    expect(screen.getByRole('button', { name: 'Baritone' }).closest('.altimeter__band')!
      .getAttribute('data-layer')).toBe('Context');
    expect(screen.getByRole('button', { name: 'pathing' }).closest('.altimeter__band')!
      .getAttribute('data-layer')).toBe('Component');
  });

  it('ascends when an ancestor crumb is clicked', () => {
    render(<Altimeter />);
    fireEvent.click(screen.getByRole('button', { name: 'bot core' }));
    expect(useStore.getState().focusId).toBe('ctr');
  });
});

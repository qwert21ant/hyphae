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

  // The band label used to be the LAYER name sliced to three letters, which prints "CON" for both
  // Context (a System) and Container — two different altitudes, identical text. The node's own type
  // is what the reader can act on and is unique across the profile's kinds.
  it('labels each band with its node type, not an ambiguous layer abbreviation', () => {
    render(<Altimeter />);
    const labelOf = (crumb: string) =>
      screen.getByRole('button', { name: crumb }).closest('.altimeter__band')!
        .querySelector('.altimeter__layer')!.textContent;
    expect(labelOf('Baritone')).toBe('SYS');
    expect(labelOf('bot core')).toBe('CON');
    expect(labelOf('pathing')).toBe('COM');
  });

  // Every band carries a label, so the altimeter is the same height at every depth. Without one on
  // the root band the whole toolbar grew a line the moment you drilled in.
  it('labels the root band too, so no band is shorter than another', () => {
    const { container } = render(<Altimeter />);
    const bands = container.querySelectorAll('.altimeter__band');
    expect(bands.length).toBe(4);
    for (const band of bands) expect(band.querySelector('.altimeter__layer')!.textContent).toBeTruthy();
  });

  it('ascends when an ancestor crumb is clicked', () => {
    render(<Altimeter />);
    fireEvent.click(screen.getByRole('button', { name: 'bot core' }));
    expect(useStore.getState().focusId).toBe('ctr');
  });
});

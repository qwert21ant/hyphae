import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { isEmptyValue, Row, ListRow, NodeLink, FieldRow } from '../src/FieldRows';
import type { FieldDef, Node } from '@hyphae/schema';

const mk = (over: Partial<Node>): Node => ({
  id: 'x', name: 'X', type: 'Component', description: '', parentId: null, root: null, role: null,
  codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {}, ...over,
});
const def = (over: Partial<FieldDef>): FieldDef => ({ key: 'k', type: 'text', description: 'd', ...over });
const nodes = [mk({ id: 'a1', name: 'A1' })];

describe('isEmptyValue', () => {
  it('treats absent, blank and empty-list values as empty', () => {
    expect(isEmptyValue(undefined)).toBe(true);
    expect(isEmptyValue(null)).toBe(true);
    expect(isEmptyValue('')).toBe(true);
    expect(isEmptyValue([])).toBe(true);
  });

  it('treats false and 0 as values, not absences', () => {
    expect(isEmptyValue(false)).toBe(false);
    expect(isEmptyValue(0)).toBe(false);
    expect(isEmptyValue('x')).toBe(false);
    expect(isEmptyValue(['x'])).toBe(false);
  });
});

describe('Row', () => {
  it('renders the label and the value as text, with no form control', () => {
    const { container } = render(<Row label="root">endpoints/api/</Row>);
    expect(screen.getByText('root')).toBeTruthy();
    expect(screen.getByText('endpoints/api/')).toBeTruthy();
    expect(container.querySelector('input, select, textarea')).toBeNull();
  });
});

describe('ListRow', () => {
  it('renders one list item per entry', () => {
    const { container } = render(<ListRow label="codeRefs" items={['src/main.ts', 'src/util.ts']} />);
    expect([...container.querySelectorAll('li')].map((li) => li.textContent))
      .toEqual(['src/main.ts', 'src/util.ts']);
  });

  it('renders nothing at all when the list is empty', () => {
    const { container } = render(<ListRow label="codeRefs" items={[]} />);
    expect(container.innerHTML).toBe('');
  });
});

describe('NodeLink', () => {
  it('renders the target name as a button that navigates by id', () => {
    const onNavigate = vi.fn();
    render(<NodeLink id="a1" nodes={nodes} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole('button', { name: 'A1' }));
    expect(onNavigate).toHaveBeenCalledWith('a1');
  });

  it('shows an unresolvable id as dimmed text rather than dropping it', () => {
    render(<NodeLink id="ghost" nodes={nodes} onNavigate={vi.fn()} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('ghost')).toBeTruthy();
  });
});

describe('FieldRow', () => {
  const noop = vi.fn();

  it('renders nothing for an empty value', () => {
    const { container } = render(<FieldRow def={def({ key: 'summary' })} value="" nodes={nodes} onNavigate={noop} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders a list field as list items', () => {
    const { container } = render(
      <FieldRow def={def({ key: 'invariants', type: 'list' })} value={['a', 'b']} nodes={nodes} onNavigate={noop} />,
    );
    expect([...container.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['a', 'b']);
  });

  it('renders a non-array value for a list-typed field as a single item instead of throwing', () => {
    const { container } = render(
      <FieldRow def={def({ key: 'invariants', type: 'list' })} value="always x" nodes={nodes} onNavigate={noop} />,
    );
    expect([...container.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['always x']);
  });

  it('renders a boolean as yes or no, including false', () => {
    render(<FieldRow def={def({ key: 'cached', type: 'boolean' })} value={false} nodes={nodes} onNavigate={noop} />);
    expect(screen.getByText('no')).toBeTruthy();
  });

  it('renders the number zero rather than omitting it', () => {
    render(<FieldRow def={def({ key: 'replicas', type: 'number' })} value={0} nodes={nodes} onNavigate={noop} />);
    expect(screen.getByText('0')).toBeTruthy();
  });

  it('renders a ref field as a navigable node name', () => {
    const onNavigate = vi.fn();
    render(<FieldRow def={def({ key: 'owner', type: 'ref' })} value="a1" nodes={nodes} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole('button', { name: 'A1' }));
    expect(onNavigate).toHaveBeenCalledWith('a1');
  });

  it('prefers the field def label over its key', () => {
    render(<FieldRow def={def({ key: 'tech', label: 'technology' })} value="Go" nodes={nodes} onNavigate={noop} />);
    expect(screen.getByText('technology')).toBeTruthy();
    expect(screen.queryByText('tech')).toBeNull();
  });

  it('never renders a form control, whatever the field type', () => {
    const { container } = render(
      <>
        <FieldRow def={def({ key: 'a' })} value="text" nodes={nodes} onNavigate={noop} />
        <FieldRow def={def({ key: 'b', type: 'number' })} value={2} nodes={nodes} onNavigate={noop} />
        <FieldRow def={def({ key: 'c', type: 'boolean' })} value={true} nodes={nodes} onNavigate={noop} />
        <FieldRow def={def({ key: 'd', type: 'list' })} value={['x']} nodes={nodes} onNavigate={noop} />
        <FieldRow def={def({ key: 'e', type: 'enum' })} value="one" nodes={nodes} onNavigate={noop} />
        <FieldRow def={def({ key: 'f', type: 'ref' })} value="a1" nodes={nodes} onNavigate={noop} />
      </>,
    );
    expect(container.querySelector('input, select, textarea')).toBeNull();
  });
});

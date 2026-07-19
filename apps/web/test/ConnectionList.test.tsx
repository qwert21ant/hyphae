import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConnectionList } from '../src/ConnectionList';
import { useStore } from '../src/store';
import { emptyModel, type Node, type Connection } from '@hyphae/schema';

const mkNode = (over: Partial<Node>): Node => ({
  id: 'n', name: 'N', type: 'Component', description: '', parentId: null, root: null, role: null, codeRefs: [],
  docRefs: [], createdAt: 't', updatedAt: 't', fields: {}, ...over,
});

const conns: Connection[] = [
  { id: 'x', from: 'a1', to: 'b1', type: 'Dependency', verb: 'uses', object: '', description: '', direction: 'Unidirectional', realizedBy: [], codeRefs: [], fields: { transport: 'Sync' } },
];

beforeEach(() => {
  const m = emptyModel();
  m.nodes.push(
    mkNode({ id: 'ca', name: 'Alpha', type: 'Container' }),
    mkNode({ id: 'a1', name: 'A1', parentId: 'ca' }),
    mkNode({ id: 'b1', name: 'B1', parentId: 'ca' }),
  );
  useStore.setState({ model: m, selectedId: null, focusId: null });
});

describe('ConnectionList', () => {
  it('renders a row per connection with endpoint names and kind/transport', () => {
    render(<ConnectionList connections={conns} />);
    expect(screen.getByRole('button', { name: 'A1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'B1' })).toBeTruthy();
    expect(screen.getByText(/Dependency/)).toBeTruthy();
    expect(screen.getByText(/Sync/)).toBeTruthy();
  });

  it('clicking the row selects the connection', () => {
    const { container } = render(<ConnectionList connections={conns} />);
    fireEvent.click(container.querySelector('li')!);
    expect(useStore.getState().selectedId).toBe('x');
  });

  it('clicking an endpoint focuses its node without selecting the row', () => {
    useStore.setState({ selectedId: 'orig' });
    render(<ConnectionList connections={conns} />);
    fireEvent.click(screen.getByRole('button', { name: 'A1' }));
    expect(useStore.getState().focusId).toBe('a1');
    // stopPropagation: the row's select('x') never fired (setFocus cleared selection to null).
    expect(useStore.getState().selectedId).not.toBe('x');
  });
});

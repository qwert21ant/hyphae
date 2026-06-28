import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../src/api', () => {
  let v = 0;
  const base = (over: Record<string, unknown>) => ({
    id: 'x', name: 'X', type: 'Component', description: '', parentId: null, codeRefs: [],
    docRefs: [], createdAt: 't', updatedAt: 't', fields: {}, ...over,
  });
  const blank = () => ({
    schemaVersion: 1, metadata: { name: 'Untitled', description: '', createdAt: 't', updatedAt: 't' },
    activeProfile: 'c4-backend', nodes: [], connections: [], flows: [], stateMachines: [],
    dataTypes: [], requirements: [], decisions: [], views: [],
  });
  class ApiError extends Error { constructor(public status: number, public body: unknown) { super('x'); } }
  return {
    ApiError,
    loadModel: vi.fn(async () => ({ model: blank(), version: v })),
    createNode: vi.fn(async (input: { id: string; name: string; type: string }) => ({ node: base({ id: input.id, name: input.name, type: input.type }), version: ++v })),
    updateNode: vi.fn(async (id: string, patch: Record<string, unknown>) => ({ node: base({ id, ...patch }), version: ++v })),
    deleteNode: vi.fn(async () => ({ version: ++v })),
    createConnection: vi.fn(async () => ({ connection: {}, version: ++v })),
    updateConnection: vi.fn(async (id: string, patch: Record<string, unknown>) => ({ connection: { id, from: 'a', to: 'b', type: 'Dependency', description: '', direction: 'Unidirectional', realizedBy: [], codeRefs: [], fields: {}, ...patch }, version: ++v })),
    deleteConnection: vi.fn(async () => ({ version: ++v })),
    setNodePosition: vi.fn(async () => ({ version: ++v })),
  };
});

import { SidePanel } from '../src/SidePanel';
import { useStore } from '../src/store';
import { emptyModel, type Node, type Connection } from '@hyphae/schema';

beforeEach(() => useStore.getState().setModel(emptyModel(), 0));

describe('SidePanel', () => {
  it('shows a hint when nothing is selected', () => {
    render(<SidePanel />);
    expect(screen.getByText(/no node selected/i)).toBeTruthy();
  });

  it('edits the selected node name', async () => {
    await useStore.getState().addNode('Component');
    render(<SidePanel />);
    fireEvent.change(screen.getByLabelText('name') as HTMLInputElement, { target: { value: 'Payments' } });
    await waitFor(() => expect(useStore.getState().model.nodes[0].name).toBe('Payments'));
  });

  it('edits invariants as a newline-separated list', async () => {
    await useStore.getState().addNode('Component');
    render(<SidePanel />);
    fireEvent.change(screen.getByLabelText('invariants') as HTMLTextAreaElement, { target: { value: 'a\nb' } });
    await waitFor(() => expect(useStore.getState().model.nodes[0].fields.invariants).toEqual(['a', 'b']));
  });

  it('reparents the selected node via the parent dropdown', async () => {
    const mk = (over: Partial<Node>): Node => ({
      id: 'x', name: 'X', type: 'Component', description: '', parentId: null, codeRefs: [],
      docRefs: [], createdAt: 't', updatedAt: 't', fields: {}, ...over,
    });
    useStore.setState((s) => ({
      model: {
        ...s.model,
        nodes: [mk({ id: 'cont', name: 'API', type: 'Container' }), mk({ id: 'comp', name: 'C', type: 'Component' })],
      },
      selectedId: 'comp',
    }));
    render(<SidePanel />);
    fireEvent.change(screen.getByLabelText('parent'), { target: { value: 'cont' } });
    await waitFor(() => expect(useStore.getState().model.nodes.find((n) => n.id === 'comp')?.parentId).toBe('cont'));
  });

  it('shows the selected connection and edits its transport', async () => {
    await useStore.getState().addNode('Component');
    await useStore.getState().addNode('Component');
    const [a, b] = useStore.getState().model.nodes.map((n) => n.id);
    useStore.setState((s) => ({
      model: {
        ...s.model,
        connections: [{ id: 'conn1', from: a, to: b, type: 'Dependency', description: '', direction: 'Unidirectional', realizedBy: [], codeRefs: [], fields: {} }],
      },
      selectedId: 'conn1',
    }));
    render(<SidePanel />);
    expect(screen.getByRole('heading', { name: /connection/i })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('transport'), { target: { value: 'Sync' } });
    await waitFor(() => expect(useStore.getState().model.connections[0].fields.transport).toBe('Sync'));
  });

  it('shows a rolled-up connection with its underlying connections and drills on click', () => {
    const mk = (over: Partial<Node>): Node => ({
      id: 'x', name: 'X', type: 'Component', description: '', parentId: null, codeRefs: [],
      docRefs: [], createdAt: 't', updatedAt: 't', fields: {}, ...over,
    });
    useStore.setState((s) => ({
      model: {
        ...s.model,
        nodes: [
          mk({ id: 'sys', name: 'Sys', type: 'System' }),
          mk({ id: 'ca', name: 'Alpha', type: 'Container', parentId: 'sys' }),
          mk({ id: 'cb', name: 'Beta', type: 'Container', parentId: 'sys' }),
          mk({ id: 'a1', name: 'A1', type: 'Component', parentId: 'ca' }),
          mk({ id: 'b1', name: 'B1', type: 'Component', parentId: 'cb' }),
        ],
        connections: [{ id: 'x1', from: 'a1', to: 'b1', type: 'Dependency', description: '', direction: 'Unidirectional', realizedBy: [], codeRefs: [], fields: { transport: 'Sync' } }],
      },
      focusId: 'sys',
      selectedId: 'agg:ca->cb',
    }));
    render(<SidePanel />);
    expect(screen.getByRole('heading', { name: /rolled-up connection/i })).toBeTruthy();
    expect(screen.getByText('Alpha → Beta')).toBeTruthy();
    expect(screen.getByText(/1 connection/i)).toBeTruthy();
    expect(screen.getByText(/Dependency/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'A1' }));
    expect(useStore.getState().focusId).toBe('a1');
  });

  it('lists a connection\'s realizedBy children and selects a child on row click', () => {
    const mk = (over: Partial<Node>): Node => ({
      id: 'x', name: 'X', type: 'Component', description: '', parentId: null, codeRefs: [],
      docRefs: [], createdAt: 't', updatedAt: 't', fields: {}, ...over,
    });
    const conn = (over: Partial<Connection>): Connection => ({
      id: 'c', from: 'a1', to: 'b1', type: 'Dependency', description: '', direction: 'Unidirectional',
      realizedBy: [], codeRefs: [], fields: {}, ...over,
    });
    useStore.setState((s) => ({
      model: {
        ...s.model,
        nodes: [mk({ id: 'ca', name: 'Alpha', type: 'Container' }), mk({ id: 'a1', name: 'A1', parentId: 'ca' }), mk({ id: 'b1', name: 'B1', parentId: 'ca' })],
        connections: [
          conn({ id: 'parent', realizedBy: ['child1', 'missing'] }),
          conn({ id: 'child1', type: 'DataFlow', fields: { transport: 'Async' } }),
        ],
      },
      selectedId: 'parent',
    }));
    render(<SidePanel />);
    // missing child id is skipped → count is 1, not 2
    expect(screen.getByText(/realized by \(1\)/i)).toBeTruthy();
    const list = document.querySelector('.rollup-list')!;
    fireEvent.click(list.querySelector('li')!);
    expect(useStore.getState().selectedId).toBe('child1');
  });
});

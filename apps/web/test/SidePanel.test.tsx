import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../src/api', () => {
  let v = 0;
  const base = (over: Record<string, unknown>) => ({
    id: 'x', name: 'X', type: 'Component', description: '', responsibilities: [], invariants: [],
    assumptions: [], failureModes: [], tags: [], status: 'Active', parentId: null, codeRefs: [],
    docRefs: [], createdAt: 't', updatedAt: 't', ...over,
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
    updateConnection: vi.fn(async (id: string, patch: Record<string, unknown>) => ({ connection: { id, from: 'a', to: 'b', relationCategory: 'Dependency', transport: 'None', description: '', direction: 'Unidirectional', realizes: [], codeRefs: [], ...patch }, version: ++v })),
    deleteConnection: vi.fn(async () => ({ version: ++v })),
    setNodePosition: vi.fn(async () => ({ version: ++v })),
  };
});

import { SidePanel } from '../src/SidePanel';
import { useStore } from '../src/store';
import { emptyModel } from '@hyphae/schema';

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
    await waitFor(() => expect(useStore.getState().model.nodes[0].invariants).toEqual(['a', 'b']));
  });

  it('shows the selected connection and edits its transport', async () => {
    await useStore.getState().addNode('Component');
    await useStore.getState().addNode('Component');
    const [a, b] = useStore.getState().model.nodes.map((n) => n.id);
    useStore.setState((s) => ({
      model: {
        ...s.model,
        connections: [{ id: 'conn1', from: a, to: b, relationCategory: 'Dependency', transport: 'None', description: '', direction: 'Unidirectional', realizes: [], codeRefs: [] }],
      },
      selectedId: 'conn1',
    }));
    render(<SidePanel />);
    expect(screen.getByRole('heading', { name: /connection/i })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('transport'), { target: { value: 'Sync' } });
    await waitFor(() => expect(useStore.getState().model.connections[0].transport).toBe('Sync'));
  });
});

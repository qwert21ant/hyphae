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
    deleteConnection: vi.fn(async () => ({ version: ++v })),
    setNodePosition: vi.fn(async () => ({ version: ++v })),
  };
});

import { App } from '../src/App';
import { useStore } from '../src/store';
import { emptyModel } from '@hyphae/schema';

beforeEach(() => {
  useStore.getState().setModel(emptyModel(), 0);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('EventSource', class { addEventListener() {} close() {} });
});

describe('App', () => {
  it('switches the active layer via the dropdown', () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('layer'), { target: { value: 'Container' } });
    expect(useStore.getState().layer).toBe('Container');
  });

  it('adds a node of the first type for the active layer', async () => {
    render(<App />);
    // Let the initial loadModel() in App's effect settle first, so its setModel
    // can't clobber the node we add below (setTimeout(0) flushes all microtasks).
    await new Promise((r) => setTimeout(r, 0));
    fireEvent.change(screen.getByLabelText('layer'), { target: { value: 'Component' } });
    fireEvent.click(screen.getByRole('button', { name: /add component/i }));
    await waitFor(() => expect(useStore.getState().model.nodes.map((n) => n.type)).toEqual(['Component']));
  });
});

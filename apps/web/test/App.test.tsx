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
    createNode: vi.fn(async (input: { id: string; name: string; type: string; parentId?: string | null }) => ({ node: base({ id: input.id, name: input.name, type: input.type, parentId: input.parentId ?? null }), version: ++v })),
    updateNode: vi.fn(async (id: string, patch: Record<string, unknown>) => ({ node: base({ id, ...patch }), version: ++v })),
    deleteNode: vi.fn(async () => ({ version: ++v })),
    createConnection: vi.fn(async () => ({ connection: {}, version: ++v })),
    deleteConnection: vi.fn(async () => ({ version: ++v })),
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
  it('shows the Root breadcrumb at the top level', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: 'Root' })).toBeTruthy();
  });

  it('adds a top-level node at the root and parents it to null', async () => {
    render(<App />);
    await new Promise((r) => setTimeout(r, 0)); // let initial loadModel settle
    fireEvent.click(screen.getByRole('button', { name: /add system/i }));
    await waitFor(() => expect(useStore.getState().model.nodes.map((n) => n.type)).toEqual(['System']));
    expect(useStore.getState().model.nodes[0].parentId).toBeNull();
  });

  it('toggles audience from the toolbar', async () => {
    render(<App />);
    await new Promise((r) => setTimeout(r, 0));
    fireEvent.click(screen.getByRole('button', { name: /stakeholder/i }));
    expect(useStore.getState().audience).toBe('stakeholder');
    fireEvent.click(screen.getByRole('button', { name: /full/i }));
    expect(useStore.getState().audience).toBe('full');
  });
});

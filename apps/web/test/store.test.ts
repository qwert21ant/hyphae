import { describe, it, expect, beforeEach, vi } from 'vitest';
import { emptyModel } from '@hyphae/schema';

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
  class ApiError extends Error {
    constructor(public status: number, public body: unknown) { super('x'); this.name = 'ApiError'; }
  }
  return {
    ApiError,
    loadModel: vi.fn(async () => ({ model: blank(), version: v })),
    createNode: vi.fn(async (input: { id: string; name: string; type: string; parentId?: string | null }) => ({ node: base({ id: input.id, name: input.name, type: input.type, parentId: input.parentId ?? null }), version: ++v })),
    updateNode: vi.fn(async (id: string, patch: Record<string, unknown>) => ({ node: base({ id, ...patch }), version: ++v })),
    deleteNode: vi.fn(async () => ({ version: ++v })),
    createConnection: vi.fn(async (input: { id: string; from: string; to: string; type: string }) => ({ connection: { id: input.id, from: input.from, to: input.to, type: input.type, description: '', direction: 'Unidirectional', realizedBy: [], codeRefs: [], fields: {} }, version: ++v })),
    updateConnection: vi.fn(async (id: string, patch: Record<string, unknown>) => ({ connection: { id, from: 'a', to: 'b', type: 'Dependency', description: '', direction: 'Unidirectional', realizedBy: [], codeRefs: [], fields: {}, ...patch }, version: ++v })),
    deleteConnection: vi.fn(async () => ({ version: ++v })),
  };
});

import { useStore } from '../src/store';

beforeEach(() => useStore.getState().setModel(emptyModel(), 0));

describe('editor store', () => {
  it('adds a node from the server response', async () => {
    await useStore.getState().addNode('Component');
    const { model, ownVersion } = useStore.getState();
    expect(model.nodes).toHaveLength(1);
    expect(model.nodes[0].type).toBe('Component');
    expect(ownVersion).toBeGreaterThan(0);
  });

  it('updates a node field', async () => {
    await useStore.getState().addNode('Component');
    const id = useStore.getState().model.nodes[0].id;
    await useStore.getState().updateNode(id, { name: 'Renamed' });
    expect(useStore.getState().model.nodes[0].name).toBe('Renamed');
  });

  it('deletes a node and its connections', async () => {
    await useStore.getState().addNode('Component');
    await useStore.getState().addNode('Component');
    const [a, b] = useStore.getState().model.nodes.map((n) => n.id);
    await useStore.getState().addConnection(a, b);
    await useStore.getState().deleteNode(a);
    const m = useStore.getState().model;
    expect(m.nodes).toHaveLength(1);
    expect(m.connections).toHaveLength(0);
  });

  it('updates a connection field', async () => {
    await useStore.getState().addNode('Component');
    await useStore.getState().addNode('Component');
    const [a, b] = useStore.getState().model.nodes.map((n) => n.id);
    await useStore.getState().addConnection(a, b);
    const cid = useStore.getState().model.connections[0].id;
    await useStore.getState().updateConnection(cid, { fields: { transport: 'Sync' } });
    expect(useStore.getState().model.connections[0].fields.transport).toBe('Sync');
  });

  it('reparents a node (sets parentId)', async () => {
    await useStore.getState().addNode('Component');
    const id = useStore.getState().model.nodes[0].id;
    await useStore.getState().reparent(id, 'cont');
    expect(useStore.getState().model.nodes[0].parentId).toBe('cont');
  });

  it('adds a node as a child of the current focus', async () => {
    useStore.getState().setFocus('ca');
    await useStore.getState().addNode('Component');
    expect(useStore.getState().model.nodes[0].parentId).toBe('ca');
    expect(useStore.getState().focusId).toBe('ca');
  });

  it('refetches and surfaces the issue when a write is rejected (422)', async () => {
    const api = await import('../src/api');
    (api.createNode as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new api.ApiError(422, { issues: [{ message: 'unknown type' }] }));
    await useStore.getState().addNode('Bogus');
    expect(useStore.getState().error).toContain('unknown type');
    expect(useStore.getState().model.nodes).toHaveLength(0);
  });
});

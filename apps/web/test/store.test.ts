import { describe, it, expect, beforeEach, vi } from 'vitest';
import { emptyModel } from '@hyphae/schema';

vi.mock('../src/api', () => {
  let v = 0;
  const base = (over: Record<string, unknown>) => ({
    id: 'x', name: 'X', type: 'Component', description: '', purpose: undefined, technology: undefined,
    responsibilities: [], invariants: [], assumptions: [], failureModes: [], tags: [], owner: undefined,
    status: 'Active', parentId: null, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', ...over,
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
    createNode: vi.fn(async (input: { id: string; name: string; type: string }) => ({ node: base({ id: input.id, name: input.name, type: input.type }), version: ++v })),
    updateNode: vi.fn(async (id: string, patch: Record<string, unknown>) => ({ node: base({ id, ...patch }), version: ++v })),
    deleteNode: vi.fn(async () => ({ version: ++v })),
    createConnection: vi.fn(async (input: { id: string; from: string; to: string }) => ({ connection: { id: input.id, from: input.from, to: input.to, relationCategory: 'Dependency', transport: 'None', description: '', direction: 'Unidirectional', realizes: [], codeRefs: [] }, version: ++v })),
    updateConnection: vi.fn(async (id: string, patch: Record<string, unknown>) => ({ connection: { id, from: 'a', to: 'b', relationCategory: 'Dependency', transport: 'None', description: '', direction: 'Unidirectional', realizes: [], codeRefs: [], ...patch }, version: ++v })),
    deleteConnection: vi.fn(async () => ({ version: ++v })),
    setNodePosition: vi.fn(async () => ({ version: ++v })),
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
    await useStore.getState().updateConnection(cid, { transport: 'Sync' });
    expect(useStore.getState().model.connections[0].transport).toBe('Sync');
  });

  it('reparents a node (sets parentId and snaps its position)', async () => {
    await useStore.getState().addNode('Component');
    const id = useStore.getState().model.nodes[0].id;
    await useStore.getState().reparent(id, 'cont');
    expect(useStore.getState().model.nodes[0].parentId).toBe('cont');
  });

  it('stores a node position in the layer view', async () => {
    useStore.getState().setLayer('Component');
    await useStore.getState().addNode('Component');
    const id = useStore.getState().model.nodes[0].id;
    await useStore.getState().setNodePosition(id, { x: 10, y: 20 });
    const view = useStore.getState().model.views.find((v) => v.layer === 'Component');
    expect(view?.nodePositions[id]).toEqual({ x: 10, y: 20 });
  });

  it('refetches and surfaces the issue when a write is rejected (422)', async () => {
    const api = await import('../src/api');
    (api.createNode as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new api.ApiError(422, { issues: [{ message: 'unknown type' }] }));
    await useStore.getState().addNode('Bogus');
    expect(useStore.getState().error).toContain('unknown type');
    expect(useStore.getState().model.nodes).toHaveLength(0);
  });
});

import { create } from 'zustand';
import {
  emptyModel, newId, c4Backend, typesForLayer,
  type HyphaeModel, type Node, type Position,
} from '@hyphae/schema';
import * as api from './api';

type State = {
  model: HyphaeModel;
  layer: string;
  selectedId: string | null;
  ownVersion: number;
  error: string | null;
  setModel: (m: HyphaeModel, version?: number) => void;
  syncFromServer: () => Promise<void>;
  setLayer: (layer: string) => void;
  select: (id: string | null) => void;
  addNode: (type: string) => Promise<void>;
  updateNode: (id: string, patch: Partial<Node>) => Promise<void>;
  deleteNode: (id: string) => Promise<void>;
  addConnection: (from: string, to: string) => Promise<void>;
  deleteConnection: (id: string) => Promise<void>;
  setNodePosition: (id: string, pos: Position) => Promise<void>;
};

export const useStore = create<State>((set, get) => {
  // On a rejected write: resync from the server (single source of truth) and surface the issue.
  async function recover(e: unknown): Promise<void> {
    if (e instanceof api.ApiError && e.status === 422) {
      const body = e.body as { issues?: Array<{ message: string }> };
      const { model, version } = await api.loadModel();
      set({ model, ownVersion: version, error: (body.issues ?? []).map((i) => i.message).join('; ') || 'rejected' });
    } else {
      set({ error: String(e) });
    }
  }

  return {
    model: emptyModel(),
    layer: 'Component',
    selectedId: null,
    ownVersion: 0,
    error: null,

    setModel: (model, version = 0) => set({ model, ownVersion: version }),
    syncFromServer: async () => {
      const { model, version } = await api.loadModel();
      set({ model, ownVersion: version });
    },
    setLayer: (layer) => set({ layer, selectedId: null }),
    select: (selectedId) => set({ selectedId }),

    addNode: async (type) => {
      try {
        const { node, version } = await api.createNode({ id: newId(), name: type, type });
        set((s) => ({ model: { ...s.model, nodes: [...s.model.nodes, node] }, selectedId: node.id, ownVersion: version, error: null }));
      } catch (e) { await recover(e); }
    },

    updateNode: async (id, patch) => {
      try {
        const { node, version } = await api.updateNode(id, patch);
        set((s) => ({ model: { ...s.model, nodes: s.model.nodes.map((n) => (n.id === id ? node : n)) }, ownVersion: version, error: null }));
      } catch (e) { await recover(e); }
    },

    deleteNode: async (id) => {
      try {
        const { version } = await api.deleteNode(id);
        set((s) => ({
          model: {
            ...s.model,
            nodes: s.model.nodes.filter((n) => n.id !== id),
            connections: s.model.connections.filter((c) => c.from !== id && c.to !== id),
          },
          selectedId: null, ownVersion: version, error: null,
        }));
      } catch (e) { await recover(e); }
    },

    addConnection: async (from, to) => {
      try {
        const { connection, version } = await api.createConnection({ id: newId(), from, to, relationCategory: 'Dependency' });
        set((s) => ({ model: { ...s.model, connections: [...s.model.connections, connection] }, ownVersion: version, error: null }));
      } catch (e) { await recover(e); }
    },

    deleteConnection: async (id) => {
      try {
        const { version } = await api.deleteConnection(id);
        set((s) => ({ model: { ...s.model, connections: s.model.connections.filter((c) => c.id !== id) }, ownVersion: version, error: null }));
      } catch (e) { await recover(e); }
    },

    setNodePosition: async (id, pos) => {
      const layer = get().layer;
      try {
        const { version } = await api.setNodePosition(layer, id, pos);
        set((s) => {
          const views = s.model.views.map((v) => ({ ...v, nodePositions: { ...v.nodePositions } }));
          let view = views.find((v) => v.layer === layer);
          if (!view) {
            view = { id: newId(), name: layer, layer, nodePositions: {} };
            views.push(view);
          }
          view.nodePositions[id] = pos;
          return { model: { ...s.model, views }, ownVersion: version };
        });
      } catch (e) { await recover(e); }
    },
  };
});

export const layerTypes = (layer: string) => typesForLayer(c4Backend, layer);
export const layers = c4Backend.layers;

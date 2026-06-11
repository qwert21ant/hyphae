import { create } from 'zustand';
import {
  emptyModel, newId, now, c4Backend, typesForLayer,
  type HyphaeModel, type Node, type Position,
} from '@hyphae/schema';
import { saveModel } from './api';

type State = {
  model: HyphaeModel;
  layer: string;
  selectedId: string | null;
  setModel: (m: HyphaeModel) => void;
  setLayer: (layer: string) => void;
  select: (id: string | null) => void;
  addNode: (type: string) => void;
  updateNode: (id: string, patch: Partial<Node>) => void;
  deleteNode: (id: string) => void;
  addConnection: (from: string, to: string) => void;
  deleteConnection: (id: string) => void;
  setNodePosition: (id: string, pos: Position) => void;
};

function persist(model: HyphaeModel) {
  model.metadata.updatedAt = now();
  void saveModel(model).catch((e) => console.error(e));
}

export const useStore = create<State>((set, get) => ({
  model: emptyModel(),
  layer: 'Component',
  selectedId: null,

  setModel: (model) => set({ model }),
  setLayer: (layer) => set({ layer, selectedId: null }),
  select: (selectedId) => set({ selectedId }),

  addNode: (type) => {
    const ts = now();
    const node: Node = {
      id: newId(), name: type, type, description: '', responsibilities: [],
      invariants: [], assumptions: [], failureModes: [], tags: [], status: 'Active',
      parentId: null, codeRefs: [], docRefs: [], createdAt: ts, updatedAt: ts,
    };
    const model = { ...get().model, nodes: [...get().model.nodes, node] };
    set({ model, selectedId: node.id });
    persist(model);
  },

  updateNode: (id, patch) => {
    const model = {
      ...get().model,
      nodes: get().model.nodes.map((n) => (n.id === id ? { ...n, ...patch, updatedAt: now() } : n)),
    };
    set({ model });
    persist(model);
  },

  deleteNode: (id) => {
    const model = {
      ...get().model,
      nodes: get().model.nodes.filter((n) => n.id !== id),
      connections: get().model.connections.filter((c) => c.from !== id && c.to !== id),
    };
    set({ model, selectedId: null });
    persist(model);
  },

  addConnection: (from, to) => {
    const conn = {
      id: newId(), from, to, relationCategory: 'Dependency' as const, transport: 'None' as const,
      description: '', direction: 'Unidirectional' as const, realizes: [], codeRefs: [],
    };
    const model = { ...get().model, connections: [...get().model.connections, conn] };
    set({ model });
    persist(model);
  },

  deleteConnection: (id) => {
    const model = { ...get().model, connections: get().model.connections.filter((c) => c.id !== id) };
    set({ model });
    persist(model);
  },

  setNodePosition: (id, pos) => {
    const { model, layer } = get();
    const views = [...model.views];
    let view = views.find((v) => v.layer === layer);
    if (!view) {
      view = { id: newId(), name: layer, layer, nodePositions: {} };
      views.push(view);
    }
    view.nodePositions = { ...view.nodePositions, [id]: pos };
    const next = { ...model, views };
    set({ model: next });
    persist(next);
  },
}));

export const layerTypes = (layer: string) => typesForLayer(c4Backend, layer);
export const layers = c4Backend.layers;

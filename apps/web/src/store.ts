import { create } from 'zustand';
import {
  emptyModel, newId,
  type HyphaeModel, type Node, type Connection, type FlowStep,
} from '@hyphae/schema';
import { stepReveal, type Audience, type ConnFilter } from './focusView';
import * as api from './api';

export type { ConnFilter };

type State = {
  model: HyphaeModel;
  focusId: string | null;
  selectedId: string | null;
  selectedFlowId: string | null;
  selectedPatternId: string | null;
  ownVersion: number;
  error: string | null;
  connFilter: ConnFilter;
  audience: Audience;
  expandedExternals: Set<string>;
  offViewStepOrders: number[];
  setModel: (m: HyphaeModel, version?: number) => void;
  syncFromServer: () => Promise<void>;
  setFocus: (id: string | null) => void;
  revealNode: (id: string) => void;
  revealStep: (step: FlowStep) => void;
  select: (id: string | null) => void;
  selectFlow: (id: string | null) => void;
  selectPattern: (id: string | null) => void;
  setOffViewSteps: (orders: number[]) => void;
  setAudience: (a: Audience) => void;
  toggleConnVerbClass: (value: string) => void;
  toggleConnField: (key: string, value: string) => void;
  clearConnFilter: () => void;
  toggleExternal: (id: string) => void;
  addNode: (type: string) => Promise<void>;
  updateNode: (id: string, patch: Partial<Node>) => Promise<void>;
  reparent: (id: string, parentId: string | null) => Promise<void>;
  deleteNode: (id: string) => Promise<void>;
  addConnection: (from: string, to: string) => Promise<void>;
  updateConnection: (id: string, patch: Partial<Connection>) => Promise<void>;
  deleteConnection: (id: string) => Promise<void>;
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

  const initialAudience: Audience =
    (typeof localStorage !== 'undefined' && localStorage.getItem('hyphae.audience') === 'stakeholder')
      ? 'stakeholder' : 'full';

  return {
    model: emptyModel(),
    focusId: null,
    selectedId: null,
    selectedFlowId: null,
    selectedPatternId: null,
    ownVersion: 0,
    error: null,
    connFilter: { verbClasses: [], fields: {} },
    audience: initialAudience,
    expandedExternals: new Set<string>(),
    offViewStepOrders: [],

    setModel: (model, version = 0) => set({ model, ownVersion: version }),
    syncFromServer: async () => {
      const { model, version } = await api.loadModel();
      set({ model, ownVersion: version });
    },
    setFocus: (focusId) => set({ focusId, selectedId: null, expandedExternals: new Set<string>() }),
    // Jump to a node from search, the tree, or a pattern member: focus its parent (root when
    // top-level) so the node shows as a highlighted child box, and select it. Atomic so setFocus's
    // selectedId reset can't clobber it. Any flow/pattern selection is dropped — this is an explicit
    // "show me this node", and a selected pattern would otherwise keep replacing the canvas.
    revealNode: (id) => {
      const nodes = get().model.nodes;
      const n = nodes.find((x) => x.id === id);
      if (!n) return;
      const parentId = n.parentId && nodes.some((x) => x.id === n.parentId) ? n.parentId : null;
      set({
        focusId: parentId, selectedId: id, expandedExternals: new Set<string>(),
        selectedFlowId: null, selectedPatternId: null,
      });
    },
    // Jump to a flow step: focus the view that owns both endpoints, expand whatever external hides
    // the far one, and select the step's connection. Atomic for the same reason as revealNode.
    revealStep: (step) => {
      const target = stepReveal(get().model, step);
      if (!target) return;
      set({ focusId: target.focusId, selectedId: target.selectedId, expandedExternals: target.expand });
    },
    select: (selectedId) => set({ selectedId }),
    // Selecting a flow jumps to its first step, so the overlay is never invisible: a flow authored
    // at another altitude would otherwise light nothing at the current focus. Deselecting doesn't move.
    selectFlow: (selectedFlowId) => {
      set({ selectedFlowId, selectedPatternId: null });
      if (!selectedFlowId) return;
      const flow = get().model.flows.find((f) => f.id === selectedFlowId);
      const first = flow ? [...flow.steps].sort((a, b) => a.order - b.order)[0] : undefined;
      if (first) get().revealStep(first);
    },
    selectPattern: (selectedPatternId) => set({ selectedPatternId, selectedFlowId: null }),
    // Which steps of the selected flow the canvas could not draw. Only the canvas knows (it depends
    // on the drawn edges), and only the tree shows it — so it is published here rather than lifted.
    // Skipping an equal update keeps the canvas's publish effect from cycling.
    setOffViewSteps: (orders) =>
      set((s) => (s.offViewStepOrders.length === orders.length && s.offViewStepOrders.every((o, i) => o === orders[i])
        ? {} : { offViewStepOrders: orders })),
    setAudience: (audience) => {
      if (typeof localStorage !== 'undefined') localStorage.setItem('hyphae.audience', audience);
      set({ audience });
    },

    toggleConnVerbClass: (value) =>
      set((s) => {
        const verbClasses = s.connFilter.verbClasses.includes(value)
          ? s.connFilter.verbClasses.filter((v) => v !== value)
          : [...s.connFilter.verbClasses, value];
        return { connFilter: { ...s.connFilter, verbClasses } };
      }),
    toggleConnField: (key, value) =>
      set((s) => {
        const cur = s.connFilter.fields[key] ?? [];
        const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
        return { connFilter: { ...s.connFilter, fields: { ...s.connFilter.fields, [key]: next } } };
      }),
    clearConnFilter: () => set({ connFilter: { verbClasses: [], fields: {} } }),

    toggleExternal: (id) =>
      set((s) => {
        const next = new Set(s.expandedExternals);
        if (next.has(id)) next.delete(id); else next.add(id);
        return { expandedExternals: next };
      }),

    addNode: async (type) => {
      try {
        const parentId = get().focusId;
        const { node, version } = await api.createNode({ id: newId(), name: type, type, parentId });
        set((s) => ({ model: { ...s.model, nodes: [...s.model.nodes, node] }, selectedId: node.id, ownVersion: version, error: null }));
      } catch (e) { await recover(e); }
    },

    updateNode: async (id, patch) => {
      try {
        const { node, version } = await api.updateNode(id, patch);
        set((s) => ({ model: { ...s.model, nodes: s.model.nodes.map((n) => (n.id === id ? node : n)) }, ownVersion: version, error: null }));
      } catch (e) { await recover(e); }
    },

    reparent: async (id, parentId) => {
      // Positions are absolute; the node keeps its spot and the new region grows to wrap it.
      await get().updateNode(id, { parentId });
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
        const { connection, version } = await api.createConnection({ id: newId(), from, to, type: 'Dependency' });
        set((s) => ({ model: { ...s.model, connections: [...s.model.connections, connection] }, ownVersion: version, error: null }));
      } catch (e) { await recover(e); }
    },

    updateConnection: async (id, patch) => {
      try {
        const { connection, version } = await api.updateConnection(id, patch);
        set((s) => ({ model: { ...s.model, connections: s.model.connections.map((c) => (c.id === id ? connection : c)) }, ownVersion: version, error: null }));
      } catch (e) { await recover(e); }
    },

    deleteConnection: async (id) => {
      try {
        const { version } = await api.deleteConnection(id);
        set((s) => ({ model: { ...s.model, connections: s.model.connections.filter((c) => c.id !== id) }, ownVersion: version, error: null }));
      } catch (e) { await recover(e); }
    },

  };
});

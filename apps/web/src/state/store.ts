import { create } from 'zustand';
import { emptyModel, type HyphaeModel, type FlowStep } from '@hyphae/schema';
import { stepReveal } from '@/core/stepReveal';
import { type Audience, type ConnFilter } from '@/core/focusView';
import { type XY } from '@/features/canvas/layout';
import { initialTheme, type Theme } from './theme';
import * as api from './api';

export type { ConnFilter };

type State = {
  model: HyphaeModel;
  focusId: string | null;
  selectedId: string | null;
  selectedFlowId: string | null;
  selectedPatternId: string | null;
  // Only ever set from a load now that the browser does not write. It still earns its place: the
  // SSE handler compares against it to ignore the version loadModel already returned.
  ownVersion: number;
  connFilter: ConnFilter;
  audience: Audience;
  // Mirrors the <html data-theme> attribute Toolbar's toggle sets via applyTheme(), so Canvas can
  // pass it to React Flow's own colorMode prop without either component reaching into the DOM.
  // Initialised the same way the attribute already is (index.html's pre-paint script + theme.ts),
  // so there is no flash of the wrong colorMode on first render.
  theme: Theme;
  expandedExternals: Set<string>;
  offViewStepOrders: number[];
  // Manually dragged node positions, layered over the computed layout. Session-only by design: the
  // auto-layout owns the durable picture, and this exists to untangle the diagram in front of you.
  // Not persisted — unlike the audience toggle, it is not a preference that should outlive the tab.
  nodePositions: Record<string, XY>;
  // How edges are drawn. Session-only and deliberately NOT reset by setFocus: unlike a dragged
  // position, this is a viewing preference about the whole canvas, not an override of one view.
  // Defaults to 'curved': measured on the real model, curved-through-ports crosses about as often
  // as the old free-anchor router (530 vs 476 on Baritone API) while squared costs a further ~130,
  // because an external column feeding a cluster is a converging fan and orthogonal runs sweep
  // across each other's lanes. Squared is a click away for anyone who prefers the engineered grain.
  edgeStyle: 'squared' | 'curved';
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
  setTheme: (t: Theme) => void;
  toggleConnField: (key: string, value: string) => void;
  clearConnFilter: () => void;
  toggleExternal: (id: string) => void;
  setNodePosition: (id: string, p: XY) => void;
  setNodePositions: (entries: Record<string, XY>) => void;
  resetNodePositions: () => void;
  setEdgeStyle: (s: 'squared' | 'curved') => void;
};

export const useStore = create<State>((set, get) => {
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
    connFilter: { fields: {} },
    audience: initialAudience,
    theme: initialTheme(),
    expandedExternals: new Set<string>(),
    offViewStepOrders: [],
    nodePositions: {},
    edgeStyle: 'curved',

    setModel: (model, version = 0) => set({ model, ownVersion: version }),
    syncFromServer: async () => {
      const { model, version } = await api.loadModel();
      set({ model, ownVersion: version });
    },
    setFocus: (focusId) => set({ focusId, selectedId: null, expandedExternals: new Set<string>(), nodePositions: {} }),
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
        selectedFlowId: null, selectedPatternId: null, nodePositions: {},
      });
    },
    // Jump to a flow step: focus the view that owns both endpoints, expand whatever external hides
    // the far one, and select the step's connection. Atomic for the same reason as revealNode.
    revealStep: (step) => {
      const target = stepReveal(get().model, step);
      if (!target) return;
      set({ focusId: target.focusId, selectedId: target.selectedId, nodePositions: {}, expandedExternals: target.expand });
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
    // The DOM attribute (and its localStorage persistence) is still applyTheme()'s job — Toolbar
    // calls both on toggle. This setter only keeps the store's mirror in sync so Canvas re-renders.
    setTheme: (theme) => set({ theme }),
    setEdgeStyle: (edgeStyle) => set({ edgeStyle }),

    toggleConnField: (key, value) =>
      set((s) => {
        const cur = s.connFilter.fields[key] ?? [];
        const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
        return { connFilter: { ...s.connFilter, fields: { ...s.connFilter.fields, [key]: next } } };
      }),
    clearConnFilter: () => set({ connFilter: { fields: {} } }),

    setNodePosition: (id, p) => set((s) => ({ nodePositions: { ...s.nodePositions, [id]: p } })),
    // Bulk form, so dragging a region commits all of its children in ONE update rather than one
    // render per child.
    setNodePositions: (entries) => set((s) => ({ nodePositions: { ...s.nodePositions, ...entries } })),
    resetNodePositions: () => set({ nodePositions: {} }),

    toggleExternal: (id) =>
      set((s) => {
        const next = new Set(s.expandedExternals);
        if (next.has(id)) next.delete(id); else next.add(id);
        return { expandedExternals: next };
      }),
  };
});

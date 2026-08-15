import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { emptyModel } from '@hyphae/schema';

vi.mock('@/state/api', () => {
  const blank = () => ({
    schemaVersion: 1, metadata: { name: 'Untitled', description: '', createdAt: 't', updatedAt: 't' },
    activeProfile: 'c4-backend', nodes: [], connections: [], flows: [], patterns: [],
    dataTypes: [], requirements: [], decisions: [], views: [],
  });
  return { loadModel: vi.fn(async () => ({ model: blank(), version: 0 })) };
});

import { useStore } from '@/state/store';

beforeEach(() => useStore.getState().setModel(emptyModel(), 0));

describe('viewer store', () => {
  // A name-based check (asserting the seven old action names are undefined) would pass a write
  // action re-added under any other name (e.g. `patchNode`). Asserting the full key set instead
  // pins the store to exactly its navigation/view surface, however a write might be spelled.
  it('exposes exactly the navigation/view state — no write action under any name', () => {
    const keys = Object.keys(useStore.getState()).sort();
    expect(keys).toEqual([
      'model', 'focusId', 'selectedId', 'selectedFlowId', 'selectedPatternId', 'ownVersion',
      'connFilter', 'audience', 'theme', 'expandedExternals', 'offViewStepOrders',
      'setModel', 'syncFromServer', 'setFocus', 'revealNode', 'revealStep', 'select',
      'selectFlow', 'selectPattern', 'setOffViewSteps', 'setAudience', 'setTheme',
      'toggleConnField', 'clearConnFilter', 'toggleExternal',
      // Manual layout: view state, not a model write.
      'nodePositions', 'setNodePosition', 'setNodePositions', 'resetNodePositions',
      // How edges are drawn: a viewing preference, not a model write.
      'edgeStyle', 'setEdgeStyle',
    ].sort());
  });

  // setTheme only mirrors the DOM attribute Toolbar's applyTheme() already set — it does not touch
  // the DOM or localStorage itself, which stay Toolbar/theme.ts's job (see Toolbar.test.tsx).
  it('setTheme updates the store without touching the DOM or localStorage', () => {
    useStore.getState().setTheme('light');
    expect(useStore.getState().theme).toBe('light');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    useStore.getState().setTheme('dark');
    expect(useStore.getState().theme).toBe('dark');
  });

  it('toggles audience and persists it to localStorage', () => {
    expect(useStore.getState().audience).toBe('full');
    useStore.getState().setAudience('stakeholder');
    expect(useStore.getState().audience).toBe('stakeholder');
    expect(localStorage.getItem('hyphae.audience')).toBe('stakeholder');
    useStore.getState().setAudience('full');
    expect(localStorage.getItem('hyphae.audience')).toBe('full');
  });

  it('toggleExternal adds then removes an id (new Set each time)', () => {
    expect(useStore.getState().expandedExternals.size).toBe(0);
    useStore.getState().toggleExternal('cb');
    expect([...useStore.getState().expandedExternals]).toEqual(['cb']);
    useStore.getState().toggleExternal('cb');
    expect(useStore.getState().expandedExternals.size).toBe(0);
  });

  it('revealNode focuses the parent and selects a child node', () => {
    const mk = (over: Record<string, unknown>) => ({
      id: 'x', name: 'X', type: 'Component', description: '', parentId: null, codeRefs: [],
      docRefs: [], createdAt: 't', updatedAt: 't', fields: {}, ...over,
    });
    useStore.setState((s) => ({ model: { ...s.model, nodes: [mk({ id: 'ca', type: 'Container' }), mk({ id: 'comp', parentId: 'ca' })] as any } }));
    useStore.getState().toggleExternal('ghost');
    useStore.getState().revealNode('comp');
    expect(useStore.getState().focusId).toBe('ca');
    expect(useStore.getState().selectedId).toBe('comp');
    expect(useStore.getState().expandedExternals.size).toBe(0);
  });

  it('revealNode on a top-level node focuses root (null) and selects it', () => {
    const mk = (over: Record<string, unknown>) => ({
      id: 'x', name: 'X', type: 'System', description: '', parentId: null, codeRefs: [],
      docRefs: [], createdAt: 't', updatedAt: 't', fields: {}, ...over,
    });
    useStore.setState((s) => ({ model: { ...s.model, nodes: [mk({ id: 'sys' })] as any } }));
    useStore.getState().revealNode('sys');
    expect(useStore.getState().focusId).toBe(null);
    expect(useStore.getState().selectedId).toBe('sys');
  });

  it('revealNode is a no-op for an unknown id', () => {
    useStore.getState().setFocus('keep');
    useStore.getState().revealNode('nope');
    expect(useStore.getState().focusId).toBe('keep');
  });

  it('setFocus resets expandedExternals', () => {
    useStore.getState().toggleExternal('cb');
    expect(useStore.getState().expandedExternals.size).toBe(1);
    useStore.getState().setFocus('ca');
    expect(useStore.getState().expandedExternals.size).toBe(0);
  });

  it('selects and clears a flow without mutating the model', () => {
    useStore.getState().selectFlow('f1');
    expect(useStore.getState().selectedFlowId).toBe('f1');
    expect(useStore.getState().model.flows).toEqual([]);
    useStore.getState().selectFlow(null);
    expect(useStore.getState().selectedFlowId).toBeNull();
  });

  it('selects a pattern and clears any selected flow (and vice versa)', () => {
    useStore.getState().selectFlow('f1');
    useStore.getState().selectPattern('p1');
    expect(useStore.getState().selectedPatternId).toBe('p1');
    expect(useStore.getState().selectedFlowId).toBeNull();
    useStore.getState().selectFlow('f2');
    expect(useStore.getState().selectedFlowId).toBe('f2');
    expect(useStore.getState().selectedPatternId).toBeNull();
    useStore.getState().selectPattern(null);
    expect(useStore.getState().selectedPatternId).toBeNull();
  });
});

// Kept as its own describe block: this is the only test in the file that needs
// vi.resetModules() to force a fresh store module instance (the store is a
// module-level singleton created once at import, so the localStorage-read
// branch that seeds initial audience is otherwise never exercised). The
// top-level `useStore` binding used by every other test above was already
// resolved at import time and is unaffected by resetModules, and the
// vi.mock('@/state/api', ...) mock factory is reapplied automatically after
// reset, so this does not desync any other test in the file.
describe('audience init from localStorage', () => {
  it('initializes audience from a previously persisted localStorage value', async () => {
    localStorage.setItem('hyphae.audience', 'stakeholder');
    try {
      vi.resetModules();
      const { useStore: freshUseStore } = await import('@/state/store');
      expect(freshUseStore.getState().audience).toBe('stakeholder');
    } finally {
      localStorage.removeItem('hyphae.audience');
      vi.resetModules();
    }
  });
});

describe('revealStep', () => {
  const base = { description: '', root: null, role: null, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {} };

  function crossContainerModel() {
    const m = emptyModel();
    m.nodes.push(
      { id: 'sys', name: 'Sys', type: 'System', parentId: null, ...base } as never,
      { id: 'ca', name: 'Alpha', type: 'Container', parentId: 'sys', ...base } as never,
      { id: 'cb', name: 'Beta', type: 'Container', parentId: 'sys', ...base } as never,
      { id: 'a1', name: 'A1', type: 'Component', parentId: 'ca', ...base } as never,
      { id: 'b1', name: 'B1', type: 'Component', parentId: 'cb', ...base } as never,
    );
    return m;
  }

  it('focuses, expands and selects in one atomic update', () => {
    useStore.getState().setModel(crossContainerModel(), 0);
    useStore.getState().revealStep({ order: 1, from: 'a1', to: 'b1', via: 'c9', message: '', kind: 'Sync' });
    const s = useStore.getState();
    expect(s.focusId).toBe('ca');
    expect([...s.expandedExternals]).toEqual(['cb']);
    expect(s.selectedId).toBe('c9');
  });

  it('ignores a step whose endpoints are not in the model', () => {
    useStore.getState().setModel(crossContainerModel(), 0);
    useStore.setState({ focusId: 'sys', selectedId: 'sys' });
    useStore.getState().revealStep({ order: 1, from: 'a1', to: 'ghost', message: '', kind: 'Sync' });
    expect(useStore.getState().focusId).toBe('sys');
    expect(useStore.getState().selectedId).toBe('sys');
  });
});

describe('connection field filter', () => {
  beforeEach(() => useStore.setState({ connFilter: { fields: {} } }));

  it('toggles a field value on and off', () => {
    useStore.getState().toggleConnField('tier', 'core');
    expect(useStore.getState().connFilter.fields.tier).toEqual(['core']);
    useStore.getState().toggleConnField('tier', 'core');
    expect(useStore.getState().connFilter.fields.tier).toEqual([]);
  });

  it('clearConnFilter empties both groups', () => {
    useStore.getState().toggleConnField('tier', 'core');
    useStore.getState().toggleConnField('anything', 'x');
    useStore.getState().clearConnFilter();
    expect(useStore.getState().connFilter).toEqual({ fields: {} });
  });
});

// api.ts is the browser's whole conversation with the server; a re-added `mutate()` or similar
// would not be caught by anything above. Read the source and assert no write verb appears — the
// same readFileSync trick SidePanel.test.tsx's 'inspector CSS' block uses for invariants jsdom
// cannot observe. import.meta.url is an http URL under jsdom, so resolve from process.cwd().
describe('api.ts has no write path', () => {
  it('contains no fetch call using a write method', () => {
    const src = readFileSync(join(process.cwd(), 'src/state/api.ts'), 'utf8');
    expect(src).not.toMatch(/method:\s*['"]?(POST|PATCH|PUT|DELETE)/i);
  });
});

describe('manual layout state', () => {
  beforeEach(() => {
    useStore.setState({
      nodePositions: {}, focusId: null, expandedExternals: new Set(),
    });
  });

  it('records and resets a dragged position', () => {
    useStore.getState().setNodePosition('a', { x: 10, y: 20 });
    expect(useStore.getState().nodePositions).toEqual({ a: { x: 10, y: 20 } });
    useStore.getState().resetNodePositions();
    expect(useStore.getState().nodePositions).toEqual({});
  });

  it('commits several positions in one update', () => {
    useStore.getState().setNodePosition('a', { x: 1, y: 1 });
    useStore.getState().setNodePositions({ b: { x: 2, y: 2 }, c: { x: 3, y: 3 } });
    expect(useStore.getState().nodePositions).toEqual({
      a: { x: 1, y: 1 }, b: { x: 2, y: 2 }, c: { x: 3, y: 3 },
    });
  });

  it('clears drag positions when the focus changes', () => {
    useStore.getState().setNodePosition('a', { x: 1, y: 2 });
    useStore.getState().setFocus('other');
    expect(useStore.getState().nodePositions).toEqual({});
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../src/api', () => {
  let v = 0;
  const base = (over: Record<string, unknown>) => ({
    id: 'x', name: 'X', type: 'Component', description: '', parentId: null, root: null, role: null, codeRefs: [],
    docRefs: [], createdAt: 't', updatedAt: 't', fields: {}, ...over,
  });
  const blank = () => ({
    schemaVersion: 1, metadata: { name: 'Untitled', description: '', createdAt: 't', updatedAt: 't' },
    activeProfile: 'c4-backend', nodes: [], connections: [], flows: [], patterns: [],
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

const nodeBase = { description: '', root: null, role: null, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {} };

/** sys › (ca › a1, cb › b1) with one flow whose first step crosses containers, and one pattern. */
function routeModel() {
  const m = emptyModel();
  m.nodes.push(
    { id: 'sys', name: 'Sys', type: 'System', parentId: null, ...nodeBase } as never,
    { id: 'ca', name: 'Alpha', type: 'Container', parentId: 'sys', ...nodeBase } as never,
    { id: 'cb', name: 'Beta', type: 'Container', parentId: 'sys', ...nodeBase } as never,
    { id: 'a1', name: 'A1', type: 'Component', parentId: 'ca', ...nodeBase } as never,
    { id: 'b1', name: 'B1', type: 'Component', parentId: 'cb', ...nodeBase } as never,
  );
  m.flows.push({ id: 'f1', name: 'F1', description: '', scope: null, steps: [{ order: 1, from: 'a1', to: 'b1', message: 'go', kind: 'Sync' }] });
  m.patterns.push({ id: 'p1', name: 'P1', kind: 'state-machine', description: '', anchor: 'ca', members: [], transitions: [] });
  return m;
}

/** Set the hash and deliver the event the browser would (jsdom fires it asynchronously). */
function navigate(hash: string) {
  window.location.hash = hash;
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

beforeEach(() => {
  window.history.replaceState(null, '', window.location.pathname);
  useStore.setState({ focusId: null, selectedId: null, selectedFlowId: null, selectedPatternId: null, expandedExternals: new Set<string>() });
  useStore.getState().setModel(emptyModel(), 0);
  localStorage.removeItem('hyphae.outline.width');
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

  it('renders the node search box in the toolbar', () => {
    render(<App />);
    expect(screen.getByLabelText('search nodes')).toBeTruthy();
  });

  it('adopts a #node/ hash naming a real node', () => {
    render(<App />);
    useStore.getState().setModel(routeModel(), 1);
    navigate('#node/ca');
    expect(useStore.getState().focusId).toBe('ca');
  });

  it('rewrites a hash naming nothing (including a legacy bare id) back to root', () => {
    render(<App />);
    useStore.getState().setModel(routeModel(), 1);
    navigate('#node/ghost');
    expect(useStore.getState().focusId).toBeNull();
    expect(window.location.hash).toBe('');

    navigate('#ca'); // pre-Cluster-E bare-id deep link
    expect(useStore.getState().focusId).toBeNull();
    expect(window.location.hash).toBe('');
  });

  it('selects a flow from #flow/ and jumps to its first step', () => {
    render(<App />);
    useStore.getState().setModel(routeModel(), 1);
    navigate('#flow/f1');
    const s = useStore.getState();
    expect(s.selectedFlowId).toBe('f1');
    expect(s.focusId).toBe('ca');            // step 1 is a1 -> b1, so focus a1's parent
    expect([...s.expandedExternals]).toEqual(['cb']);
  });

  it('selects a pattern from #pattern/ and clears it again on a node route', () => {
    render(<App />);
    useStore.getState().setModel(routeModel(), 1);
    navigate('#pattern/p1');
    expect(useStore.getState().selectedPatternId).toBe('p1');
    navigate('#node/ca');
    expect(useStore.getState().selectedPatternId).toBeNull();
    expect(useStore.getState().focusId).toBe('ca');
  });

  it('pushes the matching hash when the store selection changes', async () => {
    render(<App />);
    await new Promise((r) => setTimeout(r, 0)); // let the initial loadModel settle before seeding
    useStore.getState().setModel(routeModel(), 1);
    useStore.getState().setFocus('ca');
    await waitFor(() => expect(window.location.hash).toBe('#node/ca'));
    useStore.getState().selectPattern('p1');
    await waitFor(() => expect(window.location.hash).toBe('#pattern/p1'));
    useStore.getState().selectFlow('f1');
    await waitFor(() => expect(window.location.hash).toBe('#flow/f1'));
    // Stepping inside the selected flow moves the focus but not the route.
    useStore.getState().revealStep({ order: 2, from: 'b1', to: 'a1', message: '', kind: 'Sync' });
    expect(useStore.getState().focusId).toBe('cb');
    expect(window.location.hash).toBe('#flow/f1');
  });

  it('toggles audience from the toolbar', async () => {
    render(<App />);
    await new Promise((r) => setTimeout(r, 0));
    fireEvent.click(screen.getByRole('button', { name: /stakeholder/i }));
    expect(useStore.getState().audience).toBe('stakeholder');
    fireEvent.click(screen.getByRole('button', { name: /full/i }));
    expect(useStore.getState().audience).toBe('full');
  });

  it('puts a resize separator on each side of the canvas', () => {
    render(<App />);
    const seps = screen.getAllByRole('separator');
    // A horizontal group yields vertical separators; the empty test model has no flows or
    // patterns, so the outline's own horizontal separator (Task 3) is not rendered here.
    expect(seps.map((s) => s.getAttribute('aria-orientation'))).toEqual(['vertical', 'vertical']);
  });

  it('collapses and restores the outline from the lifted toggle', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'hide model outline' }));
    expect(screen.getByRole('button', { name: 'show model outline' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'show model outline' }));
    expect(screen.getByRole('button', { name: 'hide model outline' })).toBeTruthy();
  });

  it('names the two body separators for accessibility', () => {
    render(<App />);
    expect(screen.getByRole('separator', { name: 'resize outline' })).toBeTruthy();
    expect(screen.getByRole('separator', { name: 'resize inspector' })).toBeTruthy();
  });

  // The actual pixel restore (getSize()/resize() against real geometry) is untestable under
  // jsdom — offsetWidth is always 0, so every onResize and getSize() call in this suite reports a
  // 0px size, and rememberOutlineWidth's guard (`px <= 26`) treats that exactly like the collapsed
  // strip. These two cases instead pin what jsdom *can* see: the guard stops a 0px reading from
  // clobbering a real persisted width, and a collapse that jsdom cannot measure never persists a
  // bogus one to begin with.
  it('does not persist a width jsdom cannot measure', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'hide model outline' }));
    expect(localStorage.getItem('hyphae.outline.width')).toBeNull();
  });

  it('keeps a width persisted from a previous session across a collapse/expand round trip', () => {
    localStorage.setItem('hyphae.outline.width', '333');
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'hide model outline' }));
    fireEvent.click(screen.getByRole('button', { name: 'show model outline' }));
    expect(localStorage.getItem('hyphae.outline.width')).toBe('333');
  });
});

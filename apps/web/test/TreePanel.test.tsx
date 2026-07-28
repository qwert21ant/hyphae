import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useState } from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { TreePanel } from '../src/TreePanel';
import { useStore } from '../src/store';
import { emptyModel } from '@hyphae/schema';

const base = { description: '', root: null, role: null, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {} };

/** sys › (ca › a1, cb › b1), one cross-container flow, one pattern anchored on ca. */
function model() {
  const m = emptyModel();
  m.nodes.push(
    { id: 'sys', name: 'Sys', type: 'System', parentId: null, ...base } as never,
    { id: 'ca', name: 'Alpha', type: 'Container', parentId: 'sys', ...base } as never,
    { id: 'cb', name: 'Beta', type: 'Container', parentId: 'sys', ...base } as never,
    { id: 'a1', name: 'A1', type: 'Component', parentId: 'ca', ...base } as never,
    { id: 'b1', name: 'B1', type: 'Component', parentId: 'cb', ...base } as never,
  );
  m.flows.push({ id: 'f1', name: 'Ingest clip', description: '', scope: null, steps: [
    { order: 1, from: 'a1', to: 'b1', message: 'send frame', kind: 'Sync' },
    { order: 2, from: 'b1', to: 'a1', message: 'ack', kind: 'Return' },
  ] });
  m.patterns.push({ id: 'p1', name: 'Recorder', kind: 'state-machine', description: '', anchor: 'ca',
    members: [{ name: 'Writer', nodeId: 'b1', description: '' }, { name: 'Idle', description: '' }],
    transitions: [] });
  return m;
}

const reset = (over: Record<string, unknown> = {}) =>
  useStore.setState({
    model: model(), focusId: null, selectedId: null, selectedFlowId: null, selectedPatternId: null,
    expandedExternals: new Set<string>(), offViewStepOrders: [], ...over,
  });

beforeEach(() => reset());

/** TreePanel is controlled by App (which drives the resizable panel's collapse()/expand()), so the
 *  tests own the flag. Every render goes through here. */
function Outline() {
  const [collapsed, setCollapsed] = useState(false);
  return <TreePanel collapsed={collapsed} onToggleCollapse={() => setCollapsed((c) => !c)} />;
}
const renderTree = () => render(<Outline />);

describe('TreePanel — nodes', () => {
  it('nests nodes by containment, opening the branch of the current focus', () => {
    reset({ focusId: 'ca' });
    const { getByRole, queryByRole } = renderTree();
    expect(getByRole('button', { name: 'Sys' })).toBeTruthy();
    expect(getByRole('button', { name: 'Alpha' })).toBeTruthy();
    expect(getByRole('button', { name: 'A1' })).toBeTruthy();   // inside the focused Alpha
    expect(queryByRole('button', { name: 'B1' })).toBeNull();   // Beta stays closed
  });

  it('expands and collapses a branch from its twisty', () => {
    const { getByRole, queryByRole } = renderTree();
    expect(queryByRole('button', { name: 'Alpha' })).toBeNull();
    fireEvent.click(getByRole('button', { name: 'expand Sys' }));
    expect(getByRole('button', { name: 'Alpha' })).toBeTruthy();
    fireEvent.click(getByRole('button', { name: 'collapse Sys' }));
    expect(queryByRole('button', { name: 'Alpha' })).toBeNull();
  });

  it('reveals a node on click and drills into it on double-click', () => {
    reset({ focusId: 'ca' });
    const { getByRole } = renderTree();
    fireEvent.click(getByRole('button', { name: 'A1' }));
    expect(useStore.getState().focusId).toBe('ca');       // A1's parent, with A1 selected
    expect(useStore.getState().selectedId).toBe('a1');
    fireEvent.doubleClick(getByRole('button', { name: 'A1' }));
    expect(useStore.getState().focusId).toBe('a1');
  });
});

describe('TreePanel — flows', () => {
  it('selects a flow and lists its numbered steps', () => {
    const { getByRole, getByText } = renderTree();
    fireEvent.click(getByRole('button', { name: 'Ingest clip' }));
    expect(useStore.getState().selectedFlowId).toBe('f1');
    expect(getByText(/1\. send frame/)).toBeTruthy();
    expect(getByText(/2\. ack/)).toBeTruthy();
  });

  it('deselects the flow when its row is clicked again', () => {
    reset({ selectedFlowId: 'f1' });
    const { getByRole } = renderTree();
    fireEvent.click(getByRole('button', { name: /Ingest clip/ }));
    expect(useStore.getState().selectedFlowId).toBeNull();
  });

  it('navigates to a step on click', () => {
    reset({ selectedFlowId: 'f1' });
    const { getByText } = renderTree();
    fireEvent.click(getByText(/2\. ack/));
    const s = useStore.getState();
    expect(s.focusId).toBe('cb');                      // step 2 runs b1 -> a1
    expect([...s.expandedExternals]).toEqual(['ca']);
    expect(s.selectedId).toBe('b1');
  });

  it('marks the steps the canvas could not draw', () => {
    reset({ selectedFlowId: 'f1', offViewStepOrders: [2] });
    const { getByText } = renderTree();
    expect(getByText(/1\. send frame/).textContent).not.toContain('↗');
    expect(getByText(/2\. ack/).textContent).toContain('↗');
  });

  it('suppresses the browser list marker, since each row prints its own step order', () => {
    // jsdom loads no external stylesheet, so the duplicated "1. 1." this guards against is invisible
    // in the DOM — assert the rule itself. The rows print the authored `order`, which need not be a
    // contiguous 1..n, so an <ol> marker would both duplicate and contradict it.
    // (import.meta.url is an http URL under jsdom, so resolve from the package root instead.)
    const css = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');
    expect(css).toMatch(/\.tree-steps\s*\{[^}]*list-style:\s*none/);
  });

  it('flags an invalid flow with a warning marker', () => {
    const m = model();
    m.flows[0].steps[0].to = 'ghost';   // dangling -> bad-flow-endpoint
    reset({ model: m });
    const { getByText } = renderTree();
    expect(getByText(/Ingest clip ⚠/)).toBeTruthy();
  });
});

describe('TreePanel — patterns', () => {
  it('selects a pattern and shows its anchor and members', () => {
    const { getByRole, getByText } = renderTree();
    fireEvent.click(getByRole('button', { name: /Recorder/ }));
    expect(useStore.getState().selectedPatternId).toBe('p1');
    expect(getByText('anchor: Alpha')).toBeTruthy();
    expect(getByText('Writer')).toBeTruthy();
    expect(getByText('Idle')).toBeTruthy();
  });

  it('navigates to the anchor node, leaving the pattern view', () => {
    reset({ selectedPatternId: 'p1' });
    const { getByText } = renderTree();
    fireEvent.click(getByText('anchor: Alpha'));
    expect(useStore.getState().focusId).toBe('sys');   // Alpha's parent, Alpha selected
    expect(useStore.getState().selectedId).toBe('ca');
    expect(useStore.getState().selectedPatternId).toBeNull();
  });

  it('navigates from a member bound to a node, but not from a bare one', () => {
    reset({ selectedPatternId: 'p1' });
    const { getByRole, getByText } = renderTree();
    expect(getByText('Idle').tagName).toBe('SPAN');    // no binding -> not a link
    fireEvent.click(getByRole('button', { name: 'Writer' }));
    expect(useStore.getState().selectedId).toBe('b1');
  });

  it('flags an invalid pattern with a warning marker', () => {
    const m = model();
    m.patterns[0].kind = 'octopus';   // unknown kind -> pattern-unknown-kind
    reset({ model: m });
    const { getByText } = renderTree();
    expect(getByText(/Recorder/).textContent).toContain('⚠');
  });
});

describe('TreePanel — chrome', () => {
  it('hides the sections when collapsed and restores them again', () => {
    const { getByRole, queryByRole, queryByText } = renderTree();
    fireEvent.click(getByRole('button', { name: 'hide model outline' }));
    expect(queryByText('Nodes')).toBeNull();
    expect(queryByRole('button', { name: 'Sys' })).toBeNull();
    fireEvent.click(getByRole('button', { name: 'show model outline' }));
    expect(getByRole('button', { name: 'Sys' })).toBeTruthy();
  });

  it('omits the Flows and Patterns sections when the model has none', () => {
    reset({ model: emptyModel() });
    const { queryByText } = renderTree();
    expect(queryByText('Flows')).toBeNull();
    expect(queryByText('Patterns')).toBeNull();
    expect(queryByText('no nodes yet')).toBeTruthy();
  });
});

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

  // Focus and selection were both colour states and fought each other. Separating "which view am I
  // in" (a bar) from "what did I click" (a fill) lets a row be both at once and stay legible.
  it('distinguishes the focused row from the selected row', () => {
    reset({ focusId: 'ca', selectedId: 'a1' });
    const { container } = renderTree();
    expect(container.querySelector('.tree-row--current')).toBeTruthy();
    expect(container.querySelector('.tree-row--active')).toBeTruthy();
    expect(container.querySelector('.tree-row--current.tree-row--active')).toBeFalsy();
  });

  // The label text was the only hit target, so the indent, the twisty column and the empty space to
  // the right of a short name all did nothing. The row is the item; the whole row acts.
  it('reveals a node from anywhere on its row, not just the label text', () => {
    reset({ focusId: 'ca' });
    const { getByRole } = renderTree();
    const row = () => getByRole('button', { name: 'A1' }).closest('.tree-row')!;
    fireEvent.click(row());
    expect(useStore.getState().selectedId).toBe('a1');
    fireEvent.doubleClick(row());
    expect(useStore.getState().focusId).toBe('a1');
  });

  it('toggles a branch from the twisty without selecting the row', () => {
    reset({ focusId: null, selectedId: null });
    const { getByRole } = renderTree();
    fireEvent.click(getByRole('button', { name: 'expand Sys' }));
    expect(getByRole('button', { name: 'Alpha' })).toBeTruthy();
    expect(useStore.getState().selectedId).toBeNull();   // the twisty click must not reach the row
  });

  it('selects a flow and a pattern from anywhere on their rows', () => {
    const { getByRole } = renderTree();
    fireEvent.click(getByRole('button', { name: /Ingest clip/ }).closest('.tree-row')!);
    expect(useStore.getState().selectedFlowId).toBe('f1');
    fireEvent.click(getByRole('button', { name: /Recorder/ }).closest('.tree-row')!);
    expect(useStore.getState().selectedPatternId).toBe('p1');
  });

  // The hover feedback has to match the hit target, or the row lies about what is clickable.
  it('highlights the whole row on hover, not the label alone', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles/chrome.css'), 'utf8');
    expect(css).toMatch(/\.tree-row:hover\s*\{[^}]*background:\s*var\(--surface-3\)/);
    const label = /\.tree-label:hover\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(label).not.toMatch(/background/);
  });

  it('renders an indent guide per depth level', () => {
    reset({ focusId: 'a1' });   // opens sys > ca > a1, so a1's row sits at depth 2
    const { container } = renderTree();
    const deepest = container.querySelectorAll('.tree-row')[2];
    expect(deepest.querySelectorAll('.tree-guide').length).toBeGreaterThan(0);
  });
});

describe('TreePanel — flows', () => {
  it('selects a flow and lists its numbered steps', () => {
    const { getByRole, getByText } = renderTree();
    fireEvent.click(getByRole('button', { name: 'Ingest clip' }));
    expect(useStore.getState().selectedFlowId).toBe('f1');
    // The order now lives in its own .tree-step__order column (see the "puts a step order..." test
    // below), so the label itself carries only the message.
    expect(getByText(/send frame/)).toBeTruthy();
    expect(getByText(/ack/)).toBeTruthy();
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
    fireEvent.click(getByText(/ack/));
    const s = useStore.getState();
    expect(s.focusId).toBe('cb');                      // step 2 runs b1 -> a1
    expect([...s.expandedExternals]).toEqual(['ca']);
    expect(s.selectedId).toBe('b1');
  });

  it('marks the steps the canvas could not draw', () => {
    reset({ selectedFlowId: 'f1', offViewStepOrders: [2] });
    const { getByText } = renderTree();
    expect(getByText(/send frame/).textContent).not.toContain('↗');
    expect(getByText(/ack/).textContent).toContain('↗');
  });

  it('suppresses the browser list marker, since each row prints its own step order', () => {
    // jsdom loads no external stylesheet, so the duplicated "1. 1." this guards against is invisible
    // in the DOM — assert the rule itself. The rows print the authored `order`, which need not be a
    // contiguous 1..n, so an <ol> marker would both duplicate and contradict it.
    // (import.meta.url is an http URL under jsdom, so resolve from the package root instead.)
    const css = readFileSync(resolve(process.cwd(), 'src/styles/chrome.css'), 'utf8');
    expect(css).toMatch(/\.tree-steps\s*\{[^}]*list-style:\s*none/);
  });

  it('flags an invalid flow with a warning marker', () => {
    const m = model();
    m.flows[0].steps[0].to = 'ghost';   // dangling -> bad-flow-endpoint
    reset({ model: m });
    const { getByText } = renderTree();
    // The ⚠ now lives in its own span (so it can carry the one warning colour), so it no longer
    // shares a text node with the label — match on the label and check the marker in .textContent,
    // the same way the pattern warning test below already does.
    expect(getByText(/Ingest clip/).textContent).toContain('⚠');
  });

  it('puts a step order in its own mono column', () => {
    reset({ selectedFlowId: 'f1' });
    const { container } = renderTree();
    const orders = container.querySelectorAll('.tree-step__order');
    expect(orders.length).toBe(2);
    // Assert the authored order value itself, not just that the column exists.
    expect(orders[0].textContent).toBe('1.');
    expect(orders[1].textContent).toBe('2.');
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

  it('splits Nodes from Flows and Patterns with a draggable separator', () => {
    const { getAllByRole } = renderTree();
    const seps = getAllByRole('separator');
    // A vertical group yields a horizontal separator.
    expect(seps.map((s) => s.getAttribute('aria-orientation'))).toEqual(['horizontal']);
    expect(seps[0].getAttribute('aria-label')).toBe('resize node list');
  });

  it('puts the node tree in the nodes pane and Flows/Patterns in the detail pane, keyed by their panel ids', () => {
    // The library sets data-testid to the panel's id, so this pins both which pane holds which
    // section (nothing else fixes their order) and the ids the persisted layout keys off, which is
    // why they carry the hyphae-pane- prefix (bare ids would collide with other DOM ids on the page).
    const { getByTestId } = renderTree();
    const nodes = getByTestId('hyphae-pane-nodes');
    const detail = getByTestId('hyphae-pane-detail');
    expect(nodes.textContent).toContain('Nodes');
    expect(nodes.textContent).toContain('Sys');
    expect(detail.textContent).toContain('Flows');
    expect(detail.textContent).toContain('Patterns');
  });

  it('omits the split when the model has neither flows nor patterns', () => {
    reset({ model: emptyModel() });
    const { queryAllByRole } = renderTree();
    expect(queryAllByRole('separator')).toEqual([]);
  });

  it('gives the split separator a row-resize cursor', () => {
    // jsdom loads no external stylesheet, so the rule is unobservable in the DOM — assert the
    // source. Without it the handle is invisible and undiscoverable, since the library sets no
    // cursor of its own.
    const css = readFileSync(resolve(process.cwd(), 'src/styles/chrome.css'), 'utf8');
    expect(css).toMatch(/\.sep--h\s*\{[^}]*cursor:\s*row-resize/);
    expect(css).toMatch(/\.sep--v\s*\{[^}]*cursor:\s*col-resize/);
  });

  it('gives the focused row an accent bar rather than a fill', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles/chrome.css'), 'utf8');
    expect(css).toMatch(/\.tree-row--current\s*\{[^}]*border-left-color:\s*var\(--accent\)/);
  });

  // The bug this guards: --current used to also set background:var(--surface-3), which is exactly
  // what --active sets — so a row carrying both classes was pixel-identical to one carrying only
  // --current, contradicting the two-independent-states comment above .tree-row in chrome.css.
  // jsdom applies no external stylesheet, so this reads the rule rather than rendered pixels.
  it('does not give --current its own background, so combining it with --active stays distinguishable', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles/chrome.css'), 'utf8');
    const currentRule = /\.tree-row--current\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(currentRule).not.toMatch(/background/);
    expect(css).toMatch(/\.tree-row--active\s*\{[^}]*background:\s*var\(--surface-3\)/);
  });
});

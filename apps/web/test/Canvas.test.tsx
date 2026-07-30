import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { Canvas } from '../src/Canvas';
import { EDGE_LABEL_CLASS } from '../src/FloatingEdge';
import { useStore } from '../src/store';
import { emptyModel } from '@hyphae/schema';

// These tests drive the REAL React Flow (not a mock) so they exercise its actual
// event wiring — a mock that called our handlers directly previously hid a bug where
// nodesDraggable={false} suppresses React Flow's onNodeDoubleClick.

const base = { description: '', root: null, role: null, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {} };
const e = { verb: 'uses', object: '', description: '', direction: 'Unidirectional' as const, realizedBy: [], codeRefs: [], fields: {} };

function model() {
  const m = emptyModel();
  m.nodes.push(
    { id: 'sys', name: 'Hyphae', type: 'System', parentId: null, ...base },
    { id: 'ca', name: 'Alpha', type: 'Container', parentId: 'sys', ...base },
    { id: 'cb', name: 'Beta', type: 'Container', parentId: 'sys', ...base },
    { id: 'a1', name: 'A1', type: 'Component', parentId: 'ca', ...base },
    { id: 'b1', name: 'B1', type: 'Component', parentId: 'cb', ...base },
  );
  m.connections.push({ id: 'x', from: 'a1', to: 'b1', ...e });
  return m;
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  // jsdom has no DOMMatrixReadOnly; React Flow constructs one (reading the viewport's zoom from its
  // CSS transform) whenever a mounted node's `type` changes in place — which first happens here when
  // expanding a ghost into a ghostGroup. A constant zoom of 1 is fine: jsdom never computes real layout.
  vi.stubGlobal('DOMMatrixReadOnly', class { m22 = 1; });
});

const node = (container: HTMLElement, id: string) =>
  container.querySelector(`.react-flow__node[data-id="${id}"]`) as HTMLElement | null;

/** Simulate a user double-click: the browser fires two click events (then dblclick). */
function dblclick(container: HTMLElement, id: string) {
  fireEvent.click(node(container, id)!);
  fireEvent.click(node(container, id)!);
}

describe('Canvas navigation (real React Flow)', () => {
  it('double-clicking the System at the root drills into it (the reported bug)', () => {
    useStore.setState({ model: model(), focusId: null, selectedId: null });
    const { container } = render(<Canvas />);
    expect(node(container, 'sys')).toBeTruthy();
    dblclick(container, 'sys');
    expect(useStore.getState().focusId).toBe('sys');
  });

  it('double-clicking a child that has children drills into it', () => {
    useStore.setState({ model: model(), focusId: 'sys', selectedId: null });
    const { container } = render(<Canvas />);
    dblclick(container, 'ca');
    expect(useStore.getState().focusId).toBe('ca');
  });

  it('double-clicking a childless Component drills into it (focus shows it with its neighbors)', () => {
    // focusView already supports a childless focus node — it renders the node itself plus its
    // connected nodes as externals — so there is no reason to refuse the drill.
    useStore.setState({ model: model(), focusId: 'ca', selectedId: null });
    const { container } = render(<Canvas />);
    dblclick(container, 'a1');
    expect(useStore.getState().focusId).toBe('a1');
  });

  it('a drilled-into leaf renders itself plus its connected neighbor', () => {
    useStore.setState({ model: model(), focusId: 'a1', selectedId: null });
    const { container } = render(<Canvas />);
    expect(node(container, 'a1')).toBeTruthy();   // the focus node itself
    expect(node(container, 'b1')).toBeTruthy();   // its neighbor across the x connection
  });

  it('double-clicking an external ghost drills into it', () => {
    // Focus ca → a1's edge to b1 surfaces cb (Beta) as an aggregated external ghost.
    useStore.setState({ model: model(), focusId: 'ca', selectedId: null });
    const { container } = render(<Canvas />);
    expect(node(container, 'cb')).toBeTruthy();
    dblclick(container, 'cb');
    expect(useStore.getState().focusId).toBe('cb');
  });

  it('renders both container children when focusing the System (edge endpoints exist)', () => {
    // a1 (in ca) → b1 (in cb) is a Component-level connection; focusing the System rolls it up to a
    // ca → cb edge, so both containers must render as nodes (regression: the System view used to
    // collapse such connections onto itself and show no inter-container structure). Edge geometry
    // itself needs element measurement that jsdom lacks, so it is asserted in focusView.test.ts.
    const m = model();
    m.connections.push({ id: 'y', from: 'a1', to: 'b1', ...e });
    useStore.setState({ model: m, focusId: 'sys', selectedId: null });
    const { container } = render(<Canvas />);
    expect(node(container, 'ca')).toBeTruthy();
    expect(node(container, 'cb')).toBeTruthy();
  });

  it('renders connection handles on the focus region so its own edges can attach', () => {
    // The focused node is drawn as a region; React Flow drops edges that cannot resolve a handle on
    // an endpoint, so the region must expose handles or the focus node's own connections vanish.
    useStore.setState({ model: model(), focusId: 'ca', selectedId: null });
    const { container } = render(<Canvas />);
    const region = container.querySelector('.react-flow__node[data-id="ca"]')!;
    expect(region.querySelectorAll('.react-flow__handle').length).toBeGreaterThan(0);
  });

  it('single click selects without drilling', () => {
    useStore.setState({ model: model(), focusId: 'sys', selectedId: null });
    const { container } = render(<Canvas />);
    fireEvent.click(node(container, 'ca')!);
    expect(useStore.getState().selectedId).toBe('ca');
    expect(useStore.getState().focusId).toBe('sys');
  });

  // sys → ca, cb with no connection between them.
  const twoContainers = () => {
    const m = emptyModel();
    m.nodes.push(
      { id: 'sys', name: 'Sys', type: 'System', parentId: null, ...base },
      { id: 'ca', name: 'Alpha', type: 'Container', parentId: 'sys', ...base },
      { id: 'cb', name: 'Beta', type: 'Container', parentId: 'sys', ...base },
    );
    return m;
  };

  // Highlight/dim is applied via an injected stylesheet keyed on stable data-ids (so hovering never
  // rebuilds the node objects — which is what blanked the canvas). Assert on that stylesheet.
  const hlCss = (container: HTMLElement) => container.querySelector('style[data-hyphae-hl]')!.textContent ?? '';

  it('hovering a node dims the rest softly (via CSS) and leaves the arrays/selection untouched', () => {
    useStore.setState({ model: twoContainers(), focusId: 'sys', selectedId: null });
    const { container } = render(<Canvas />);
    // At rest: transitions only, no dim rule.
    expect(hlCss(container)).not.toMatch(/opacity:0\.65/);
    fireEvent.mouseEnter(node(container, 'ca')!);
    const css = hlCss(container);
    expect(css).toContain('opacity:0.65');                              // soft dim (selection dim is 0.4)
    expect(css).toContain('.react-flow__node[data-id="ca"]');          // ca is highlighted
    expect(css).toContain('var(--accent-soft)');                       // soft hover ring
    expect(useStore.getState().selectedId).toBeNull();
    // Node objects must NOT carry per-hover inline opacity (that churn is the bug we fixed).
    expect(node(container, 'cb')!.style.opacity).toBe('');
    fireEvent.mouseLeave(node(container, 'ca')!);
    expect(hlCss(container)).not.toMatch(/opacity:0\.65/);             // back to neutral
  });

  it('once a node is selected, hovering another node does not change the highlight', () => {
    useStore.setState({ model: twoContainers(), focusId: 'sys', selectedId: 'ca' });
    const { container } = render(<Canvas />);
    const before = hlCss(container);
    expect(before).toContain('opacity:0.4');                           // strong selection dim
    expect(before).toContain('var(--accent)');                         // strong selection ring
    expect(before).toContain('.react-flow__node[data-id="ca"]');      // ca (selected) is highlighted
    // Hovering cb must not steal the highlight — selection wins, CSS is unchanged.
    fireEvent.mouseEnter(node(container, 'cb')!);
    expect(hlCss(container)).toBe(before);
  });

  it('keeps the hovered/selected node fully opaque (restore beats the dim rule)', () => {
    // The dim rule uses two :not() pseudo-classes (specificity 0,4,0), which outranks the [data-id]
    // restore rule (0,3,0). Without !important the active node itself would stay dimmed in a real
    // browser. jsdom does not compute :not() specificity, so we assert the generated CSS carries the
    // !important that guarantees the highlighted node wins the cascade.
    useStore.setState({ model: twoContainers(), focusId: 'sys', selectedId: null });
    const { container } = render(<Canvas />);
    fireEvent.mouseEnter(node(container, 'ca')!);
    const css = hlCss(container);
    expect(css).toContain('[data-id="ca"]');              // ca is the highlighted (active) node
    expect(css).toMatch(/opacity:1\s*!important/);         // its restore rule must override the dim rule
  });

  it('dims non-neighbor edge LABELS too, and restores the highlighted edge\'s label', () => {
    // Labels portal into .react-flow__edgelabel-renderer, outside the .react-flow__edge group the
    // dim rule targets — so without their own rule they stay crisp over a faded canvas.
    // EDGE_LABEL_CLASS is imported from the component that emits it, so the selector cannot drift
    // from the markup. (The label elements themselves are not assertable here: React Flow renders
    // no edges at all in jsdom, which never measures nodes.)
    useStore.setState({ model: model(), focusId: 'sys', selectedId: 'ca' });
    const { container } = render(<Canvas />);
    const css = hlCss(container);
    expect(css).toContain(`.${EDGE_LABEL_CLASS}{opacity:0.12}`);                             // dimmed with the edges
    expect(css).toMatch(new RegExp(`\\.${EDGE_LABEL_CLASS}\\[data-edge-id="[^"]+"\\]\\{opacity:1\\}`)); // neighbor restored
  });

  it('in full mode, double-clicking a node with children still drills', () => {
    useStore.setState({ model: model(), focusId: 'sys', selectedId: null, audience: 'full' });
    const { container } = render(<Canvas />);
    dblclick(container, 'ca');
    expect(useStore.getState().focusId).toBe('ca');
  });

  it('clicking a ghost\'s expand caret expands it into its participating child', () => {
    useStore.setState({ model: model(), focusId: 'ca', selectedId: null, expandedExternals: new Set() });
    const { container } = render(<Canvas />);
    const caret = node(container, 'cb')!.querySelector('button')!;
    expect(caret).toBeTruthy();                         // cb is expandable → caret present
    fireEvent.click(caret);
    expect([...useStore.getState().expandedExternals]).toEqual(['cb']);
    // after expansion the member child b1 renders and the collapsed cb ghost is gone
    expect(node(container, 'b1')).toBeTruthy();
    expect(node(container, 'cb')?.classList.contains('react-flow__node-ghost')).toBeFalsy();
  });

  it('double-clicking a ghost still drills (caret does not steal the gesture)', () => {
    useStore.setState({ model: model(), focusId: 'ca', selectedId: null, expandedExternals: new Set() });
    const { container } = render(<Canvas />);
    dblclick(container, 'cb');
    expect(useStore.getState().focusId).toBe('cb');
  });
});

// A container whose children form a chain a1 → a2 → a3, where a2 → a3 exists only as a DERIVED edge
// (two connections on the same pair collapsed, count 2). Filtering to dataAccess only, or switching to
// stakeholder (which drops derived edges), hides it — which under the old (unstable) pipeline re-ran
// dagre and moved a3. The stable-base pipeline must keep a3 put.
function chainModel() {
  const m = emptyModel();
  m.nodes.push(
    { id: 'ca', name: 'Alpha', type: 'Container', parentId: null, ...base },
    { id: 'a1', name: 'A1', type: 'Component', parentId: 'ca', ...base },
    { id: 'a2', name: 'A2', type: 'Component', parentId: 'ca', ...base },
    { id: 'a3', name: 'A3', type: 'Component', parentId: 'ca', ...base },
  );
  m.connections.push(
    { id: 'e1', from: 'a1', to: 'a2', ...e, verb: 'reads' }, // dataAccess
    { id: 'e2', from: 'a2', to: 'a3', ...e }, // two edges on the same pair → derived a2 → a3 (control)
    { id: 'e3', from: 'a2', to: 'a3', ...e },
  );
  return m;
}

const xOf = (el: HTMLElement) => { const mm = /translate\(([-\d.]+)px/.exec(el.style.transform); return mm ? parseFloat(mm[1]) : NaN; };

describe('Canvas layout stability', () => {
  it('applying a connection filter does not move child node positions', () => {
    useStore.setState({ model: chainModel(), focusId: 'ca', selectedId: null, connFilter: { verbClasses: [], fields: {} }, audience: 'full', expandedExternals: new Set() });
    const { container } = render(<Canvas />);
    const before = node(container, 'a3')!.style.transform;
    act(() => { useStore.getState().toggleConnVerbClass('dataAccess'); }); // hides the control-class derived a2→a3
    expect(node(container, 'a3')!.style.transform).toBe(before);
  });

  it('switching audience does not move child node positions', () => {
    useStore.setState({ model: chainModel(), focusId: 'ca', selectedId: null, connFilter: { verbClasses: [], fields: {} }, audience: 'full', expandedExternals: new Set() });
    const { container } = render(<Canvas />);
    const before = node(container, 'a3')!.style.transform;
    act(() => { useStore.getState().setAudience('stakeholder'); }); // hides the derived a2→a3
    expect(node(container, 'a3')!.style.transform).toBe(before);
  });

  it('expanding an external keeps children put and renders the group on the same side', () => {
    useStore.setState({ model: model(), focusId: 'ca', selectedId: null, connFilter: { verbClasses: [], fields: {} }, audience: 'full', expandedExternals: new Set() });
    const { container } = render(<Canvas />);
    const a1Before = node(container, 'a1')!.style.transform;
    const a1X = xOf(node(container, 'a1')!);
    const cbSide = Math.sign(xOf(node(container, 'cb')!) - a1X); // side of the collapsed ghost
    act(() => { useStore.getState().toggleExternal('cb'); });
    expect(node(container, 'a1')!.style.transform).toBe(a1Before); // child unchanged
    const b1 = node(container, 'b1');
    expect(b1).toBeTruthy();
    expect(Math.sign(xOf(b1!) - a1X)).toBe(cbSide);                // member on the same side as the ghost was
  });
});

function flowModel() {
  const m = emptyModel();
  m.nodes.push(
    { id: 'ca', name: 'Alpha', type: 'Container', parentId: null, ...base },
    { id: 'a1', name: 'A1', type: 'Component', parentId: 'ca', ...base },
    { id: 'a2', name: 'A2', type: 'Component', parentId: 'ca', ...base },
  );
  m.connections.push({ id: 'x', from: 'a1', to: 'a2', ...e });
  m.flows.push({ id: 'f1', name: 'F', description: '', scope: null, steps: [
    { order: 1, from: 'a1', to: 'a2', via: 'x', message: 'go', kind: 'Sync' },
  ] });
  return m;
}

describe('Canvas flow overlay', () => {
  const hlCss = (container: HTMLElement) => container.querySelector('style[data-hyphae-hl]')!.textContent ?? '';

  it('leaves flows and patterns to the tree panel', () => {
    useStore.setState({ model: flowModel(), focusId: 'ca', selectedId: null, selectedFlowId: null });
    const { queryByText } = render(<Canvas />);
    expect(queryByText('Flows')).toBeNull();
    expect(queryByText('Patterns')).toBeNull();
  });

  it('selecting a flow dims the rest and restores its participating edge (via CSS)', () => {
    useStore.setState({ model: flowModel(), focusId: 'ca', selectedId: null, selectedFlowId: 'f1' });
    const { container } = render(<Canvas />);
    const css = hlCss(container);
    expect(css).toContain('.react-flow__edge{opacity:');           // dim rule active
    expect(css).toContain('.react-flow__edge[data-id="x"]');       // participating edge restored
  });

  it('selecting a flow whose steps are all off-view does not dim the canvas', () => {
    const m = emptyModel();
    m.nodes.push(
      { id: 'sys', name: 'Sys', type: 'System', parentId: null, ...base },
      { id: 'ca', name: 'Alpha', type: 'Container', parentId: 'sys', ...base },
      { id: 'cb', name: 'Beta', type: 'Container', parentId: 'sys', ...base },
      { id: 'a1', name: 'A1', type: 'Component', parentId: 'ca', ...base },
      { id: 'b1', name: 'B1', type: 'Component', parentId: 'cb', ...base },
    );
    m.connections.push({ id: 'x', from: 'a1', to: 'b1', ...e });
    // Step a1 -> b1; focused on 'ca', b1 lives in cb and is not a visible node -> off-view.
    m.flows.push({ id: 'f1', name: 'F', description: '', scope: null, steps: [
      { order: 1, from: 'a1', to: 'b1', message: 'go', kind: 'Sync' },
    ] });
    // Reset expandedExternals: a prior test may leave 'cb' expanded (singleton store), which would
    // surface b1 as a visible member and make the step on-view — defeating this test's premise.
    useStore.setState({ model: m, focusId: 'ca', selectedId: null, selectedFlowId: 'f1', expandedExternals: new Set() });
    const { container } = render(<Canvas />);
    const css = container.querySelector('style[data-hyphae-hl]')!.textContent ?? '';
    expect(css).not.toMatch(/react-flow__edge\{opacity:0\.\d/);   // no dim-all rule
    // ...and the step is published as off-view, so the tree can offer to navigate to it.
    expect(useStore.getState().offViewStepOrders).toEqual([1]);
  });

  it('draws an ephemeral edge for a step with no connection behind it', () => {
    // a1 and a2 are both drawn, but nothing connects them — the step still has to be visible.
    // React Flow renders no edges in jsdom, so assert the highlight CSS keyed on the edge id.
    const m = emptyModel();
    m.nodes.push(
      { id: 'ca', name: 'Alpha', type: 'Container', parentId: null, ...base },
      { id: 'a1', name: 'A1', type: 'Component', parentId: 'ca', ...base },
      { id: 'a2', name: 'A2', type: 'Component', parentId: 'ca', ...base },
    );
    m.flows.push({ id: 'f1', name: 'F', description: '', scope: null, steps: [
      { order: 1, from: 'a1', to: 'a2', message: 'go', kind: 'Sync' },
    ] });
    useStore.setState({ model: m, focusId: 'ca', selectedId: null, selectedFlowId: 'f1', expandedExternals: new Set() });
    const { container } = render(<Canvas />);
    expect(hlCss(container)).toContain('.react-flow__edge[data-id="flow-step:a1|a2"]');
    expect(useStore.getState().offViewStepOrders).toEqual([]);   // shown, so not marked ↗ in the tree
  });

  it('publishes an empty off-view step list when no flow is selected', () => {
    useStore.setState({ model: flowModel(), focusId: 'ca', selectedFlowId: null, offViewStepOrders: [7] });
    render(<Canvas />);
    expect(useStore.getState().offViewStepOrders).toEqual([]);
  });

  it('renders pattern member boxes when a pattern is selected', () => {
    const m = emptyModel();
    m.nodes.push({ id: 'comp', name: 'Ingest', type: 'Component', parentId: null, root: null, role: null, description: '', codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: { summary: 's' } } as never);
    m.patterns.push({ id: 'p1', name: 'Recorder', kind: 'state-machine', description: '', anchor: null,
      members: [{ name: 'Idle', description: '' }, { name: 'Recording', description: '' }],
      transitions: [{ from: 'Idle', to: 'Recording', trigger: 'start', description: '' }] });
    useStore.setState({ model: m, selectedPatternId: 'p1', selectedFlowId: null, focusId: null });
    // Scope the lookup to the canvas's own React Flow nodes via the file's `node()` helper: the
    // TreePanel lists the same member names when the pattern is selected (it is not rendered here,
    // but the canvas must be checked on its own terms either way).
    const { container } = render(<Canvas />);
    expect(node(container, 'Idle')).toBeTruthy();
    expect(node(container, 'Recording')).toBeTruthy();
  });

  // The single orchestrated moment in the design: a flow's participating edges pulse, which reads
  // as movement through the graph. Everything else only transitions on hover.
  it('animates the participating edges when a flow is selected', () => {
    useStore.setState({ model: flowModel(), focusId: 'ca', selectedId: null, selectedFlowId: 'f1' });
    const { container } = render(<Canvas />);
    expect(hlCss(container)).toContain('hyphae-pulse');
  });

  it('does not animate when no flow is selected', () => {
    useStore.setState({ model: flowModel(), focusId: 'ca', selectedId: null, selectedFlowId: null });
    const { container } = render(<Canvas />);
    expect(hlCss(container)).not.toContain('hyphae-pulse');
  });

  it('double-clicking a pattern member does NOT set focus to it', () => {
    // Pattern member boxes are keyed by member NAME, not by a node id — focusing one would point
    // the canvas at an id no node has. Only real model nodes are drillable.
    const m = emptyModel();
    m.nodes.push({ id: 'comp', name: 'Ingest', type: 'Component', parentId: null, root: null, role: null, description: '', codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: { summary: 's' } } as never);
    m.patterns.push({ id: 'p1', name: 'Recorder', kind: 'state-machine', description: '', anchor: null,
      members: [{ name: 'Idle', description: '' }, { name: 'Recording', description: '' }],
      transitions: [{ from: 'Idle', to: 'Recording', trigger: 'start', description: '' }] });
    useStore.setState({ model: m, selectedPatternId: 'p1', selectedFlowId: null, focusId: null });
    const { container } = render(<Canvas />);
    dblclick(container, 'Idle');
    expect(useStore.getState().focusId).toBeNull();
  });
});

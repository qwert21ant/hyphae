import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { Canvas } from '../src/Canvas';
import { useStore } from '../src/store';
import { emptyModel } from '@hyphae/schema';

// These tests drive the REAL React Flow (not a mock) so they exercise its actual
// event wiring — a mock that called our handlers directly previously hid a bug where
// nodesDraggable={false} suppresses React Flow's onNodeDoubleClick.

const base = { description: '', root: null, codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {} };
const e = { description: '', direction: 'Unidirectional' as const, realizedBy: [], codeRefs: [], fields: {} };

function model() {
  const m = emptyModel();
  m.nodes.push(
    { id: 'sys', name: 'Hyphae', type: 'System', parentId: null, ...base },
    { id: 'ca', name: 'Alpha', type: 'Container', parentId: 'sys', ...base },
    { id: 'cb', name: 'Beta', type: 'Container', parentId: 'sys', ...base },
    { id: 'a1', name: 'A1', type: 'Component', parentId: 'ca', ...base },
    { id: 'b1', name: 'B1', type: 'Component', parentId: 'cb', ...base },
    { id: 'k1', name: 'K1', type: 'Class', parentId: 'a1', ...base },
  );
  m.connections.push({ id: 'x', from: 'a1', to: 'b1', type: 'Dependency', ...e });
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

  it('double-clicking a leaf only selects (focus unchanged)', () => {
    useStore.setState({ model: model(), focusId: 'a1', selectedId: null });
    const { container } = render(<Canvas />);
    dblclick(container, 'k1');
    expect(useStore.getState().focusId).toBe('a1');
    expect(useStore.getState().selectedId).toBe('k1');
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
    m.connections.push({ id: 'y', from: 'a1', to: 'b1', type: 'Dependency', ...e });
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
    expect(css).toContain('#93c5fd');                                  // soft hover accent
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
    expect(before).toContain('#2563eb');                               // strong selection accent
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

  it('in stakeholder mode, double-clicking a Component does not drill into its Code', () => {
    useStore.setState({ model: model(), focusId: 'ca', selectedId: null, audience: 'stakeholder' });
    const { container } = render(<Canvas />);
    dblclick(container, 'a1');                        // a1 is a Component with a Class child (k1)
    expect(useStore.getState().focusId).toBe('ca');   // stayed put
    expect(useStore.getState().selectedId).toBe('a1');
  });

  it('in full mode, double-clicking a Component with children still drills', () => {
    useStore.setState({ model: model(), focusId: 'ca', selectedId: null, audience: 'full' });
    const { container } = render(<Canvas />);
    dblclick(container, 'a1');
    expect(useStore.getState().focusId).toBe('a1');
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
// (rolled up from a Code connection m1 → m2). Filtering to Dependency-only, or switching to
// stakeholder, hides that derived edge — which under the old (unstable) pipeline re-ran dagre and
// moved a3. The stable-base pipeline must keep a3 put.
function chainModel() {
  const m = emptyModel();
  m.nodes.push(
    { id: 'ca', name: 'Alpha', type: 'Container', parentId: null, ...base },
    { id: 'a1', name: 'A1', type: 'Component', parentId: 'ca', ...base },
    { id: 'a2', name: 'A2', type: 'Component', parentId: 'ca', ...base },
    { id: 'a3', name: 'A3', type: 'Component', parentId: 'ca', ...base },
    { id: 'm1', name: 'M1', type: 'Class', parentId: 'a2', ...base },
    { id: 'm2', name: 'M2', type: 'Class', parentId: 'a3', ...base },
  );
  m.connections.push(
    { id: 'e1', from: 'a1', to: 'a2', type: 'Dependency', ...e },
    { id: 'e2', from: 'm1', to: 'm2', type: 'DataFlow', ...e }, // rolls up to a derived a2 → a3
  );
  return m;
}

const xOf = (el: HTMLElement) => { const mm = /translate\(([-\d.]+)px/.exec(el.style.transform); return mm ? parseFloat(mm[1]) : NaN; };

describe('Canvas layout stability', () => {
  it('applying a connection filter does not move child node positions', () => {
    useStore.setState({ model: chainModel(), focusId: 'ca', selectedId: null, connFilter: { kinds: [], fields: {} }, audience: 'full', expandedExternals: new Set() });
    const { container } = render(<Canvas />);
    const before = node(container, 'a3')!.style.transform;
    act(() => { useStore.getState().toggleConnKind('Dependency'); }); // hides the DataFlow-derived a2→a3
    expect(node(container, 'a3')!.style.transform).toBe(before);
  });

  it('switching audience does not move child node positions', () => {
    useStore.setState({ model: chainModel(), focusId: 'ca', selectedId: null, connFilter: { kinds: [], fields: {} }, audience: 'full', expandedExternals: new Set() });
    const { container } = render(<Canvas />);
    const before = node(container, 'a3')!.style.transform;
    act(() => { useStore.getState().setAudience('stakeholder'); }); // hides the derived a2→a3
    expect(node(container, 'a3')!.style.transform).toBe(before);
  });

  it('expanding an external keeps children put and renders the group on the same side', () => {
    useStore.setState({ model: model(), focusId: 'ca', selectedId: null, connFilter: { kinds: [], fields: {} }, audience: 'full', expandedExternals: new Set() });
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

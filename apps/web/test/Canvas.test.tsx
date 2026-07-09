import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { Canvas } from '../src/Canvas';
import { useStore } from '../src/store';
import { emptyModel } from '@hyphae/schema';

// These tests drive the REAL React Flow (not a mock) so they exercise its actual
// event wiring — a mock that called our handlers directly previously hid a bug where
// nodesDraggable={false} suppresses React Flow's onNodeDoubleClick.

const base = { description: '', codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {} };
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
});

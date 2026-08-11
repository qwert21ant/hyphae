import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('@/state/api', () => {
  const blank = () => ({
    schemaVersion: 1, metadata: { name: 'Untitled', description: '', createdAt: 't', updatedAt: 't' },
    activeProfile: 'c4-backend', nodes: [], connections: [], flows: [], patterns: [],
    dataTypes: [], requirements: [], decisions: [], views: [],
  });
  return { loadModel: vi.fn(async () => ({ model: blank(), version: 0 })) };
});

import { SidePanel } from '@/features/inspector/SidePanel';
import { useStore } from '@/state/store';
import { emptyModel, type Node, type Connection } from '@hyphae/schema';

const mk = (over: Partial<Node>): Node => ({
  id: 'x', name: 'X', type: 'Component', description: '', parentId: null, root: null, role: null,
  codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {}, ...over,
});
const conn = (over: Partial<Connection>): Connection => ({
  id: 'c', from: 'a1', to: 'b1', label: '', verb: 'uses', object: '', description: '', direction: 'Unidirectional',
  realizedBy: [], codeRefs: [], fields: {}, ...over,
});

/** Seed the model and the selection in one shot. The store has no write action to arrange this with
 *  any more, and an explicit fixture is clearer than one built by calling the thing under test. */
function seed(
  parts: { nodes?: Node[]; connections?: Connection[] },
  selectedId: string | null,
  focusId: string | null = null,
) {
  useStore.getState().setModel(
    { ...emptyModel(), nodes: parts.nodes ?? [], connections: parts.connections ?? [] },
    0,
  );
  useStore.setState({ selectedId, focusId });
}

beforeEach(() => {
  useStore.getState().setModel(emptyModel(), 0);
  useStore.setState({ selectedId: null, focusId: null });
});

describe('SidePanel', () => {
  it('shows a hint when nothing is selected', () => {
    render(<SidePanel />);
    expect(screen.getByText(/no node selected/i)).toBeTruthy();
  });

  it('renders a node as text with no form control and no delete button', () => {
    seed({ nodes: [mk({ id: 'a1', name: 'Payments', description: 'Takes money', role: 'datastore' })] }, 'a1');
    const { container } = render(<SidePanel />);
    // The name and its type/role are no longer a heading and Row labels — they're .panel__name and
    // chips, so assert the markup that actually carries them now.
    expect(container.querySelector('.panel__name')?.textContent).toBe('Payments');
    expect(screen.getByText('Takes money')).toBeTruthy();
    // The real model uses roles like `datastore`/`queue`/`ui`, so this chip renders in production.
    const chips = [...container.querySelectorAll('.chip')].map((c) => c.textContent);
    expect(chips).toEqual(['Component', 'datastore']);
    expect(container.querySelector('input, select, textarea')).toBeNull();
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull();
  });

  it('renders the profile field values a node has', () => {
    seed({ nodes: [mk({ id: 'a1', fields: { summary: 'Stores clips', technology: 'Go' } })] }, 'a1');
    render(<SidePanel />);
    expect(screen.getByText('Stores clips')).toBeTruthy();
    expect(screen.getByText('Go')).toBeTruthy();
  });

  it('omits rows for values the node does not have', () => {
    seed({ nodes: [mk({ id: 'a1', root: null, role: null, fields: {} })] }, 'a1');
    render(<SidePanel />);
    expect(screen.queryByText('root')).toBeNull();
    expect(screen.queryByText('codeRefs')).toBeNull();
    expect(screen.queryByText('summary')).toBeNull();
    expect(screen.queryByText('invariants')).toBeNull();
    expect(screen.queryByText('role')).toBeNull();
  });

  it('renders codeRefs and a list field as list items', () => {
    seed({
      nodes: [mk({ id: 'a1', codeRefs: ['src/main.ts', 'src/util.ts'], fields: { invariants: ['always x'] } })],
    }, 'a1');
    const { container } = render(<SidePanel />);
    const items = [...container.querySelectorAll('li')].map((li) => li.textContent);
    expect(items).toContain('src/main.ts');
    expect(items).toContain('src/util.ts');
    expect(items).toContain('always x');
  });

  it('renders the parent as a link that reveals it', () => {
    seed({
      nodes: [mk({ id: 'ca', name: 'API', type: 'Container' }), mk({ id: 'comp', name: 'C', parentId: 'ca' })],
    }, 'comp');
    render(<SidePanel />);
    expect(screen.getByText('parent')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'API' }));
    // revealNode focuses the target's parent (root here) and selects the target itself.
    expect(useStore.getState().selectedId).toBe('ca');
    expect(useStore.getState().focusId).toBeNull();
  });

  it('omits the parent row for a top-level node', () => {
    seed({ nodes: [mk({ id: 'sys', name: 'Sys', type: 'System' })] }, 'sys');
    render(<SidePanel />);
    expect(screen.queryByText('parent')).toBeNull();
  });

  // README.md documents this order as inspector behaviour, which makes it a contract. `type` and
  // `role` moved out of `.field` rows into `.panel__chips` (asserted separately, above), so this
  // list now covers the fields that remain rows. `.field` rows are
  // `<div className="field ..."><span className="field__label ...">{label}</span>...</div>`, so
  // the first child span of each `.field` is the row's label. (The connection/rollup panels'
  // `<div className="panel__chips">` summary lines use a plain span, not `.field`, so this
  // selector never matches them.)
  it('renders the field labels in the documented order', () => {
    seed({
      nodes: [
        mk({ id: 'ca', name: 'Alpha', type: 'Container' }),
        mk({
          id: 'a1', name: 'A1', type: 'Component', parentId: 'ca',
          role: 'datastore', description: 'Stores clips on disk', root: 'src/a1/',
          codeRefs: ['src/a1/index.ts'], docRefs: ['https://example.com/a1'],
          fields: {
            summary: 'Stores clips', technology: 'Go',
            responsibilities: ['persist clips'], invariants: ['never loses a write'],
          },
        }),
      ],
    }, 'a1');
    const { container } = render(<SidePanel />);
    const labels = [...container.querySelectorAll('.field > span:first-child')].map((el) => el.textContent);
    expect(labels).toEqual([
      'summary', 'technology', 'description', 'root',
      'codeRefs', 'docRefs', 'responsibilities', 'invariants', 'parent',
    ]);
  });

  it('renders a connection as text with no form control and no delete button', () => {
    seed({
      nodes: [mk({ id: 'a1', name: 'A1' }), mk({ id: 'b1', name: 'B1' })],
      connections: [conn({ id: 'conn1', label: 'reads the camera list', description: 'Polls the feed' })],
    }, 'conn1');
    const { container } = render(<SidePanel />);
    // "Connection" is .panel__name text now, not a heading.
    expect(container.querySelector('.panel__name')?.textContent).toBe('Connection');
    expect(screen.getByText('A1 → B1')).toBeTruthy();
    expect(screen.getByText('reads the camera list')).toBeTruthy();
    expect(screen.getByText('Unidirectional')).toBeTruthy();
    expect(screen.getByText('Polls the feed')).toBeTruthy();
    expect(container.querySelector('input, select, textarea')).toBeNull();
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull();
  });

  it('omits the description row for a connection with none', () => {
    seed({
      nodes: [mk({ id: 'a1', name: 'A1' }), mk({ id: 'b1', name: 'B1' })],
      connections: [conn({ id: 'conn1', description: '' })],
    }, 'conn1');
    render(<SidePanel />);
    expect(screen.queryByText('description')).toBeNull();
  });

  it('shows a rolled-up connection with its underlying connections and drills on click', () => {
    seed({
      nodes: [
        mk({ id: 'sys', name: 'Sys', type: 'System' }),
        mk({ id: 'ca', name: 'Alpha', type: 'Container', parentId: 'sys' }),
        mk({ id: 'cb', name: 'Beta', type: 'Container', parentId: 'sys' }),
        mk({ id: 'a1', name: 'A1', parentId: 'ca' }),
        mk({ id: 'b1', name: 'B1', parentId: 'cb' }),
      ],
      connections: [conn({ id: 'x1' })],
    }, 'agg:ca->cb', 'sys');
    const { container } = render(<SidePanel />);
    // "Rolled-up connection" is .panel__name text now, not a heading.
    expect(container.querySelector('.panel__name')?.textContent).toBe('Rolled-up connection');
    expect(screen.getByText('Alpha → Beta')).toBeTruthy();
    expect(screen.getByText(/1 connection/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'A1' }));
    expect(useStore.getState().focusId).toBe('a1');
  });

  it('lists connections touching a selected node (and its descendants)', () => {
    seed({
      nodes: [mk({ id: 'ca', name: 'Alpha', type: 'Container' }), mk({ id: 'a1', name: 'A1', parentId: 'ca' }), mk({ id: 'b1', name: 'B1' })],
      connections: [conn({ id: 'c1' })],
    }, 'ca'); // a Container; its child a1 has a connection to b1
    render(<SidePanel />);
    // "connections (1)" became "connections · 1" (a micro-labelled section, not an <h3>).
    expect(screen.getByText(/connections · 1/i)).toBeTruthy();
    const list = document.querySelector('.rollup-list')!;
    fireEvent.click(list.querySelector('li')!);
    expect(useStore.getState().selectedId).toBe('c1');
  });

  it('splits the selected node connections into Outgoing and Incoming sections', () => {
    seed({
      nodes: [mk({ id: 'ca', name: 'Alpha', type: 'Container' }), mk({ id: 'a1', name: 'A1', parentId: 'ca' }), mk({ id: 'ext', name: 'Ext', type: 'System' })],
      connections: [conn({ id: 'o1', from: 'a1', to: 'ext' }), conn({ id: 'i1', from: 'ext', to: 'a1' })],
    }, 'ca');
    render(<SidePanel />);
    expect(screen.getByText(/connections · 2/i)).toBeTruthy();
    expect(screen.getByText(/outgoing · 1/i)).toBeTruthy();
    expect(screen.getByText(/incoming · 1/i)).toBeTruthy();
  });

  it('omits a direction subsection when it has no connections', () => {
    seed({
      nodes: [mk({ id: 'ca', name: 'Alpha', type: 'Container' }), mk({ id: 'a1', name: 'A1', parentId: 'ca' }), mk({ id: 'ext', name: 'Ext', type: 'System' })],
      connections: [conn({ id: 'o1', from: 'a1', to: 'ext' })],
    }, 'ca');
    render(<SidePanel />);
    expect(screen.getByText(/outgoing · 1/i)).toBeTruthy();
    expect(screen.queryByText(/incoming/i)).toBeNull();
  });

  it("lists a connection's realizedBy children and selects a child on row click", () => {
    seed({
      nodes: [mk({ id: 'ca', name: 'Alpha', type: 'Container' }), mk({ id: 'a1', name: 'A1', parentId: 'ca' }), mk({ id: 'b1', name: 'B1', parentId: 'ca' })],
      connections: [conn({ id: 'parent', realizedBy: ['child1', 'missing'] }), conn({ id: 'child1' })],
    }, 'parent');
    render(<SidePanel />);
    // missing child id is skipped → count is 1, not 2
    expect(screen.getByText(/realized by · 1/i)).toBeTruthy();
    const list = document.querySelector('.rollup-list')!;
    fireEvent.click(list.querySelector('li')!);
    expect(useStore.getState().selectedId).toBe('child1');
  });
});

// jsdom loads no external stylesheet, so nothing in styles.css is observable in the DOM. Read the
// file and assert the rules instead — the same trick TreePanel.test.tsx uses for the step marker.
// The inspector's rules moved from styles.css to styles/chrome.css in Task 7 (the component layer),
// then to features/inspector/inspector.css in Task 8 (the CSS split).
describe('inspector CSS', () => {
  const css = readFileSync(join(process.cwd(), 'src/features/inspector/inspector.css'), 'utf8');

  it('styles the read-only value, list and link', () => {
    expect(css).toMatch(/\.field__value\s*\{/);
    expect(css).toMatch(/\.field__list\s*\{/);
    expect(css).toMatch(/\.field__link\s*\{/);
  });

  it('no longer styles form controls inside a field', () => {
    expect(css).not.toMatch(/\.field\s+input/);
    expect(css).not.toMatch(/\.field\s+textarea/);
    expect(css).not.toMatch(/\.field\s+select/);
  });
});

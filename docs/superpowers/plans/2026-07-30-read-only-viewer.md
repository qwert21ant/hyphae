# Read-Only Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove every create/edit/delete surface for nodes and connections from `apps/web`, turning
the browser into a read-only viewer of a model that agents author over MCP.

**Architecture:** Five tasks, ordered so the suite stays green at every commit. Task 1 builds the new
read-only field renderers in isolation (nothing consumes them yet). Task 2 rewires `SidePanel` onto
them. Task 3 strips the toolbar's `add` buttons. Only then — with no caller left — Task 4 deletes the
store's write actions and the `api.ts` write layer. Task 5 corrects the living docs.

**Tech Stack:** TypeScript, React 18, Zustand, Vitest + @testing-library/react + jsdom.

Spec: `docs/superpowers/specs/2026-07-30-read-only-editor-design.md`.

## Global Constraints

- **`apps/server` and `apps/server/src/mcp.ts` must not change.** The HTTP write endpoints and all
  twelve MCP write tools keep working; only the browser stops calling them. If a task seems to need a
  server change, stop and ask.
- **`packages/schema` must not change.** No profile, no field type, no validation is touched.
- **Never run bare `pnpm vitest run` from the repo root** — there is no root vitest config and web
  tests then run without jsdom, producing dozens of bogus failures. Run `cd apps/web && pnpm test`
  for a single suite, `pnpm -r test` from the root for the whole baseline.
- **Roughly 80 `act(...)` warnings in the web suite are pre-existing noise**, not a regression.
- The web store is a module-level singleton. Reset the slice you touch in `beforeEach`.
- Conventional commits with a scope (`feat(web):`, `fix(web):`, `docs:`). Explain *why* in the body.
  End every commit message with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Stage explicit paths — never `git add -A`.** `apps/server/hyphae-baritone.json` is a real model
  and is permanently untracked; verify with `git status --short` before every commit.
- Branch is already `feat/read-only-viewer`; the spec is already committed there.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `apps/web/src/FieldRows.tsx` | **new** — read-only renderers for a labelled value, a list value, a node link, and a profile field | 1 |
| `apps/web/test/FieldRows.test.tsx` | **new** — covers all six `FieldType`s including `ref`, which no profile uses yet | 1 |
| `apps/web/src/SidePanel.tsx` | inspector: shows a node / connection / rollup as text; no controls | 2 |
| `apps/web/src/styles.css` | `.field__value` / `.field__list` / `.field__link` in, the `.field` control rules out | 2 |
| `apps/web/test/SidePanel.test.tsx` | rewritten: seeds via `setModel`, asserts text and absence of controls | 2 |
| `apps/web/src/App.tsx` | toolbar without the `add` buttons | 3 |
| `apps/web/test/App.test.tsx` | asserts no `add` button; api mock shrinks to `loadModel` | 3 |
| `apps/web/src/store.ts` | navigation + view state only | 4 |
| `apps/web/src/api.ts` | `loadModel` only | 4 |
| `apps/web/src/FloatingConnectionLine.tsx` | **deleted** — drag-to-connect line, already unreferenced | 4 |
| `apps/web/test/store.test.ts` | write-path tests deleted; api mock shrinks to `loadModel` | 4 |
| `README.md`, `docs/SPEC.md`, `docs/MODEL.md`, `CLAUDE.md` | living docs corrected | 5 |

---

### Task 1: `FieldRows.tsx` — the read-only field renderers

A new, self-contained presentational module. It takes `nodes` and an `onNavigate` callback as props
rather than reading the store, so its test needs no store and no api mock — and so a `ref`-typed
field can be tested with a synthetic `FieldDef` even though **no field in `c4-backend` uses
`type: 'ref'` today** (`packages/schema/src/profiles/c4-backend.ts` defines only `text` and `list`
fields). That is the whole reason this is its own file: routed through `SidePanel` and the real
profile, four of the six field types would be untestable.

**Files:**
- Create: `apps/web/src/FieldRows.tsx`
- Test: `apps/web/test/FieldRows.test.tsx`

**Interfaces:**
- Consumes: `FieldDef` and `Node` types from `@hyphae/schema`. `FieldDef` is
  `{ key: string; label?: string; type: 'text'|'number'|'boolean'|'list'|'enum'|'ref'; description: string; required?: boolean; values?: {value: string; description: string}[]; refKind?: string }`.
- Produces, for Task 2:
  ```ts
  export function isEmptyValue(value: unknown): boolean
  export function Row(props: { label: string; title?: string; children: React.ReactNode }): JSX.Element
  export function ListRow(props: { label: string; title?: string; items: string[] }): JSX.Element | null
  export function NodeLink(props: { id: string; nodes: Node[]; onNavigate: (id: string) => void }): JSX.Element
  export function FieldRow(props: { def: FieldDef; value: unknown; nodes: Node[]; onNavigate: (id: string) => void }): JSX.Element | null
  ```

- [x] **Step 1: Write the failing test**

Create `apps/web/test/FieldRows.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { isEmptyValue, Row, ListRow, NodeLink, FieldRow } from '../src/FieldRows';
import type { FieldDef, Node } from '@hyphae/schema';

const mk = (over: Partial<Node>): Node => ({
  id: 'x', name: 'X', type: 'Component', description: '', parentId: null, root: null, role: null,
  codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {}, ...over,
});
const def = (over: Partial<FieldDef>): FieldDef => ({ key: 'k', type: 'text', description: 'd', ...over });
const nodes = [mk({ id: 'a1', name: 'A1' })];

describe('isEmptyValue', () => {
  it('treats absent, blank and empty-list values as empty', () => {
    expect(isEmptyValue(undefined)).toBe(true);
    expect(isEmptyValue(null)).toBe(true);
    expect(isEmptyValue('')).toBe(true);
    expect(isEmptyValue([])).toBe(true);
  });

  it('treats false and 0 as values, not absences', () => {
    expect(isEmptyValue(false)).toBe(false);
    expect(isEmptyValue(0)).toBe(false);
    expect(isEmptyValue('x')).toBe(false);
    expect(isEmptyValue(['x'])).toBe(false);
  });
});

describe('Row', () => {
  it('renders the label and the value as text, with no form control', () => {
    const { container } = render(<Row label="root">endpoints/api/</Row>);
    expect(screen.getByText('root')).toBeTruthy();
    expect(screen.getByText('endpoints/api/')).toBeTruthy();
    expect(container.querySelector('input, select, textarea')).toBeNull();
  });
});

describe('ListRow', () => {
  it('renders one list item per entry', () => {
    const { container } = render(<ListRow label="codeRefs" items={['src/main.ts', 'src/util.ts']} />);
    expect([...container.querySelectorAll('li')].map((li) => li.textContent))
      .toEqual(['src/main.ts', 'src/util.ts']);
  });

  it('renders nothing at all when the list is empty', () => {
    const { container } = render(<ListRow label="codeRefs" items={[]} />);
    expect(container.innerHTML).toBe('');
  });
});

describe('NodeLink', () => {
  it('renders the target name as a button that navigates by id', () => {
    const onNavigate = vi.fn();
    render(<NodeLink id="a1" nodes={nodes} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole('button', { name: 'A1' }));
    expect(onNavigate).toHaveBeenCalledWith('a1');
  });

  it('shows an unresolvable id as dimmed text rather than dropping it', () => {
    render(<NodeLink id="ghost" nodes={nodes} onNavigate={vi.fn()} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('ghost')).toBeTruthy();
  });
});

describe('FieldRow', () => {
  const noop = vi.fn();

  it('renders nothing for an empty value', () => {
    const { container } = render(<FieldRow def={def({ key: 'summary' })} value="" nodes={nodes} onNavigate={noop} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders a list field as list items', () => {
    const { container } = render(
      <FieldRow def={def({ key: 'invariants', type: 'list' })} value={['a', 'b']} nodes={nodes} onNavigate={noop} />,
    );
    expect([...container.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['a', 'b']);
  });

  it('renders a boolean as yes or no, including false', () => {
    render(<FieldRow def={def({ key: 'cached', type: 'boolean' })} value={false} nodes={nodes} onNavigate={noop} />);
    expect(screen.getByText('no')).toBeTruthy();
  });

  it('renders the number zero rather than omitting it', () => {
    render(<FieldRow def={def({ key: 'replicas', type: 'number' })} value={0} nodes={nodes} onNavigate={noop} />);
    expect(screen.getByText('0')).toBeTruthy();
  });

  it('renders a ref field as a navigable node name', () => {
    const onNavigate = vi.fn();
    render(<FieldRow def={def({ key: 'owner', type: 'ref' })} value="a1" nodes={nodes} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole('button', { name: 'A1' }));
    expect(onNavigate).toHaveBeenCalledWith('a1');
  });

  it('prefers the field def label over its key', () => {
    render(<FieldRow def={def({ key: 'tech', label: 'technology' })} value="Go" nodes={nodes} onNavigate={noop} />);
    expect(screen.getByText('technology')).toBeTruthy();
    expect(screen.queryByText('tech')).toBeNull();
  });

  it('never renders a form control, whatever the field type', () => {
    const { container } = render(
      <>
        <FieldRow def={def({ key: 'a' })} value="text" nodes={nodes} onNavigate={noop} />
        <FieldRow def={def({ key: 'b', type: 'number' })} value={2} nodes={nodes} onNavigate={noop} />
        <FieldRow def={def({ key: 'c', type: 'boolean' })} value={true} nodes={nodes} onNavigate={noop} />
        <FieldRow def={def({ key: 'd', type: 'list' })} value={['x']} nodes={nodes} onNavigate={noop} />
        <FieldRow def={def({ key: 'e', type: 'enum' })} value="one" nodes={nodes} onNavigate={noop} />
        <FieldRow def={def({ key: 'f', type: 'ref' })} value="a1" nodes={nodes} onNavigate={noop} />
      </>,
    );
    expect(container.querySelector('input, select, textarea')).toBeNull();
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

```bash
cd apps/web && pnpm vitest run test/FieldRows.test.tsx
```

Expected: FAIL — `Failed to resolve import "../src/FieldRows"`.

- [x] **Step 3: Write the implementation**

Create `apps/web/src/FieldRows.tsx`:

```tsx
import type { FieldDef, Node } from '@hyphae/schema';

/** Read-only counterparts of the inspector's old editable controls: the model is authored by agents
 *  over MCP, so nothing here writes. Kept out of `SidePanel` because `SidePanel` renders the real
 *  `c4-backend` profile, which defines only `text` and `list` fields — routed through it, the other
 *  four `FieldType`s (`number`, `boolean`, `enum`, `ref`) would have no way to be tested. */

/** Absent, blank, or an empty list. `false` and `0` are values, not absences — omitting them would
 *  make "no" and "zero" indistinguishable from "nobody filled this in". */
export function isEmptyValue(value: unknown): boolean {
  return value === undefined || value === null || value === ''
    || (Array.isArray(value) && value.length === 0);
}

/** A labelled scalar value. Reuses `.field`'s label/value stack so the panel's rhythm is unchanged
 *  from when this row held an `<input>`. */
export function Row({ label, title, children }: {
  label: string; title?: string; children: React.ReactNode;
}) {
  return (
    <div className="field" title={title}>
      <span>{label}</span>
      <span className="field__value">{children}</span>
    </div>
  );
}

/** A list value, one entry per line — the read-only form of the old newline-separated textarea.
 *  Renders nothing when empty, so an unfilled list costs no vertical space. */
export function ListRow({ label, title, items }: { label: string; title?: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="field" title={title}>
      <span>{label}</span>
      <ul className="field__list">
        {items.map((item, i) => <li key={`${i}:${item}`}>{item}</li>)}
      </ul>
    </div>
  );
}

/** A node id shown as its clickable name. Losing the ability to *set* a parent or a ref should not
 *  cost the ability to *follow* one. An id that no longer resolves shows dimmed rather than
 *  vanishing — the same treatment `TreePanel` gives a dangling pattern anchor. */
export function NodeLink({ id, nodes, onNavigate }: {
  id: string; nodes: Node[]; onNavigate: (id: string) => void;
}) {
  const target = nodes.find((n) => n.id === id);
  if (!target) return <span className="tree-dim">{id}</span>;
  return <button className="field__link" onClick={() => onNavigate(id)}>{target.name}</button>;
}

/** One profile-defined field, formatted by its declared type. An empty value renders nothing at all:
 *  a short panel is the signal that a node is thinly described, and `model_gaps` is the tool for
 *  auditing that properly. */
export function FieldRow({ def, value, nodes, onNavigate }: {
  def: FieldDef; value: unknown; nodes: Node[]; onNavigate: (id: string) => void;
}) {
  if (isEmptyValue(value)) return null;
  const label = def.label ?? def.key;
  if (def.type === 'list') {
    return <ListRow label={label} title={def.description} items={(value as unknown[]).map(String)} />;
  }
  if (def.type === 'ref') {
    return (
      <Row label={label} title={def.description}>
        <NodeLink id={String(value)} nodes={nodes} onNavigate={onNavigate} />
      </Row>
    );
  }
  return (
    <Row label={label} title={def.description}>
      {def.type === 'boolean' ? (value ? 'yes' : 'no') : String(value)}
    </Row>
  );
}
```

- [x] **Step 4: Run the test to verify it passes**

```bash
cd apps/web && pnpm vitest run test/FieldRows.test.tsx
```

Expected: PASS, 14 tests.

- [x] **Step 5: Run the whole web suite — nothing else may move**

```bash
cd apps/web && pnpm test
```

Expected: the existing count plus 14. Nothing consumes `FieldRows` yet, so no other file can change.

- [x] **Step 6: Commit**

```bash
git add apps/web/src/FieldRows.tsx apps/web/test/FieldRows.test.tsx
git status --short   # hyphae-baritone.json must still be listed as untracked (??), not staged
git commit -m "$(cat <<'EOF'
feat(web): add read-only renderers for inspector field values

Presentational counterparts of the inspector's editable controls: a labelled
value row, a list row, a node link, and a profile-field row that formats by
declared FieldType and renders nothing for an empty value.

Its own module rather than internals of SidePanel: SidePanel renders the real
c4-backend profile, which defines only text and list fields, so `number`,
`boolean`, `enum` and `ref` would otherwise have no route to a test. Taking
`nodes` and `onNavigate` as props (not from the store) also means the test
needs no api mock.

Nothing consumes this yet.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `SidePanel` becomes a detail view

**Files:**
- Modify: `apps/web/src/SidePanel.tsx` (full rewrite of the render bodies; `FieldInput` deleted)
- Modify: `apps/web/src/styles.css:34-36`
- Test: `apps/web/test/SidePanel.test.tsx` (rewritten)

**Interfaces:**
- Consumes: `Row`, `ListRow`, `NodeLink`, `FieldRow` from Task 1, with the exact signatures listed
  there. Also `nodeFields(c4Backend, type)` and `connectionFields(c4Backend)` from `@hyphae/schema`,
  both already imported by the current file.
- Produces: nothing new. `SidePanel` keeps its zero-prop signature.

**Note on field order.** `nodeFields(c4Backend, 'Component')` returns
`[responsibilities, invariants, summary, technology]` — common fields first. The current file already
splits that list in two so `summary`/`technology` (the two the canvas draws) come first; keep that
split, just without the `On diagram` / `Detail` `<h3>`s that used to head the two halves.

- [x] **Step 1: Write the failing test**

Replace `apps/web/test/SidePanel.test.tsx` entirely:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('../src/api', () => {
  const blank = () => ({
    schemaVersion: 1, metadata: { name: 'Untitled', description: '', createdAt: 't', updatedAt: 't' },
    activeProfile: 'c4-backend', nodes: [], connections: [], flows: [], patterns: [],
    dataTypes: [], requirements: [], decisions: [], views: [],
  });
  return { loadModel: vi.fn(async () => ({ model: blank(), version: 0 })) };
});

import { SidePanel } from '../src/SidePanel';
import { useStore } from '../src/store';
import { emptyModel, type Node, type Connection } from '@hyphae/schema';

const mk = (over: Partial<Node>): Node => ({
  id: 'x', name: 'X', type: 'Component', description: '', parentId: null, root: null, role: null,
  codeRefs: [], docRefs: [], createdAt: 't', updatedAt: 't', fields: {}, ...over,
});
const conn = (over: Partial<Connection>): Connection => ({
  id: 'c', from: 'a1', to: 'b1', verb: 'uses', object: '', description: '', direction: 'Unidirectional',
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
    seed({ nodes: [mk({ id: 'a1', name: 'Payments', description: 'Takes money' })] }, 'a1');
    const { container } = render(<SidePanel />);
    expect(screen.getByRole('heading', { name: 'Payments' })).toBeTruthy();
    expect(screen.getByText('Takes money')).toBeTruthy();
    expect(screen.getByText('Component')).toBeTruthy();
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
    seed({ nodes: [mk({ id: 'a1', root: null, fields: {} })] }, 'a1');
    render(<SidePanel />);
    expect(screen.queryByText('root')).toBeNull();
    expect(screen.queryByText('codeRefs')).toBeNull();
    expect(screen.queryByText('summary')).toBeNull();
    expect(screen.queryByText('invariants')).toBeNull();
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

  it('renders a connection as text with no form control and no delete button', () => {
    seed({
      nodes: [mk({ id: 'a1', name: 'A1' }), mk({ id: 'b1', name: 'B1' })],
      connections: [conn({ id: 'conn1', verb: 'reads', object: 'camera list' })],
    }, 'conn1');
    const { container } = render(<SidePanel />);
    expect(screen.getByRole('heading', { name: /connection/i })).toBeTruthy();
    expect(screen.getByText('A1 → B1')).toBeTruthy();
    expect(screen.getByText('reads')).toBeTruthy();
    expect(screen.getByText('camera list')).toBeTruthy();
    expect(screen.getByText('Unidirectional')).toBeTruthy();
    expect(container.querySelector('input, select, textarea')).toBeNull();
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull();
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
    render(<SidePanel />);
    expect(screen.getByRole('heading', { name: /rolled-up connection/i })).toBeTruthy();
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
    expect(screen.getByText(/connections \(1\)/i)).toBeTruthy();
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
    expect(screen.getByText(/connections \(2\)/i)).toBeTruthy();
    expect(screen.getByText(/outgoing \(1\)/i)).toBeTruthy();
    expect(screen.getByText(/incoming \(1\)/i)).toBeTruthy();
  });

  it('omits a direction subsection when it has no connections', () => {
    seed({
      nodes: [mk({ id: 'ca', name: 'Alpha', type: 'Container' }), mk({ id: 'a1', name: 'A1', parentId: 'ca' }), mk({ id: 'ext', name: 'Ext', type: 'System' })],
      connections: [conn({ id: 'o1', from: 'a1', to: 'ext' })],
    }, 'ca');
    render(<SidePanel />);
    expect(screen.getByText(/outgoing \(1\)/i)).toBeTruthy();
    expect(screen.queryByText(/incoming/i)).toBeNull();
  });

  it("lists a connection's realizedBy children and selects a child on row click", () => {
    seed({
      nodes: [mk({ id: 'ca', name: 'Alpha', type: 'Container' }), mk({ id: 'a1', name: 'A1', parentId: 'ca' }), mk({ id: 'b1', name: 'B1', parentId: 'ca' })],
      connections: [conn({ id: 'parent', realizedBy: ['child1', 'missing'] }), conn({ id: 'child1' })],
    }, 'parent');
    render(<SidePanel />);
    // missing child id is skipped → count is 1, not 2
    expect(screen.getByText(/realized by \(1\)/i)).toBeTruthy();
    const list = document.querySelector('.rollup-list')!;
    fireEvent.click(list.querySelector('li')!);
    expect(useStore.getState().selectedId).toBe('child1');
  });
});

// jsdom loads no external stylesheet, so nothing in styles.css is observable in the DOM. Read the
// file and assert the rules instead — the same trick TreePanel.test.tsx uses for the step marker.
describe('inspector CSS', () => {
  const css = readFileSync(join(process.cwd(), 'src/styles.css'), 'utf8');

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
```

- [x] **Step 2: Run the test to verify it fails**

```bash
cd apps/web && pnpm vitest run test/SidePanel.test.tsx
```

Expected: FAIL — several cases, including `container.querySelector('input, select, textarea')`
returning the name input rather than `null`, `getByRole('heading', { name: 'Payments' })` not
matching (the `<h2>` still holds the node *type*), and both CSS assertions.

- [x] **Step 3: Rewrite `SidePanel.tsx`**

Replace the whole file:

```tsx
import { useMemo } from 'react';
import { useStore } from './store';
import { buildFocusView, partitionConnections } from './focusView';
import { ConnectionList } from './ConnectionList';
import { Row, ListRow, NodeLink, FieldRow } from './FieldRows';
import { nodeFields, connectionFields, c4Backend, type Connection } from '@hyphae/schema';

/** The inspector: a read-only detail view of whatever is selected. The model is authored by agents
 *  over MCP (and by editing the JSON file), so nothing in the browser writes — refs and the parent
 *  stay navigable, which is the only interaction left here. */
export function SidePanel() {
  const node = useStore((s) => s.model.nodes.find((n) => n.id === s.selectedId));
  const connection = useStore((s) => s.model.connections.find((c) => c.id === s.selectedId));
  const nodes = useStore((s) => s.model.nodes);
  const revealNode = useStore((s) => s.revealNode);
  const model = useStore((s) => s.model);
  const selectedId = useStore((s) => s.selectedId);
  const focusId = useStore((s) => s.focusId);
  const connFilter = useStore((s) => s.connFilter);
  const rollup = useMemo(() => {
    // Only derived (rollup) edges use the `agg:` id; skip the view recompute for any other selection.
    if (!selectedId?.startsWith('agg:')) return null;
    const v = buildFocusView(model, focusId, connFilter);
    return v.edges.find((edge) => edge.derived && edge.id === selectedId) ?? null;
  }, [model, focusId, connFilter, selectedId]);

  if (node) {
    const fields = nodeFields(c4Backend, node.type);
    // summary and technology are the two the canvas draws, so they lead — the same split the panel
    // made when it had "On diagram" / "Detail" headings to justify it.
    const onDiagram = (def: { key: string }) => def.key === 'summary' || def.key === 'technology';
    const { outgoing, incoming } = partitionConnections(model, node.id);
    const total = outgoing.length + incoming.length;
    return (
      <aside className="panel">
        <h2>{node.name}</h2>
        <Row label="type">{node.type}</Row>
        {node.role && (
          <Row label="role" title="Shape archetype. Empty = this node kind's default.">{node.role}</Row>
        )}
        {fields.filter(onDiagram).map((def) => (
          <FieldRow key={def.key} def={def} value={node.fields[def.key]} nodes={nodes} onNavigate={revealNode} />
        ))}
        {node.description && <Row label="description">{node.description}</Row>}
        {node.root && (
          <Row label="root" title='Directory Ref anchoring this subtree on disk, e.g. "endpoints/media_gateway/". Descendants resolve their refs against it.'>
            {node.root}
          </Row>
        )}
        <ListRow label="codeRefs" title="Refs relative to the nearest ancestor root." items={node.codeRefs} />
        <ListRow label="docRefs" title="Refs or URLs." items={node.docRefs} />
        {fields.filter((def) => !onDiagram(def)).map((def) => (
          <FieldRow key={def.key} def={def} value={node.fields[def.key]} nodes={nodes} onNavigate={revealNode} />
        ))}
        {node.parentId && (
          <Row label="parent">
            <NodeLink id={node.parentId} nodes={nodes} onNavigate={revealNode} />
          </Row>
        )}
        {total > 0 && (
          <>
            <h3>Connections ({total})</h3>
            {outgoing.length > 0 && (
              <>
                <h4 className="conn-dir">Outgoing ({outgoing.length})</h4>
                <ConnectionList connections={outgoing} />
              </>
            )}
            {incoming.length > 0 && (
              <>
                <h4 className="conn-dir">Incoming ({incoming.length})</h4>
                <ConnectionList connections={incoming} />
              </>
            )}
          </>
        )}
      </aside>
    );
  }

  if (connection) {
    const conn = connection;
    const nameOf = (id: string) => nodes.find((n) => n.id === id)?.name ?? id;
    const realizedChildren = conn.realizedBy
      .map((id) => model.connections.find((c) => c.id === id))
      .filter((c): c is Connection => !!c);
    return (
      <aside className="panel">
        <h2>Connection</h2>
        <p className="field"><strong>{nameOf(conn.from)} → {nameOf(conn.to)}</strong></p>
        <Row label="verb" title="The business action shown on the edge.">{conn.verb}</Row>
        {conn.object && (
          <Row label="object" title='Short noun the action acts on, e.g. "camera list".'>{conn.object}</Row>
        )}
        <Row label="direction">{conn.direction}</Row>
        {conn.description && <Row label="description">{conn.description}</Row>}
        {connectionFields(c4Backend).map((def) => (
          <FieldRow key={def.key} def={def} value={conn.fields[def.key]} nodes={nodes} onNavigate={revealNode} />
        ))}
        {realizedChildren.length > 0 && (
          <>
            <h3>Realized by ({realizedChildren.length})</h3>
            <ConnectionList connections={realizedChildren} />
          </>
        )}
      </aside>
    );
  }

  if (rollup) {
    const nameOf = (id: string) => nodes.find((n) => n.id === id)?.name ?? id;
    const conns = rollup.realizedBy
      .map((id) => model.connections.find((c) => c.id === id))
      .filter((c): c is Connection => !!c);
    return (
      <aside className="panel">
        <h2>Rolled-up connection</h2>
        <p className="field"><strong>{nameOf(rollup.from)} → {nameOf(rollup.to)}</strong></p>
        <p className="field">{conns.length} connection{conns.length === 1 ? '' : 's'}</p>
        <ConnectionList connections={conns} />
      </aside>
    );
  }

  return <aside className="panel"><p>No node selected.</p></aside>;
}
```

Gone from this file: the `lines()` helper, the `FieldInput` component, and the
`DirectionSchema` / `allowedParentTypes` / `nodeFields`-adjacent editing imports
(`DirectionSchema`, `allowedParentTypes`, `type Node`, `type FieldDef` are all unused now).

- [x] **Step 4: Update `styles.css`**

In `apps/web/src/styles.css`, replace lines 35-36:

```css
.field input, .field textarea, .field select { font-size: 13px; padding: 4px; }
.field textarea { min-height: 56px; }
```

with:

```css
.field__value { font-size: 13px; white-space: pre-wrap; overflow-wrap: anywhere; }
.field__list { margin: 0; padding-left: 16px; font-size: 13px; overflow-wrap: anywhere; }
.field__link { background: none; border: none; padding: 0; font-size: 13px; color: #2563eb; cursor: pointer; text-align: left; }
.field__link:hover { text-decoration: underline; }
```

`.field { display: flex; flex-direction: column; ... }` on line 34 stays — it is what stacks a label
over its value. `pre-wrap` keeps a multi-line `description` readable; `overflow-wrap: anywhere` stops
a long ref path from overflowing the panel. `#2563eb` is the app's existing link blue (`.crumb`).
`FilterPanel` and `SearchBox` style their own controls inline, so nothing else loses styling.

- [x] **Step 5: Run the test to verify it passes**

```bash
cd apps/web && pnpm vitest run test/SidePanel.test.tsx
```

Expected: PASS, 15 tests.

- [x] **Step 6: Run the whole web suite**

```bash
cd apps/web && pnpm test
```

Expected: green. `App.test.tsx` still passes — it never asserted on inspector controls, and the
store's write actions are still present for its own `add` button test.

- [x] **Step 7: Commit**

```bash
git add apps/web/src/SidePanel.tsx apps/web/src/styles.css apps/web/test/SidePanel.test.tsx
git status --short
git commit -m "$(cat <<'EOF'
feat(web): make the inspector a read-only detail view

Every control in the side panel wrote on change, so typing a description
PATCHed the model once per character, and Delete node removed the node plus
every connection touching it with no confirmation and no undo. The models in
this repo are built over MCP, which validates against the profile and writes
in batches.

The panel now shows the same information as text: name as the heading, then
type, role, the fields the canvas draws, description, root, refs, the
remaining profile fields, and the parent. Empty values render no row at all —
a short panel is the signal that a node is thinly described. The parent and
any ref-typed field stay clickable via revealNode, so losing the ability to
set a ref does not cost the ability to follow one.

The "On diagram" / "Detail" headings are gone: they grouped fields by editing
affordance, which means nothing once nothing is edited. The field order they
justified is kept.

The store's write actions survive this commit unused; App still calls addNode.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Remove the `add` buttons from the toolbar

**Files:**
- Modify: `apps/web/src/App.tsx:7, :50, :148, :162-164`
- Test: `apps/web/test/App.test.tsx:4-25, :68-74`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: nothing. This is the last caller of `store.addNode`; Task 4 depends on it landing first.

- [x] **Step 1: Write the failing test**

In `apps/web/test/App.test.tsx`, replace the whole test at lines 68-74:

```tsx
  it('adds a top-level node at the root and parents it to null', async () => {
    render(<App />);
    await new Promise((r) => setTimeout(r, 0)); // let initial loadModel settle
    fireEvent.click(screen.getByRole('button', { name: /add system/i }));
    await waitFor(() => expect(useStore.getState().model.nodes.map((n) => n.type)).toEqual(['System']));
    expect(useStore.getState().model.nodes[0].parentId).toBeNull();
  });
```

with:

```tsx
  it('offers no create button in the toolbar', async () => {
    render(<App />);
    await new Promise((r) => setTimeout(r, 0)); // let initial loadModel settle
    expect(screen.queryByRole('button', { name: /^add /i })).toBeNull();
  });
```

- [x] **Step 2: Run the test to verify it fails**

```bash
cd apps/web && pnpm vitest run test/App.test.tsx
```

Expected: FAIL — `offers no create button in the toolbar` finds the `add System` button.

- [x] **Step 3: Strip the buttons from `App.tsx`**

Four edits. All three of `c4Backend`, `allowedChildTypes` and `topLevelTypes` are used *only* on line
148, and `focusNode` (line 147) is read only by line 148 — verified by
`grep -n 'c4Backend\|focusNode\|addable' apps/web/src/App.tsx`, which reports lines 7, 147, 148 and
162 and nothing else. So the whole chain goes:

1. Line 7 — delete the entire import statement:

```tsx
import { c4Backend, allowedChildTypes, topLevelTypes } from '@hyphae/schema';
```

2. Line 50 — delete `const addNode = useStore((s) => s.addNode);`

3. Lines 147-148 — delete both:

```tsx
  const focusNode = focusId ? model.nodes.find((n) => n.id === focusId) : null;
  const addable = focusNode ? allowedChildTypes(c4Backend, focusNode.type) : topLevelTypes(c4Backend);
```

`const crumbs = breadcrumbPath(model, focusId);` on line 146 **stays** — the breadcrumbs still need
it.

4. Lines 162-164 — delete the button row:

```tsx
        {addable.map((t) => (
          <button key={t} onClick={() => addNode(t)}>add {t}</button>
        ))}
```

- [x] **Step 4: Shrink the api mock in `App.test.tsx`**

Replace the `vi.mock('../src/api', () => {...})` block at lines 4-25 with:

```tsx
vi.mock('../src/api', () => {
  const blank = () => ({
    schemaVersion: 1, metadata: { name: 'Untitled', description: '', createdAt: 't', updatedAt: 't' },
    activeProfile: 'c4-backend', nodes: [], connections: [], flows: [], patterns: [],
    dataTypes: [], requirements: [], decisions: [], views: [],
  });
  return { loadModel: vi.fn(async () => ({ model: blank(), version: 0 })) };
});
```

`fireEvent` and `waitFor` are both still used further down the file (the audience toggle, the outline
collapse, and the hash-push assertions), so leave the imports on line 2 alone.

- [x] **Step 5: Run the test to verify it passes**

```bash
cd apps/web && pnpm vitest run test/App.test.tsx
```

Expected: PASS. Then confirm no TypeScript casualty from the deleted imports:

```bash
cd apps/web && pnpm build
```

Expected: build succeeds. An `'allowedChildTypes' is declared but never read` error here means step 3
edit 1 was missed; `'model' is declared but never read` means edit 3 removed `crumbs` by mistake.

- [x] **Step 6: Run the whole web suite**

```bash
cd apps/web && pnpm test
```

Expected: green, one test fewer than after Task 2.

- [x] **Step 7: Commit**

```bash
git add apps/web/src/App.tsx apps/web/test/App.test.tsx
git status --short
git commit -m "$(cat <<'EOF'
feat(web): remove the toolbar's add-node buttons

The button created a node named after its own type, with no fields, under the
current focus, and left the user to fill a form field by field. Nodes come
from MCP, where they arrive named and described in one validated write.

This was the last caller of store.addNode.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Delete the client write path

With no UI caller left, the store actions, the `api.ts` write layer and the unreferenced
drag-to-connect line all go.

**Files:**
- Modify: `apps/web/src/store.ts` (`:1-9` imports, `:11-44` State type, `:46-56` recover, `:69` error, `:146-199` actions)
- Modify: `apps/web/src/api.ts` (`:19-47`)
- Delete: `apps/web/src/FloatingConnectionLine.tsx`
- Test: `apps/web/test/store.test.ts` (`:4-28` mock, `:34-91` write tests)

**Interfaces:**
- Consumes: the guarantee from Tasks 2 and 3 that no component calls a write action.
- Produces: `api.ts` exporting **only** `loadModel(): Promise<{ model: HyphaeModel; version: number }>`;
  the store's `State` type without `error` or any write action.

- [x] **Step 1: Verify there is genuinely no caller left**

```bash
cd /c/projects/hyphae/apps/web && grep -rn "addNode\|addConnection\|reparent\|deleteNode\|deleteConnection\|updateNode\|updateConnection\|ApiError\|s.error\|FloatingConnectionLine" src/
```

Expected output: **only** `src/store.ts` and `src/api.ts` lines, plus
`src/FloatingConnectionLine.tsx` defining itself. Any hit in another `src/` file means Task 2 or 3 is
incomplete — stop and fix that first.

- [x] **Step 2: Write the failing test**

Replace the mock block at `apps/web/test/store.test.ts:4-28` with:

```tsx
vi.mock('../src/api', () => {
  const blank = () => ({
    schemaVersion: 1, metadata: { name: 'Untitled', description: '', createdAt: 't', updatedAt: 't' },
    activeProfile: 'c4-backend', nodes: [], connections: [], flows: [], patterns: [],
    dataTypes: [], requirements: [], decisions: [], views: [],
  });
  return { loadModel: vi.fn(async () => ({ model: blank(), version: 0 })) };
});
```

Delete these seven tests wholesale (currently lines 35-91) — they test behaviour that is being
removed:

- `adds a node from the server response`
- `updates a node field`
- `deletes a node and its connections`
- `updates a connection`
- `reparents a node (sets parentId)`
- `adds a node as a child of the current focus`
- `refetches and surfaces the issue when a write is rejected (422)`

Then add this test at the top of the `describe('editor store', ...)` block, in their place:

```ts
  it('exposes no write action — the model is authored over MCP', () => {
    const s = useStore.getState() as unknown as Record<string, unknown>;
    for (const name of [
      'addNode', 'updateNode', 'reparent', 'deleteNode',
      'addConnection', 'updateConnection', 'deleteConnection',
    ]) {
      expect(s[name]).toBeUndefined();
    }
  });
```

Everything from `toggles audience and persists it to localStorage` (line 93) down to the end of the
file is unchanged, including the three later `describe` blocks. The comment above
`describe('audience init from localStorage')` still applies verbatim — the shrunk `vi.mock` factory
is still reapplied after `vi.resetModules()`.

- [x] **Step 3: Run the test to verify it fails**

```bash
cd apps/web && pnpm vitest run test/store.test.ts
```

Expected: FAIL on `exposes no write action` — `expected [Function] to be undefined`.

- [x] **Step 4: Strip `store.ts`**

Four edits to `apps/web/src/store.ts`:

1. Lines 1-9 — the imports. `newId`, `Node` and `Connection` are only used by the write actions:

```ts
import { create } from 'zustand';
import { emptyModel, type HyphaeModel, type FlowStep } from '@hyphae/schema';
import { stepReveal, type Audience, type ConnFilter } from './focusView';
import * as api from './api';

export type { ConnFilter };
```

2. Lines 37-43 of the `State` type — delete all seven action signatures. Also delete
   `error: string | null;` (line 18). The type ends:

```ts
  toggleConnVerbClass: (value: string) => void;
  toggleConnField: (key: string, value: string) => void;
  clearConnFilter: () => void;
  toggleExternal: (id: string) => void;
};
```

3. Lines 46-56 — delete the whole `recover()` helper, so the factory opens:

```ts
export const useStore = create<State>((set, get) => {
  const initialAudience: Audience =
```

4. Line 69 — delete `error: null,` from the initial state. Lines 146-199 — delete every action from
   `addNode:` through the closing brace of `deleteConnection:`, so the returned object ends:

```ts
    toggleExternal: (id) =>
      set((s) => {
        const next = new Set(s.expandedExternals);
        if (next.has(id)) next.delete(id); else next.add(id);
        return { expandedExternals: next };
      }),
  };
});
```

**`ownVersion` stays.** `App.tsx:114-115` still guards `version > ownVersion` so the version
`loadModel` already returned does not trigger a redundant resync; it is now only ever set from a
load. Add that as a comment on the field so nobody deletes it as write-only bookkeeping:

```ts
  // Only ever set from a load now that the browser does not write. It still earns its place: the
  // SSE handler compares against it to ignore the version loadModel already returned.
  ownVersion: number;
```

- [x] **Step 5: Strip `api.ts`**

`apps/web/src/api.ts` becomes exactly:

```ts
import { HyphaeModelSchema, type HyphaeModel } from '@hyphae/schema';

/** The browser's whole conversation with the server: fetch the model, then follow SSE for changes.
 *  Writes go through MCP (or a direct edit of the JSON file), never through here. */
export async function loadModel(): Promise<{ model: HyphaeModel; version: number }> {
  const res = await fetch('/model');
  if (!res.ok) throw new Error(`GET /model failed: ${res.status}`);
  const version = Number(res.headers.get('X-Hyphae-Version') ?? '0');
  const model = HyphaeModelSchema.parse(await res.json());
  return { model, version };
}
```

`ApiError` goes with `mutate()`: `loadModel` throws a plain `Error`, so nothing constructs or catches
an `ApiError` any more.

- [x] **Step 6: Delete the drag-to-connect line**

```bash
git rm apps/web/src/FloatingConnectionLine.tsx
```

- [x] **Step 7: Run the test to verify it passes**

```bash
cd apps/web && pnpm vitest run test/store.test.ts
```

Expected: PASS.

- [x] **Step 8: Verify the whole workspace**

```bash
cd /c/projects/hyphae && pnpm -r test && pnpm -r build
```

Expected: green, with the web count lower than the 508 baseline. **Record the new per-package
numbers** (schema / server / web) from this output — Task 5 writes them into `CLAUDE.md`.

A TypeScript error in `apps/web` here means a leftover reference; `pnpm build` names the file and
line.

- [x] **Step 9: Commit**

```bash
git add apps/web/src/store.ts apps/web/src/api.ts apps/web/test/store.test.ts
git status --short
git commit -m "$(cat <<'EOF'
feat(web): delete the client write path

Nothing in the UI calls these any more, so the store keeps only navigation and
view state, and api.ts keeps only loadModel. Going with them: the 422-recovery
resync (a write-only path), the `error` field (written only by that recovery
and rendered by nothing), ApiError, and FloatingConnectionLine — the
drag-to-connect line, already referenced by nothing.

ownVersion stays and is now commented: the SSE handler still compares against
it to ignore the version loadModel already returned.

The server's write endpoints and all twelve MCP write tools are untouched.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Correct the living docs

`README.md`, `docs/MODEL.md`, `docs/SPEC.md` and `CLAUDE.md` are living docs — they change in the
same branch as the behaviour. Historical records under `docs/superpowers/{plans,reviews}/` are left
alone.

**Files:**
- Modify: `README.md:3, :10, :16, :49-55`
- Modify: `docs/SPEC.md:3, :19, :45, :63, :77, :214, :393, :397, :401`
- Modify: `docs/MODEL.md:134, :341-342, :350`
- Modify: `CLAUDE.md` (test baseline line)

**Interfaces:** consumes the per-package test counts recorded in Task 4 Step 8.

- [x] **Step 1: `README.md` — the Editing paragraph**

Replace lines 49-55 (the paragraph starting `**Editing.**`) with:

```markdown
**The inspector.** Selecting a node or a connection shows its detail in the right-hand panel, as
text — the browser does not write the model. A node shows its name, type, role, the fields the
canvas draws (`summary`, `technology`), description, `root`, `codeRefs`/`docRefs`, the remaining
**profile-defined fields** for its kind (`responsibilities`, `invariants`, …), its parent, and its
incoming/outgoing connections. A field with no value renders no row at all, so a short panel means a
thinly described node — use the `model_gaps` MCP tool to audit that properly. The parent, and any
`ref`-typed field, are clickable and reveal their target. A connection's meaning is its **verb** +
**object** ("reads camera list"), and its verb's *class* (`dataAccess` / `messaging` / `control` /
`user` / `traceability`) decides the edge colour. Layout is automatic (dagre) and stable — the
connection filter, the audience toggle, and expanding an external never reflow the graph.
```

- [x] **Step 2: `README.md` — the framing lines**

Line 3 becomes:

```markdown
Local visual **viewer** for a C4-style architecture model, written by LLM agents over MCP.
```

Line 10 (`# editor on :3000, proxies the API`) becomes `# viewer on :3000, proxies the API`.

Line 16's `## Editor` heading becomes `## Viewer`, and append one sentence to the end of the
paragraph that begins `The server is the single source of truth` (line 12-14):

```markdown
The browser is a read-only client: it loads the model over HTTP and follows SSE. Every write comes
from an MCP tool call or a direct edit of the JSON file.
```

- [x] **Step 3: `docs/SPEC.md` — five framing edits**

| Line | Current | Change to |
|---|---|---|
| 3 | `> A visual editor for a **business-legible** model…` | `> A visual **viewer** for a **business-legible** model…` |
| 19 | `edits over MCP. The diagram is primary;` | unchanged — this describes the *LLM* editing over MCP, which is still true. **Leave it.** |
| 45 | `- A visual editor whose **diagrams are legible on their own**:` | `- A visual viewer whose **diagrams are legible on their own**:` |
| 63 | `Schema-reserved; no editor yet.` | `Schema-reserved; no MCP tools and nothing rendered yet.` |
| 77 | `- The developer maintains their project's model by hand through the visual editor and **reads the architecture off the diagram**.` | `- The developer's model is built and maintained by an AI agent over MCP; the developer **reads the architecture off the diagram** and reviews the agent's edits.` |
| 214 | `### 6.8 Reserved axes (schema present, editor later)` | `### 6.8 Reserved axes (schema present, tools and rendering later)` |

- [x] **Step 4: `docs/SPEC.md` — the three "MCP + editor" phase entries**

Lines 393, 397 and 401 each end a phase description with `MCP + editor.` In each, that means *MCP
tools to write it, and rendering to read it*. Replace `MCP + editor.` with `MCP tools + rendering.`
on all three lines.

- [x] **Step 5: `docs/MODEL.md` — four edits**

| Line | Current fragment | Change to |
|---|---|---|
| 134 | `has no MCP tool or editor yet` | `has no MCP tool and nothing rendered yet` |
| 341 | `but has no editor, MCP tool, or reader yet` | `but has no MCP tool and nothing that reads or renders it yet` |
| 342 | `moved from reserved to built (MCP + editor)` | `moved from reserved to built (MCP tools + rendering)` |
| 350 | table header `\| When in the editor \|` | `\| When rendered \|` |

Lines 26, 211 and 238 mention "an LLM queries and edits", "for the LLM and editor tooltips" and
"for the LLM/editor" — the LLM does still edit, and the tooltips are still rendered. **Leave all
three alone.**

- [x] **Step 6: `CLAUDE.md` — the test baseline**

Update the line under `## Commands`:

```
    pnpm -r test        # baseline 508 green: schema 147, server 107, web 254
```

with the numbers recorded in Task 4 Step 8. Do not invent them — if they were not recorded, re-run
`pnpm -r test` and read them off.

The listed invariants all concern the focus-view pipeline and panel layout; none covers writes, so
they stand unchanged.

- [x] **Step 7: Verify no stale claim survives**

```bash
cd /c/projects/hyphae && grep -rn "visual editor\|MCP + editor\|create / edit / delete\|Create / edit / delete" README.md docs/SPEC.md docs/MODEL.md CLAUDE.md skills/
```

Expected: no output. A hit under `skills/` means the modeling skill also claims editor authorship —
read the line, and if it describes the *browser* creating nodes, correct it in the same commit; if it
describes MCP writes, leave it.

- [x] **Step 8: Full verification**

```bash
cd /c/projects/hyphae && pnpm -r test && pnpm -r build
```

Show the output. Confirm the recorded counts match what `CLAUDE.md` now claims.

- [x] **Step 9: Commit**

```bash
git add README.md docs/SPEC.md docs/MODEL.md CLAUDE.md
git status --short
git commit -m "$(cat <<'EOF'
docs: describe the browser as a read-only viewer

The living docs called the web app a visual editor the developer maintains
their model with by hand. It renders a model that agents author over MCP, so
the framing, the Editing paragraph, and the phase entries that promised
"MCP + editor" are corrected — the two capabilities are now named separately,
since only one of them lives in the browser.

Records the new test baseline. Historical plans and reviews are left alone.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## After the plan

Ask before merging. `superpowers:finishing-a-development-branch` covers the integration.

Worth a look once it runs in a browser against the real Baritone model (`HYPHAE_FILE=$(pwd)/apps/server/hyphae-baritone.json pnpm server`): a Baritone Component with several `responsibilities` and long `codeRefs` is the case the read-only panel changes most, and the one where `overflow-wrap` earns its place.

# Resizable Panels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make both side panels drag-resizable and split the left outline into two independently
scrolling, drag-resizable regions — Nodes above, Flows + Patterns below.

**Architecture:** `apps/web/src/App.tsx`'s `.body` flex row becomes a horizontal
`react-resizable-panels` `Group` of three `Panel`s (outline / canvas / inspector) separated by two
`Separator`s. Inside `TreePanel`, when the model has flows or patterns, the outline body becomes a
vertical `Group` of two `Panel`s. Layouts persist to `localStorage` through the library's
`useDefaultLayout` hook; the outline's existing « / » collapse toggle moves up to `App`, which drives
the panel's imperative `collapse()` / `expand()`.

**Tech Stack:** React 18, TypeScript, Vite, Vitest + jsdom + @testing-library/react,
`react-resizable-panels@^4.12.2` (new dependency, MIT, zero runtime deps).

Spec: `docs/superpowers/specs/2026-07-27-resizable-panels-design.md`.

## Global Constraints

- **Package manager is pnpm with workspaces.** Install into the web app only:
  `pnpm --filter @hyphae/web add react-resizable-panels@^4.12.2`. Never `npm install`.
- **Never run bare `pnpm vitest run` from the repo root** — there is no root vitest config and the web
  tests then run without jsdom, producing dozens of bogus failures. Use `pnpm -r test` from the root,
  or `cd apps/web && pnpm test`.
- **Test baseline before this work: 502 green** (schema 147, server 107, web 248). This plan adds 5
  web tests (1 in Task 1, 1 in Task 2, 3 in Task 3; Task 2 *replaces* one existing test rather than
  adding it), so the expected end state is **507 (web 253)**. If the observed count differs, use the
  observed numbers — do not "fix" tests to hit a target.
- **Roughly 80 `act(...)` warnings in the web suite are pre-existing noise.** Not caused by this work.
- **jsdom loads no external stylesheet**, so nothing in `styles.css` is observable in the DOM. Pin a
  CSS invariant by reading the file and asserting the rule (see `TreePanel.test.tsx:102-109`).
- **Never `git add -A`, and never `git add` any `*.json` model file.** `apps/server/hyphae-baritone.json`
  is permanently untracked. Stage explicit paths and run `git status --short` before each commit.
- Conventional commits with a scope (`feat(web):`, `chore(web):`, `docs:`), *why* in the body, ending
  with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Do not touch the focus-view pipeline.** `buildFocusView` → `layoutFocusView` → `resolveViewPositions`
  → `focusViewToFlow` and its `[model, focusId]` memoization stay exactly as they are; panels change
  only the canvas's container size.

### Library facts (verified against `react-resizable-panels@4.12.2`'s `dist/`)

You will not have the docs site. These are the details this plan depends on:

- Exports used here: `Group`, `Panel`, `Separator`, `useDefaultLayout`, `usePanelRef`.
- `Panel` **numeric** sizes are pixels; **string** sizes are percentages (`"60"` = 60%). So
  `defaultSize={240}` is 240px and `defaultSize="60"` is 60%.
- `Panel` and `Separator` must be **direct DOM children** of their `Group`. Wrapping either in a
  `<div>` breaks resizing. (Components rendered *inside* a `Panel` are fine.)
- `Panel`'s `className` and `style` are applied to a **nested inner div**, not the panel root. That
  inner div defaults to `overflow: auto`, so a panel scrolls its content for free; pass
  `style={{ overflow: 'hidden', display: 'flex' }}` when the child must fill the panel instead.
- `Separator` renders `role="separator"` with `aria-orientation` **perpendicular** to the group: a
  `orientation="horizontal"` group yields `aria-orientation="vertical"` separators, and vice versa.
  It also sets `data-separator="inactive" | "hover" | "active" | "focus" | "disabled"` — the documented
  hook for hover/drag styling, since `className` cannot override its `flex-grow` / `flex-shrink`.
  It does **not** set a resize cursor; our CSS must.
- `Separator` gives keyboard resize (arrow keys) and double-click-to-reset for free.
- `Panel`'s `onResize(size, id, prevSize)` is called with `prevSize === undefined` on mount.
- `useDefaultLayout({ id, storage, onlySaveAfterUserInteractions })` returns
  `{ defaultLayout, onLayoutChange, onLayoutChanged }`; pass `defaultLayout` and `onLayoutChanged`
  (not the deprecated `onLayoutChange`) to the `Group`.
- The library calls `ResizeObserver`, `window.matchMedia("(pointer:coarse)")` and
  `Element.prototype.setPointerCapture`. jsdom 24 has **none** of them — Task 1 stubs all three, or
  every test that renders `<App />` or `<TreePanel />` throws on mount.
- Elements are never measured under jsdom, so real drag geometry is untestable. Tests assert
  structure and wiring, never pixel sizes.

---

### Task 1: Dependency and jsdom test setup

Nothing renders until jsdom has the three APIs the library calls on mount. This task installs the
library and makes the existing suite green with it available.

**Files:**
- Modify: `apps/web/package.json` (via pnpm — do not hand-edit)
- Create: `apps/web/test/setup.ts`
- Modify: `apps/web/vitest.config.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `react-resizable-panels` importable from `apps/web/src/*`; a global vitest setup file that
  guarantees `ResizeObserver`, `window.matchMedia` and `Element.prototype.setPointerCapture` exist in
  every web test.

- [ ] **Step 1: Install the library**

```bash
cd C:/projects/hyphae && pnpm --filter @hyphae/web add react-resizable-panels@^4.12.2
```

Expected: `apps/web/package.json` gains `"react-resizable-panels": "^4.12.2"` under `dependencies`,
and `pnpm-lock.yaml` updates.

- [ ] **Step 2: Write the failing test — the jsdom stubs exist**

This is a setup task, so its test asserts the setup itself. Create
`apps/web/test/domStubs.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

// react-resizable-panels calls all three on mount or during a drag; jsdom 24 implements none of
// them. They come from test/setup.ts — without it every render of <App /> or <TreePanel /> throws.
describe('jsdom stubs for react-resizable-panels', () => {
  it('provides ResizeObserver, matchMedia and pointer capture', () => {
    expect(typeof globalThis.ResizeObserver).toBe('function');
    expect(window.matchMedia('(pointer:coarse)').matches).toBe(false);
    expect(typeof Element.prototype.setPointerCapture).toBe('function');
    expect(typeof Element.prototype.releasePointerCapture).toBe('function');
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

```bash
cd C:/projects/hyphae/apps/web && pnpm test -- domStubs
```

Expected: FAIL — `ResizeObserver` is `undefined` and `window.matchMedia` is not a function.

- [ ] **Step 4: Write the setup file**

Create `apps/web/test/setup.ts`:

```ts
/** jsdom 24 implements no ResizeObserver, no matchMedia and no pointer capture, all of which
 *  react-resizable-panels calls when a Group mounts or a Separator is dragged. Every stub is
 *  guarded so a future jsdom that does implement one wins. */

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = function () {};
  Element.prototype.releasePointerCapture = function () {};
  Element.prototype.hasPointerCapture = function () { return false; };
}
```

- [ ] **Step 5: Wire it into the vitest config**

Modify `apps/web/vitest.config.ts` — the `test` block becomes:

```ts
  test: { globals: true, environment: 'jsdom', setupFiles: ['./test/setup.ts'] },
```

(`test/setup.ts` does not match vitest's `*.test.ts` include glob, so it will not be collected as a
test file.)

- [ ] **Step 6: Run the new test, then the whole suite**

```bash
cd C:/projects/hyphae/apps/web && pnpm test -- domStubs
cd C:/projects/hyphae && pnpm -r test
```

Expected: the stub test PASSES; the full suite is **503 green** (web 249 — baseline 248 plus this
one). Nothing else changed behaviour yet.

- [ ] **Step 7: Commit**

```bash
cd C:/projects/hyphae && git status --short
git add apps/web/package.json pnpm-lock.yaml apps/web/vitest.config.ts apps/web/test/setup.ts apps/web/test/domStubs.test.ts
git commit -m "$(cat <<'EOF'
chore(web): add react-resizable-panels and jsdom stubs for it

The library calls ResizeObserver, matchMedia and setPointerCapture when a
Group mounts; jsdom 24 has none of them, so without a shared setup file
every test rendering App or TreePanel would throw before asserting
anything.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Resizable side panels (outer horizontal group)

Turns `.body` into a three-panel group and moves the outline's collapse toggle up to `App` so the
panel width and the collapsed rendering cannot disagree.

**Files:**
- Modify: `apps/web/src/App.tsx:93-128` (the `return` block) and its import list
- Modify: `apps/web/src/TreePanel.tsx:48-83,183-199` (props, collapse state, toggle buttons)
- Modify: `apps/web/src/styles.css:4-7` (`.body`, `.panel`, `.tree-panel`, `.tree-panel--collapsed`) and append separator rules
- Test: `apps/web/test/App.test.tsx`, `apps/web/test/TreePanel.test.tsx`

**Interfaces:**
- Consumes: `react-resizable-panels` and the jsdom stubs from Task 1.
- Produces:
  - `TreePanel` is now **controlled**: `export function TreePanel({ collapsed, onToggleCollapse }: { collapsed: boolean; onToggleCollapse: () => void })`. It no longer owns collapse state. Task 3 edits the same component.
  - Panel ids `outline`, `canvas`, `inspector` in group `hyphae-body`; localStorage layout id `hyphae.body`.
  - CSS classes `sep sep--v` on the two vertical separators.

- [ ] **Step 1: Write the failing tests**

In `apps/web/test/App.test.tsx`, add this case at the end of the `describe('App', ...)` block:

```tsx
  it('puts a resize separator on each side of the canvas', () => {
    render(<App />);
    const seps = screen.getAllByRole('separator');
    // A horizontal group yields vertical separators; the empty test model has no flows or
    // patterns, so the outline's own horizontal separator (Task 3) is not rendered here.
    expect(seps.map((s) => s.getAttribute('aria-orientation'))).toEqual(['vertical', 'vertical']);
  });
```

In `apps/web/test/TreePanel.test.tsx`, rewrite the collapse test at lines 157-164 to drive a
controlled wrapper — `TreePanel` no longer owns the flag, so the test must own it. The `it` block
becomes:

```tsx
  it('hides the sections when collapsed and restores them again', () => {
    const { getByRole, queryByRole, queryByText } = renderTree();
    fireEvent.click(getByRole('button', { name: 'hide model outline' }));
    expect(queryByText('Nodes')).toBeNull();
    expect(queryByRole('button', { name: 'Sys' })).toBeNull();
    fireEvent.click(getByRole('button', { name: 'show model outline' }));
    expect(getByRole('button', { name: 'Sys' })).toBeTruthy();
  });
```

and add this wrapper + helper near the top of that file, just after the `beforeEach(() => reset());`
on line 37:

```tsx
/** TreePanel is controlled by App (which drives the resizable panel's collapse()/expand()), so the
 *  tests own the flag. Every render goes through here. */
function Outline() {
  const [collapsed, setCollapsed] = useState(false);
  return <TreePanel collapsed={collapsed} onToggleCollapse={() => setCollapsed((c) => !c)} />;
}
const renderTree = () => render(<Outline />);
```

Add `import { useState } from 'react';` to that file, and replace **every** remaining
`render(<TreePanel />)` call in it with `renderTree()` (lines 42, 50, 60, 71, 80, 87, 97, 115, 122,
132, 141, 151, 158, 168 — search for `render(<TreePanel` to be sure none are missed).

- [ ] **Step 2: Run the tests and watch them fail**

```bash
cd C:/projects/hyphae/apps/web && pnpm test -- App TreePanel
```

Expected: the App case FAILS (`getAllByRole('separator')` finds none) and TreePanel FAILS to compile
(`TreePanel` takes no props yet).

- [ ] **Step 3: Make `TreePanel` controlled**

In `apps/web/src/TreePanel.tsx`:

- change the signature on line 48 to
  ```tsx
  export function TreePanel({ collapsed, onToggleCollapse }: { collapsed: boolean; onToggleCollapse: () => void }) {
  ```
- delete the `const [collapsed, setCollapsed] = useState(false);` line (line 61), leaving the
  `override` state and its comment below it untouched;
- in the collapsed early-return (lines 77-83) change the button to `onClick={onToggleCollapse}`;
- in `.tree-panel__head` (line 187) change the button to `onClick={onToggleCollapse}`;
- `useState` is still used for `override`, so leave the import alone.

- [ ] **Step 4: Build the group in `App.tsx`**

Add to the imports at the top of `apps/web/src/App.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Group, Panel, Separator, useDefaultLayout, usePanelRef } from 'react-resizable-panels';
```

(the existing `import { useEffect } from 'react';` on line 1 is replaced by the first line above).

Inside `export function App()`, after the existing store selectors (line 45), add:

```tsx
  // The outline panel is collapsible from both ends: the « button drives the panel's imperative
  // API, and dragging the separator to the edge collapses it. onResize syncs the flag back so the
  // 26px strip renders whichever way the user got there — the mount call (prevSize undefined) is
  // ignored, since jsdom measures nothing and would report a spurious collapse.
  const outlineRef = usePanelRef();
  const [outlineCollapsed, setOutlineCollapsed] = useState(false);
  const bodyLayout = useDefaultLayout({
    id: 'hyphae.body',
    storage: localStorage,
    onlySaveAfterUserInteractions: true,
  });

  const toggleOutline = () => {
    if (outlineCollapsed) outlineRef.current?.expand();
    else outlineRef.current?.collapse();
    setOutlineCollapsed(!outlineCollapsed);
  };
```

Replace the `<div className="body">…</div>` block (lines 122-126) with:

```tsx
      <Group
        className="body"
        id="hyphae-body"
        orientation="horizontal"
        defaultLayout={bodyLayout.defaultLayout}
        onLayoutChanged={bodyLayout.onLayoutChanged}
      >
        <Panel
          id="outline"
          panelRef={outlineRef}
          defaultSize={240}
          minSize={160}
          maxSize="40%"
          collapsible
          collapsedSize={26}
          groupResizeBehavior="preserve-pixel-size"
          style={{ overflow: 'hidden', display: 'flex' }}
          onResize={(size, _id, prev) => {
            if (prev !== undefined) setOutlineCollapsed(size.inPixels <= 26);
          }}
        >
          <TreePanel collapsed={outlineCollapsed} onToggleCollapse={toggleOutline} />
        </Panel>
        <Separator className="sep sep--v" />
        {/* The canvas is the group's one preserve-relative-size panel, so it absorbs window
            resizes while the side panels keep their pixel width. */}
        <Panel id="canvas" minSize="20%" style={{ overflow: 'hidden', display: 'flex' }}>
          <Canvas />
        </Panel>
        <Separator className="sep sep--v" />
        <Panel
          id="inspector"
          defaultSize={320}
          minSize={220}
          maxSize="40%"
          groupResizeBehavior="preserve-pixel-size"
          style={{ overflow: 'hidden', display: 'flex' }}
        >
          <SidePanel />
        </Panel>
      </Group>
```

- [ ] **Step 5: Update the CSS**

In `apps/web/src/styles.css`, replace lines 4-7 with:

```css
.body { flex: 1 1 0; min-height: 0; }
.panel { height: 100%; box-sizing: border-box; border-left: 1px solid #ddd; padding: 12px; overflow-y: auto; }
.tree-panel { flex: 1; min-width: 0; height: 100%; display: flex; flex-direction: column; border-right: 1px solid #ddd; font-size: 12px; color: #334155; }
.tree-panel--collapsed { align-items: center; padding-top: 6px; }
```

The fixed `width` on each panel is gone — the `Group` owns width now — and `.body` no longer declares
`display: flex`, which `Group` sets inline and does not allow overriding.

Append at the end of the file:

```css
/* Resize separators. The library sets no cursor of its own and its `data-separator` attribute
   (inactive | hover | active | focus | disabled) is the documented styling hook, since a
   Separator's className cannot override its flex-grow/flex-shrink. */
[data-separator] { background: transparent; transition: background 120ms ease; }
[data-separator]:hover, [data-separator="active"], [data-separator="focus"] { background: #93c5fd; }
.sep--v { width: 5px; cursor: col-resize; }
.sep--h { height: 5px; cursor: row-resize; }
```

- [ ] **Step 6: Run the tests**

```bash
cd C:/projects/hyphae/apps/web && pnpm test -- App TreePanel
```

Expected: PASS, including every pre-existing case in both files.

- [ ] **Step 7: Run the whole suite**

```bash
cd C:/projects/hyphae && pnpm -r test
```

Expected: **504 green** (web 250). Ignore the ~80 pre-existing `act(...)` warnings.

- [ ] **Step 8: Check it in the browser**

```bash
cd C:/projects/hyphae && pnpm dev
```

Open http://localhost:3000 and confirm: dragging the border between the outline and the canvas
resizes it; likewise the inspector; the cursor turns into `col-resize` over each border; « collapses
the outline to a narrow strip and » restores its previous width; a reload keeps the widths.

- [ ] **Step 9: Commit**

```bash
cd C:/projects/hyphae && git status --short
git add apps/web/src/App.tsx apps/web/src/TreePanel.tsx apps/web/src/styles.css apps/web/test/App.test.tsx apps/web/test/TreePanel.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): make both side panels drag-resizable

The outline was pinned at 240px and the inspector at 320px, so long node
names truncated with no way to widen them and the inspector's field
editors stayed cramped on a wide screen. Express the body as a panel
group instead; the canvas is the one relative-sized panel, so the side
panels keep their pixel width when the window resizes.

Collapse moves up to App because the panel's width and TreePanel's
collapsed rendering must not disagree — dragging the separator to the
edge now collapses the outline too.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Split the outline into Nodes and Flows + Patterns

**Files:**
- Modify: `apps/web/src/TreePanel.tsx:183-199` (the render) and its imports
- Modify: `apps/web/src/styles.css` (`.tree-panel__body`, plus the two new pane rules)
- Test: `apps/web/test/TreePanel.test.tsx`

**Interfaces:**
- Consumes: the controlled `TreePanel` props and the `renderTree()` helper from Task 2; the `sep sep--h` CSS class from Task 2's separator rules.
- Produces: panel ids `nodes`, `detail` in group `hyphae-outline`; localStorage layout id `hyphae.outline`.

- [ ] **Step 1: Write the failing tests**

Add to the `describe('TreePanel — chrome', ...)` block in `apps/web/test/TreePanel.test.tsx`:

```tsx
  it('splits Nodes from Flows and Patterns with a draggable separator', () => {
    const { getAllByRole } = renderTree();
    const seps = getAllByRole('separator');
    // A vertical group yields a horizontal separator.
    expect(seps.map((s) => s.getAttribute('aria-orientation'))).toEqual(['horizontal']);
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
    const css = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');
    expect(css).toMatch(/\.sep--h\s*\{[^}]*cursor:\s*row-resize/);
    expect(css).toMatch(/\.sep--v\s*\{[^}]*cursor:\s*col-resize/);
  });
```

- [ ] **Step 2: Run them and watch them fail**

```bash
cd C:/projects/hyphae/apps/web && pnpm test -- TreePanel
```

Expected: the first case FAILS (no separator found), the second PASSES already (nothing renders a
separator yet), the third FAILS (no `.sep--h` rule yet if Task 2 is not merged — if Task 2 is in, it
passes).

- [ ] **Step 3: Render the vertical group**

In `apps/web/src/TreePanel.tsx`, add the import:

```tsx
import { Group, Panel, Separator, useDefaultLayout } from 'react-resizable-panels';
```

Add this hook **with the other hooks, above the `if (collapsed)` early return** (hooks must not sit
behind a conditional return) — put it right after the `offView` memo on line 75:

```tsx
  const outlineLayout = useDefaultLayout({
    id: 'hyphae.outline',
    storage: localStorage,
    onlySaveAfterUserInteractions: true,
  });
```

Replace the final `return (...)` block (lines 183-199) with:

```tsx
  const nodesSection = (
    <Section title="Nodes">
      {roots.length === 0
        ? <div className="tree-empty">no nodes yet</div>
        : roots.map((r) => renderNode(r, 0))}
    </Section>
  );
  const detailSections = (
    <>
      {model.flows.length > 0 && <Section title="Flows">{model.flows.map(renderFlow)}</Section>}
      {model.patterns.length > 0 && <Section title="Patterns">{model.patterns.map(renderPattern)}</Section>}
    </>
  );
  // A long node tree used to push Flows and Patterns below the fold of a single scroll region, so
  // they get their own. Percentage sizes keep the split proportional as the window height changes.
  // With neither flows nor patterns there is nothing to split, and a Group of one Panel would only
  // add a dead handle — so the body renders plainly, as it always did.
  const hasDetail = model.flows.length > 0 || model.patterns.length > 0;

  return (
    <aside className="tree-panel" aria-label="model outline">
      <div className="tree-panel__head">
        <strong>Outline</strong>
        <button className="tree-toggle" onClick={onToggleCollapse} title="Hide model outline" aria-label="hide model outline">«</button>
      </div>
      {hasDetail ? (
        <div className="tree-panel__body tree-panel__body--split">
          <Group
            id="hyphae-outline"
            orientation="vertical"
            defaultLayout={outlineLayout.defaultLayout}
            onLayoutChanged={outlineLayout.onLayoutChanged}
          >
            <Panel id="nodes" defaultSize="60" minSize="15" className="tree-split__pane">
              {nodesSection}
            </Panel>
            <Separator className="sep sep--h" />
            <Panel id="detail" defaultSize="40" minSize="15" className="tree-split__pane tree-split__pane--detail">
              {detailSections}
            </Panel>
          </Group>
        </div>
      ) : (
        <div className="tree-panel__body">{nodesSection}</div>
      )}
    </aside>
  );
```

- [ ] **Step 4: Update the CSS**

In `apps/web/src/styles.css`, replace the `.tree-panel__body` rule (line 9) with:

```css
.tree-panel__body { flex: 1; min-height: 0; overflow: auto; padding-bottom: 12px; }
.tree-panel__body--split { overflow: hidden; padding-bottom: 0; }
.tree-split__pane { padding-bottom: 12px; }
.tree-split__pane--detail { border-top: 1px solid #eee; }
```

The split body must not scroll — its two panes do, which the library's panel wrapper already handles
(`overflow: auto` on the inner div a `Panel`'s `className` lands on).

- [ ] **Step 5: Run the tests**

```bash
cd C:/projects/hyphae/apps/web && pnpm test -- TreePanel
```

Expected: PASS, all cases in the file.

- [ ] **Step 6: Run the whole suite**

```bash
cd C:/projects/hyphae && pnpm -r test
```

Expected: **507 green** (web 253).

- [ ] **Step 7: Check it against the real model**

```bash
cd C:/projects/hyphae && HYPHAE_FILE=$PWD/apps/server/hyphae-baritone.json pnpm server
```

and in a second terminal `pnpm web`, then open http://localhost:3000. With Baritone's large node
tree, confirm: the outline shows Nodes above and Flows + Patterns below; each scrolls on its own;
dragging the handle between them re-proportions and a reload remembers it; selecting a flow expands
its steps inside the lower pane without pushing anything out of the panel.

- [ ] **Step 8: Commit**

```bash
cd C:/projects/hyphae && git status --short   # hyphae-baritone.json must stay untracked
git add apps/web/src/TreePanel.tsx apps/web/src/styles.css apps/web/test/TreePanel.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): split the outline into resizable Nodes and Flows/Patterns panes

Flows and Patterns were sections stacked below Nodes in one scroll
region, so on a real model they sat far below the fold — and selecting a
flow expanded its steps into that same region, pushing them further.
Give them their own pane with a draggable, proportional split. A model
with neither renders as before rather than showing a dead handle.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Update the living docs

`README.md`, `docs/MODEL.md`, `docs/SPEC.md` and the skill are living docs — behaviour changes in the
same branch that changes them. Only `README.md` and `CLAUDE.md` describe anything this work altered.

**Files:**
- Modify: `README.md:22-24` (the Navigation paragraph)
- Modify: `CLAUDE.md` (the `pnpm -r test` baseline line, and the testing-gotchas list)

**Interfaces:**
- Consumes: the finished behaviour from Tasks 2 and 3.
- Produces: nothing code-facing.

- [ ] **Step 1: Update the README's Navigation paragraph**

In `README.md`, replace the sentence beginning "The left **outline** panel lists the whole model"
(lines 22-24) with:

```markdown
**expanded** to reveal the child actually taking part. The left **outline** panel lists the whole
model — nodes by containment above, then Flows and Patterns in their own pane below, each scrolling
independently — and is collapsible; a click reveals a node in context, a double-click drills in.
Both side panels and the outline's internal split are **drag-resizable** (arrow keys resize a
focused handle, double-click resets it), and the sizes persist per browser. Search jumps to a node
by name.
```

- [ ] **Step 2: Update the test baseline in CLAUDE.md**

In `CLAUDE.md`, under `## Commands`, change the baseline line to match the number `pnpm -r test`
actually reports at the end of Task 3:

```
    pnpm -r test        # baseline 507 green: schema 147, server 107, web 253
```

- [ ] **Step 3: Add the jsdom gotcha**

In `CLAUDE.md`, under `## Testing gotchas`, add this bullet after the React Flow one:

```markdown
- **The resizable panels need jsdom stubs.** `react-resizable-panels` calls `ResizeObserver`,
  `matchMedia` and `setPointerCapture`, none of which jsdom implements; `apps/web/test/setup.ts`
  provides them. Elements are never measured, so panel *sizes* are untestable — assert the
  `role="separator"` structure (`aria-orientation` is perpendicular to its group) instead.
```

- [ ] **Step 4: Verify the docs match reality**

```bash
cd C:/projects/hyphae && pnpm -r test && pnpm -r build
```

Expected: the suite reports exactly the number now written in `CLAUDE.md`, and the build succeeds.
Re-read the edited README paragraph against what the app actually does.

- [ ] **Step 5: Commit**

```bash
cd C:/projects/hyphae && git status --short
git add README.md CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: describe the resizable panels and the new test baseline

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Done when

- `pnpm -r test` is green at the baseline recorded in `CLAUDE.md`, and `pnpm -r build` succeeds.
- Both side panels and the outline's Nodes/Flows split resize by dragging, by arrow keys on a focused
  handle, and reset on double-click; all three sizes survive a reload.
- The outline still collapses and expands to its previous width, from the « button and by dragging
  the separator to the edge.
- `git status --short` shows `apps/server/hyphae-baritone.json` still untracked.

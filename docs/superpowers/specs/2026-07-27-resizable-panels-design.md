# Resizable side panels and a split outline

**Date:** 2026-07-27
**Status:** agreed, ready for a plan

## Problem

The editor's three regions are fixed. `.body` is a flex row in which `.tree-panel` (the outline) is
hard-coded to 240px, `.panel` (the inspector) to 320px, and the canvas takes what is left
(`apps/web/src/styles.css:4-9`). Neither side panel can be resized.

Two things suffer:

- **The outline.** Node names are long and deeply nested — `.tree-label` truncates with an ellipsis
  at depth 3 or 4 in a real model, and 240px cannot be widened to read them.
- **Flows and patterns.** They are sections stacked *below* Nodes inside one scrolling body
  (`TreePanel.tsx:189-197`). With a large node tree they sit far below the fold, and selecting a flow
  expands its step list inside that same scroll region, pushing them further.

The inspector has the mirror problem: field editors and the connection list are cramped at 320px on a
wide screen, and there is no way to reclaim canvas width on a narrow one.

## Solution

Adopt `react-resizable-panels@4.12.2` (MIT, no runtime dependencies, peer React 18) and express the
body as two nested resizable groups.

v4's API is `Group` / `Panel` / `Separator` plus a `useDefaultLayout` hook for persistence. Numeric
sizes are pixels, string sizes are percentages, and `groupResizeBehavior` decides which panels absorb
a window resize.

### Outer group — horizontal, in `App.tsx`

`.body` becomes `<Group orientation="horizontal" id="hyphae-body">`:

| Panel | `id` | Sizing | `groupResizeBehavior` |
|---|---|---|---|
| `<TreePanel>` | `outline` | `defaultSize={240}` px, `minSize={160}`, `maxSize="40%"`, `collapsible`, `collapsedSize={26}` | `preserve-pixel-size` |
| `<Canvas>` | `canvas` | `minSize="20%"` | `preserve-relative-size` (default) |
| `<SidePanel>` | `inspector` | `defaultSize={320}` px, `minSize={220}`, `maxSize="40%"` | `preserve-pixel-size` |

with a `<Separator>` between each pair. The side panels therefore hold their pixel width when the
window resizes and the canvas absorbs the difference — a group requires at least one
`preserve-relative-size` panel, and the canvas is it.

Every panel carries an explicit `id`: ids key the persisted layout, and without them the library
falls back to `useId`, which is not stable across releases.

### Inner group — vertical, in `TreePanel.tsx`

When the model has at least one flow **or** one pattern, `.tree-panel__body` renders
`<Group orientation="vertical" id="hyphae-outline">`:

| Panel | `id` | Sizing |
|---|---|---|
| Nodes section | `nodes` | `defaultSize="60"`, `minSize="15"` |
| Flows + Patterns sections | `detail` | `defaultSize="40"`, `minSize="15"` |

Percentages, so the split holds its **proportion** as the window height changes — both regions grow
and shrink together. Each panel scrolls independently (`overflow:auto`, `min-height:0`), which is the
substantive win: a long node tree no longer pushes flows off the bottom.

When the model has neither flows nor patterns, the body renders the Nodes section plainly, exactly as
today — no group, no separator. This also sidesteps the library's conditionally-rendered-panel
caveat, since the group, when mounted, always holds exactly two panels.

### Collapse

The existing « / » toggle keeps its behaviour but changes owner. `App` holds the collapsed flag and a
`usePanelRef` for the outline panel, and `TreePanel` becomes controlled via two new props:

```ts
{ collapsed: boolean; onToggleCollapse: () => void }
```

Toggling calls `collapse()` / `expand()` on the panel handle. Because the panel is `collapsible`,
dragging the separator to the edge also collapses it; the panel's `onResize` reads `isCollapsed()`
and syncs the flag, so the 26px strip renders whichever way the user got there. The library's own
`expand()` only falls back to `minSize` — its `expandToSize` bookkeeping is written by `collapse()`
alone and never survives a drag-collapse or a reload — so `App` remembers the outline's last expanded
width itself and resizes back to it after calling `expand()`, persisting the value so it survives a
reload too.

### Persistence

One `useDefaultLayout({ id, storage: localStorage, onlySaveAfterUserInteractions: true })` per group,
feeding the group's `defaultLayout` and `onLayoutChanged` props. `onlySaveAfterUserInteractions`
keeps window resizes and mount-time constraint recomputes from overwriting a deliberate layout. No
store changes: panel geometry is view state the library already owns, and threading it through the
zustand singleton would buy nothing.

### Styling

Separators are styled by attribute selector (`[data-separator]`), which the library documents as the
supported hook for hover and active states — its `className` cannot override `flex-grow` /
`flex-shrink`. 5px, `col-resize` / `row-resize` cursor, tinted on hover and while dragging. `.tree-panel`
keeps its `border-right` and `.panel` its `border-left` — a separator is `background: transparent`
until hover, so without those borders there would be no visible divider at rest — but both rules lose
their fixed `width`, since the `Group` owns width now.

## Non-goals

- **No new dependency beyond the one library.** The hand-rolled alternative (a `Resizer` component
  plus a pure sizing module) was considered and rejected: more code to own for a solved problem.
- **No resizable toolbar, legend, or filter panel.** Only the two side panels and the outline split.
- **No per-model or server-side persistence.** Layout is per-browser, like `hyphae.audience`.
- **The focus-view pipeline is untouched.** Panels change the canvas's *container* size only; base
  positions stay memoized on `[model, focusId]`, so resizing never reflows the graph.

## Testing

jsdom 24 provides no `ResizeObserver`, no `matchMedia`, and no `setPointerCapture`, all three of
which the library uses. This adds `apps/web/test/setup.ts` with stubs for them and wires
`setupFiles` into `apps/web/vitest.config.ts`. Without it every test that renders `<App />` or
`<TreePanel />` fails on mount.

Real drag geometry stays untestable under jsdom — elements never get measured — so tests assert
structure and wiring, in the spirit of the existing `hlCss` pattern:

- `App.test.tsx` — the three regions still render; two vertical separators exist with
  `role="separator"`; the existing route/breadcrumb assertions stay green.
- `TreePanel.test.tsx` — the horizontal separator is present when the model has flows or patterns and
  absent when it has neither; the collapse test at `TreePanel.test.tsx:157` moves to a small
  controlled wrapper that owns the `collapsed` prop.
- `styles.css` is read and asserted for the `col-resize` / `row-resize` rules, since jsdom loads no
  external stylesheet.

Baseline returns to **502 green** (schema 147, server 107, web 248), plus the new cases.

## Open questions

None. The constants — 240 / 320 / 60-40 and the min and max sizes — are deliberate placeholders to be
tuned by hand once the layout is on screen.

# A visual design for the viewer

**Date:** 2026-07-30
**Status:** agreed, ready for a plan

## Problem

The viewer has no design. `apps/web/src/styles.css` is 59 lines of near-default styling: `system-ui`
throughout, `1px solid #ddd` dividers, and colour literals picked ad hoc. Concretely:

- **The inspector renders browser-default headings.** `SidePanel.tsx` uses `<h2>`, `<h3>` and `<h4>`
  at default sizes and margins (`SidePanel.tsx:36,62,65,71`), so a node's name, its "Connections"
  heading and the Outgoing/Incoming split have no deliberate hierarchy between them.
- **The audience toggle is two unstyled native buttons** with an inline `fontWeight` swap for the
  pressed state (`App.tsx:159-170`).
- **Colour is scattered across eight files as literals.** `LAYER_COLOR` and `VERB_CLASS_COLOR` live in
  `reactflow.ts:7,35`; `PatternMemberNode.tsx:7` keeps a private map of its own; the rest is inline
  `style={{ … }}` in `Legend`, `FilterPanel`, `SearchBox`, `NodeBox`, `GhostNode`, `FloatingEdge` and
  `patternView.ts`. There is no token layer, so nothing can be themed and no value has one home.
- **Four unrelated meanings compete in the same register.** Layer tint, verb class, the violet rollup
  edge and pattern-member binding are all mid-saturation fills at the same volume. `SPEC.md` §9 asks
  for a "legibility budget" and `reactflow.ts:33` already states the rule ("one colour should mean one
  thing"), but nothing enforces it.

What *is* designed is the diagram's geometry: `shapes.ts` draws role silhouettes as SVG paths with
derived text padding, and it is deliberate and well-tested. This spec does not touch it.

## Design thesis

> **Luminance is state. Hue is meaning.**

The one inarguable truth about a C4 model is that it has **altitude** — Context above Container above
Component — and that navigating it means descending. Today that is three arbitrary pastel tints and a
`›` separator.

Altitude, selection and focus therefore all become **light level**: descending from Context to
Component increases a node's presence against its substrate, and touching something increases it
further. In the dark theme that means the diagram brightens as you descend; in the light theme it
densifies, which is the same reading of "closer to you" rather than an inversion of it. Because
altitude spends no hue at all, the entire chromatic budget is free for the five verb classes — the one
thing on the canvas that genuinely needs colour to be told apart. That is what resolves the four-way competition
above, and it is the reason this palette is neutral rather than tinted.

**Signature element:** the **altimeter breadcrumb** — the toolbar breadcrumb becomes three luminance
bands, one per layer, with the current band lit and labelled in the accent. Depth is readable without
reading the names. Boldness is spent here and nowhere else.

**Register:** a precise dark-first product UI. Dark is the default; the light theme is a *warm paper*
counterpart rather than a bleached inversion, which keeps the two themes from looking like the same
design with the lamp turned off.

## Token system

All tokens live in `:root` in `tokens.css`, with a `[data-theme="light"]` block overriding the values
and nothing else. Every value below is a token; no component may introduce a literal colour.

### Surfaces, rules, text

| Token | Dark | Light | Use |
|---|---|---|---|
| `--sub` | `#101214` | `#F5F2EC` | canvas substrate |
| `--surface-1` | `#141719` | `#EDEAE3` | outline and inspector panels |
| `--surface-2` | `#171A1C` | `#E7E3DB` | toolbar, floating legend/filter |
| `--surface-3` | `#1D2124` | `#DFDAD1` | row hover and selected-row lift |
| `--rule` | `#262A2E` | `#D2CCC2` | every hairline divider |
| `--chip` | `#282D31` | `#DFDAD1` | technology / type chips |
| `--tx-1` | `#E7E9EA` | `#22201C` | primary text |
| `--tx-2` | `#98A0A6` | `#5C564D` | secondary text, summaries |
| `--tx-3` | `#7C858B` | `#6E675C` | micro-labels |

### Altitude ramp — the signature

Three steps, no hue. In dark the ramp brightens with depth; in light it *densifies* with depth, so
"closer to you" reads the same way in both without inverting the semantic.

| Token | Dark bg / border | Light bg / border | Layer |
|---|---|---|---|
| `--alt-1-bg` / `--alt-1-bd` | `#1A1D20` / `#3A4046` | `#E9E5DC` / `#B9B2A5` | Context |
| `--alt-2-bg` / `--alt-2-bd` | `#22262A` / `#4E555C` | `#E2DDD2` / `#9A9284` | Container |
| `--alt-3-bg` / `--alt-3-bd` | `#2C3136` / `#6B747C` | `#DAD4C7` / `#7A7264` | Component |

A node whose type maps to no layer falls back to `--alt-2-*` (today's fallback is a bare `#fff`).

### Hue — meaning only

| Token | Dark | Light | Meaning |
|---|---|---|---|
| `--verb-dataAccess` | `#5B9DD9` | `#265C8C` | reads / writes / stores |
| `--verb-messaging` | `#D9944E` | `#8F5214` | publishes / subscribes |
| `--verb-control` | `#8896A3` | `#5A6570` | invokes / triggers — deliberately the least chromatic, it is the baseline |
| `--verb-user` | `#D6789F` | `#8F3566` | views / submits |
| `--verb-traceability` | `#4FB6A0` | `#176356` | implements / satisfies |
| `--edge-derived` | `#9B7EDB` | `#6D4FB0` | rolled-up edge (violet keeps its existing exclusive meaning) |

The light column is darker than a naive tint of the dark one because these hues are used as **edge
label text** on `--surface-2`. The first draft of this table used `#2E6FA8` / `#A8631E` / `#A8437A` /
`#1E7F6E`, which measure 4.12 / 3.62 / 4.35 / 3.78 : 1 — all below the floor this spec sets. The values
above measure 5.42 / 4.77 / 4.54 / 5.68 / 5.45 : 1.

### Interaction and status

One saturated accent, used for selection rings, focus rings, the lit altimeter band, the active flow
step and navigable links — and for nothing else. Saturation is what separates it from the muted verb
hairlines.

| Token | Dark | Light | Use |
|---|---|---|---|
| `--accent` | `#F2C14E` | `#B98A12` | fills and rings: selection ring, focus ring, pressed segment, lit altimeter band |
| `--accent-text` | `#F2C14E` | `#7A5A06` | the accent used *as text*: links, the active flow step, the `↗` marker |
| `--accent-soft` | `#8A6F2A` | `#DCC98F` | the weaker hover ring, replacing `#93c5fd` |
| `--accent-on` | `#231A02` | `#FFF8E6` | text on an accent fill |
| `--warn` | `#E0603F` | `#B4321A` | invalid flow / pattern `⚠` only |

`--accent` and `--accent-text` are the same value in dark and diverge in light: a gold bright enough to
work as a fill on paper measures only 2.44:1 as text, so link-coloured text needs its own darker token.
Splitting them is what keeps "one accent means interaction" true without failing the contrast floor.

### Type

Bundled via `@fontsource`, so the viewer stays offline-capable per `SPEC.md` §2 ("Local execution
without a cloud or accounts").

- `--font-ui`: **Archivo Variable** (`@fontsource-variable/archivo`, verified published at 5.3.0),
  `system-ui` fallback. Weight 400/500/600; the `wdth` axis at
  112–125% supplies the *display* role (wordmark, panel titles, node names) without a second file.
  If that package ships the weight axis only, the display role falls back to weight plus
  letter-spacing and `font-stretch` is dropped; the plan verifies which at install time.
- `--font-mono`: **IBM Plex Mono**, `ui-monospace` fallback. Ids, refs, technology chips,
  verb labels, step numbers, micro-labels. There is **no** `@fontsource-variable/ibm-plex-mono` —
  IBM Plex Mono has no variable release — so this is the static `@fontsource/ibm-plex-mono` at
  weights 400 and 500 only.

| Token | Size | Treatment |
|---|---|---|
| `--t-micro` | 10px | mono, uppercase, `letter-spacing: .08em`, `--tx-3` |
| `--t-sm` | 11px | tree rows, chips, legend |
| `--t-base` | 12px | body default |
| `--t-md` | 13px | inspector field values |
| `--t-lg` | 15px | inspector node name, `wdth: 112%`, weight 600 |
| `--t-word` | 12px | wordmark, `wdth: 125%`, weight 700, `letter-spacing: .15em` |

Space scale `--s-1`…`--s-7` = 2/4/6/8/12/16/24px. Radii `--r-sm` 3px, `--r-md` 5px, `--r-lg` 9px
(region boxes).

**Canvas type sizes are unchanged.** `NODE_W`, `NODE_H` and `SUMMARY_LINES` in `layout.ts` feed the
layout engine, and the node name (12px) / summary (10px) / chip (9px) sizes are calibrated to them.
Changing them would reflow the graph, which is out of scope.

## Per-surface treatment

### Toolbar — `App.tsx`

Wordmark, altimeter breadcrumb, search, then right-aligned: audience segmented control, theme toggle.

The **altimeter** replaces `.breadcrumbs`. Each crumb is rendered inside a band tinted with its own
layer's `--alt-N-bg`; the band for the current focus depth gets `--tx-1` text and an accent
micro-label. Crumbs stay buttons calling `setFocus(c.id)` — the behaviour is untouched, only the
presentation. `breadcrumbPath` already returns the ancestor chain, and each entry's node type gives
its layer via the existing `layerOfType`.

The audience toggle becomes a real segmented control (`--accent` fill on the pressed segment,
`--accent-on` text) and keeps `role="group"` and `aria-pressed`.

### Outline — `TreePanel.tsx`

- Section titles use `--t-micro`.
- Indent guides: each depth level renders a hairline `--rule` guide instead of bare `padding-left`.
- **Focused** row (`.tree-row--current`) gets a 2px `--accent` left bar and `--tx-1` at weight 600.
  **Selected** row (`.tree-row--active`) gets only a `--surface-3` lift. Today both are competing
  colour states; separating bar-from-fill lets a row be both at once and still be legible.
- Flow steps put the authored `order` in a fixed-width mono column. The `list-style: none` comment in
  `styles.css:21-22` stays true and stays with the rule.
- `↗` off-view marker uses `--accent`; `⚠` invalid uses `--warn`.

### Inspector — `SidePanel.tsx`, `FieldRows.tsx`

Every browser-default heading is replaced:

- Node name → `--t-lg`.
- `type` and `role` → mono chips on `--chip`.
- **Fields use the hybrid treatment**: short scalar values sit in a two-column
  `label` / `value` grid; long or multi-line values become a stacked block preceded by a `--rule`
  hairline and a `--t-micro` label.

  The split is decided by a new pure function, **not** a hand-maintained list of field keys:

  ```ts
  export type FieldLayout = 'grid' | 'stack';
  export function fieldLayout(type: FieldType | 'core', value: unknown): FieldLayout
  ```

  `list` and `text` values that are multi-line or longer than a threshold (~64 chars) stack;
  `number`, `boolean`, `enum`, `ref` and short `text` go in the grid. `FieldDef.type` alone cannot
  decide this — it distinguishes a list from a ref, but `summary` and `description` are both `text`
  and only one of them is prose — so the value's own shape is the deciding input. The core rows
  (`description`, `root`, `codeRefs`, `docRefs`, `parent`) pass `'core'` and go through the same
  function, so nothing in the panel gets a bespoke rule. Being pure, it is TDD-able ahead of the
  markup.
- Connection lists: one row each, a `--verb-*` dot, the verb in mono, the counterpart name in
  `--tx-1`. The `Connections (n)` / Outgoing / Incoming headings become `--t-micro` labels.

### Canvas — `Canvas.tsx`, `NodeBox`, `GhostNode`, `GroupNode`, `GhostGroupNode`, `Legend`, `FilterPanel`

- Region and ghost-group boxes take `--alt-N-*` for the focus node's own layer.
- Edge labels sit on `--surface-2` instead of `#fff` (`FloatingEdge.tsx:40`).
- Legend and filter floats become translucent `--surface-2` with a hairline and a blur, replacing the
  white cards with drop shadows.
- Separators: `[data-separator]` hover/active becomes `--accent` at low opacity, replacing `#93c5fd`.
- The legend gains a row for the altitude ramp, since altitude is now a deliberate encoding.

## The canvas colours stop being literals

The load-bearing implementation decision. `LAYER_COLOR` and `VERB_CLASS_COLOR` are hexes passed into
SVG `fill`/`stroke` (`NodeShape`) and React Flow edge `style`. With two themes they cannot stay
values, so they become **`var()` references**:

```ts
export const LAYER_COLOR = {
  Context:   { bg: 'var(--alt-1-bg)', border: 'var(--alt-1-bd)' },
  Container: { bg: 'var(--alt-2-bg)', border: 'var(--alt-2-bd)' },
  Component: { bg: 'var(--alt-3-bg)', border: 'var(--alt-3-bd)' },
};
```

Both SVG presentation attributes and React Flow's `style` accept any CSS colour string, so switching
`data-theme` repaints the diagram with **no React re-render and no layout recompute** — which matters,
because base positions are memoized on `[model, focusId]` only and must not be invalidated by a theme
change (`focusView` pipeline invariant).

`PatternMemberNode.tsx:7`'s private `{ node, ref, none }` map folds into the token system — and, per the
thesis, as **luminance rather than hue**, because how well a member is bound is a state of resolution,
not a meaning. A member bound to a node gets `--alt-3-bd` with `--tx-1` text; one bound only to a ref
gets `--alt-2-bd` with `--tx-2`; an unbound member gets a dashed `--rule` border with `--tx-3`. This
also keeps the accent exclusive to interaction, which an earlier draft of this spec broke by handing
`--accent` to ref-bound members.

**Known risk.** Two call sites may not resolve `var()`:

1. `markerEnd`/`markerStart` colours, which React Flow renders into a generated `<marker>` fill.
2. `MiniMap`'s `nodeColor`, if it paints to a canvas context rather than SVG.

The plan must verify both in a browser before committing to the approach. Fallback for those two sites
only: a `token(name)` helper reading `getComputedStyle(document.documentElement)` once per theme
change, keeping the rest declarative.

## Theme switching

`data-theme` on `<html>`; dark is the default. Persisted at `localStorage['hyphae.theme']`, seeded from
`prefers-color-scheme` when unset, and applied by a small inline script in `index.html` before React
mounts so there is no flash of the wrong theme. The toolbar toggle writes the attribute and the
storage key. `matchMedia` is already stubbed for jsdom in `apps/web/test/setup.ts`.

## Motion

One orchestrated moment: **the selected flow's current step animates a travelling dash** along its
edge (`stroke-dashoffset`), which reads as movement through the graph and reinforces that a flow is a
sequence. Everything else is a 120ms hover/active transition on background and opacity. All animation
is disabled under `@media (prefers-reduced-motion: reduce)`.

## Quality floor

Not announced in the UI, just met: visible `--accent` focus ring with offset on every interactive
element, `--tx-1`/`--tx-2` at ≥4.5:1 on their own surface, `--tx-3` micro-labels at ≥4.5:1 (which is
why they are 10px, not the 8px used in the brainstorming mockups), every verb hue at ≥4.5:1 against
`--surface-2` where its label sits, and the layout responsive down to a narrow window via the existing
panel min-sizes.

## File layout

`styles.css` remains the single entry point `App.tsx` imports, and becomes four files it `@import`s:

| File | Owns |
|---|---|
| `styles/tokens.css` | every token, both theme blocks, nothing else |
| `styles/base.css` | `@fontsource` imports, reset, type scale, focus ring, reduced-motion switch |
| `styles/chrome.css` | toolbar, altimeter, outline, inspector, floats, separators |
| `styles/canvas.css` | region, ghost, node text, edge labels |

**Selector discipline**, per `frontend-design`'s warning about rules that cancel each other: single
class selectors only, no element-type selectors, no nesting, no `!important`, and the existing
BEM-ish naming (`tree-panel__head`) continued. Padding and margin between sections are set in exactly
one place per element.

Inline `style={{ … }}` for anything static moves into these files. It stays only where a value is
computed at runtime — node geometry from `layout.ts`, `shapePadding`, React Flow's positioning.

## Testing

- The pure functions (`focusView`, `layout`, `hashRoute`, `flowOverlay`, `patternView`) are untouched,
  so the bulk of the 523-test baseline stays green unchanged.
- Tests asserting specific hexes (`Legend`, `Canvas`'s `hlCss` pattern, `patternView`) are rewritten to
  assert **token names**. This is a stronger test: it pins the contract rather than a value that is
  now allowed to differ per theme.
- **New `tokens.test.ts`** — reads `tokens.css`, collects every `var(--…)` referenced from TS and CSS,
  and asserts each is defined in *both* the `:root` and `[data-theme="light"]` blocks. A typo'd custom
  property fails silently in CSS, so this is the highest-value new test in the change.
- **New `contrast.test.ts`** — parses the token hexes, computes WCAG contrast for the documented
  text-on-surface and hue-on-surface pairs, and asserts the ratios in the quality floor above. A pure
  function, and the only way to keep that floor honest with no browser in the loop.
- CSS invariants continue to be pinned by reading the owning file and asserting the rule, since jsdom
  loads no external stylesheet (`TreePanel.test.tsx` already does this).
- **Gap, stated deliberately:** there is no visual regression testing. Whether it *looks* right stays a
  human judgement at `localhost:3000`.

## Living docs to update in the same branch

- `README.md` — the viewer's behaviour gains the theme toggle and the altimeter breadcrumb.
- `docs/SPEC.md` — §9 UX principles (altitude as luminance, the colour budget) and the §6.3 claim that
  verbs are "coloured by class", which stays true but now has an explicit token per class.
- The in-app `Legend`, which is the user-facing explanation of the visual language.

## Out of scope

- **Panel arrangement.** The three-pane resizable layout, its persistence and the collapse behaviour
  stay exactly as they are, including the `TreePanel`-is-controlled-by-`App` invariant.
- **The focus/layout pipeline.** `buildFocusView` → `layoutFocusView` → `resolveViewPositions` →
  `focusViewToFlow` is untouched, and so is the `[model, focusId]` memoization.
- **`shapes.ts` geometry.** The role silhouettes are already deliberate and tested; only their fill and
  stroke colours change.
- **Information architecture.** What each surface shows, and the drill/reveal gestures, are unchanged.
- **Any write path.** The browser remains a read-only viewer.

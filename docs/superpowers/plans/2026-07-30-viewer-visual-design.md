# Viewer Visual Design Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the viewer a deliberate visual design — a two-theme token system in which luminance carries state (altitude, selection, focus) and hue carries meaning (verb class) — replacing 59 lines of near-default CSS and colour literals spread across eight files.

**Architecture:** A CSS custom-property layer (`styles/tokens.css`) is the single source of every colour, type and space value, with a `[data-theme="light"]` block. TypeScript stops holding hexes: `LAYER_COLOR`, `VERB_CLASS_COLOR` and the pattern-member map become `var()` references, so switching themes repaints the diagram with no React re-render and no invalidation of the `[model, focusId]` layout memoization. Chrome surfaces (toolbar, outline, inspector, floats) are restyled against those tokens, and the toolbar breadcrumb becomes the design's signature element: an altimeter whose three luminance bands make the current depth readable without reading the names.

**Tech Stack:** Vite 5 + React 18 + TypeScript, `@xyflow/react` 12, `react-resizable-panels` 4, Vitest + jsdom + Testing Library, plain CSS with custom properties, `@fontsource` for bundled fonts.

**Spec:** `docs/superpowers/specs/2026-07-30-viewer-visual-design-design.md`

## Global Constraints

- **Every task's requirements implicitly include this section.**
- Work on branch `feat/viewer-visual-design`. Commit per task. Stage explicit paths — never `git add -A`.
- End every commit message with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Never `git add apps/server/hyphae-baritone.json`** or any other `*.json` model. Run `git status --short` before every commit.
- Run tests with `pnpm -r test`, or `cd apps/web && pnpm test`. **Never run bare `pnpm vitest run` from the repo root** — there is no root vitest config, so web tests run without jsdom and report dozens of bogus failures.
- Baseline is **523 green** (schema 147, server 107, web 269). A task may add tests; it may not leave a red one.
- **No colour literal may appear in `apps/web/src` outside `styles/tokens.css`** once Task 4 lands. The only exceptions are `NodeShape`'s props (callers pass values in) and test files that supply their own inputs.
- **Do not touch:** `shapes.ts` geometry, `layout.ts` constants (`NODE_W`, `NODE_H`, `SUMMARY_LINES`, `PAD`, `LABEL_H`), the focus-view pipeline (`buildFocusView` → `layoutFocusView` → `resolveViewPositions` → `focusViewToFlow`), panel arrangement in `App.tsx`, or anything resembling a write path.
- **CSS discipline:** `base.css` is the reset/global layer and **may** use element, ID and pseudo-class selectors (`html, body, #root`, `body`, `:focus-visible`) — a reset has nowhere else to attach. Everywhere else (`chrome.css`, `canvas.css`) is **single-class selectors only, no element-type selectors**, which is where the specificity collisions the rule exists to prevent actually happen. No nesting anywhere. No `!important` in the new stylesheets, except the `prefers-reduced-motion` block in `base.css`, where an override must beat what it suppresses (the one existing `!important` in `Canvas.tsx`'s generated CSS also stays, and its comment explains why). Continue the existing BEM-ish naming (`tree-panel__head`). Set padding/margin for an element in exactly one place.
  <br>*Amended 2026-07-30 during execution: Task 2's review flagged the original blanket "single-class only" as contradicting the plan's own `base.css` template. Ruled by the human partner in favour of carving out the reset layer.*
- Roughly 80 `act(...)` warnings in the web suite are **pre-existing noise**, not a regression.
- Two themes exist from Task 1 onward: **any** token you add must be defined in **both** `:root` and `[data-theme="light"]`, or `tokens.test.ts` fails.

---

## File Structure

**Create:**

| Path | Responsibility |
|---|---|
| `apps/web/src/styles/tokens.css` | every token, both theme blocks, nothing else |
| `apps/web/src/styles/base.css` | font imports, reset, type scale, focus ring, reduced-motion switch |
| `apps/web/src/styles/chrome.css` | toolbar, altimeter, outline, inspector, floats, separators |
| `apps/web/src/styles/canvas.css` | region, ghost, node text, edge labels, minimap |
| `apps/web/src/theme.ts` | pure theme helpers: read stored/preferred theme, apply, toggle |
| `apps/web/src/fieldLayout.ts` | pure `fieldLayout(type, value)` → `'grid' \| 'stack'` |
| `apps/web/src/Altimeter.tsx` | the breadcrumb-as-altimeter (signature element) |
| `apps/web/src/Toolbar.tsx` | wordmark + Altimeter + SearchBox + audience control + theme toggle |
| `apps/web/test/tokens.test.ts` | every `var(--…)` used anywhere is defined in both theme blocks |
| `apps/web/test/contrast.test.ts` | WCAG ratios for the documented pairs meet the floor |
| `apps/web/test/theme.test.ts` | theme helpers |
| `apps/web/test/fieldLayout.test.ts` | the grid/stack decision |
| `apps/web/test/Altimeter.test.tsx` | band-per-layer, current band, crumb navigation |
| `apps/web/test/Toolbar.test.tsx` | audience control, theme toggle |

**Modify:** `apps/web/src/styles.css` (becomes four `@import`s), `reactflow.ts`, `patternView.ts`, `Canvas.tsx`, `PatternMemberNode.tsx`, `NodeBox.tsx`, `GhostNode.tsx`, `GroupNode.tsx`, `GhostGroupNode.tsx`, `FloatingEdge.tsx`, `Legend.tsx`, `FilterPanel.tsx`, `SearchBox.tsx`, `TreePanel.tsx`, `SidePanel.tsx`, `FieldRows.tsx`, `ConnectionList.tsx`, `App.tsx`, `index.html`, `apps/web/package.json`, `README.md`, `docs/SPEC.md`.

**Existing tests that will need updating** (they assert hexes that become tokens): `test/Canvas.test.tsx:140,153`, `test/reactflow.test.ts:179,226`. `test/NodeShape.test.tsx` passes its own colours as props and needs **no** change.

---

## Task 1: Token layer and its two guard tests

**Files:**
- Create: `apps/web/src/styles/tokens.css`
- Modify: `apps/web/src/styles.css` (prepend the import; leave existing rules alone for now)
- Test: `apps/web/test/tokens.test.ts`, `apps/web/test/contrast.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: the token names every later task uses. Exact list is the file written in Step 3.

- [ ] **Step 1: Write the failing token-symmetry test**

Create `apps/web/test/tokens.test.ts`. jsdom loads no external stylesheet, so this reads the file from disk — the same approach `TreePanel.test.tsx` already uses to pin a CSS invariant. `import.meta.url` is an **http** URL under jsdom, so resolve from `process.cwd()`.

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'src');
const TOKENS = readFileSync(join(SRC, 'styles/tokens.css'), 'utf-8');

/** The declarations inside one selector block of tokens.css. */
function block(selector: string): Map<string, string> {
  const i = TOKENS.indexOf(selector);
  expect(i, `${selector} missing from tokens.css`).toBeGreaterThanOrEqual(0);
  const open = TOKENS.indexOf('{', i);
  const close = TOKENS.indexOf('}', open);
  const out = new Map<string, string>();
  for (const line of TOKENS.slice(open + 1, close).split('\n')) {
    const m = /^\s*(--[\w-]+)\s*:\s*([^;]+);/.exec(line);
    if (m) out.set(m[1], m[2].trim());
  }
  return out;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|css)$/.test(entry)) out.push(p);
  }
  return out;
}

describe('tokens.css', () => {
  const dark = block(':root');
  const light = block('[data-theme="light"]');

  it('defines at least the documented surface, text and altitude tokens', () => {
    for (const name of [
      '--sub', '--surface-1', '--surface-2', '--surface-3', '--rule', '--chip',
      '--tx-1', '--tx-2', '--tx-3',
      '--alt-1-bg', '--alt-1-bd', '--alt-2-bg', '--alt-2-bd', '--alt-3-bg', '--alt-3-bd',
      '--verb-dataAccess', '--verb-messaging', '--verb-control', '--verb-user', '--verb-traceability',
      '--edge-derived', '--accent', '--accent-text', '--accent-soft', '--accent-on', '--warn',
    ]) {
      expect(dark.has(name), `${name} missing from :root`).toBe(true);
    }
  });

  // The whole point of the light block: a token defined in only one theme is a bug that CSS
  // reports by silently rendering the wrong colour.
  it('defines every colour token in both themes', () => {
    const colourish = (n: string) => !n.startsWith('--font-') && !n.startsWith('--t-')
      && !n.startsWith('--s-') && !n.startsWith('--r-');
    for (const name of [...dark.keys()].filter(colourish)) {
      expect(light.has(name), `${name} defined in :root but not in [data-theme="light"]`).toBe(true);
    }
    for (const name of light.keys()) {
      expect(dark.has(name), `${name} defined in the light theme but not in :root`).toBe(true);
    }
  });

  // A var() typo is invisible in CSS — the declaration is simply dropped. This is the guard.
  it('defines every token referenced anywhere in src', () => {
    const referenced = new Set<string>();
    for (const file of walk(SRC)) {
      for (const m of readFileSync(file, 'utf-8').matchAll(/var\((--[\w-]+)/g)) referenced.add(m[1]);
    }
    const missing = [...referenced].filter((n) => !dark.has(n));
    expect(missing, `undefined tokens referenced: ${missing.join(', ')}`).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd apps/web && pnpm vitest run test/tokens.test.ts`
Expected: FAIL — `ENOENT` on `src/styles/tokens.css`.

- [ ] **Step 3: Write `tokens.css`**

Create `apps/web/src/styles/tokens.css` exactly as follows. Every value is from the spec's tables.

```css
/* The single source of every design value. Nothing but custom properties belongs in this file.
 *
 * The system has one rule: LUMINANCE IS STATE, HUE IS MEANING. Altitude (--alt-*), selection and
 * focus are expressed as light level, which leaves the whole chromatic budget for the five verb
 * classes — the one thing on the canvas that genuinely needs colour to be told apart. Adding a
 * hue to anything structural breaks the system, not just the palette.
 *
 * Dark is the default. The light theme is warm paper rather than an inversion, so the two do not
 * read as the same design with the lamp turned off. */
:root {
  /* surfaces */
  --sub: #101214;              /* canvas substrate */
  --surface-1: #141719;        /* outline and inspector panels */
  --surface-2: #171A1C;        /* toolbar, floating legend/filter, edge labels */
  --surface-3: #1D2124;        /* row hover, selected-row lift */
  --rule: #262A2E;             /* every hairline divider */
  --chip: #282D31;             /* technology / type chips */

  /* text */
  --tx-1: #E7E9EA;
  --tx-2: #98A0A6;
  --tx-3: #7C858B;             /* micro-labels; 10px minimum, never smaller */

  /* altitude — no hue, by design. 1 = Context, 3 = Component. */
  --alt-1-bg: #1A1D20;  --alt-1-bd: #3A4046;
  --alt-2-bg: #22262A;  --alt-2-bd: #4E555C;
  --alt-3-bg: #2C3136;  --alt-3-bd: #6B747C;

  /* hue — meaning only */
  --verb-dataAccess: #5B9DD9;
  --verb-messaging: #D9944E;
  --verb-control: #8896A3;     /* the baseline: deliberately the least chromatic */
  --verb-user: #D6789F;
  --verb-traceability: #4FB6A0;
  --edge-derived: #9B7EDB;     /* violet keeps its existing exclusive meaning */

  /* interaction and status */
  --accent: #F2C14E;           /* fills and rings only */
  --accent-text: #F2C14E;      /* the accent used as text; diverges in light */
  --accent-soft: #8A6F2A;      /* the weaker hover ring */
  --accent-on: #231A02;        /* text on an accent fill */
  --warn: #E0603F;             /* invalid flow / pattern only */

  /* type */
  --font-ui: 'Archivo Variable', system-ui, sans-serif;
  --font-mono: 'IBM Plex Mono', ui-monospace, monospace;
  --t-micro: 10px;
  --t-sm: 11px;
  --t-base: 12px;
  --t-md: 13px;
  --t-lg: 15px;
  --t-word: 12px;

  /* space and radius */
  --s-1: 2px; --s-2: 4px; --s-3: 6px; --s-4: 8px; --s-5: 12px; --s-6: 16px; --s-7: 24px;
  --r-sm: 3px; --r-md: 5px; --r-lg: 9px;
}

/* Warm paper. The altitude ramp densifies with depth here instead of brightening — the same
 * reading of "closer to you", not an inversion of it. The verb hues are markedly darker than a
 * tint of their dark counterparts because they are used as edge-label TEXT on --surface-2, where
 * a naive tint measures 3.6-4.3:1. See contrast.test.ts. */
[data-theme="light"] {
  --sub: #F5F2EC;
  --surface-1: #EDEAE3;
  --surface-2: #E7E3DB;
  --surface-3: #DFDAD1;
  --rule: #D2CCC2;
  --chip: #DFDAD1;

  --tx-1: #22201C;
  --tx-2: #5C564D;
  --tx-3: #6E675C;

  --alt-1-bg: #E9E5DC;  --alt-1-bd: #B9B2A5;
  --alt-2-bg: #E2DDD2;  --alt-2-bd: #9A9284;
  --alt-3-bg: #DAD4C7;  --alt-3-bd: #7A7264;

  --verb-dataAccess: #265C8C;
  --verb-messaging: #8F5214;
  --verb-control: #5A6570;
  --verb-user: #8F3566;
  --verb-traceability: #176356;
  --edge-derived: #6D4FB0;

  --accent: #B98A12;
  --accent-text: #7A5A06;      /* --accent measures 2.44:1 as text on paper; this is 4.85:1 */
  --accent-soft: #DCC98F;
  --accent-on: #FFF8E6;
  --warn: #B4321A;
}
```

- [ ] **Step 4: Import it from the entry stylesheet**

Add as the **first line** of `apps/web/src/styles.css` (a CSS `@import` must precede all rules):

```css
@import './styles/tokens.css';
```

- [ ] **Step 5: Run the token test to verify it passes**

Run: `cd apps/web && pnpm vitest run test/tokens.test.ts`
Expected: PASS, 3 tests. The third passes trivially for now (nothing references a token yet) and gets stronger with every later task.

- [ ] **Step 6: Write the failing contrast test**

Create `apps/web/test/contrast.test.ts`. This is the only mechanism keeping the accessibility floor honest — there is no browser in the loop.

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const TOKENS = readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf-8');

function block(selector: string): Record<string, string> {
  const open = TOKENS.indexOf('{', TOKENS.indexOf(selector));
  const out: Record<string, string> = {};
  for (const line of TOKENS.slice(open + 1, TOKENS.indexOf('}', open)).split('\n')) {
    const m = /^\s*(--[\w-]+)\s*:\s*(#[0-9A-Fa-f]{6})\s*;/.exec(line);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

/** WCAG 2.1 relative luminance. */
function luminance(hex: string): number {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

function ratio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Every pair the spec's quality floor claims. Text on its own surface, at 4.5:1. */
const PAIRS: Array<[string, string]> = [
  ['--tx-1', '--surface-1'], ['--tx-2', '--surface-1'], ['--tx-3', '--surface-1'],
  ['--tx-1', '--surface-2'], ['--tx-2', '--surface-2'], ['--tx-3', '--surface-2'],
  ['--tx-1', '--sub'], ['--tx-2', '--sub'], ['--tx-3', '--sub'],
  ['--tx-1', '--alt-1-bg'], ['--tx-1', '--alt-2-bg'], ['--tx-1', '--alt-3-bg'],
  ['--tx-2', '--alt-1-bg'], ['--tx-2', '--alt-2-bg'], ['--tx-2', '--alt-3-bg'],
  // verb hues are edge-label text, and the label sits on --surface-2
  ['--verb-dataAccess', '--surface-2'], ['--verb-messaging', '--surface-2'],
  ['--verb-control', '--surface-2'], ['--verb-user', '--surface-2'],
  ['--verb-traceability', '--surface-2'], ['--edge-derived', '--surface-2'],
  ['--accent-text', '--surface-1'], ['--accent-text', '--surface-2'],
  ['--warn', '--surface-1'], ['--warn', '--surface-2'],
  ['--accent-on', '--accent'],
];

describe.each([['dark', ':root'], ['light', '[data-theme="light"]']])('%s theme contrast', (_name, selector) => {
  const t = block(selector);
  it.each(PAIRS)('%s on %s is at least 4.5:1', (fg, bg) => {
    expect(t[fg], `${fg} not a plain hex in ${selector}`).toBeTruthy();
    expect(t[bg], `${bg} not a plain hex in ${selector}`).toBeTruthy();
    expect(ratio(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5);
  });
});
```

- [ ] **Step 7: Run it**

Run: `cd apps/web && pnpm vitest run test/contrast.test.ts`
Expected: **PASS**, 52 assertions (26 pairs × 2 themes). The spec's values were chosen against exactly this computation. If any pair fails, do **not** loosen the threshold — darken or lighten the token and note the change in the commit body.

- [ ] **Step 8: Run the whole web suite**

Run: `cd apps/web && pnpm test`
Expected: 269 pre-existing + 3 + 52 new, all green.

- [ ] **Step 9: Commit**

```bash
cd C:/projects/hyphae
git status --short
git add apps/web/src/styles/tokens.css apps/web/src/styles.css \
        apps/web/test/tokens.test.ts apps/web/test/contrast.test.ts
git commit -m "$(cat <<'EOF'
feat(web): add the token layer and its two guard tests

tokens.css is now the single source of every colour, type and space value,
with a light theme beside the dark default. Nothing consumes it yet.

Two tests guard it because CSS cannot: a var() typo silently drops the
declaration, so tokens.test.ts asserts every token referenced anywhere in
src is defined and that every colour exists in BOTH themes. contrast.test.ts
computes WCAG ratios for the 26 documented text-on-surface pairs in both
themes, which is the only way to keep the accessibility floor honest with no
browser in the loop.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Bundled fonts and the type scale

**Files:**
- Modify: `apps/web/package.json`, `apps/web/src/styles.css`
- Create: `apps/web/src/styles/base.css`

**Interfaces:**
- Consumes: `--font-ui`, `--font-mono`, `--t-*`, `--s-*`, `--accent` from Task 1.
- Produces: `.hy-micro` (the shared micro-label class), and a global focus-ring rule every later task relies on rather than restyling focus itself.

- [ ] **Step 1: Install the font packages**

`@fontsource-variable/archivo` is published (5.3.0). `@fontsource-variable/ibm-plex-mono` **does not exist** — IBM Plex Mono has no variable release — so the mono role uses the static package at two weights.

```bash
cd C:/projects/hyphae/apps/web
pnpm add @fontsource-variable/archivo @fontsource/ibm-plex-mono
```

- [ ] **Step 2: Verify which Archivo axes shipped**

Run: `ls node_modules/@fontsource-variable/archivo/*.css`

Fontsource publishes one CSS entry per axis combination. If you see a `wdth.css` or `standard.css`, the width axis is available and Step 4's `font-stretch` declarations work. **If only `index.css` (weight axis) exists, drop every `font-stretch` in this plan** and express the display role with weight and `letter-spacing` alone — note which you found in the commit body. Record the finding; Tasks 5 and 7 both reference `font-stretch`.

- [ ] **Step 3: Write `base.css`**

Create `apps/web/src/styles/base.css`. Adjust the two `@import` lines to the filenames Step 2 actually found.

```css
/* Fonts are bundled, not fetched: SPEC.md's "local execution without a cloud or accounts" means the
 * viewer has to render correctly on an air-gapped machine. Vite emits the woff2 files into the
 * bundle. Archivo is variable (weight, and width where published); IBM Plex Mono has no variable
 * release, so it is the static package at exactly the two weights used. */
@import '@fontsource-variable/archivo';
@import '@fontsource/ibm-plex-mono/400.css';
@import '@fontsource/ibm-plex-mono/500.css';

html, body, #root { height: 100%; margin: 0; }
body {
  font-family: var(--font-ui);
  font-size: var(--t-base);
  color: var(--tx-1);
  background: var(--surface-1);
}

/* One focus rule for the whole app. Every interactive element inherits it, so no later stylesheet
 * needs to think about focus — and :focus-visible means a mouse click never draws it. */
:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: var(--r-sm);
}

/* The shared micro-label: mono, uppercase, tracked. 10px is a floor, not a suggestion — at 8px
 * these fall under 3.5:1 against their surface and stop being readable. */
.hy-micro {
  font-family: var(--font-mono);
  font-size: var(--t-micro);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--tx-3);
}

/* Motion is opt-out at the root, so no individual animation has to remember to check. */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

The `!important`s here are the documented exception to the global CSS rule: a reduced-motion override has to beat the declarations it is suppressing, and this is the standard formulation.

- [ ] **Step 4: Import it and drop the old body rule**

In `apps/web/src/styles.css`, the first two lines become:

```css
@import './styles/tokens.css';
@import './styles/base.css';
```

and **delete** the old line 1 (`html, body, #root { height: 100%; margin: 0; font-family: system-ui, sans-serif; }`) — `base.css` now owns it. Leave every other rule in `styles.css` for later tasks.

- [ ] **Step 5: Write a test pinning the offline-font invariant**

Append to `apps/web/test/tokens.test.ts`:

```ts
describe('base.css', () => {
  const BASE = readFileSync(join(SRC, 'styles/base.css'), 'utf-8');

  // A CDN <link> would be smaller to write and would break the air-gapped case SPEC.md promises.
  it('imports fonts from the bundled packages, never over the network', () => {
    expect(BASE).toContain('@fontsource');
    expect(BASE).not.toMatch(/https?:\/\//);
  });

  it('sets a reduced-motion escape hatch', () => {
    expect(BASE).toContain('prefers-reduced-motion');
  });
});
```

- [ ] **Step 6: Run the tests**

Run: `cd apps/web && pnpm test`
Expected: all green, 2 new tests.

- [ ] **Step 7: Verify the build actually bundles the fonts**

Run: `cd apps/web && pnpm build`
Expected: success, and `dist/assets/` contains `.woff2` files. If the build fails on the `@import` paths, the package's CSS entry names differ from Step 2's finding — fix the import, do not remove it.

- [ ] **Step 8: Commit**

```bash
cd C:/projects/hyphae
git status --short
git add apps/web/package.json apps/web/src/styles/base.css apps/web/src/styles.css \
        apps/web/test/tokens.test.ts ../../pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
feat(web): bundle Archivo and IBM Plex Mono, add the type scale

Typography was system-ui at every size. Archivo (variable) now carries the
UI and display roles and IBM Plex Mono the data role — ids, refs, chips,
verb labels, step numbers.

Both are bundled via @fontsource rather than linked from a CDN: SPEC.md
promises local execution with no cloud, so the viewer has to render on an
air-gapped machine. A test asserts base.css never references an http URL.

base.css also takes over the body rule from styles.css and adds the two
global rules every later surface depends on: one :focus-visible ring, and a
prefers-reduced-motion escape hatch.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Theme switching

**Files:**
- Create: `apps/web/src/theme.ts`, `apps/web/test/theme.test.ts`
- Modify: `apps/web/index.html`

**Interfaces:**
- Consumes: the `[data-theme="light"]` block from Task 1.
- Produces:
  - `type Theme = 'dark' | 'light'`
  - `THEME_KEY = 'hyphae.theme'`
  - `initialTheme(): Theme`
  - `applyTheme(t: Theme): void`
  - `nextTheme(t: Theme): Theme`
  Task 5 wires these to a button.

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/theme.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyTheme, initialTheme, nextTheme, THEME_KEY } from '../src/theme';

describe('theme', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('defaults to dark when nothing is stored and no preference is expressed', () => {
    expect(initialTheme()).toBe('dark');
  });

  it('honours a stored choice over the OS preference', () => {
    localStorage.setItem(THEME_KEY, 'light');
    expect(initialTheme()).toBe('light');
  });

  it('ignores a stored value that is not a theme', () => {
    localStorage.setItem(THEME_KEY, 'chartreuse');
    expect(initialTheme()).toBe('dark');
  });

  it('falls back to the OS light preference when nothing is stored', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
    expect(initialTheme()).toBe('light');
  });

  it('applies the theme as an attribute and persists it', () => {
    applyTheme('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem(THEME_KEY)).toBe('light');
  });

  // Dark is the default, so it is the ABSENCE of the attribute — the :root block already is dark.
  // Writing data-theme="dark" would work too, but leaving it off keeps one source of truth.
  it('removes the attribute for dark rather than setting it', () => {
    applyTheme('light');
    applyTheme('dark');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
  });

  it('toggles', () => {
    expect(nextTheme('dark')).toBe('light');
    expect(nextTheme('light')).toBe('dark');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/web && pnpm vitest run test/theme.test.ts`
Expected: FAIL — cannot resolve `../src/theme`.

- [ ] **Step 3: Write `theme.ts`**

```ts
/** Which palette `tokens.css` serves. Dark is the default and is expressed as the ABSENCE of the
 *  attribute — `:root` is already the dark block, so writing `data-theme="dark"` would give the
 *  same colours two sources of truth. */
export type Theme = 'dark' | 'light';

export const THEME_KEY = 'hyphae.theme';

const isTheme = (v: unknown): v is Theme => v === 'dark' || v === 'light';

/** The stored choice if there is a valid one, else the OS preference, else dark. A junk value in
 *  localStorage (hand-edited, or written by an older build) must not leave the app unstyled. */
export function initialTheme(): Theme {
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(THEME_KEY) : null;
  if (isTheme(stored)) return stored;
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches) {
    return 'light';
  }
  return 'dark';
}

export function applyTheme(theme: Theme): void {
  if (theme === 'light') document.documentElement.setAttribute('data-theme', 'light');
  else document.documentElement.removeAttribute('data-theme');
  if (typeof localStorage !== 'undefined') localStorage.setItem(THEME_KEY, theme);
}

export const nextTheme = (t: Theme): Theme => (t === 'dark' ? 'light' : 'dark');
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && pnpm vitest run test/theme.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Apply the theme before first paint**

React mounts after the first paint, so reading the theme in a component flashes the wrong palette on every load. Add to `apps/web/index.html`, inside `<head>` after `<title>`:

```html
    <!-- Set the theme before first paint. React mounts too late: reading it in a component
         flashes the dark default at anyone who chose light. Inlined and duplicated from
         src/theme.ts on purpose — an imported module would itself be a deferred fetch. -->
    <script>
      (function () {
        try {
          var stored = localStorage.getItem('hyphae.theme');
          var light = stored === 'light'
            || (stored !== 'dark' && window.matchMedia('(prefers-color-scheme: light)').matches);
          if (light) document.documentElement.setAttribute('data-theme', 'light');
        } catch (e) { /* private mode: fall through to the dark default */ }
      })();
    </script>
```

- [ ] **Step 6: Pin the duplication so it cannot drift**

Append to `apps/web/test/theme.test.ts`:

```ts
describe('the pre-paint script in index.html', () => {
  const html = readFileSync(join(process.cwd(), 'index.html'), 'utf-8');

  // It duplicates theme.ts by necessity (an imported module would be a deferred fetch, which is
  // the flash we are avoiding). This test is what stops the two drifting apart.
  it('reads the same storage key and preference query as theme.ts', () => {
    expect(html).toContain(THEME_KEY);
    expect(html).toContain('prefers-color-scheme: light');
    expect(html).toContain('data-theme');
  });
});
```

Add `import { readFileSync } from 'node:fs'; import { join } from 'node:path';` to the top of the file.

- [ ] **Step 7: Run the suite**

Run: `cd apps/web && pnpm test`
Expected: all green, 8 new tests in this task.

- [ ] **Step 8: Commit**

```bash
cd C:/projects/hyphae
git status --short
git add apps/web/src/theme.ts apps/web/test/theme.test.ts apps/web/index.html
git commit -m "$(cat <<'EOF'
feat(web): switch themes via a data-theme attribute

Dark is the default and is the absence of the attribute, since :root is
already the dark block — writing data-theme="dark" would give one palette
two sources of truth.

The theme is applied by an inline script in index.html rather than by a
component, because React mounts after the first paint and anyone who chose
light would see the dark default flash on every load. That script duplicates
theme.ts by necessity; a test asserts both use the same storage key and
media query so they cannot drift.

A junk stored value falls back to the preference rather than leaving the app
unstyled. No UI yet — the toggle arrives with the toolbar.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: The canvas stops holding colour literals

This is the load-bearing task. It also contains the plan's one genuine unknown, in Step 2.

**Files:**
- Modify: `apps/web/src/reactflow.ts:7-15,35-41,80-84`, `apps/web/src/patternView.ts:40-45`, `apps/web/src/Canvas.tsx:29-33,114-116,137`, `apps/web/src/PatternMemberNode.tsx:7-9`, `apps/web/src/NodeBox.tsx:27,60,67`, `apps/web/src/GhostNode.tsx:24,38,66,73`, `apps/web/src/FloatingEdge.tsx:40-41`
- Create: `apps/web/src/styles/canvas.css`
- Modify: `apps/web/src/styles.css` (move `.region*` rules into `canvas.css`)
- Test: update `apps/web/test/reactflow.test.ts:179,226` and `apps/web/test/Canvas.test.tsx:140,153`

**Interfaces:**
- Consumes: every colour token from Task 1.
- Produces: `LAYER_COLOR` and `VERB_CLASS_COLOR` keep their exact shapes (`Record<string, {bg, border}>` and `Record<VerbClass, string>`) — only the values become `var(--…)` strings. `layerColorOf(type)` keeps its signature. Task 8's `Legend` reads both.

- [ ] **Step 1: Update the two tests that assert hexes**

In `apps/web/test/reactflow.test.ts`, line 179 becomes:

```ts
    // A type outside the profile's layers gets the mid step rather than a bare white box.
    expect(layerColorOf('Nonsense')).toEqual({ bg: 'var(--alt-2-bg)', border: 'var(--alt-2-bd)' });
```

and line 226 (asserting no verb class is violet, since violet means "derived") becomes:

```ts
  expect(colors).not.toContain('var(--edge-derived)');
```

In `apps/web/test/Canvas.test.tsx`, line 140 becomes:

```ts
    expect(css).toContain('var(--accent-soft)');                       // soft hover ring
```

and line 153:

```ts
    expect(before).toContain('var(--accent)');                         // strong selection ring
```

- [ ] **Step 2: Verify `var()` resolves at the two risky call sites**

Two places do not simply set a CSS property, and this is the only thing in the plan that cannot be settled by reading code:

1. `markerEnd` / `markerStart` — React Flow renders these into a generated `<marker>` element's fill.
2. `MiniMap`'s `nodeColor` callback (`Canvas.tsx:29-33`) — which may paint to a `<canvas>` 2D context, where `var()` is meaningless.

Run the app and look:

```bash
cd C:/projects/hyphae
HYPHAE_FILE=$(pwd)/apps/server/hyphae-baritone.json pnpm server   # terminal 1
pnpm web                                                          # terminal 2
```

Open `http://localhost:3000`, focus a node with outgoing edges, and check: **are the arrowheads coloured, and are the minimap dots coloured?** Toggle the theme by running `localStorage.setItem('hyphae.theme','light'); location.reload()` in the console and confirm the diagram repaints.

- **If both work:** proceed with `var()` everywhere and delete Step 3.
- **If either renders black/transparent:** implement Step 3's `token()` helper for **only** the failing call site(s), and record in the commit body which one failed.

- [ ] **Step 3: Only if Step 2 showed a failure — add the `token()` fallback**

Add to `apps/web/src/theme.ts`:

```ts
/** Resolve a custom property to its computed value. Needed only where a CSS variable cannot be
 *  used: a value React Flow copies into a generated <marker> fill, or into a canvas 2D context.
 *  Everything else must stay declarative so a theme switch repaints without a React render. */
export function token(name: string): string {
  if (typeof window === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
```

For the minimap, call it inside the callback so it re-reads per paint:

```ts
const miniMapColor = (n: FlowNode): string => {
  if (n.type === 'region') return token('--alt-2-bd');
  const c = (n.data as { color?: { border: string } }).color;
  return c?.border?.startsWith('var(') ? token(c.border.slice(4, -1)) : (c?.border ?? token('--tx-3'));
};
```

Note in a comment that a theme switch will not repaint the minimap until React re-renders it, which is an accepted limitation of the fallback path.

- [ ] **Step 4: Convert `reactflow.ts`**

Replace lines 7-15:

```ts
/** Tint each node by its C4 layer so altitude is readable at a glance — the design's core encoding,
 *  expressed as luminance with no hue at all (see styles/tokens.css). These are `var()` references,
 *  not values, so switching themes repaints the diagram with no React re-render and therefore no
 *  invalidation of the base-position memo, which is keyed on [model, focusId] only. */
export const LAYER_COLOR: Record<string, { bg: string; border: string }> = {
  Context: { bg: 'var(--alt-1-bg)', border: 'var(--alt-1-bd)' },
  Container: { bg: 'var(--alt-2-bg)', border: 'var(--alt-2-bd)' },
  Component: { bg: 'var(--alt-3-bg)', border: 'var(--alt-3-bd)' },
};
export function layerColorOf(type: string): { bg: string; border: string } {
  const layer = layerOfType(c4Backend, type);
  // An unmapped type takes the middle step. The old fallback was a bare white box, which in a dark
  // theme is the brightest thing on the canvas — the exact opposite of "this has no known altitude".
  return (layer && LAYER_COLOR[layer]) || { bg: 'var(--alt-2-bg)', border: 'var(--alt-2-bd)' };
}
```

Replace lines 35-41:

```ts
/** Verb classes get distinct hues, and are the ONLY thing on the canvas that does. Violet is
 *  deliberately absent — it means "derived rollup edge" here and in the legend. */
export const VERB_CLASS_COLOR: Record<VerbClass, string> = {
  dataAccess: 'var(--verb-dataAccess)',
  messaging: 'var(--verb-messaging)',
  control: 'var(--verb-control)',
  user: 'var(--verb-user)',
  traceability: 'var(--verb-traceability)',
};
```

In `derivedEdge` (lines 80-84), replace the four violet literals with `var(--edge-derived)`, and `labelBgStyle: { background: '#ede9fe' }` with `labelBgStyle: { background: 'var(--surface-2)' }`.

- [ ] **Step 5: Convert `patternView.ts`, `Canvas.tsx`, `PatternMemberNode.tsx`**

`patternView.ts:40-45` — replace `'#475569'` (three occurrences) with `'var(--verb-control)'`: a pattern's internal edges are structural, so they take the baseline hue rather than inventing one.

`Canvas.tsx:114-116` — the ephemeral flow-step edge:

```ts
      style: { stroke: 'var(--accent)', strokeDasharray: '2 5', strokeWidth: 2 },
      labelStyle: { fill: 'var(--accent-text)', fontWeight: 700 },
      markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--accent)' },
```

`Canvas.tsx:137`:

```ts
  const accent = strong ? 'var(--accent)' : 'var(--accent-soft)';
```

`PatternMemberNode.tsx:7-9` — how well a member is bound is a **state of resolution, not a meaning**, so per the thesis it is luminance, not hue:

```ts
// Binding strength as luminance, not hue: a bound member is more present than a ref-only one, which
// is more present than an unbound one. Giving these three their own colours (as this map used to)
// spent chromatic budget that belongs to the verb classes.
const BIND = {
  node: { bg: 'var(--alt-3-bg)', border: 'var(--alt-3-bd)', tag: 'node' },
  ref: { bg: 'var(--alt-2-bg)', border: 'var(--alt-2-bd)', tag: 'ref' },
  none: { bg: 'var(--alt-1-bg)', border: 'var(--rule)', tag: '' },
} as const;
```

Keep the existing exported name if `PatternMemberNode.test.tsx` imports it; otherwise rename as above. Check first with `grep -n "BIND\|MEMBER" test/PatternMemberNode.test.tsx`.

- [ ] **Step 6: Move canvas chrome into `canvas.css`**

Create `apps/web/src/styles/canvas.css` and **cut** lines 39-42 of `styles.css` (`.region`, `.region--ghost`, `.region--ghost .region__handle`, `.region__handle`) into it, retokenised:

```css
/* A containment boundary. It takes the altitude of the node it represents, so the box you are
 * inside is as bright as the nodes inside it. */
.region {
  width: 100%; height: 100%;
  border: 1px solid var(--alt-2-bd);
  border-radius: var(--r-lg);
  background: var(--alt-2-bg);
  pointer-events: none;
}
/* An external, dashed because it is outside the focus and drawn for context only. */
.region--ghost { border: 1.5px dashed var(--rule); background: var(--surface-2); }
.region--ghost .region__handle { color: var(--tx-3); }
.region__handle {
  position: absolute; top: 0; left: 0; right: 0; height: 22px;
  padding: var(--s-1) var(--s-5); box-sizing: border-box;
  font-size: var(--t-micro); font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--tx-3); cursor: grab; pointer-events: auto;
}
```

Add `@import './styles/canvas.css';` to `styles.css` after the `base.css` import.

- [ ] **Step 7: Retokenise the node renderers' inline styles**

`NodeBox.tsx`: line 27 `const color = d.color ?? { bg: 'var(--alt-2-bg)', border: 'var(--alt-2-bd)' };`; line 60 `color: 'var(--tx-2)'`; line 67 `color: 'var(--tx-2)', background: 'var(--chip)'`.

`GhostNode.tsx`: line 24 `{ bg: 'var(--surface-2)', border: 'var(--rule)' }`; lines 38 and 66 `color: 'var(--tx-2)'`; line 73 `color: 'var(--tx-2)', background: 'var(--chip)'`.

`FloatingEdge.tsx:40-41`: `background: 'var(--surface-2)'`, `color: 'var(--tx-2)'`.

- [ ] **Step 8: Prove no literal survives**

Append to `apps/web/test/tokens.test.ts`:

```ts
// The whole point of the token layer: one place to change a colour. A literal anywhere else is a
// value that cannot be themed and has no home.
it('has no colour literal in src outside tokens.css', () => {
  const offenders: string[] = [];
  for (const file of walk(SRC)) {
    if (file.endsWith(join('styles', 'tokens.css'))) continue;
    const text = readFileSync(file, 'utf-8');
    for (const m of text.matchAll(/#[0-9A-Fa-f]{3,8}\b/g)) {
      // NodeShape takes colours as props, so its own defaults are the caller's business.
      if (file.endsWith('NodeShape.tsx')) continue;
      offenders.push(`${file}: ${m[0]}`);
    }
    for (const m of text.matchAll(/\b(rgba?|hsla?)\(/g)) offenders.push(`${file}: ${m[0]}`);
  }
  expect(offenders, `colour literals outside tokens.css:\n${offenders.join('\n')}`).toEqual([]);
});
```

This test will fail until Tasks 5-8 have converted the chrome components. **Mark it `it.fails` is wrong** — instead, add it now but scoped to the files this task owns:

```ts
const TASK4_FILES = ['reactflow.ts', 'patternView.ts', 'PatternMemberNode.tsx', 'NodeBox.tsx',
                     'GhostNode.tsx', 'FloatingEdge.tsx', 'styles/canvas.css'];
```

filter `walk(SRC)` to those, and widen the list in each later task until Task 8 removes the filter entirely.

- [ ] **Step 9: Run everything**

Run: `cd apps/web && pnpm test`
Expected: all green. `Canvas.test.tsx`'s `hlCss` assertions now match token names; `reactflow.test.ts` matches `var(--alt-2-*)`.

- [ ] **Step 10: Look at it in the browser**

With the servers from Step 2 still running, confirm: node fills step up in brightness as you drill from the root into a container into a component; edges are coloured by verb; the rollup edge is violet-dashed; the theme switch repaints without a reload beyond the one you trigger.

- [ ] **Step 11: Commit**

```bash
cd C:/projects/hyphae
git status --short
git add apps/web/src/reactflow.ts apps/web/src/patternView.ts apps/web/src/Canvas.tsx \
        apps/web/src/PatternMemberNode.tsx apps/web/src/NodeBox.tsx apps/web/src/GhostNode.tsx \
        apps/web/src/FloatingEdge.tsx apps/web/src/styles/canvas.css apps/web/src/styles.css \
        apps/web/src/theme.ts apps/web/test/reactflow.test.ts apps/web/test/Canvas.test.tsx \
        apps/web/test/tokens.test.ts
git commit -m "$(cat <<'EOF'
feat(web): paint the canvas from tokens instead of hexes

LAYER_COLOR and VERB_CLASS_COLOR now hold var() references rather than
values, so a theme switch repaints the diagram with no React re-render —
which matters because base positions are memoized on [model, focusId] only
and a re-render would risk invalidating a layout the user is reading.

Two behavioural fixes fall out of it. An unmapped node type took a bare
white box, the brightest possible thing on a dark canvas for a node whose
altitude is unknown; it now takes the middle altitude step. And
PatternMemberNode's private colour map became luminance steps: how well a
member is bound is a state of resolution, not a meaning, so it has no claim
on chromatic budget that belongs to the verb classes.

Tests that asserted specific hexes now assert token names, which pins the
contract instead of a value that is allowed to differ per theme.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: The toolbar and the altimeter

The signature element. Extracting `Toolbar` also takes ~30 lines of unrelated markup out of `App.tsx`, which is already dense with panel-collapse logic.

**Files:**
- Create: `apps/web/src/Altimeter.tsx`, `apps/web/src/Toolbar.tsx`, `apps/web/test/Altimeter.test.tsx`, `apps/web/test/Toolbar.test.tsx`
- Create: `apps/web/src/styles/chrome.css`
- Modify: `apps/web/src/App.tsx:144-171` (replace the `<header>` with `<Toolbar />`), `apps/web/src/styles.css`

**Interfaces:**
- Consumes: `breadcrumbPath(model, focusId)` from `./focusView` (returns `Array<{ id: string | null; name: string }>`, root first); `layerOfType(c4Backend, type)` from `@hyphae/schema`; `initialTheme`, `applyTheme`, `nextTheme` from `./theme`.
- Produces: `<Altimeter />` and `<Toolbar />`, both taking no props (they read the store directly, as `SearchBox` already does).

- [ ] **Step 1: Write the failing Altimeter test**

Create `apps/web/test/Altimeter.test.tsx`:

```tsx
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Altimeter } from '../src/Altimeter';
import { useStore } from '../src/store';
import type { Model } from '@hyphae/schema';

const model = {
  nodes: [
    { id: 'sys', name: 'Baritone', type: 'System', parentId: null, role: null, description: '', root: null, codeRefs: [], docRefs: [], fields: {} },
    { id: 'ctr', name: 'bot core', type: 'Container', parentId: 'sys', role: null, description: '', root: null, codeRefs: [], docRefs: [], fields: {} },
    { id: 'cmp', name: 'pathing', type: 'Component', parentId: 'ctr', role: null, description: '', root: null, codeRefs: [], docRefs: [], fields: {} },
  ],
  connections: [], flows: [], patterns: [], profile: 'c4-backend',
} as unknown as Model;

describe('Altimeter', () => {
  beforeEach(() => {
    useStore.setState({ model, focusId: 'cmp' });
  });

  it('renders one crumb per ancestor, root first', () => {
    render(<Altimeter />);
    const crumbs = screen.getAllByRole('button');
    expect(crumbs.map((b) => b.textContent)).toEqual(['Baritone', 'bot core', 'pathing']);
  });

  // The point of the element: depth is legible without reading the names.
  it('marks the deepest crumb as the current altitude', () => {
    render(<Altimeter />);
    expect(screen.getByRole('button', { name: 'pathing' }).closest('.altimeter__band'))
      .toHaveClass('altimeter__band--current');
    expect(screen.getByRole('button', { name: 'Baritone' }).closest('.altimeter__band'))
      .not.toHaveClass('altimeter__band--current');
  });

  it('bands a crumb by its node type layer', () => {
    render(<Altimeter />);
    expect(screen.getByRole('button', { name: 'Baritone' }).closest('.altimeter__band'))
      .toHaveAttribute('data-layer', 'Context');
    expect(screen.getByRole('button', { name: 'pathing' }).closest('.altimeter__band'))
      .toHaveAttribute('data-layer', 'Component');
  });

  it('ascends when an ancestor crumb is clicked', async () => {
    render(<Altimeter />);
    await userEvent.click(screen.getByRole('button', { name: 'bot core' }));
    expect(useStore.getState().focusId).toBe('ctr');
  });
});
```

`userEvent` is not currently a dependency. Check with `grep -rn "user-event" package.json test/`; if absent, use `fireEvent.click` from `@testing-library/react` instead of adding a dependency for one call.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/web && pnpm vitest run test/Altimeter.test.tsx`
Expected: FAIL — cannot resolve `../src/Altimeter`.

- [ ] **Step 3: Write `Altimeter.tsx`**

```tsx
import { c4Backend, layerOfType } from '@hyphae/schema';
import { useStore } from './store';
import { breadcrumbPath } from './focusView';

/**
 * The breadcrumb as an altimeter — the design's signature element.
 *
 * A C4 model's one inarguable property is altitude, and navigating it means descending. Each crumb
 * is drawn inside a band tinted with its own layer's altitude step, so how deep you are is readable
 * without reading the names; only the deepest band is lit. `data-layer` carries the layer name and
 * the CSS maps it to a step, which keeps the ramp in one place (styles/chrome.css) rather than
 * duplicating LAYER_COLOR here.
 */
export function Altimeter() {
  const model = useStore((s) => s.model);
  const focusId = useStore((s) => s.focusId);
  const setFocus = useStore((s) => s.setFocus);
  const crumbs = breadcrumbPath(model, focusId);
  const byId = new Map(model.nodes.map((n) => [n.id, n]));

  return (
    <nav className="altimeter" aria-label="breadcrumbs">
      {crumbs.map((c, i) => {
        const node = c.id ? byId.get(c.id) : undefined;
        const layer = node ? layerOfType(c4Backend, node.type) : undefined;
        const current = i === crumbs.length - 1;
        return (
          <span
            key={c.id ?? '__root__'}
            className={`altimeter__band${current ? ' altimeter__band--current' : ''}`}
            data-layer={layer ?? ''}
          >
            {layer && <span className="hy-micro altimeter__layer">{layer.slice(0, 3)}</span>}
            <button className="altimeter__crumb" onClick={() => setFocus(c.id)}>{c.name}</button>
          </span>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && pnpm vitest run test/Altimeter.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the failing Toolbar test**

Create `apps/web/test/Toolbar.test.tsx`:

```tsx
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Toolbar } from '../src/Toolbar';
import { useStore } from '../src/store';
import { THEME_KEY } from '../src/theme';

describe('Toolbar', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    useStore.setState({ audience: 'full' });
  });

  it('marks the active audience with aria-pressed', () => {
    render(<Toolbar />);
    expect(screen.getByRole('button', { name: /full/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /stakeholder/i })).toHaveAttribute('aria-pressed', 'false');
  });

  it('switches audience', () => {
    render(<Toolbar />);
    fireEvent.click(screen.getByRole('button', { name: /stakeholder/i }));
    expect(useStore.getState().audience).toBe('stakeholder');
  });

  it('toggles the theme and persists it', () => {
    render(<Toolbar />);
    fireEvent.click(screen.getByRole('button', { name: /theme/i }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem(THEME_KEY)).toBe('light');
    fireEvent.click(screen.getByRole('button', { name: /theme/i }));
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `cd apps/web && pnpm vitest run test/Toolbar.test.tsx`
Expected: FAIL — cannot resolve `../src/Toolbar`.

- [ ] **Step 7: Write `Toolbar.tsx`**

```tsx
import { useState } from 'react';
import { useStore } from './store';
import { Altimeter } from './Altimeter';
import { SearchBox } from './SearchBox';
import { applyTheme, initialTheme, nextTheme, type Theme } from './theme';

const AUDIENCES = ['stakeholder', 'full'] as const;

/** The app's one header: wordmark, altimeter, search, audience, theme. Extracted from App so App
 *  is left holding only the panel layout it already has plenty of logic for. */
export function Toolbar() {
  const audience = useStore((s) => s.audience);
  const setAudience = useStore((s) => s.setAudience);
  // The attribute is already correct before React mounts (index.html), so this state only mirrors
  // it for the button's own label.
  const [theme, setTheme] = useState<Theme>(initialTheme);

  const toggleTheme = () => {
    const next = nextTheme(theme);
    applyTheme(next);
    setTheme(next);
  };

  return (
    <header className="toolbar">
      <span className="toolbar__word">HYPHAE</span>
      <Altimeter />
      <SearchBox />
      <div className="toolbar__right">
        <div className="segmented" role="group" aria-label="detail level">
          {AUDIENCES.map((a) => (
            <button
              key={a}
              className="segmented__option"
              onClick={() => setAudience(a)}
              aria-pressed={audience === a}
            >
              {a}
            </button>
          ))}
        </div>
        <button
          className="toolbar__icon"
          onClick={toggleTheme}
          aria-label={`theme: ${theme}`}
          title={`Switch to ${nextTheme(theme)} theme`}
        >
          ◐
        </button>
      </div>
    </header>
  );
}
```

- [ ] **Step 8: Write `chrome.css`'s toolbar section**

Create `apps/web/src/styles/chrome.css`:

```css
.toolbar {
  display: flex; align-items: center; gap: var(--s-5);
  padding: var(--s-3) var(--s-5);
  background: var(--surface-2);
  border-bottom: 1px solid var(--rule);
}
.toolbar__word {
  font-size: var(--t-word); font-weight: 700; font-stretch: 125%;
  letter-spacing: 0.15em; color: var(--tx-1);
}
.toolbar__right { margin-left: auto; display: flex; align-items: center; gap: var(--s-3); }
.toolbar__icon {
  background: none; border: 1px solid var(--rule); border-radius: var(--r-sm);
  color: var(--tx-3); cursor: pointer; padding: var(--s-1) var(--s-3); font-size: var(--t-sm);
}
.toolbar__icon:hover { color: var(--tx-1); border-color: var(--accent-soft); }

.segmented { display: flex; border: 1px solid var(--rule); border-radius: var(--r-sm); overflow: hidden; }
.segmented__option {
  background: none; border: none; cursor: pointer;
  padding: var(--s-1) var(--s-4);
  font: inherit; font-size: var(--t-sm); text-transform: capitalize;
  color: var(--tx-3);
}
.segmented__option:hover { color: var(--tx-1); }
/* aria-pressed is the state, so it drives the styling too — no second source of truth. */
.segmented__option[aria-pressed='true'] {
  background: var(--accent); color: var(--accent-on); font-weight: 500;
}

/* The altimeter. Each band's fill is its layer's altitude step, mapped here rather than in the
 * component so the ramp lives in exactly one place. */
.altimeter { display: flex; border: 1px solid var(--rule); border-radius: var(--r-sm); overflow: hidden; }
.altimeter__band {
  display: flex; flex-direction: column; justify-content: center;
  padding: var(--s-1) var(--s-4);
  border-right: 1px solid var(--rule);
}
.altimeter__band:last-child { border-right: none; }
.altimeter__band[data-layer='Context'] { background: var(--alt-1-bg); }
.altimeter__band[data-layer='Container'] { background: var(--alt-2-bg); }
.altimeter__band[data-layer='Component'] { background: var(--alt-3-bg); }
.altimeter__layer { line-height: 1.1; }
.altimeter__band--current .altimeter__layer { color: var(--accent-text); }
.altimeter__band--current .altimeter__crumb { color: var(--tx-1); font-weight: 600; }
.altimeter__crumb {
  background: none; border: none; cursor: pointer; padding: 0;
  font: inherit; font-size: var(--t-sm); color: var(--tx-2); text-align: left;
}
.altimeter__crumb:hover { color: var(--tx-1); }
```

Add `@import './styles/chrome.css';` to `styles.css`, and **delete** the now-dead `.toolbar`, `.breadcrumbs`, `.breadcrumbs .crumb`, `.breadcrumbs .crumb:hover` and `.breadcrumbs .crumb-sep` rules from it (old lines 3, 43-46).

- [ ] **Step 9: Wire it into `App.tsx`**

Replace the whole `<header className="toolbar">…</header>` block (lines 148-171) with `<Toolbar />`. Delete the now-unused `audience`, `setAudience`, `crumbs`, `setFocus` reads and the `breadcrumbPath` import if nothing else in `App` uses them — check with `grep -n "setFocus\|crumbs\|audience" src/App.tsx` before deleting; `setFocus` may still be referenced.

- [ ] **Step 10: Run the suite**

Run: `cd apps/web && pnpm test`
Expected: all green, 7 new tests. `App.test.tsx` may assert on breadcrumb DOM — if it queries `.crumb`, update it to `.altimeter__crumb`; the accessible names are unchanged, so `getByRole('button', { name })` queries keep working.

- [ ] **Step 11: Commit**

```bash
cd C:/projects/hyphae
git status --short
git add apps/web/src/Altimeter.tsx apps/web/src/Toolbar.tsx apps/web/src/App.tsx \
        apps/web/src/styles/chrome.css apps/web/src/styles.css \
        apps/web/test/Altimeter.test.tsx apps/web/test/Toolbar.test.tsx apps/web/test/App.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): make the breadcrumb an altimeter

The design's signature element. Each crumb sits in a band tinted with its
own layer's altitude step and only the deepest is lit, so how deep you are
in the model is readable without reading the names. The band fill is mapped
from a data-layer attribute in CSS rather than from LAYER_COLOR in the
component, so the altitude ramp still lives in exactly one place.

The audience toggle becomes a real segmented control driven off aria-pressed
— the accessibility state and the styling now have one source of truth
instead of an inline fontWeight — and the theme toggle gets a home.

Toolbar is extracted from App, which was carrying 30 lines of header markup
on top of the panel-collapse logic it already has enough of.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: The outline panel

**Files:**
- Modify: `apps/web/src/TreePanel.tsx:90-119,121-150,207-234`, `apps/web/src/styles/chrome.css`, `apps/web/src/styles.css`
- Test: `apps/web/test/TreePanel.test.tsx`

**Interfaces:**
- Consumes: tokens; `.hy-micro` from Task 2.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Write the failing tests**

Append to `apps/web/test/TreePanel.test.tsx`. Read the file first for its existing model fixture and render helper, and reuse them.

```tsx
  // Focus and selection were both colour states and fought each other. Separating "which view am I
  // in" (a bar) from "what did I click" (a fill) lets a row be both at once and stay legible.
  it('distinguishes the focused row from the selected row', () => {
    useStore.setState({ focusId: 'ctr', selectedId: 'cmp' });
    const { container } = renderTree();
    expect(container.querySelector('.tree-row--current')).toBeTruthy();
    expect(container.querySelector('.tree-row--active')).toBeTruthy();
    expect(container.querySelector('.tree-row--current.tree-row--active')).toBeFalsy();
  });

  it('renders an indent guide per depth level', () => {
    const { container } = renderTree();
    const deepest = container.querySelectorAll('.tree-row')[2];
    expect(deepest.querySelectorAll('.tree-guide').length).toBeGreaterThan(0);
  });

  it('puts a step order in its own mono column', () => {
    // …select a flow first, per the existing tests' helper…
    const { container } = renderTree();
    expect(container.querySelector('.tree-step__order')).toBeTruthy();
  });
```

Also assert the CSS invariant the way this file already does for the step marker — read `chrome.css` and check the rule:

```tsx
  it('gives the focused row an accent bar rather than a fill', () => {
    const css = readFileSync(join(process.cwd(), 'src/styles/chrome.css'), 'utf-8');
    expect(css).toMatch(/\.tree-row--current\s*\{[^}]*border-left-color:\s*var\(--accent\)/);
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/web && pnpm vitest run test/TreePanel.test.tsx`
Expected: FAIL on the new assertions.

- [ ] **Step 3: Change the markup**

In `renderNode` (line 98), replace the `style={{ paddingLeft: 4 + depth * 12 }}` inline indent with explicit guides, so depth is a visible hairline rather than empty space:

```tsx
        <div className={rowClass(node.id === selectedId, node.id === focusId)}>
          {Array.from({ length: depth }, (_, i) => <span key={i} className="tree-guide" />)}
```

In `renderFlow`'s step list (line 134), split the order out of the label:

```tsx
              <li key={s.order} className={s.kind === 'Return' ? 'tree-step--return' : undefined}>
                <span className="tree-step__order">{s.order}.</span>
                <button
                  className="tree-label"
                  onClick={() => revealStep(s)}
                  title={`${nodeName.get(s.from) ?? s.from} → ${nodeName.get(s.to) ?? s.to}`}
                >
                  {s.message || <em>(no caption)</em>}
                  {offView.has(s.order) ? <span className="tree-offview" title="not drawn in this view"> ↗</span> : null}
                </button>
              </li>
```

Keep the `list-style: none` comment's reasoning intact — it is now doubly true, since the order has its own element.

Replace `<strong>Outline</strong>` (line 210) with `<span className="tree-panel__title">Outline</span>` and each `Section`'s title div with `className="tree-section__title hy-micro"`.

- [ ] **Step 4: Add the outline rules to `chrome.css`**

Append, and **delete** the corresponding old rules from `styles.css` (old lines 6-32):

```css
.tree-panel {
  flex: 1; min-width: 0; height: 100%;
  display: flex; flex-direction: column;
  background: var(--surface-1);
  border-right: 1px solid var(--rule);
  font-size: var(--t-sm); color: var(--tx-2);
}
.tree-panel--collapsed { align-items: center; padding-top: var(--s-3); }
.tree-panel__head {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--s-3) var(--s-4);
  border-bottom: 1px solid var(--rule);
}
.tree-panel__title {
  font-size: var(--t-micro); font-weight: 600; font-stretch: 112%;
  letter-spacing: 0.1em; text-transform: uppercase; color: var(--tx-1);
}
.tree-panel__body { flex: 1; min-height: 0; overflow: auto; padding-bottom: var(--s-5); }
.tree-panel__body--split { overflow: hidden; padding-bottom: 0; }
.tree-split__pane { padding-bottom: var(--s-5); }
.tree-split__pane--detail { border-top: 1px solid var(--rule); }
.tree-toggle {
  background: none; border: none; color: var(--tx-3); cursor: pointer;
  font-size: var(--t-md); padding: 0 var(--s-1);
}
.tree-toggle:hover { color: var(--tx-1); }
.tree-section__title { padding: var(--s-3) var(--s-4) var(--s-1); }

/* A row carries two independent states. --current is "the view you are in" and gets the accent bar;
 * --active is "the thing you clicked" and gets a luminance lift. Both at once must stay readable. */
.tree-row {
  display: flex; align-items: center; gap: var(--s-1);
  padding: var(--s-1) var(--s-4) var(--s-1) 0;
  border-left: 2px solid transparent;
}
.tree-row--active { background: var(--surface-3); }
.tree-row--current { background: var(--surface-3); border-left-color: var(--accent); }
.tree-row--current .tree-label { color: var(--tx-1); font-weight: 600; }
/* One hairline per depth level: the nesting becomes visible instead of implied by empty space. */
.tree-guide { flex: none; width: 11px; height: 17px; margin-left: var(--s-3); border-left: 1px solid var(--rule); }
.tree-twisty {
  flex: none; width: 14px; background: none; border: none; padding: 0;
  color: var(--tx-3); cursor: pointer; font-size: var(--t-micro); line-height: 1;
}
.tree-label {
  flex: 1; min-width: 0; text-align: left; background: none; border: none;
  color: inherit; font: inherit; cursor: pointer;
  padding: var(--s-1) var(--s-2); border-radius: var(--r-sm);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.tree-label:hover { background: var(--surface-3); color: var(--tx-1); }

/* list-style:none — the rows print the step's own `order`, which is authored and need not be a
   contiguous 1..n, so the browser's decimal marker would both duplicate and contradict it. The
   order now has its own element, which is also what lets it line up in a column. */
.tree-steps { list-style: none; margin: 0; padding: var(--s-1) var(--s-3) var(--s-2) var(--s-5); }
.tree-steps li { display: flex; align-items: baseline; gap: var(--s-3); line-height: 1.4; }
.tree-step__order {
  flex: none; min-width: 16px; text-align: right;
  font-family: var(--font-mono); font-size: var(--t-micro); color: var(--tx-3);
}
.tree-step--return .tree-label { color: var(--tx-3); }
.tree-offview { color: var(--accent-text); }
.tree-detail { padding: var(--s-1) var(--s-3) var(--s-2) var(--s-7); }
.tree-anchor { display: block; color: var(--accent-text); }
.tree-members { margin: var(--s-1) 0 0; padding-left: var(--s-6); }
.tree-member--static { color: var(--tx-3); }
.tree-dim { color: var(--tx-3); font-weight: 400; }
.tree-empty { padding: var(--s-1) var(--s-5); color: var(--tx-3); }
.tree-invalid { color: var(--warn); }
```

- [ ] **Step 5: Use the warning token for `⚠`**

In `TreePanel.tsx`, wrap both `⚠` occurrences (lines 128, 160, 169) so the one warning colour is applied:

```tsx
{invalid.flows.has(f.id) ? <span className="tree-invalid" title="references something missing"> ⚠</span> : null}
```

- [ ] **Step 6: Run the suite**

Run: `cd apps/web && pnpm test`
Expected: all green. If an existing test asserts `paddingLeft` on a tree row, it must change — depth is now guides, not padding. Update it to count `.tree-guide` elements and note that in the commit body.

- [ ] **Step 7: Commit**

```bash
cd C:/projects/hyphae
git status --short
git add apps/web/src/TreePanel.tsx apps/web/src/styles/chrome.css apps/web/src/styles.css \
        apps/web/test/TreePanel.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): restyle the outline against the tokens

Depth was implied by padding-left; it is now a hairline guide per level, so
nesting is visible rather than inferred.

The bigger fix is that focus and selection were both colour fills and fought
each other. --current ("the view you are in") now takes the accent bar and
--active ("what you clicked") takes a luminance lift, so a row that is both
stays legible — which it could not be when both meant a background.

Flow step orders move into their own mono column. The list-style:none
reasoning still holds and now has a second reason: the order is its own
element, which is what lets it align.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: The inspector

**Files:**
- Create: `apps/web/src/fieldLayout.ts`, `apps/web/test/fieldLayout.test.ts`
- Modify: `apps/web/src/FieldRows.tsx`, `apps/web/src/SidePanel.tsx`, `apps/web/src/ConnectionList.tsx`, `apps/web/src/styles/chrome.css`, `apps/web/src/styles.css`
- Test: `apps/web/test/SidePanel.test.tsx`, `apps/web/test/FieldRows.test.tsx`

**Interfaces:**
- Consumes: `FieldDef` (`{ key, label?, type, description? }`) and `FieldType` (`'text' | 'list' | 'number' | 'boolean' | 'enum' | 'ref'`) from `@hyphae/schema`.
- Produces: `fieldLayout(type: FieldType | 'core', value: unknown): 'grid' | 'stack'`.

- [ ] **Step 1: Write the failing `fieldLayout` test**

Create `apps/web/test/fieldLayout.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { fieldLayout } from '../src/fieldLayout';

describe('fieldLayout', () => {
  // FieldDef.type cannot decide this on its own: `summary` and `description` are BOTH 'text' and
  // only one of them is prose. The value's own shape is the deciding input.
  it('grids a short text value', () => {
    expect(fieldLayout('text', 'Owns the active path')).toBe('grid');
  });

  it('stacks a long text value', () => {
    expect(fieldLayout('text', 'Holds the current path and re-plans when the segment is exhausted or the world changes underneath it.')).toBe('stack');
  });

  it('stacks a multi-line text value even when it is short', () => {
    expect(fieldLayout('text', 'one\ntwo')).toBe('stack');
  });

  it('always stacks a list, because entries need their own lines', () => {
    expect(fieldLayout('list', ['a'])).toBe('stack');
  });

  it('grids the scalar types regardless of value', () => {
    expect(fieldLayout('number', 42)).toBe('grid');
    expect(fieldLayout('boolean', false)).toBe('grid');
    expect(fieldLayout('enum', 'sync')).toBe('grid');
    expect(fieldLayout('ref', 'some-uuid')).toBe('grid');
  });

  it('treats core rows by the same rule', () => {
    expect(fieldLayout('core', 'Component')).toBe('grid');
    expect(fieldLayout('core', 'x'.repeat(80))).toBe('stack');
  });

  it('grids an absent value rather than reserving a block for it', () => {
    expect(fieldLayout('text', undefined)).toBe('grid');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && pnpm vitest run test/fieldLayout.test.ts`
Expected: FAIL — cannot resolve `../src/fieldLayout`.

- [ ] **Step 3: Write `fieldLayout.ts`**

```ts
import type { FieldType } from '@hyphae/schema';

export type FieldLayout = 'grid' | 'stack';

/** Past this a value stops being a scalar you scan and becomes prose you read. Chosen against the
 *  Baritone model: summaries sit well under it, descriptions and invariants well over. */
const PROSE_CHARS = 64;

/**
 * Which of the inspector's two treatments a field gets: a scannable label/value grid row, or a
 * stacked block at full panel width.
 *
 * The field's declared type is not enough on its own — `summary` and `description` are both `text`
 * and only one of them is prose — so the decision also reads the value. `'core'` covers the rows
 * that are not profile fields at all (`description`, `root`, `parent`), which go through the same
 * rule rather than getting a bespoke one.
 */
export function fieldLayout(type: FieldType | 'core', value: unknown): FieldLayout {
  if (type === 'list') return 'stack';
  if (type === 'number' || type === 'boolean' || type === 'enum' || type === 'ref') return 'grid';
  const text = typeof value === 'string' ? value : '';
  return text.includes('\n') || text.length > PROSE_CHARS ? 'stack' : 'grid';
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/web && pnpm vitest run test/fieldLayout.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Apply the two treatments in `FieldRows.tsx`**

`Row` gains a layout prop and renders either a grid row or a stacked block. Keep `ListRow`'s and `NodeLink`'s behaviour exactly as it is — including `ListRow` rendering nothing when empty, and `NodeLink` dimming an id that no longer resolves.

```tsx
export function Row({ label, title, layout = 'grid', children }: {
  label: string; title?: string; layout?: FieldLayout; children: React.ReactNode;
}) {
  if (layout === 'stack') {
    return (
      <div className="field field--stack" title={title}>
        <span className="field__label hy-micro">{label}</span>
        <div className="field__value">{children}</div>
      </div>
    );
  }
  return (
    <div className="field field--grid" title={title}>
      <span className="field__label hy-micro">{label}</span>
      <span className="field__value">{children}</span>
    </div>
  );
}
```

In `FieldRow`, pass the computed layout through:

```tsx
  const layout = fieldLayout(def.type, value);
  // …
  return (
    <Row label={label} title={def.description} layout={layout}>
      {def.type === 'boolean' ? (value ? 'yes' : 'no') : String(value)}
    </Row>
  );
```

and give `ListRow` `layout="stack"` implicitly by rendering it with the stacked classes.

- [ ] **Step 6: Replace the default headings in `SidePanel.tsx`**

Every `<h2>`/`<h3>`/`<h4>` goes. The node branch's header becomes:

```tsx
      <aside className="panel">
        <div className="panel__name">{node.name}</div>
        <div className="panel__chips">
          <span className="chip">{node.type}</span>
          {node.role && <span className="chip" title="Shape archetype, overriding this node kind's default.">{node.role}</span>}
        </div>
```

(the `type` and `role` `Row`s they replace are deleted), and the connection headings become:

```tsx
            <div className="panel__section hy-micro">connections · {total}</div>
            {outgoing.length > 0 && (
              <>
                <div className="panel__subsection hy-micro">outgoing · {outgoing.length}</div>
                <ConnectionList connections={outgoing} />
              </>
            )}
```

Apply the same treatment to the connection and rollup branches (`Connection`, `Realized by (n)`, `Rolled-up connection`). Pass `layout={fieldLayout('core', node.description)}` to the `description` `Row`, and `layout="grid"` to `root` and `parent`.

- [ ] **Step 7: Add the inspector rules to `chrome.css`**

Append, and delete the old `.panel`, `.conn-dir`, `.field`, `.field__value`, `.field__list`, `.field__link` rules from `styles.css` (old lines 5, 33-38):

```css
.panel {
  flex: 1; min-width: 0; height: 100%; box-sizing: border-box;
  background: var(--surface-1);
  border-left: 1px solid var(--rule);
  padding: var(--s-5); overflow-y: auto;
}
.panel__name {
  font-size: var(--t-lg); font-weight: 600; font-stretch: 112%;
  letter-spacing: -0.005em; color: var(--tx-1);
}
.panel__chips { display: flex; flex-wrap: wrap; gap: var(--s-2); margin: var(--s-3) 0 var(--s-5); }
.chip {
  font-family: var(--font-mono); font-size: var(--t-micro);
  color: var(--tx-2); background: var(--chip);
  border-radius: var(--r-sm); padding: var(--s-1) var(--s-3);
}
.panel__section, .panel__subsection {
  border-top: 1px solid var(--rule);
  margin-top: var(--s-5); padding-top: var(--s-4);
}
.panel__subsection { border-top: none; margin-top: var(--s-4); padding-top: 0; }

/* Two treatments, one rule. Short scalars grid so they can be scanned; prose stacks so it gets the
 * panel's full measure. fieldLayout() decides which, from the value's own shape. */
.field--grid {
  display: grid; grid-template-columns: 72px 1fr;
  column-gap: var(--s-4); row-gap: var(--s-1);
  align-items: baseline; margin-bottom: var(--s-2);
}
.field--stack {
  border-top: 1px solid var(--rule);
  margin-top: var(--s-5); padding-top: var(--s-4);
}
.field--stack .field__value { margin-top: var(--s-2); }
.field__label { line-height: 1.5; }
.field__value {
  font-size: var(--t-md); line-height: 1.45; color: var(--tx-1);
  white-space: pre-wrap; overflow-wrap: anywhere;
}
.field__list {
  margin: var(--s-2) 0 0; padding-left: var(--s-6);
  font-family: var(--font-mono); font-size: var(--t-sm);
  color: var(--tx-2); overflow-wrap: anywhere;
}
.field__link {
  background: none; border: none; padding: 0; cursor: pointer; text-align: left;
  font: inherit; font-size: var(--t-md); color: var(--accent-text);
}
.field__link:hover { text-decoration: underline; }

.conn { display: flex; align-items: center; gap: var(--s-3); padding: var(--s-1) 0; }
.conn__dot { flex: none; width: 6px; height: 6px; border-radius: 50%; }
.conn__verb { font-family: var(--font-mono); font-size: var(--t-micro); color: var(--tx-2); }
.conn__name {
  font-size: var(--t-sm); color: var(--tx-1);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.rollup-list { list-style: none; margin: var(--s-3) 0 0; padding: 0; max-height: 320px; overflow: auto; }
.rollup-list li { padding: var(--s-2) 0; border-bottom: 1px solid var(--rule); font-size: var(--t-sm); }
.rollup-list button {
  background: none; border: none; padding: 0; cursor: pointer;
  font: inherit; font-size: var(--t-sm); color: var(--accent-text);
}
.rollup-list button:hover { text-decoration: underline; }
.rollup-list small { color: var(--tx-3); }
```

- [ ] **Step 8: Give connection rows their verb dot**

In `ConnectionList.tsx`, render each row with the verb-class colour as an inline `background` on the dot — this is the one place a token has to reach a runtime value, since the verb class is per connection:

```tsx
import { c4Backend, verbClassOf } from '@hyphae/schema';
import { VERB_CLASS_COLOR } from './reactflow';
// …
  const cls = verbClassOf(c4Backend, c.verb) ?? 'control';
  return (
    <div className="conn" key={c.id}>
      <span className="conn__dot" style={{ background: VERB_CLASS_COLOR[cls] }} />
      <span className="conn__verb">{c.verb}</span>
      <span className="conn__name">{nameOf(other)}</span>
    </div>
  );
```

Read the existing `ConnectionList.tsx` first — it already resolves the counterpart name and is only 33 lines; preserve whatever it does for navigation.

- [ ] **Step 9: Run the suite**

Run: `cd apps/web && pnpm test`
Expected: `SidePanel.test.tsx` will fail wherever it queries `getByRole('heading', …)` or asserts on `type`/`role` `Row`s — those are now `.panel__name` and `.chip`. Update those queries; do not reinstate the headings. Confirm the tests still assert the *behaviour* (a thin node renders a short panel; `codeRefs` render; a dangling ref dims) rather than the markup.

- [ ] **Step 10: Commit**

```bash
cd C:/projects/hyphae
git status --short
git add apps/web/src/fieldLayout.ts apps/web/src/FieldRows.tsx apps/web/src/SidePanel.tsx \
        apps/web/src/ConnectionList.tsx apps/web/src/styles/chrome.css apps/web/src/styles.css \
        apps/web/test/fieldLayout.test.ts apps/web/test/SidePanel.test.tsx apps/web/test/FieldRows.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): give the inspector a real hierarchy

The panel rendered browser-default h2/h3/h4 at default margins, so a node's
name, its Connections heading and the Outgoing/Incoming split had no
deliberate relationship. Name, chips and micro-labelled sections replace
them.

Fields now get one of two treatments, decided by a new pure fieldLayout():
short scalars grid so they can be scanned, prose stacks so it gets the
panel's full measure. FieldDef.type cannot decide this alone — summary and
description are both 'text' and only one is prose — so the value's own shape
is an input, and the core rows that are not profile fields at all go through
the same rule rather than a bespoke one.

Connection rows gain a verb-class dot, which is the one place a token has to
reach a runtime value since the class is per connection.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Floats, separators, and the last literals

**Files:**
- Modify: `apps/web/src/Legend.tsx`, `apps/web/src/FilterPanel.tsx`, `apps/web/src/SearchBox.tsx`, `apps/web/src/GhostGroupNode.tsx`, `apps/web/src/styles/chrome.css`, `apps/web/src/styles/canvas.css`, `apps/web/src/styles.css`
- Test: `apps/web/test/tokens.test.ts` (remove the file filter), `apps/web/test/Legend.test.tsx`

**Interfaces:**
- Consumes: `LAYER_COLOR`, `VERB_CLASS_COLOR` from Task 4.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Widen the no-literals test to the whole tree**

In `apps/web/test/tokens.test.ts`, delete the `TASK4_FILES` filter added in Task 4 Step 8, so the assertion covers all of `src`.

- [ ] **Step 2: Run it to see exactly what is left**

Run: `cd apps/web && pnpm vitest run test/tokens.test.ts`
Expected: FAIL, listing every remaining literal with its file. That list is this task's worklist.

- [ ] **Step 3: Move the Legend's inline styles into CSS**

`Legend.tsx` currently carries 13 inline style objects. Replace them with classes, keeping `LAYER_COLOR[l].bg` / `.border` and `VERB_CLASS_COLOR[cls]` as the only inline values (they are per-item data, exactly like the connection dot). Add a **Layers** section label change: the legend now explains altitude, so title that section `Altitude` and add a one-line note that brightness is depth.

```tsx
const swatch = (bg: string, border: string) => ({ background: bg, borderColor: border });
// …
      <div className="legend__row"><span className="legend__box" style={swatch(LAYER_COLOR[l].bg, LAYER_COLOR[l].border)} />{l}</div>
```

Add to `chrome.css`:

```css
/* Floating canvas surfaces. Translucent with a blur so the diagram stays visible behind them,
 * rather than the opaque white cards with drop shadows these used to be. */
.float {
  background: color-mix(in srgb, var(--surface-2) 86%, transparent);
  backdrop-filter: blur(6px);
  border: 1px solid var(--rule); border-radius: var(--r-md);
  font-size: var(--t-sm); color: var(--tx-2);
}
.float__toggle {
  display: block; width: 100%; text-align: left;
  background: none; border: none; cursor: pointer;
  padding: var(--s-2) var(--s-4);
  font: inherit; font-size: var(--t-sm); font-weight: 600; color: var(--tx-1);
}
.float__body { padding: var(--s-1) var(--s-5) var(--s-4); line-height: 1.7; }
.legend__group { font-weight: 600; color: var(--tx-1); margin: var(--s-3) 0 var(--s-1); }
.legend__note { color: var(--tx-3); }
.legend__row { display: flex; align-items: center; gap: var(--s-3); }
.legend__box { flex: none; width: 12px; height: 12px; border: 1px solid; border-radius: 2px; }
.legend__line { flex: none; width: 20px; height: 0; border-top: 2px solid var(--tx-3); }
.legend__line--dashed { border-top-style: dashed; border-top-color: var(--edge-derived); }
.legend__shape { position: relative; display: inline-block; width: 20px; height: 14px; }

.filter { min-width: 130px; padding: var(--s-4) var(--s-5); }
.filter__group { margin-bottom: var(--s-3); }
.filter__swatch { display: inline-block; width: 10px; height: 2px; }
```

`color-mix` needs a Baseline-2023 browser; the app already requires a modern one for `backdrop-filter`. If you would rather not depend on it, use `var(--surface-2)` opaque and drop the blur — note which you chose.

- [ ] **Step 4: Add the altitude row to the Legend**

The ramp is now a deliberate encoding, so the key has to say so:

```tsx
          <div className="legend__group">Altitude</div>
          <div className="legend__note">brighter is deeper — Context to Component</div>
```

Update `apps/web/test/Legend.test.tsx` to assert the altitude section exists alongside the existing layer/edge/role/verb assertions.

- [ ] **Step 5: Retokenise `SearchBox` and `GhostGroupNode`**

`SearchBox.tsx:66,73` — the dropdown becomes `className="float search__menu"` with the active item at `background: var(--surface-3)`; add to `chrome.css`:

```css
.search__menu {
  position: absolute; z-index: 10; margin: 0; padding: 0; list-style: none;
  max-height: 280px; overflow-y: auto; min-width: 220px;
}
.search__option { padding: var(--s-1) var(--s-4); cursor: pointer; }
.search__option--active { background: var(--surface-3); color: var(--tx-1); }
```

`GhostGroupNode.tsx` — move its 5 inline styles to the existing `.region--ghost` classes in `canvas.css`.

- [ ] **Step 6: Separators**

Replace the separator rules in `styles.css` (old lines 56-59) — move them into `chrome.css`, keeping the comment about `data-separator` being the documented styling hook:

```css
/* Resize separators. The library sets no cursor of its own and its `data-separator` attribute
   (inactive | hover | active | focus | disabled) is the documented styling hook, since a
   Separator's className cannot override its flex-grow/flex-shrink. */
[data-separator] { background: transparent; transition: background 120ms ease; }
[data-separator]:hover,
[data-separator='active'],
[data-separator='focus'] { background: var(--accent-soft); }
.sep--v { width: 5px; cursor: col-resize; }
.sep--h { height: 5px; cursor: row-resize; }
```

- [ ] **Step 7: `styles.css` is now only imports**

It should contain exactly four lines:

```css
@import './styles/tokens.css';
@import './styles/base.css';
@import './styles/chrome.css';
@import './styles/canvas.css';
```

Add a test asserting that, so nobody drops a one-off rule back into the entry file:

```ts
it('styles.css is only imports', () => {
  const entry = readFileSync(join(SRC, 'styles.css'), 'utf-8');
  const meaningful = entry.split('\n').map((l) => l.trim())
    .filter((l) => l && !l.startsWith('/*') && !l.startsWith('*'));
  expect(meaningful.every((l) => l.startsWith('@import'))).toBe(true);
});
```

- [ ] **Step 8: Run everything**

Run: `cd apps/web && pnpm test`
Expected: all green, including the now-unfiltered no-literals assertion.

- [ ] **Step 9: Commit**

```bash
cd C:/projects/hyphae
git status --short
git add apps/web/src/Legend.tsx apps/web/src/FilterPanel.tsx apps/web/src/SearchBox.tsx \
        apps/web/src/GhostGroupNode.tsx apps/web/src/styles/chrome.css \
        apps/web/src/styles/canvas.css apps/web/src/styles.css \
        apps/web/test/tokens.test.ts apps/web/test/Legend.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): retokenise the floats and retire the last literals

The legend and filter were opaque white cards with drop shadows sitting on
the diagram; they are now translucent blurred surfaces, so the graph stays
visible behind them. The legend also gains an altitude row — brightness is
now a deliberate encoding, so the key that explains the visual language has
to explain it.

styles.css is reduced to four @imports, and the no-colour-literals
assertion is unfiltered from here on: every value in apps/web/src now comes
from tokens.css. A test pins both, so a one-off hex or a stray rule in the
entry file fails rather than quietly accumulating.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: The one animated moment

**Files:**
- Modify: `apps/web/src/Canvas.tsx:149-180` (the generated highlight CSS), `apps/web/src/styles/canvas.css`
- Test: `apps/web/test/Canvas.test.tsx`

**Interfaces:**
- Consumes: `overlay.participatingEdges` and `overlay.edgeSteps` from `computeFlowOverlay`, already computed in `Canvas`.
- Produces: nothing.

- [ ] **Step 1: Write the failing test**

Append to `apps/web/test/Canvas.test.tsx`, following the existing `hlCss(container)` pattern — React Flow renders zero edges in jsdom, so the generated stylesheet is the only observable thing.

```tsx
  // The single orchestrated moment in the design: a flow's participating edges pulse, which reads
  // as movement through the graph. Everything else only transitions on hover.
  it('animates the participating edges when a flow is selected', () => {
    useStore.setState({ selectedFlowId: 'flow-1' });   // reuse this file's flow fixture
    const { container } = render(<Canvas />);
    expect(hlCss(container)).toContain('hyphae-pulse');
  });

  it('does not animate when no flow is selected', () => {
    useStore.setState({ selectedFlowId: null });
    const { container } = render(<Canvas />);
    expect(hlCss(container)).not.toContain('hyphae-pulse');
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && pnpm vitest run test/Canvas.test.tsx`
Expected: FAIL — `hyphae-pulse` not found.

- [ ] **Step 3: Define the keyframes in `canvas.css`**

```css
/* The design's one orchestrated animation: a dash travelling along a selected flow's edges. The
 * dash pattern is set here rather than inline so a reduced-motion user still gets the dashes
 * (which distinguish the flow's edges) without the movement. base.css neutralises the duration. */
@keyframes hyphae-pulse {
  from { stroke-dashoffset: 24; }
  to { stroke-dashoffset: 0; }
}
```

- [ ] **Step 4: Emit the rule for participating edges only**

In `Canvas.tsx`'s `highlightCss`, inside the `if (edgeSel.length)` branch, add the animation to the participating edge paths — only when a flow is what is driving the highlight:

```ts
      if (flowActive) {
        rules.push(
          `${edgeSel.map((s) => `${s} .react-flow__edge-path`).join(',')}`
          + '{stroke-dasharray:6 6;animation:hyphae-pulse 1.2s linear infinite}',
        );
      }
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd apps/web && pnpm vitest run test/Canvas.test.tsx`
Expected: PASS.

- [ ] **Step 6: Check it in the browser and against reduced motion**

With the servers running, select a flow from the outline and confirm the participating edges pulse in step order. Then enable the OS "reduce motion" setting (or emulate it in DevTools: Rendering → Emulate CSS `prefers-reduced-motion`) and confirm the dashes remain but stop moving.

- [ ] **Step 7: Run the full suite and commit**

```bash
cd C:/projects/hyphae/apps/web && pnpm test
cd C:/projects/hyphae
git status --short
git add apps/web/src/Canvas.tsx apps/web/src/styles/canvas.css apps/web/test/Canvas.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): pulse a selected flow's edges

The design spends its whole motion budget here. A flow is a sequence, and a
dash travelling along its participating edges says so in a way a static
highlight cannot.

The dash pattern lives in CSS rather than inline so that a reduced-motion
user still gets the dashes — which are what distinguish the flow's edges —
while base.css neutralises the movement. Asserted through the generated
highlight stylesheet, since React Flow renders zero edges under jsdom.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Update the living docs and verify the whole thing

CLAUDE.md requires the living docs to change in the same branch as the behaviour.

**Files:**
- Modify: `README.md`, `docs/SPEC.md`
- Modify: `docs/superpowers/plans/2026-07-30-viewer-visual-design.md` (tick every box)

- [ ] **Step 1: Update `README.md`**

Find the section describing the viewer's behaviour and add: the theme toggle (dark default, light available, remembered per browser), the altimeter breadcrumb and what its bands mean, and the fact that brightness encodes altitude. Keep the existing tone — short declarative sentences about what the viewer does.

- [ ] **Step 2: Update `docs/SPEC.md` §9**

Add to the UX principles list, next to the existing "Legibility budget" bullet:

```markdown
- **Luminance is state, hue is meaning.** Altitude (Context → Container → Component), selection and
  focus are expressed as light level; the chromatic budget belongs to the five verb classes, which
  are the one thing on the canvas that needs colour to be told apart. Dark is the default; the light
  theme is warm paper rather than an inversion. Every value comes from
  `apps/web/src/styles/tokens.css`.
```

- [ ] **Step 3: Check §6.3's colour claim is still accurate**

`docs/SPEC.md:149` says `verb` is "shown on the edge and colored by class". Still true. Confirm no sentence elsewhere in SPEC.md or MODEL.md claims a *specific* colour for a layer or verb class — `grep -n "blue\|green\|violet\|purple\|tint" docs/SPEC.md docs/MODEL.md README.md` — and fix any that do.

- [ ] **Step 4: Tick every checkbox in this plan**

- [ ] **Step 5: Full verification**

Run, and paste the output into the final report rather than summarising it:

```bash
cd C:/projects/hyphae
pnpm -r test
pnpm -r build
git status --short          # must show only hyphae-baritone.json as untracked
```

Expected: 523 baseline + the tests added by Tasks 1-9, all green. Build clean.

- [ ] **Step 6: Look at the finished thing in both themes**

```bash
HYPHAE_FILE=$(pwd)/apps/server/hyphae-baritone.json pnpm server   # terminal 1
pnpm web                                                          # terminal 2
```

Walk the real Baritone model in both themes and check the five things this design claims:

1. Drilling from root to a component visibly brightens (dark) / densifies (light) the diagram.
2. The altimeter tells you your depth before you read the names.
3. Verb classes are distinguishable from each other, and the rollup violet is distinguishable from all five.
4. A focused-and-selected outline row is legible as both.
5. Selecting a flow pulses its edges in order, and long descriptions in the inspector are stacked while short scalars are gridded.

- [ ] **Step 7: Commit**

```bash
cd C:/projects/hyphae
git add README.md docs/SPEC.md docs/superpowers/plans/2026-07-30-viewer-visual-design.md
git commit -m "$(cat <<'EOF'
docs: describe the viewer's visual language

README gains the theme toggle and the altimeter; SPEC.md §9 gains the rule
the design is built on — luminance is state, hue is meaning — and a pointer
to tokens.css as the one place any value lives.

Ticks the plan's boxes.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Plan self-review

Checked against the spec, section by section.

**Spec coverage:** Design thesis → Task 1 (`tokens.css` header comment states the rule) and enforced by Tasks 4-8. Token system, all four tables → Task 1. Type → Task 2. Toolbar and altimeter → Task 5. Outline → Task 6. Inspector, including `fieldLayout` → Task 7. Canvas → Task 4. Floats and separators → Task 8. Canvas literals → Task 4 (canvas) + Task 8 (chrome), with the guard test widening between them. Theme switching → Task 3. Motion → Task 9. Quality floor → Task 1 (`contrast.test.ts`) + Task 2 (focus ring, reduced motion). File layout → Tasks 1, 2, 5, 8 (Task 8 Step 7 proves the end state). Testing → the tests named in the spec exist in Tasks 1, 3, 7, plus the literal guard the spec did not name. Living docs → Task 10. Out of scope → the Global Constraints "do not touch" list.

**Placeholder scan:** no TBD/TODO. Two steps are deliberately conditional rather than vague, and both say exactly how to decide: Task 2 Step 2 (which Archivo axes shipped — inspect `node_modules`, drop `font-stretch` if only weight) and Task 4 Steps 2-3 (whether `var()` resolves in a generated `<marker>` and in `MiniMap` — look in a browser, add `token()` for the failing site only). Task 6 Step 1 and Task 7 Step 9 tell the implementer to read the existing test file first for its fixtures rather than inventing them, which is a real instruction, not a gap.

**Type consistency:** `fieldLayout(type, value)` is declared in Task 7's Interfaces, defined in Step 3, consumed in Steps 5-6 with the same name and argument order. `Theme`/`initialTheme`/`applyTheme`/`nextTheme`/`THEME_KEY` are declared in Task 3's Interfaces and used identically in Task 5's `Toolbar`. `token()` is added in Task 3's file but only in Task 4's conditional step — that is intentional and stated. `LAYER_COLOR` and `VERB_CLASS_COLOR` keep their exact shapes through Tasks 4, 7 and 8. Class names introduced in one task and used in another (`.hy-micro` from Task 2; `.float` from Task 8 used by `SearchBox` in the same task; `.tree-guide`, `.tree-step__order`, `.altimeter__band--current`) match their test assertions.

**One gap I am accepting:** Task 4's no-literals test is filtered to that task's files and widened in Task 8. A cleaner alternative — write the test once in Task 8 — would leave Tasks 4-7 unguarded against reintroducing hexes. The filter is the lesser evil and both tasks say so.

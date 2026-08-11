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

/** Every pair the spec's quality floor claims. Text on its own surface, at 4.5:1.
 *
 * Checked (by reading the CSS, not just guessing) which text tokens actually render on which
 * surfaces before adding to this list:
 *  - --tx-3 on every --alt-*-bg: .region__handle (the focus region's own title bar, now painted at
 *    the focus node's altitude per canvas.css) and .hy-micro/.altimeter__layer (the non-current
 *    altimeter band's layer label) both sit at --tx-3, over whichever altitude background their
 *    layer resolves to.
 *  - --tx-3 on --surface-3: .tree-twisty, .tree-dim, .tree-step__order and .tree-step--return's
 *    label all sit at --tx-3, and a selected (--surface-3) tree row can carry any of them.
 *  - --tx-1 / --tx-2 on --surface-3: .tree-row--current .tree-label (--tx-1), .tree-label:hover
 *    (--tx-1), .search__option--active (--tx-1), and a merely-active row's default label colour
 *    (--tx-2, inherited from .tree-panel) all render over --surface-3. Included for completeness;
 *    both already clear the floor comfortably in each theme.
 *  - --accent-text on --alt-3-bg: .altimeter__band--current .altimeter__layer, when the deepest
 *    (Component) band is the current one — the lit altimeter label, the design's signature element.
 */
const PAIRS: Array<[string, string]> = [
  ['--tx-1', '--surface-1'], ['--tx-2', '--surface-1'], ['--tx-3', '--surface-1'],
  ['--tx-1', '--surface-2'], ['--tx-2', '--surface-2'], ['--tx-3', '--surface-2'],
  ['--tx-1', '--surface-3'], ['--tx-2', '--surface-3'], ['--tx-3', '--surface-3'],
  ['--tx-1', '--sub'], ['--tx-2', '--sub'], ['--tx-3', '--sub'],
  ['--tx-1', '--alt-1-bg'], ['--tx-1', '--alt-2-bg'], ['--tx-1', '--alt-3-bg'],
  ['--tx-2', '--alt-1-bg'], ['--tx-2', '--alt-2-bg'], ['--tx-2', '--alt-3-bg'],
  ['--tx-3', '--alt-1-bg'], ['--tx-3', '--alt-2-bg'], ['--tx-3', '--alt-3-bg'],
  // the edge line is also edge-label text, and the label sits on --surface-2
  ['--edge-line', '--surface-2'], ['--edge-derived', '--surface-2'],
  ['--accent-text', '--surface-1'], ['--accent-text', '--surface-2'], ['--accent-text', '--alt-3-bg'],
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

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

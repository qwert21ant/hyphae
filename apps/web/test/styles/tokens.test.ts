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
      '--edge-line',
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

  // The inverse guard: a token nobody references is dead — CSS silently accepts it, so nothing but
  // this test would ever catch it. This is what would have caught --sub sitting unused while the
  // canvas fell through to body's --surface-1. (--font-*/--t-*/--s-*/--r-* are excluded from the
  // "colour" test above but not from this one — a genuinely unused SPACE/type token is just as dead.)
  it('references every token declared in :root somewhere in src', () => {
    const referenced = new Set<string>();
    for (const file of walk(SRC)) {
      for (const m of readFileSync(file, 'utf-8').matchAll(/var\((--[\w-]+)/g)) referenced.add(m[1]);
    }
    const unused = [...dark.keys()].filter((n) => !referenced.has(n));
    expect(unused, `tokens declared in :root but never referenced: ${unused.join(', ')}`).toEqual([]);
  });

  // The verb vocabulary is gone, and with it the only thing hue ever meant on an edge. A stray
  // --verb-* token surviving in either theme would be a hue that means nothing — the exact failure
  // SPEC.md section 9 forbids.
  it('declares no verb tokens, in either theme', () => {
    for (const [label, t] of [['dark', dark], ['light', light]] as const) {
      const verbs = [...t.keys()].filter((n) => n.startsWith('--verb-'));
      expect(verbs, `${label}: --verb-* tokens survived the verb removal`).toEqual([]);
    }
  });
});

describe('colour literals', () => {
  // The whole point of the token layer: one place to change a colour. A literal anywhere else is a
  // value that cannot be themed and has no home. tokens.css is the one legitimate home for literals
  // — everything else must reference a var(...) instead.
  it('has no colour literal anywhere in src', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      if (file === join(SRC, 'styles', 'tokens.css')) continue;
      const text = readFileSync(file, 'utf-8');
      for (const m of text.matchAll(/#[0-9A-Fa-f]{3,8}\b/g)) offenders.push(`${file}: ${m[0]}`);
      for (const m of text.matchAll(/\b(rgba?|hsla?)\(/g)) offenders.push(`${file}: ${m[0]}`);
    }
    expect(offenders, `colour literals outside tokens.css:\n${offenders.join('\n')}`).toEqual([]);
  });
});

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

describe('styles.css', () => {
  it('styles.css is only imports', () => {
    const entry = readFileSync(join(SRC, 'styles.css'), 'utf-8');
    const meaningful = entry.split('\n').map((l) => l.trim())
      .filter((l) => l && !l.startsWith('/*') && !l.startsWith('*'));
    expect(meaningful.every((l) => l.startsWith('@import'))).toBe(true);
  });
});

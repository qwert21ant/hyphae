import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

  it('falls back to the preference when reading localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
    expect(initialTheme()).toBe('light');
  });

  it('still applies the theme when writing localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    applyTheme('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    // The write failed, but the attribute was still applied.
  });
});

describe('the pre-paint script in index.html', () => {
  // It duplicates theme.ts by necessity (an imported module would be a deferred fetch, which is
  // the flash we are avoiding). This test is what stops the two drifting apart by actually
  // executing the script's logic and asserting the outcomes.

  /** Run index.html's pre-paint script against stubbed globals and report what it set. */
  function runPrePaintScript(stored: string | null, prefersLight: boolean): string | null {
    const html = readFileSync(join(process.cwd(), 'index.html'), 'utf-8');
    const source = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1];
    expect(source, 'pre-paint script not found in index.html').toBeTruthy();

    let set: string | null = null;
    const fakeDocument = {
      documentElement: {
        setAttribute: (name: string, value: string) => { if (name === 'data-theme') set = value; },
      },
    };
    const fakeLocalStorage = { getItem: (k: string) => (k === 'hyphae.theme' ? stored : null) };
    const fakeWindow = { matchMedia: () => ({ matches: prefersLight }) };

    // eslint-disable-next-line no-new-func
    new Function('document', 'localStorage', 'window', source!)(fakeDocument, fakeLocalStorage, fakeWindow);
    return set;
  }

  it('script sets data-theme="light" when stored is light', () => {
    expect(runPrePaintScript('light', false)).toBe('light');
  });

  it('script leaves data-theme unset (returns null) when stored is dark', () => {
    expect(runPrePaintScript('dark', true)).toBe(null);
  });

  it('script sets data-theme="light" when junk stored and prefers light', () => {
    expect(runPrePaintScript('chartreuse', true)).toBe('light');
  });

  it('script leaves data-theme unset when junk stored and prefers dark', () => {
    expect(runPrePaintScript('chartreuse', false)).toBe(null);
  });

  it('script sets data-theme="light" when nothing stored and prefers light', () => {
    expect(runPrePaintScript(null, true)).toBe('light');
  });

  it('script leaves data-theme unset when nothing stored and prefers dark', () => {
    expect(runPrePaintScript(null, false)).toBe(null);
  });

  it('uses the same storage key as theme.ts', () => {
    const html = readFileSync(join(process.cwd(), 'index.html'), 'utf-8');
    expect(html).toContain(THEME_KEY);
  });
});

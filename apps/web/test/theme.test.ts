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
});

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

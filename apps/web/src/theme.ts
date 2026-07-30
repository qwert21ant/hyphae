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

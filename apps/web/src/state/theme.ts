/** Which palette `tokens.css` serves. Dark is the default and is expressed as the ABSENCE of the
 *  attribute — `:root` is already the dark block, so writing `data-theme="dark"` would give the
 *  same colours two sources of truth. */
export type Theme = 'dark' | 'light';

export const THEME_KEY = 'hyphae.theme';

const isTheme = (v: unknown): v is Theme => v === 'dark' || v === 'light';

/** The stored choice if there is a valid one, else the OS preference, else dark. A junk value in
 *  localStorage (hand-edited, or written by an older build) must not leave the app unstyled. */
export function initialTheme(): Theme {
  let stored: string | null = null;
  try {
    // typeof localStorage !== 'undefined' suppresses a ReferenceError for an undeclared identifier,
    // but does not catch SecurityError thrown by privacy-hardened browsers when the property is
    // accessed. Without this try/catch, initialTheme() would throw uncaught where the pre-paint
    // script in index.html degrades silently — they must fail the same way.
    if (typeof localStorage !== 'undefined') {
      stored = localStorage.getItem(THEME_KEY);
    }
  } catch {
    // Fall through: treat as if nothing was stored.
  }
  if (isTheme(stored)) return stored;
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches) {
    return 'light';
  }
  return 'dark';
}

export function applyTheme(theme: Theme): void {
  if (theme === 'light') document.documentElement.setAttribute('data-theme', 'light');
  else document.documentElement.removeAttribute('data-theme');
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Fail silently: the theme is still applied via the attribute, just not persisted.
  }
}

export const nextTheme = (t: Theme): Theme => (t === 'dark' ? 'light' : 'dark');

/**
 * Focus ↔ URL-hash mapping. The root view has no hash; a focused node lives at `#<id>`
 * (percent-encoded). The hash never reaches a server, so refresh and deep-links always
 * load the app and restore the focus without any SPA-fallback config.
 */

/** The focused node id encoded in `hash`, or null for the root view. */
export function hashToFocusId(hash: string): string | null {
  const raw = hash.replace(/^#/, '').trim();
  return raw.length ? decodeURIComponent(raw) : null;
}

/** The hash string for `focusId` (`''` for the root view). */
export function focusIdToHash(focusId: string | null): string {
  return focusId ? `#${encodeURIComponent(focusId)}` : '';
}

/**
 * Resolve the focus a hash should produce given which node ids exist. A hash naming an unknown
 * node (a stale or hand-typed deep-link) coerces to the root view and reports `rewrite: true`
 * so the caller can replace the bad URL instead of leaving it — or pushing a history entry for it.
 */
export function resolveHashFocus(
  hash: string,
  exists: (id: string) => boolean,
): { focusId: string | null; rewrite: boolean } {
  const wanted = hashToFocusId(hash);
  if (wanted && !exists(wanted)) return { focusId: null, rewrite: true };
  return { focusId: wanted, rewrite: false };
}

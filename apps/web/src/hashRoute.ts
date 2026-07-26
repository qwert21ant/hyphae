/**
 * View ↔ URL-hash mapping. The hash carries whichever selection *defines* the current view:
 * a focused node (`#node/<id>`), a selected flow (`#flow/<id>`), or a selected pattern
 * (`#pattern/<id>`); the root view has no hash. The hash never reaches a server, so refresh and
 * deep-links always load the app and restore the view without any SPA-fallback config.
 *
 * Every route is prefixed — a bare `#<id>` (the pre-Cluster-E focus-only form) no longer parses
 * and is treated like any other unresolvable hash: coerced to root with a rewrite.
 */

export type Route =
  | { kind: 'root' }
  | { kind: 'node'; id: string }
  | { kind: 'flow'; id: string }
  | { kind: 'pattern'; id: string };

export const ROOT_ROUTE: Route = { kind: 'root' };

const PREFIXES = ['node', 'flow', 'pattern'] as const;
type Prefixed = (typeof PREFIXES)[number];

/** The route encoded in `hash`: the root route for an empty hash, null when it doesn't parse. */
export function parseHash(hash: string): Route | null {
  const raw = hash.replace(/^#/, '').trim();
  if (!raw.length) return ROOT_ROUTE;
  const slash = raw.indexOf('/');
  if (slash < 0) return null;
  const prefix = raw.slice(0, slash);
  const id = decodeURIComponent(raw.slice(slash + 1));
  if (!id.length || !PREFIXES.includes(prefix as Prefixed)) return null;
  return { kind: prefix as Prefixed, id };
}

/** The hash string for `route` (`''` for the root view). Ids are percent-encoded, so an id
 *  containing `/` or `#` survives the round-trip. */
export function routeToHash(route: Route): string {
  return route.kind === 'root' ? '' : `#${route.kind}/${encodeURIComponent(route.id)}`;
}

/**
 * The route a store state maps to. A pattern replaces the canvas and a flow drives the focus, so
 * they outrank the focused node: while a flow is selected, stepping through it changes `focusId`
 * without changing the URL.
 */
export function routeOfState(s: { focusId: string | null; selectedFlowId: string | null; selectedPatternId: string | null }): Route {
  if (s.selectedPatternId) return { kind: 'pattern', id: s.selectedPatternId };
  if (s.selectedFlowId) return { kind: 'flow', id: s.selectedFlowId };
  if (s.focusId) return { kind: 'node', id: s.focusId };
  return ROOT_ROUTE;
}

/**
 * Resolve the route a hash should produce given what exists in the model. A hash naming an unknown
 * node/flow/pattern — or one that doesn't parse at all — coerces to the root view and reports
 * `rewrite: true` so the caller can replace the bad URL instead of leaving it, or pushing a
 * history entry for it.
 */
export function resolveHashRoute(
  hash: string,
  exists: { node: (id: string) => boolean; flow: (id: string) => boolean; pattern: (id: string) => boolean },
): { route: Route; rewrite: boolean } {
  const route = parseHash(hash);
  if (!route) return { route: ROOT_ROUTE, rewrite: true };
  if (route.kind !== 'root' && !exists[route.kind](route.id)) return { route: ROOT_ROUTE, rewrite: true };
  return { route, rewrite: false };
}

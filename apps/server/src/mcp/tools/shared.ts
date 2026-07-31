import type { CreatedEntity, ApiResult } from '../api';

/** What a create echoes back so the caller never has to re-look-up what it just wrote:
 *  the id plus enough identity to match it to the input — the name for a named entity
 *  (node/flow/pattern), the endpoints for a connection. */
type Identity = { id: string; name?: string; from?: string; to?: string };
export function identityOf(e: CreatedEntity): Identity {
  return e.name !== undefined
    ? { id: e.id, name: e.name }
    : e.from !== undefined || e.to !== undefined
      ? { id: e.id, from: e.from, to: e.to }
      : { id: e.id };
}

export async function runCreate(
  items: Record<string, unknown>[],
  fn: (i: Record<string, unknown>) => Promise<unknown>,
  key: 'node' | 'connection' | 'flow' | 'pattern',
) {
  const results: Array<Identity | { issues: unknown } | { error: unknown }> = [];
  let ok = true;
  for (const it of items) {
    const r = (await fn(it)) as ApiResult;
    const created = r?.[key];
    if (created?.id) results.push(identityOf(created));
    else { ok = false; results.push('issues' in (r ?? {}) ? { issues: r.issues } : { error: r?.error ?? 'failed' }); }
  }
  return ok ? { created: results as Identity[] } : { results };
}

export async function runVoid(calls: Array<() => Promise<unknown>>) {
  const results: Array<{ ok: true } | { issues: unknown } | { error: unknown }> = [];
  let ok = true;
  for (const call of calls) {
    const r = (await call()) as ApiResult;
    if (r && 'issues' in r) { ok = false; results.push({ issues: r.issues }); }
    else if (r && 'error' in r) { ok = false; results.push({ error: r.error }); }
    else results.push({ ok: true });
  }
  return ok ? { ok: true } : { results };
}

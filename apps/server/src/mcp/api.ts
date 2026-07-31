import { HyphaeModelSchema, type HyphaeModel } from '@hyphae/schema';

export interface HyphaeApi {
  getModel(): Promise<HyphaeModel>;
  createNode(input: unknown): Promise<unknown>;
  updateNode(id: string, patch: unknown): Promise<unknown>;
  deleteNode(id: string): Promise<unknown>;
  createConnection(input: unknown): Promise<unknown>;
  updateConnection(id: string, patch: unknown): Promise<unknown>;
  deleteConnection(id: string): Promise<unknown>;
  createFlow(input: unknown): Promise<unknown>;
  updateFlow(id: string, patch: unknown): Promise<unknown>;
  deleteFlow(id: string): Promise<unknown>;
  createPattern(input: unknown): Promise<unknown>;
  updatePattern(id: string, patch: unknown): Promise<unknown>;
  deletePattern(id: string): Promise<unknown>;
}

export type CreatedEntity = { id: string; name?: string; from?: string; to?: string; type?: string };
export type ApiResult = { node?: CreatedEntity; connection?: CreatedEntity; flow?: CreatedEntity; pattern?: CreatedEntity; issues?: unknown; error?: unknown };

/** HTTP client of the running Hyphae server (the single source of truth). */
export function httpApi(base: string): HyphaeApi {
  async function mutate(method: string, path: string, body?: unknown): Promise<unknown> {
    try {
      const res = await fetch(`${base}${path}`, {
        method,
        headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const txt = await res.text();
      return txt ? JSON.parse(txt) : { version: null };
    } catch (e) {
      return { error: `Hyphae server not reachable at ${base} — start it with \`pnpm --filter @hyphae/server dev\`. (${String(e)})` };
    }
  }
  return {
    getModel: async () => {
      const res = await fetch(`${base}/model`);
      if (!res.ok) throw new Error(`GET /model failed: ${res.status}`);
      return HyphaeModelSchema.parse(await res.json());
    },
    createNode: (input) => mutate('POST', '/nodes', input),
    updateNode: (id, patch) => mutate('PATCH', `/nodes/${id}`, patch),
    deleteNode: (id) => mutate('DELETE', `/nodes/${id}`),
    createConnection: (input) => mutate('POST', '/connections', input),
    updateConnection: (id, patch) => mutate('PATCH', `/connections/${id}`, patch),
    deleteConnection: (id) => mutate('DELETE', `/connections/${id}`),
    createFlow: (input) => mutate('POST', '/flows', input),
    updateFlow: (id, patch) => mutate('PATCH', `/flows/${id}`, patch),
    deleteFlow: (id) => mutate('DELETE', `/flows/${id}`),
    createPattern: (input) => mutate('POST', '/patterns', input),
    updatePattern: (id, patch) => mutate('PATCH', `/patterns/${id}`, patch),
    deletePattern: (id) => mutate('DELETE', `/patterns/${id}`),
  };
}

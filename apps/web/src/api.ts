import { HyphaeModelSchema, type HyphaeModel, type Node, type Connection } from '@hyphae/schema';

/** Non-2xx response carrying the parsed error body (e.g. {issues}). */
export class ApiError extends Error {
  constructor(public readonly status: number, public readonly body: unknown) {
    super(`request failed: ${status}`);
    this.name = 'ApiError';
  }
}

export async function loadModel(): Promise<{ model: HyphaeModel; version: number }> {
  const res = await fetch('/model');
  if (!res.ok) throw new Error(`GET /model failed: ${res.status}`);
  const version = Number(res.headers.get('X-Hyphae-Version') ?? '0');
  const model = HyphaeModelSchema.parse(await res.json());
  return { model, version };
}

async function mutate(method: string, path: string, body?: unknown): Promise<{ [k: string]: unknown }> {
  const res = await fetch(path, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = res.status === 204 ? {} : await res.json();
  if (!res.ok) throw new ApiError(res.status, json);
  return json;
}

export function createNode(input: { id: string; name: string; type: string; parentId?: string | null }): Promise<{ node: Node; version: number }> {
  return mutate('POST', '/nodes', input) as Promise<{ node: Node; version: number }>;
}
export function updateNode(id: string, patch: Partial<Node>): Promise<{ node: Node; version: number }> {
  return mutate('PATCH', `/nodes/${id}`, patch) as Promise<{ node: Node; version: number }>;
}
export function deleteNode(id: string): Promise<{ version: number }> {
  return mutate('DELETE', `/nodes/${id}`) as Promise<{ version: number }>;
}
export function createConnection(input: { id: string; from: string; to: string }): Promise<{ connection: Connection; version: number }> {
  return mutate('POST', '/connections', input) as Promise<{ connection: Connection; version: number }>;
}
export function updateConnection(id: string, patch: Partial<Connection>): Promise<{ connection: Connection; version: number }> {
  return mutate('PATCH', `/connections/${id}`, patch) as Promise<{ connection: Connection; version: number }>;
}
export function deleteConnection(id: string): Promise<{ version: number }> {
  return mutate('DELETE', `/connections/${id}`) as Promise<{ version: number }>;
}

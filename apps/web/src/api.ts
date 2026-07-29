import { HyphaeModelSchema, type HyphaeModel } from '@hyphae/schema';

/** The browser's whole conversation with the server: fetch the model, then follow SSE for changes.
 *  Writes go through MCP (or a direct edit of the JSON file), never through here. */
export async function loadModel(): Promise<{ model: HyphaeModel; version: number }> {
  const res = await fetch('/model');
  if (!res.ok) throw new Error(`GET /model failed: ${res.status}`);
  const version = Number(res.headers.get('X-Hyphae-Version') ?? '0');
  const model = HyphaeModelSchema.parse(await res.json());
  return { model, version };
}

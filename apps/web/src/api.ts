import { HyphaeModelSchema, type HyphaeModel } from '@hyphae/schema';

export async function loadModel(): Promise<HyphaeModel> {
  const res = await fetch('/model');
  if (!res.ok) throw new Error(`GET /model failed: ${res.status}`);
  return HyphaeModelSchema.parse(await res.json());
}

export async function saveModel(model: HyphaeModel): Promise<void> {
  const res = await fetch('/model', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(model),
  });
  if (!res.ok) throw new Error(`PUT /model failed: ${res.status}`);
}

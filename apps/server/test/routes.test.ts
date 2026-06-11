import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ModelStore } from '../src/store';
import { createApp } from '../src/routes';

let dir: string;
let app: ReturnType<typeof createApp>;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hyphae-'));
  app = createApp(new ModelStore(join(dir, 'hyphae.json')));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('routes', () => {
  it('GET /model returns the current model', async () => {
    const res = await app.request('/model');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.nodes).toEqual([]);
  });

  it('PUT /model stores a valid model', async () => {
    const get = await (await app.request('/model')).json();
    get.metadata.name = 'Via API';
    const res = await app.request('/model', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(get),
    });
    expect(res.status).toBe(200);
    const after = await (await app.request('/model')).json();
    expect(after.metadata.name).toBe('Via API');
  });

  it('PUT /model rejects an invalid model with 400', async () => {
    const res = await app.request('/model', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nope: true }),
    });
    expect(res.status).toBe(400);
  });
});

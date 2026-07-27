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

const post = (path: string, body: unknown) =>
  app.request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const createNode = async (body: unknown) => (await (await post('/nodes', body)).json()).node;

describe('routes', () => {
  it('GET /model returns the model and the version header', async () => {
    const res = await app.request('/model');
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Hyphae-Version')).toBe('0');
    expect((await res.json()).nodes).toEqual([]);
  });

  it('POST /nodes creates a node and bumps version', async () => {
    const res = await post('/nodes', { name: 'API', type: 'System', fields: { summary: 'x' } });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.node).toMatchObject({ name: 'API', type: 'System' });
    expect(body.version).toBe(1);
  });

  it('POST /nodes rejects an unknown type with 422 and issues', async () => {
    const res = await post('/nodes', { name: 'X', type: 'Bogus' });
    expect(res.status).toBe(422);
    expect((await res.json()).issues[0]).toMatchObject({ kind: 'unknown-type' });
  });

  it('PATCH /nodes/:id updates a node', async () => {
    const node = await createNode({ name: 'API', type: 'System', fields: { summary: 'x' } });
    const res = await app.request(`/nodes/${node.id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Renamed' }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).node.name).toBe('Renamed');
  });

  it('PATCH /nodes/:id returns 404 for a missing id', async () => {
    const res = await app.request('/nodes/nope', {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'X' }),
    });
    expect(res.status).toBe(404);
  });

  it('DELETE /nodes/:id cascades its connections', async () => {
    const a = await createNode({ name: 'A', type: 'System', fields: { summary: 'x' } });
    const b = await createNode({ name: 'B', type: 'System', fields: { summary: 'x' } });
    await post('/connections', { from: a.id, to: b.id, type: 'Dependency' });
    expect((await app.request(`/nodes/${a.id}`, { method: 'DELETE' })).status).toBe(200);
    const model = await (await app.request('/model')).json();
    expect(model.nodes.map((n: { id: string }) => n.id)).toEqual([b.id]);
    expect(model.connections).toEqual([]);
  });

  it('POST /connections rejects a dangling endpoint with 422', async () => {
    const a = await createNode({ name: 'A', type: 'System', fields: { summary: 'x' } });
    const res = await post('/connections', { from: a.id, to: 'ghost', type: 'Dependency' });
    expect(res.status).toBe(422);
    expect((await res.json()).issues[0]).toMatchObject({ kind: 'dangling-endpoint' });
  });

  it('PATCH /connections/:id updates a connection', async () => {
    const a = await createNode({ name: 'A', type: 'System', fields: { summary: 'x' } });
    const b = await createNode({ name: 'B', type: 'System', fields: { summary: 'x' } });
    const conn = (await (await post('/connections', { from: a.id, to: b.id, type: 'Dependency' })).json()).connection;
    const res = await app.request(`/connections/${conn.id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ description: 'calls' }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).connection.description).toBe('calls');
  });

  it('PATCH /connections/:id returns 404 for a missing id', async () => {
    const res = await app.request('/connections/nope', {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ description: 'x' }),
    });
    expect(res.status).toBe(404);
  });

  it('PUT /views/:layer/positions/:nodeId stores a position', async () => {
    const a = await createNode({ name: 'A', type: 'System', fields: { summary: 'x' } });
    const res = await app.request(`/views/Context/positions/${a.id}`, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ x: 5, y: 6 }),
    });
    expect(res.status).toBe(200);
    const model = await (await app.request('/model')).json();
    expect(model.views.find((v: { layer: string }) => v.layer === 'Context').nodePositions[a.id]).toEqual({ x: 5, y: 6 });
  });
});

describe('flow routes', () => {
  const seed = async () => {
    const a = await createNode({ name: 'A', type: 'System', fields: { summary: 'x' } });
    const b = await createNode({ name: 'B', type: 'System', fields: { summary: 'x' } });
    return { a, b };
  };
  const makeFlow = async (a: { id: string }, b: { id: string }) =>
    (await (await post('/flows', { name: 'F', steps: [{ order: 1, from: a.id, to: b.id, message: 'go', kind: 'Sync' }] })).json()).flow;

  it('POST /flows creates a flow', async () => {
    const { a, b } = await seed();
    const res = await post('/flows', { name: 'Views feed', steps: [{ order: 1, from: a.id, to: b.id, message: 'go', kind: 'Sync' }] });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.flow).toMatchObject({ name: 'Views feed' });
    expect(body.flow.steps[0].kind).toBe('Sync');
  });

  it('POST /flows rejects a step with a missing node (422)', async () => {
    const res = await post('/flows', { name: 'Bad', steps: [{ order: 1, from: 'ghost', to: 'ghost', message: '', kind: 'Sync' }] });
    expect(res.status).toBe(422);
    expect((await res.json()).issues[0]).toMatchObject({ kind: 'bad-flow-endpoint' });
  });

  it('PATCH /flows/:id updates a flow name', async () => {
    const { a, b } = await seed();
    const flow = await makeFlow(a, b);
    const res = await app.request(`/flows/${flow.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Renamed' }) });
    expect(res.status).toBe(200);
    expect((await res.json()).flow.name).toBe('Renamed');
  });

  it('PATCH /flows/:id returns 404 for a missing id', async () => {
    const res = await app.request('/flows/nope', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'X' }) });
    expect(res.status).toBe(404);
  });

  it('DELETE /flows/:id removes it', async () => {
    const { a, b } = await seed();
    const flow = await makeFlow(a, b);
    expect((await app.request(`/flows/${flow.id}`, { method: 'DELETE' })).status).toBe(200);
    const model = await (await app.request('/model')).json();
    expect(model.flows).toEqual([]);
  });
});

describe('pattern routes', () => {
  it('POST /patterns creates a pattern', async () => {
    const res = await app.request('/patterns', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Recorder', kind: 'state-machine', members: [{ name: 'Idle' }] }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { pattern: { id: string; kind: string } };
    expect(body.pattern.kind).toBe('state-machine');
  });

  it('POST /patterns rejects an unknown kind with 422', async () => {
    const res = await app.request('/patterns', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Bad', kind: 'octopus' }),
    });
    expect(res.status).toBe(422);
  });

  it('PATCH /patterns/:id updates a pattern name', async () => {
    const created = (await (await post('/patterns', { name: 'Recorder', kind: 'state-machine', members: [{ name: 'Idle' }] })).json()).pattern;
    const res = await app.request(`/patterns/${created.id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Renamed' }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).pattern.name).toBe('Renamed');
  });

  it('PATCH /patterns/:id returns 404 for a missing id', async () => {
    const res = await app.request('/patterns/nope', {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'X' }),
    });
    expect(res.status).toBe(404);
  });

  it('DELETE /patterns/:id removes it', async () => {
    const created = (await (await post('/patterns', { name: 'Recorder', kind: 'state-machine', members: [{ name: 'Idle' }] })).json()).pattern;
    expect((await app.request(`/patterns/${created.id}`, { method: 'DELETE' })).status).toBe(200);
    const model = await (await app.request('/model')).json();
    expect(model.patterns).toEqual([]);
  });
});

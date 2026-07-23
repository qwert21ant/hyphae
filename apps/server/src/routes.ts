import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { Context } from 'hono';
import type { ModelStore } from './store';
import { ValidationError, NotFoundError } from './errors';

function mapError(c: Context, e: unknown) {
  if (e instanceof ValidationError) return c.json({ issues: e.issues }, 422);
  if (e instanceof NotFoundError) return c.json({ error: e.message }, 404);
  return c.json({ error: 'invalid input', detail: String(e) }, 400);
}

export function createApp(store: ModelStore) {
  const app = new Hono();

  app.get('/model', (c) => {
    c.header('X-Hyphae-Version', String(store.version));
    return c.json(store.get());
  });

  app.post('/nodes', async (c) => {
    let body: unknown;
    try { body = await c.req.json(); } catch { return c.json({ error: 'invalid JSON' }, 400); }
    try { const node = store.addNode(body as never); return c.json({ node, version: store.version }, 201); }
    catch (e) { return mapError(c, e); }
  });

  app.patch('/nodes/:id', async (c) => {
    let body: unknown;
    try { body = await c.req.json(); } catch { return c.json({ error: 'invalid JSON' }, 400); }
    try { const node = store.updateNode(c.req.param('id'), body as never); return c.json({ node, version: store.version }); }
    catch (e) { return mapError(c, e); }
  });

  app.delete('/nodes/:id', (c) => {
    try { store.deleteNode(c.req.param('id')); return c.json({ version: store.version }); }
    catch (e) { return mapError(c, e); }
  });

  app.post('/connections', async (c) => {
    let body: unknown;
    try { body = await c.req.json(); } catch { return c.json({ error: 'invalid JSON' }, 400); }
    try { const connection = store.addConnection(body as never); return c.json({ connection, version: store.version }, 201); }
    catch (e) { return mapError(c, e); }
  });

  app.patch('/connections/:id', async (c) => {
    let body: unknown;
    try { body = await c.req.json(); } catch { return c.json({ error: 'invalid JSON' }, 400); }
    try { const connection = store.updateConnection(c.req.param('id'), body as never); return c.json({ connection, version: store.version }); }
    catch (e) { return mapError(c, e); }
  });

  app.delete('/connections/:id', (c) => {
    try { store.deleteConnection(c.req.param('id')); return c.json({ version: store.version }); }
    catch (e) { return mapError(c, e); }
  });

  app.post('/flows', async (c) => {
    let body: unknown;
    try { body = await c.req.json(); } catch { return c.json({ error: 'invalid JSON' }, 400); }
    try { const flow = store.addFlow(body as never); return c.json({ flow, version: store.version }, 201); }
    catch (e) { return mapError(c, e); }
  });

  app.patch('/flows/:id', async (c) => {
    let body: unknown;
    try { body = await c.req.json(); } catch { return c.json({ error: 'invalid JSON' }, 400); }
    try { const flow = store.updateFlow(c.req.param('id'), body as never); return c.json({ flow, version: store.version }); }
    catch (e) { return mapError(c, e); }
  });

  app.delete('/flows/:id', (c) => {
    try { store.deleteFlow(c.req.param('id')); return c.json({ version: store.version }); }
    catch (e) { return mapError(c, e); }
  });

  app.post('/patterns', async (c) => {
    let body: unknown;
    try { body = await c.req.json(); } catch { return c.json({ error: 'invalid JSON' }, 400); }
    try { const pattern = store.addPattern(body as never); return c.json({ pattern, version: store.version }, 201); }
    catch (e) { return mapError(c, e); }
  });

  app.patch('/patterns/:id', async (c) => {
    let body: unknown;
    try { body = await c.req.json(); } catch { return c.json({ error: 'invalid JSON' }, 400); }
    try { const pattern = store.updatePattern(c.req.param('id'), body as never); return c.json({ pattern, version: store.version }); }
    catch (e) { return mapError(c, e); }
  });

  app.delete('/patterns/:id', (c) => {
    try { store.deletePattern(c.req.param('id')); return c.json({ version: store.version }); }
    catch (e) { return mapError(c, e); }
  });

  app.put('/views/:layer/positions/:nodeId', async (c) => {
    let body: unknown;
    try { body = await c.req.json(); } catch { return c.json({ error: 'invalid JSON' }, 400); }
    const { x, y } = (body ?? {}) as { x?: number; y?: number };
    if (typeof x !== 'number' || typeof y !== 'number') return c.json({ error: 'x and y must be numbers' }, 400);
    try { store.setNodePosition(c.req.param('layer'), c.req.param('nodeId'), { x, y }); return c.json({ version: store.version }); }
    catch (e) { return mapError(c, e); }
  });

  app.get('/events', (c) =>
    streamSSE(c, async (stream) => {
      await stream.writeSSE({ event: 'hello', data: String(store.version) });
      const unsub = store.subscribe((v) => {
        void stream.writeSSE({ event: 'changed', data: String(v) }).catch(() => undefined);
      });
      await new Promise<void>((resolve) => stream.onAbort(() => { unsub(); resolve(); }));
    }),
  );

  return app;
}

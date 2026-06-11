import { Hono } from 'hono';
import type { ModelStore } from './store';

export function createApp(store: ModelStore) {
  const app = new Hono();

  app.get('/model', (c) => c.json(store.get()));

  app.put('/model', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'invalid JSON' }, 400);
    }
    try {
      const saved = store.set(body);
      return c.json(saved);
    } catch (err) {
      return c.json({ error: 'invalid model', detail: String(err) }, 400);
    }
  });

  return app;
}

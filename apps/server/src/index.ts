import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { ModelStore } from './store';
import { createApp } from './routes';

const MODEL_FILE = process.env.HYPHAE_FILE ?? join(process.cwd(), 'hyphae.json');
const PORT = Number(process.env.PORT ?? 5173);

const store = new ModelStore(MODEL_FILE);
const app = createApp(store);

// In prod, serve the built SPA. In dev, Vite serves the UI and proxies /model here.
const dist = join(process.cwd(), 'apps/web/dist');
if (existsSync(dist)) {
  app.use('/*', serveStatic({ root: './apps/web/dist' }));
}

process.on('SIGINT', async () => {
  await store.flush();
  process.exit(0);
});

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`Hyphae server on http://localhost:${info.port}  (model: ${MODEL_FILE})`);
});

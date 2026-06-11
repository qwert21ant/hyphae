import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { ModelStore } from './store';
import { createApp } from './routes';

const MODEL_FILE = process.env.HYPHAE_FILE ?? join(process.cwd(), 'hyphae.json');
const PORT = Number(process.env.PORT ?? 5173);

const store = new ModelStore(MODEL_FILE);
const app = createApp(store);

// In prod, serve the built SPA. In dev, Vite serves the UI and proxies /model here.
// Resolve the dist dir relative to this module so it works regardless of cwd
// (e.g. when launched via `pnpm --filter @hyphae/server start`, cwd is apps/server).
const here = dirname(fileURLToPath(import.meta.url)); // apps/server/src
const dist = join(here, '../../web/dist');            // -> apps/web/dist
if (existsSync(dist)) {
  // serveStatic's `root` is resolved relative to cwd, so hand it a cwd-relative path.
  const root = relative(process.cwd(), dist).split('\\').join('/');
  app.use('/*', serveStatic({ root }));
}

process.on('SIGINT', async () => {
  await store.flush();
  process.exit(0);
});

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`Hyphae server on http://localhost:${info.port}  (model: ${MODEL_FILE})`);
});

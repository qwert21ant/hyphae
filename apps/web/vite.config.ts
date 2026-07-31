import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: 3000,
    // Every server route the editor may call. Keep in step with apps/server/src/index.ts: a route
    // missing here 404s in dev only, which is easy to mistake for a broken endpoint.
    proxy: {
      '/model': 'http://localhost:5173',
      '/nodes': 'http://localhost:5173',
      '/connections': 'http://localhost:5173',
      '/flows': 'http://localhost:5173',
      '/patterns': 'http://localhost:5173',
      '/views': 'http://localhost:5173',
      '/events': 'http://localhost:5173',
    },
  },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/model': 'http://localhost:5173',
      '/nodes': 'http://localhost:5173',
      '/connections': 'http://localhost:5173',
      '/views': 'http://localhost:5173',
      '/events': 'http://localhost:5173',
    },
  },
});

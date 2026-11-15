import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { offlineServiceWorker } from './sw-plugin.js';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// Relative base so the same build works when served by Express and when
// loaded from Tauri's bundled asset protocol.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), offlineServiceWorker()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: true,
    proxy: {
      '/api': 'http://localhost:3456',
    },
  },
  build: {
    outDir: mode === 'friends' ? 'dist-local' : 'dist',
    target: ['es2021', 'safari15'],
    sourcemap: false,
  },
}));

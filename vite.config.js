import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: 'client',
  plugins: [react()],
  resolve: {
    // Never load the 6,000-icon barrel (it ran the dev server out of memory).
    // Any `from '@tabler/icons-react'` resolves to our slim per-icon module instead.
    alias: [{ find: /^@tabler\/icons-react$/, replacement: fileURLToPath(new URL('./client/src/icons.js', import.meta.url)) }],
  },
  build: { outDir: '../dist', emptyOutDir: true, chunkSizeWarningLimit: 1500 },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3001' },
  },
});

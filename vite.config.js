import { defineConfig } from 'vite';

// Relative base so the same build works at / and at /firefly-jar/ on GitHub Pages.
export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 1600, assetsInlineLimit: 0 },
  server: { host: '127.0.0.1', port: 5183, strictPort: false },
});

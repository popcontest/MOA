import { defineConfig } from 'vite';

export default defineConfig({
  root: import.meta.dirname,
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: {
    target: 'es2022',
    // One file, no separate chunks or asset requests: the published build has
    // to run under a CSP that blocks every external host.
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    rollupOptions: {
      output: { inlineDynamicImports: true, entryFileNames: 'app.js', assetFileNames: 'app.[ext]' },
    },
  },
});

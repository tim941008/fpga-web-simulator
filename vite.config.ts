import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages compatible Vite configuration (relative base path './')
export default defineConfig({
  base: './',
  plugins: [react()],
  optimizeDeps: {
    exclude: ['verilator-wasm'],
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    assetsDir: 'assets',
    chunkSizeWarningLimit: 8000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes('node_modules/binaryen') ||
            id.includes('binaryen-shim') ||
            id.includes('hdlwasm')
          ) {
            return 'binaryen-wasm-codegen';
          }
          if (
            id.includes('node_modules/react') ||
            id.includes('node_modules/lucide-react')
          ) {
            return 'vendor-ui';
          }
        },
      },
    },
  },
});

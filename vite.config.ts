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
  },
});

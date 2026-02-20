import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  main: {
    build: {
      outDir: 'dist/main',
      rollupOptions: {
        external: ['better-sqlite3', 'electron-store'],
      },
    },
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared'),
        '@main': resolve(__dirname, 'src/main'),
      },
    },
  },
  preload: {
    build: {
      outDir: 'dist/preload',
    },
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared'),
      },
    },
  },
  renderer: {
    root: 'src/renderer',
    build: {
      outDir: 'dist/renderer',
      rollupOptions: {
        input: resolve(__dirname, 'src/renderer/index.html'),
      },
    },
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared'),
        '@renderer': resolve(__dirname, 'src/renderer'),
      },
    },
    plugins: [react()],
  },
});

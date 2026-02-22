import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(resolve(fileURLToPath(new URL('.', import.meta.url)), 'package.json'), 'utf-8'));

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['@shared', '@main'] })],
    build: {
      outDir: 'dist/main',
    },
    resolve: {
      alias: {
        '@shared': resolve(root, 'src/shared'),
        '@main': resolve(root, 'src/main'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ['@shared'] })],
    build: {
      outDir: 'dist/preload',
    },
    resolve: {
      alias: {
        '@shared': resolve(root, 'src/shared'),
      },
    },
  },
  renderer: {
    root: 'src/renderer',
    build: {
      outDir: 'dist/renderer',
      rollupOptions: {
        input: resolve(root, 'src/renderer/index.html'),
      },
    },
    resolve: {
      alias: {
        '@shared': resolve(root, 'src/shared'),
        '@renderer': resolve(root, 'src/renderer'),
      },
    },
    plugins: [react(), tailwindcss()],
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
  },
});

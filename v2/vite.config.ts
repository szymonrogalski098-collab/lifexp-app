/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base: the same build works at /lifexp-app/v2/ on GitHub Pages and
  // at any path in local previews and tests.
  base: './',
  plugins: [preact()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.ts'],
  },
});

/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Relative base: the same build works at /lifexp-app/v2/ on GitHub Pages and
  // at any path in local previews and tests.
  base: './',
  plugins: [
    preact(),
    // Service Worker (src/sw.ts) and the web app manifest (docs/v2/PLAN.md 4.8, stage 1f).
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      // Registered by src/app/pwa.ts: the plugin's own helper reloads pages on update.
      injectRegister: false,
      injectManifest: {
        // Classic script: module Service Workers are too new on older iPhones.
        rollupFormat: 'iife',
        globPatterns: ['**/*.{js,css,html,woff2,png,webmanifest}'],
      },
      manifest: {
        // Its own name while v1 and v2 live side by side, so two installed icons are told apart.
        name: 'LifeXP v2',
        short_name: 'LifeXP v2',
        description: 'Zarabiaj punkty za produktywność i obowiązki, zamieniaj je na realne pieniądze.',
        lang: 'pl',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#0e0f13',
        theme_color: '#0e0f13',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        ],
      },
    }),
  ],
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

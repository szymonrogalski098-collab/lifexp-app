// Service Worker of v2 (docs/v2/PLAN.md 4.8, stage 1f). Scope /lifexp-app/v2/: the
// longer scope wins over v1's sw.js, so each version controls its own pages.
//
// - Precache: every hashed asset plus index.html, installed as one set. An offline
//   start always gets one consistent build (v1's bug B1 cannot happen).
// - Navigations: network first (3 s), so an online start always gets the newest
//   build; offline, or on a slow network, the precached index.html.
// - Updates install in the background and take over at once, without reloading
//   anyone: an open page keeps running, and app/pwa.ts reloads it only if it asks
//   for a chunk the deploy removed.
// - Only same-origin GETs are touched; Firebase traffic goes straight to the network.
/// <reference lib="webworker" />
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { addRoute, cleanupOutdatedCaches, matchPrecache, precache, type PrecacheEntry } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (string | PrecacheEntry)[] };

/** v1's sw.js deletes every cache that is not its own `lifexp-shell-*`; ours start with this. */
setCacheNameDetails({ prefix: 'lifexp-v2' });

const NETWORK_TIMEOUT_MS = 3000;

async function networkFirstShell(request: Request): Promise<Response> {
  const shell = () => matchPrecache('index.html');
  try {
    const response = await Promise.race([
      fetch(request, { cache: 'no-store' }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT_MS)),
    ]);
    if (response.ok) return response;
    return (await shell()) ?? response;
  } catch {
    return (await shell()) ?? Response.error();
  }
}

// Registered before the precache route, so navigations (including ./ and
// ./index.html) are network first instead of being answered from the precache.
registerRoute(new NavigationRoute(({ request }) => networkFirstShell(request)));

precache(self.__WB_MANIFEST);
addRoute();
cleanupOutdatedCaches();

self.addEventListener('install', () => {
  void self.skipWaiting();
});
clientsClaim();

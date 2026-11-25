// Offline support. App files are network-first; bump VERSION to clear old cached copies.
const VERSION = 'v1';
const SHELL = `emlearn-shell-${VERSION}`;
const DATA = 'emlearn-data';
const SHELL_FILES = [
  './', 'index.html', 'styles.css', 'app.js', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png',
];
const CONTENT = 'data/content.json';

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    await (await caches.open(SHELL)).addAll(SHELL_FILES);
    await (await caches.open(DATA)).add(CONTENT);
  })());
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('emlearn-shell-') && key !== SHELL) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  // Content: serve the cached copy instantly, refresh it in the background.
  if (url.pathname.endsWith(CONTENT)) {
    e.respondWith((async () => {
      const cache = await caches.open(DATA);
      const cached = await cache.match(CONTENT);
      const fresh = fetch(e.request).then((res) => {
        if (res.ok) cache.put(CONTENT, res.clone());
        return res;
      }).catch(() => cached);
      return cached || fresh;
    })());
    return;
  }

  // App shell: network first (so edits show up straight away), cached copy when offline.
  e.respondWith((async () => {
    try {
      const res = await fetch(e.request);
      if (res.ok) (await caches.open(SHELL)).put(e.request, res.clone());
      return res;
    } catch (err) {
      const cached = await caches.match(e.request, { ignoreSearch: true });
      if (cached) return cached;
      if (e.request.mode === 'navigate') return caches.match('index.html');
      throw err;
    }
  })());
});

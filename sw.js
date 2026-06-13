// Meshack 1.0 Service Worker
// Always fetch fresh from network (app is online-only, syncs with Google Sheets)
// Cache only the shell for offline fallback

const CACHE = 'meshack1-v1';
const SHELL = [
  '/MeBudget/',
  '/MeBudget/index.html',
  '/MeBudget/manifest.json',
  '/MeBudget/icons/icon-192x192.png',
  '/MeBudget/icons/icon-512x512.png'
];

// Install: cache the app shell
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

// Activate: clean old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: network-first (always get fresh data from Google Sheets)
// Fall back to cache only if offline
self.addEventListener('fetch', e => {
  // Skip non-GET and chrome-extension requests
  if (e.request.method !== 'GET') return;
  if (e.request.url.startsWith('chrome-extension')) return;

  // For Google Apps Script calls — always go network, never cache
  if (e.request.url.includes('script.google.com')) {
    e.respondWith(fetch(e.request));
    return;
  }

  // Network-first for everything else
  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Cache a copy of successful responses
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

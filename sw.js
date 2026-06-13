// Meshack 1.0 Service Worker — with background notifications
const CACHE = 'meshack1-v1';
const SHELL = [
  '/MeBudget/',
  '/MeBudget/index.html',
  '/MeBudget/manifest.json',
  '/MeBudget/icons/icon-192x192.png',
  '/MeBudget/icons/icon-512x512.png'
];

// ── Install ──────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

// ── Activate ─────────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => startNotificationLoop())
  );
});

// ── Fetch: network-first ──────────────────────────────────
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.startsWith('chrome-extension')) return;
  if (e.request.url.includes('script.google.com')) {
    e.respondWith(fetch(e.request));
    return;
  }
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

// ── Messages from the app ─────────────────────────────────
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SAVE_NOTIF_SETTINGS') {
    // Store settings in SW scope so they survive app close
    self._notifSettings = e.data.settings;
    startNotificationLoop();
  }
  if (e.data && e.data.type === 'GET_SETTINGS') {
    e.ports[0].postMessage({ settings: self._notifSettings || null });
  }
});

// ── Notification click ────────────────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes('MeBudget') && 'focus' in c) return c.focus();
      }
      if (clients.openWindow) return clients.openWindow('/MeBudget/');
    })
  );
});

// ── Background notification loop ──────────────────────────
let _loopTimer = null;

function startNotificationLoop() {
  if (_loopTimer) clearInterval(_loopTimer);

  // Check every 30 seconds — lightweight
  _loopTimer = setInterval(() => checkAndNotify(), 30000);
}

async function checkAndNotify() {
  const settings = self._notifSettings;
  if (!settings) return;

  const now  = new Date();
  const hhmm = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
  const today = now.toISOString().split('T')[0];

  const slots = {
    morning: {
      title: '🌅 Good morning, Meshack!',
      body:  "Time to log last night's expenses. Keep the streak going! 💪"
    },
    afternoon: {
      title: '☀️ Afternoon check-in',
      body:  "Have you logged your morning expenses? A minute now saves confusion later."
    },
    evening: {
      title: '🌙 Evening wrap-up',
      body:  "End of day — log today's expenses and check your balance."
    }
  };

  for (const slot of ['morning', 'afternoon', 'evening']) {
    const s = settings[slot];
    if (!s || !s.enabled) continue;
    if (s.time !== hhmm) continue;

    // Deduplicate — only once per slot per day
    const lastKey = `last_notif_${slot}`;
    const lastFired = self[lastKey];
    if (lastFired === today) continue;
    self[lastKey] = today;

    await self.registration.showNotification(slots[slot].title, {
      body:    slots[slot].body,
      icon:    '/MeBudget/icons/icon-192x192.png',
      badge:   '/MeBudget/icons/icon-96x96.png',
      tag:     'meshack_' + slot,
      vibrate: [200, 100, 200],
      data:    { slot, url: '/MeBudget/' },
      actions: [
        { action: 'open',   title: '📊 Open App' },
        { action: 'dismiss',title: '✕ Dismiss'   }
      ]
    });
  }
}

// Start the loop immediately when SW loads
startNotificationLoop();

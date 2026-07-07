// Meshack 1.0 Service Worker — reliable background notifications
// v3: uses IndexedDB for persistent settings (survives SW restart),
//     catch-up on activation, and no seconds restriction

const CACHE = 'meshack1-v2';
const SHELL = [
  '/MeBudget/',
  '/MeBudget/index.html',
  '/MeBudget/manifest.json',
  '/MeBudget/icons/icon-192x192.png',
  '/MeBudget/icons/icon-512x512.png'
];

const DB_NAME    = 'meshack_sw';
const DB_STORE   = 'kv';
const SETTINGS_KEY = 'notif_settings';
const FIRED_KEY    = 'notif_fired';   // { slot_YYYY-MM-DD: true }

// ── IndexedDB helpers (settings survive SW restart) ──────
function openDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore(DB_STORE);
    req.onsuccess = e => res(e.target.result);
    req.onerror   = e => rej(e.target.error);
  });
}
async function dbGet(key) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx  = db.transaction(DB_STORE, 'readonly');
    const req = tx.objectStore(DB_STORE).get(key);
    req.onsuccess = () => res(req.result);
    req.onerror   = () => rej(req.error);
  });
}
async function dbSet(key, value) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx  = db.transaction(DB_STORE, 'readwrite');
    const req = tx.objectStore(DB_STORE).put(value, key);
    req.onsuccess = () => res();
    req.onerror   = () => rej(req.error);
  });
}

// ── Notification content ──────────────────────────────────
const SLOTS = {
  morning: {
    title: '🌅 Good morning, Meshack!',
    body:  "Time to log last night's expenses. Keep the streak going! 💪"
  },
  afternoon: {
    title: '☀️ Afternoon check-in',
    body:  'Have you logged your morning expenses? A minute now saves confusion later.'
  },
  evening: {
    title: '🌙 Evening wrap-up',
    body:  "End of day — log today's expenses and check your balance."
  }
};

// ── Install ──────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

// ── Activate ─────────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => {
        // Catch-up: fire any missed notifications from today
        catchUpNotifications();
        // Start the reliable check loop
        startLoop();
      })
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
        caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

// ── Messages from app ─────────────────────────────────────
self.addEventListener('message', async e => {
  if (!e.data) return;

  if (e.data.type === 'SAVE_NOTIF_SETTINGS') {
    await dbSet(SETTINGS_KEY, e.data.settings);
    startLoop();
  }

  if (e.data.type === 'TEST_NOTIFICATION') {
    // Fire immediately — used by the Test button in Settings
    await self.registration.showNotification('🔔 Meshack 1.0 — Test', {
      body:    'Notifications are working correctly! ✅',
      icon:    '/MeBudget/icons/icon-192x192.png',
      badge:   '/MeBudget/icons/icon-96x96.png',
      tag:     'meshack_test',
      vibrate: [200, 100, 200],
      data:    { url: '/MeBudget/' }
    });
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

// ── Core: check and fire notifications ───────────────────
async function checkAndNotify() {
  const settings = await dbGet(SETTINGS_KEY);
  if (!settings) return;

  const now   = new Date();
  const hhmm  = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
  const today = now.toISOString().split('T')[0];

  for (const slot of ['morning', 'afternoon', 'evening']) {
    const s = settings[slot];
    if (!s || !s.enabled) continue;
    if (s.time !== hhmm) continue;

    // Deduplicate: only once per slot per day, persisted in IndexedDB
    const firedKey  = `${FIRED_KEY}_${slot}_${today}`;
    const alreadyFired = await dbGet(firedKey);
    if (alreadyFired) continue;

    await dbSet(firedKey, true);
    await self.registration.showNotification(SLOTS[slot].title, {
      body:    SLOTS[slot].body,
      icon:    '/MeBudget/icons/icon-192x192.png',
      badge:   '/MeBudget/icons/icon-96x96.png',
      tag:     'meshack_' + slot,
      vibrate: [200, 100, 200],
      data:    { slot, url: '/MeBudget/' },
      actions: [
        { action: 'open',    title: '📊 Open App' },
        { action: 'dismiss', title: '✕ Dismiss'   }
      ]
    });
  }
}

// ── Catch-up: fire any slot that was missed today ────────
async function catchUpNotifications() {
  const settings = await dbGet(SETTINGS_KEY);
  if (!settings) return;

  const now   = new Date();
  const today = now.toISOString().split('T')[0];
  const nowMins = now.getHours() * 60 + now.getMinutes();

  for (const slot of ['morning', 'afternoon', 'evening']) {
    const s = settings[slot];
    if (!s || !s.enabled) continue;

    const [h, m]      = s.time.split(':').map(Number);
    const slotMins    = h * 60 + m;
    // Only catch up if the slot was in the past today (within last 60 min)
    if (slotMins > nowMins || nowMins - slotMins > 60) continue;

    const firedKey     = `${FIRED_KEY}_${slot}_${today}`;
    const alreadyFired = await dbGet(firedKey);
    if (alreadyFired) continue;

    await dbSet(firedKey, true);
    await self.registration.showNotification(SLOTS[slot].title + ' (catch-up)', {
      body:    SLOTS[slot].body,
      icon:    '/MeBudget/icons/icon-192x192.png',
      badge:   '/MeBudget/icons/icon-96x96.png',
      tag:     'meshack_catchup_' + slot,
      vibrate: [100, 50, 100],
      data:    { slot, url: '/MeBudget/' }
    });
  }
}

// ── Reliable loop: check every 30s, no seconds restriction ─
let _loopTimer = null;
function startLoop() {
  if (_loopTimer) clearInterval(_loopTimer);
  // Check immediately then every 30s — no `getSeconds()` restriction
  checkAndNotify();
  _loopTimer = setInterval(() => checkAndNotify(), 30000);
}

// Boot on SW load
startLoop();

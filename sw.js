/* Maunon ruokinta – service worker: offline-välimuisti ja push-ilmoitukset. */
const VERSION = 'mauno-v1';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'src/logic.js', 'src/firebase-config.js', 'src/firebase-adapter.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Omat tiedostot: verkko ensin (päivitykset näkyvät heti), välimuisti jos verkkoa ei ole.
async function networkFirst(req) {
  const cache = await caches.open(VERSION);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (e) {
    const hit = await cache.match(req, { ignoreSearch: true })
      || (req.mode === 'navigate' ? (await cache.match('./')) || (await cache.match('index.html')) : null);
    if (hit) return hit;
    throw e;
  }
}
async function cacheFirst(req) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}
async function staleWhileRevalidate(req) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req);
  const net = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => hit);
  return hit || net;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) return e.respondWith(networkFirst(req));
  // Versioidut Firebase-SDK:t ja fonttitiedostot eivät muutu → cache-first
  if ((url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) || url.hostname === 'fonts.gstatic.com')
    return e.respondWith(cacheFirst(req));
  if (url.hostname === 'fonts.googleapis.com') return e.respondWith(staleWhileRevalidate(req));
  // Firestore- ja Auth-liikenne kulkee suoraan verkkoon (Firestore hoitaa oman offline-välimuistinsa).
});

/* ---------- push (FCM, data-viestit) ---------- */
self.addEventListener('push', e => {
  let p = {};
  try { p = e.data ? e.data.json() : {}; } catch (_) { p = { body: e.data ? e.data.text() : '' }; }
  const m = p.notification || p.data || p;
  e.waitUntil(self.registration.showNotification(m.title || 'Maunon ruokinta', {
    body: m.body || '', tag: m.tag || undefined, renotify: !!m.tag,
    icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', lang: 'fi', data: { url: './' },
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) if ('focus' in c) return c.focus();
    return self.clients.openWindow('./');
  }));
});

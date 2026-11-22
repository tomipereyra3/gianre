// Funciona sin señal: primero la red, si no hay, lo guardado.
const CACHE = 'gianre-v22';
const BASE = [
  './',
  './index.html',
  './styles.css',
  './js/app.js',
  './js/store.js',
  './js/ui.js',
  './js/report.js',
  './js/sync.js',
  './manifest.webmanifest',
  './icon.svg',
  './logo-gianre.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(BASE)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith('http')) return;
  // Archivos propios: siempre se revalidan, así cada cambio llega al toque.
  const propio = new URL(req.url).origin === self.location.origin;
  e.respondWith(
    fetch(propio ? new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' }) : req)
      .then((res) => {
        const copia = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copia));
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true })),
  );
});

// ---------- Avisos: llegan cifrados desde el servidor y se muestran como notificación.

self.addEventListener('push', (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {
    d = { cuerpo: e.data ? e.data.text() : '' };
  }
  e.waitUntil(
    self.registration.showNotification(d.titulo || 'Gianre', {
      body: d.cuerpo || '',
      icon: './icon-192.png',
      badge: './icon-192.png',
      tag: d.tag || 'gianre',
      data: { url: d.url || './' },
    }),
  );
});

// Tocar el aviso abre la app (o la trae al frente si ya estaba abierta).
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || './', self.registration.scope).href;
  e.waitUntil(
    (async () => {
      const abiertas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const c of abiertas) {
        if (c.url.startsWith(self.registration.scope) && 'focus' in c) return c.focus();
      }
      return self.clients.openWindow(url);
    })(),
  );
});

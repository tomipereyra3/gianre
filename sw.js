// Funciona sin señal: primero la red, si no hay, lo guardado.
const CACHE = 'gianre-v2';
const BASE = [
  './',
  './index.html',
  './styles.css',
  './js/app.js',
  './js/store.js',
  './js/ui.js',
  './js/report.js',
  './manifest.webmanifest',
  './icon.svg',
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

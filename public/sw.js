const CACHE_NAME = 'wpmenu-v3';
const STATIC_URLS = ['/manifest.json', '/telegram-web-app.js'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('/api/')) return;
  // Kritik dosyalar: her zaman network (cache mismatch önle)
  if (
    event.request.url.includes('panel.html') ||
    event.request.url.includes('menu.html') ||
    event.request.url.includes('/menu.js')
  ) {
    return event.respondWith(fetch(event.request));
  }
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((res) => {
      const clone = res.clone();
      if (res.status === 200 && event.request.url.startsWith(self.location.origin)) {
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
      }
      return res;
    }))
  );
});

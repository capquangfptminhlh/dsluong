/* Service Worker cho Nhà Thuốc Nhân Đức (Chuẩn PWA GPP - Network First Auto-Update v3.6) */
const CACHE_NAME = 'nhanduc-gpp-v3.9';
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/manifest.json',
  '/favicon.png',
  '/icons/icon-64.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-icon-512.png',
  '/icons/apple-touch-icon.png',
  '/kiotviet_nhanduc_7854.json'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch(() => {});
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(async (keys) => {
      const oldKeys = keys.filter((k) => k !== CACHE_NAME);
      await Promise.all(oldKeys.map((k) => caches.delete(k)));
      await self.clients.claim();
      if (oldKeys.length > 0) {
        const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const client of clientList) {
          try {
            await client.navigate(client.url);
          } catch (_) {}
        }
      }
    })
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;
  if (url.pathname.endsWith('/sw.js')) return;

  // Network-First cho mọi trang HTML, JS, CSS để luôn nhận bản cập nhật mới nhất ngay lập tức
  event.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then((networkRes) => {
        if (networkRes && networkRes.status === 200) {
          const copy = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return networkRes;
      })
      .catch(async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        if (req.mode === 'navigate') {
          const fallback = await caches.match('/index.html') || await caches.match('/');
          if (fallback) return fallback;
        }
        return new Response('Ứng dụng đang ngoại tuyến (Offline)', {
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

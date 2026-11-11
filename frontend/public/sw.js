/* Service Worker cho Nhà Thuốc Nhân Đức (Chuẩn PWA GPP) */
const CACHE_NAME = 'nhanduc-gpp-v2.1';
const PRECACHE_ASSETS = [
  '/',
  '/app',
  '/login',
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

// Cài đặt và tải trước các tài nguyên cốt lõi
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('Pre-cache một số file thất bại, tiếp tục...', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Kích hoạt: Xóa bộ nhớ cache phiên bản cũ và chiếm quyền kiểm soát ngay lập tức
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((k) => {
          if (k !== CACHE_NAME) {
            return caches.delete(k);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Xử lý request tài nguyên (Hỗ trợ chạy Offline 100% khi mất mạng)
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Chỉ can thiệp các request GET cùng origin hoặc CDN tĩnh
  if (req.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;

  // 1. Đối với điều hướng trang (SPA navigation: /app, /app/pos, /app/branches, v.v.):
  // Thử tải qua mạng trước, nếu mất mạng thì trả về index.html từ cache
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
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
          const fallback = await caches.match('/index.html') || await caches.match('/');
          if (fallback) return fallback;
          return new Response('Ứng dụng đang ngoại tuyến (Offline)', {
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
          });
        })
    );
    return;
  }

  // 2. Đối với static assets (JS, CSS, hình ảnh, font):
  // Chiến lược: Cache-first, sau đó cập nhật nền (Stale-While-Revalidate)
  const isStaticAsset =
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.woff2') ||
    url.pathname.endsWith('.json');

  if (isStaticAsset) {
    event.respondWith(
      caches.match(req).then((cachedRes) => {
        if (cachedRes) {
          // Trả về cache ngay và fetch ngầm để cập nhật phiên bản mới
          fetch(req).then((networkRes) => {
            if (networkRes && networkRes.status === 200) {
              caches.open(CACHE_NAME).then((cache) => cache.put(req, networkRes));
            }
          }).catch(() => {});
          return cachedRes;
        }
        return fetch(req).then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const copy = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return networkRes;
        });
      })
    );
    return;
  }

  // Mặc định: Network first với cache fallback
  event.respondWith(
    fetch(req).catch(() => caches.match(req))
  );
});

// Cho phép trang web gửi lệnh nâng cấp tức thì
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

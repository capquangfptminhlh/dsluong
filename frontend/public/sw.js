const CACHE_PREFIX = 'autotax-pwa';
const CACHE_VERSION = 'v6-20260916-pos-hotfix';
const SHELL_CACHE = `${CACHE_PREFIX}-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `${CACHE_PREFIX}-runtime-${CACHE_VERSION}`;
const FONT_CACHE = `${CACHE_PREFIX}-fonts-${CACHE_VERSION}`;

const APP_SHELL = [
  '/',
  '/app',
  '/manifest.webmanifest',
  '/autotax-logo.svg',
  '/autotax-pwa-v3.svg',
  '/autotax-pwa-maskable-v3.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.allSettled(
      APP_SHELL.map((url) => cache.add(new Request(url, { cache: 'reload' }))),
    );
    // Activate a newly downloaded worker immediately. The client reloads once on
    // controllerchange, so reopened POS/PWA sessions do not stay on an old bundle.
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((name) => name.startsWith(CACHE_PREFIX) && ![SHELL_CACHE, RUNTIME_CACHE, FONT_CACHE].includes(name))
        .map((name) => caches.delete(name)),
    );
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

function isCacheable(response) {
  if (!response) return false;
  if (!(response.ok || response.type === 'opaque')) return false;
  const cacheControl = response.headers?.get?.('cache-control') || '';
  return !/no-store|private/i.test(cacheControl);
}

async function putSafe(cacheName, request, response) {
  if (!isCacheable(response)) return;
  try {
    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
  } catch {
    // Storage can be unavailable or full on mobile; never break the live request.
  }
}

async function fetchWithTimeout(request, timeoutMs = 4500) {
  return Promise.race([
    fetch(request),
    new Promise((_, reject) => setTimeout(() => reject(new Error('network-timeout')), timeoutMs)),
  ]);
}

async function networkFirstNavigation(request) {
  try {
    // Bypass the browser HTTP cache for document navigations. Vite assets are
    // content-hashed, so a fresh index is the reliable pointer to the latest bundle.
    const liveRequest = new Request(request, { cache: 'no-store' });
    const response = await fetchWithTimeout(liveRequest);
    await putSafe(SHELL_CACHE, request, response);
    return response;
  } catch {
    const cache = await caches.open(SHELL_CACHE);
    return (
      (await cache.match(request, { ignoreSearch: true })) ||
      (await cache.match('/app')) ||
      (await cache.match('/')) ||
      Response.error()
    );
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then(async (response) => {
      await putSafe(cacheName, request, response);
      return response;
    })
    .catch(() => null);

  if (cached) {
    network.catch(() => null);
    return cached;
  }

  return (await network) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Business APIs must always stay live. Never serve stale stock, debt or POS data.
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  const isSameOrigin = url.origin === self.location.origin;
  const isStaticAsset = isSameOrigin && (
    url.pathname.startsWith('/assets/') ||
    ['script', 'style', 'image', 'font', 'worker'].includes(request.destination)
  );

  if (isStaticAsset) {
    event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
    return;
  }

  const isFontAsset =
    request.destination === 'font' ||
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com';

  if (isFontAsset) {
    event.respondWith(staleWhileRevalidate(request, FONT_CACHE));
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification?.data?.url || '/app';
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if ('focus' in client) {
        await client.focus();
        if ('navigate' in client) await client.navigate(target);
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});

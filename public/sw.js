// FootballIQ Progressive Web App Service Worker (PWA)
// Enables offline resilience, instant startup on Android & desktop, and immediate live updates.

const CACHE_NAME = 'footballiq-pwa-v2';
const CACHE_VERSION = 'v2-' + Date.now();
const STATIC_CACHE = `${CACHE_NAME}-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `${CACHE_NAME}-runtime-${CACHE_VERSION}`;

const STATIC_ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
];

// 1. Install & Pre-cache Core Shell Assets (without locking index.html to stale disk cache)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[PWA] Pre-cache non-blocking error:', err);
      });
    })
  );
  // Force active immediately
  self.skipWaiting();
});

// 2. Activate & Immediately Purge Stale Caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== STATIC_CACHE && key !== RUNTIME_CACHE) {
            console.log('[PWA] Purging outdated cache:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  // Claim all active clients so the new version controls immediately
  self.clients.claim();
});

// Allow clients to trigger skipWaiting
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// 3. Fetch Handler: Strict Network-First for Navigation (HTML) & APIs
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests and WebSocket/HMR
  if (event.request.method !== 'GET' || url.protocol.startsWith('ws')) {
    return;
  }

  // A. Navigation Requests (Opening the app, refreshing, changing page) -> Strict Network-First
  // This guarantees that installed Android PWAs always load the newest deployed HTML bundle!
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(async () => {
          // If completely offline, fall back to cached shell
          const cached = await caches.match(event.request);
          if (cached) return cached;
          const fallback = await caches.match('/index.html') || await caches.match('/');
          return fallback || Response.error();
        })
    );
    return;
  }

  // B. API Endpoints -> Network-First with Cache Fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          return (
            cached ||
            new Response(
              JSON.stringify({
                success: false,
                error: 'Offline mode: displaying cached tactical data.',
              }),
              { headers: { 'Content-Type': 'application/json' } }
            )
          );
        })
    );
    return;
  }

  // C. Static Hashed Assets (JS, CSS, Images, Fonts) -> Stale-While-Revalidate
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});

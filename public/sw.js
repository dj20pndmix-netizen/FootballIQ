// FootballIQ Progressive Web App Service Worker (PWA)
// Enables offline resilience, instant startup on Android & desktop, and background sync.

const CACHE_NAME = 'footballiq-pwa-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
];

// 1. Install & Cache Core App Shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('PWA pre-cache non-blocking error:', err);
      });
    })
  );
  self.skipWaiting();
});

// 2. Activate & Purge Stale Caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 3. Network First with Cache Fallback for dynamic content, Stale-While-Revalidate for assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests and WebSocket/HMR requests
  if (event.request.method !== 'GET' || url.protocol.startsWith('ws')) {
    return;
  }

  // API Requests: Network First with Cache Fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          return caches.match(event.request).then((cached) => {
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
          });
        })
    );
    return;
  }

  // App Shell & Static Assets: Stale While Revalidate
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});

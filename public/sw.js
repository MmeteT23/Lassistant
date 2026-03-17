self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  // Simple pass-through for PWA installability
  e.respondWith(fetch(e.request));
});

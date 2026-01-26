const CACHE_NAME = 'sports-card-portfolio-v1';

const PRECACHE_ASSETS = [
  '/',
  '/manifest.json',
  '/favicon.png',
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(PRECACHE_ASSETS);
    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter(name => name !== CACHE_NAME)
        .map(name => caches.delete(name))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  
  const url = new URL(event.request.url);
  
  if (url.pathname.startsWith('/api/')) {
    return;
  }
  
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    
    try {
      const networkResponse = await fetch(event.request);
      
      if (networkResponse.ok) {
        cache.put(event.request, networkResponse.clone());
      }
      
      return networkResponse;
    } catch (error) {
      const cachedResponse = await cache.match(event.request);
      
      if (cachedResponse) {
        return cachedResponse;
      }
      
      if (event.request.mode === 'navigate') {
        const fallback = await cache.match('/');
        if (fallback) return fallback;
      }
      
      throw error;
    }
  })());
});

// Retire legacy cache-first shells that could retain publisher credentials.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k.startsWith('naf-mobile-')).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});

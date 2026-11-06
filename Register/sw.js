const CACHE_NAME = 'cylinder-app-v5';
const APP_SHELL = [
    './',
    './index.html',
    './manifest.json',
    './js/app.js',
    './js/db.js',
    './js/modules/cylinderService.js',
    './js/modules/table.js',
    './js/modules/backup.js',
    './assets/css/style.css',
    './assets/icons/icon-192.png',
    './assets/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys
                    .filter((key) => key.startsWith('cylinder-app-') && key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    if (request.method !== 'GET' || url.origin !== self.location.origin) return;

    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request).catch(async () => {
                const cached = await caches.match('./index.html');
                return cached || new Response('Application unavailable offline.', { status: 503 });
            })
        );
        return;
    }

    event.respondWith(
        caches.match(request).then(async (cached) => {
            if (cached) return cached;
            try {
                const response = await fetch(request);
                if (response.ok) {
                    const cache = await caches.open(CACHE_NAME);
                    await cache.put(request, response.clone());
                }
                return response;
            } catch {
                return new Response('Resource unavailable offline.', { status: 503 });
            }
        })
    );
});
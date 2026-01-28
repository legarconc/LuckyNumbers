const CACHE_NAME = 'luckynumbers-v1';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './app.js',
    './styles.css',
    './manifest.json',
    './icons/icon-192.svg',
    './icons/icon-512.svg'
];

const DATA_CACHE_NAME = 'luckynumbers-data-v1';
const DATA_URLS = [
    './data/lotto.json',
    './data/euromillions.json'
];

// Install: cache app shell
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ASSETS_TO_CACHE))
            .then(() => self.skipWaiting())
    );
});

// Activate: clean old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME && key !== DATA_CACHE_NAME)
                    .map(key => caches.delete(key))
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch: serve from cache, update in background
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Handle data requests with network-first strategy
    if (DATA_URLS.some(dataUrl => url.pathname.endsWith(dataUrl.replace('./', '')))) {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    const responseClone = response.clone();
                    caches.open(DATA_CACHE_NAME).then(cache => {
                        cache.put(event.request, responseClone);
                    });
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // Handle app shell with cache-first strategy
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    // Update cache in background
                    fetch(event.request).then(freshResponse => {
                        caches.open(CACHE_NAME).then(cache => {
                            cache.put(event.request, freshResponse);
                        });
                    }).catch(() => {});
                    return response;
                }
                return fetch(event.request);
            })
    );
});

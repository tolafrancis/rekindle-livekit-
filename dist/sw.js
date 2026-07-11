// Bump these on any change that must purge old caches. The `activate` handler below
// deletes every cache not named here, so a version bump wipes stale content.
const STATIC_CACHE = 'prayer-app-static-v2';
const DYNAMIC_CACHE = 'prayer-app-dynamic-v2';

// Static assets to cache. NOTE: '/' and '/index.html' are deliberately NOT precached
// — precaching the HTML shell pinned users to whatever bundle was cached at install
// time (the cause of "deployed a new build but everyone still sees the old app", incl.
// the old hash-routing shell). The app shell is served network-first (see fetch below),
// so a fresh index.html — and thus the current JS bundle — is fetched on every load.
const STATIC_ASSETS = [
  '/manifest.json',
  '/icon-192.png',
  '/badge-72.png'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('Service Worker: Caching static assets');
        return Promise.allSettled(
          STATIC_ASSETS.map(url => 
            cache.add(url).catch(err => {
              console.warn(`Failed to cache ${url}:`, err);
              return null;
            })
          )
        );
      })
      .then(() => {
        console.log('Service Worker: Installation complete, skipping waiting');
        return self.skipWaiting();
      })
      .catch(err => {
        console.error('Service Worker: Installation failed:', err);
      })
  );
});

self.addEventListener("push", event => {
  const data = event.data.json();

  self.registration.showNotification(data.title, {
    body: data.body,
    data: { url: data.url }
  });
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url)
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Keep current caches, delete everything else
          if (![STATIC_CACHE, DYNAMIC_CACHE].includes(cacheName)) {
            console.log('Service Worker: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('Service Worker: Activation complete, claiming clients');
      return self.clients.claim();
    })
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip external API calls for now
  if (url.hostname.includes('supabase') || url.hostname.includes('databasepad')) {
    return;
  }

  // For images, use cache-first strategy
  if (request.destination === 'image' || /\.(png|jpg|jpeg|gif|svg|ico)$/i.test(url.pathname)) {
    event.respondWith(
      caches.match(request)
        .then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          return fetch(request)
            .then((networkResponse) => {
              // Cache successful responses
              if (networkResponse && networkResponse.status === 200) {
                const responseClone = networkResponse.clone();
                caches.open(DYNAMIC_CACHE)
                  .then((cache) => {
                    cache.put(request, responseClone);
                  });
              }
              return networkResponse;
            })
            .catch(() => {
              // Return placeholder for failed image loads
              return new Response('', { status: 404 });
            });
        })
    );
    return;
  }

  // For audio files, use cache-first
  if (request.url.includes('.mp3') || request.url.includes('.wav') || request.url.includes('.ogg') || /audio/i.test(request.destination)) {
    event.respondWith(
      caches.match(request)
        .then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          return fetch(request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                const responseClone = networkResponse.clone();
                caches.open(DYNAMIC_CACHE)
                  .then((cache) => {
                    cache.put(request, responseClone);
                  });
              }
              return networkResponse;
            });
        })
    );
    return;
  }

  // For HTML/JS/CSS, use network-first strategy
  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        // Clone the response before caching
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(DYNAMIC_CACHE)
            .then((cache) => {
              cache.put(request, responseClone);
            });
        }
        return networkResponse;
      })
      .catch(() => {
        // If network fails, try cache
        return caches.match(request)
          .then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // Return offline page for navigation requests
            if (request.mode === 'navigate') {
              return caches.match('/');
            }
            return new Response('Offline', { 
              status: 503, 
              headers: { 'Content-Type': 'text/plain' } 
            });
          });
      })
  );
});

// Background sync for offline data
self.addEventListener('sync', (event) => {
  console.log('Service Worker: Background sync triggered');
  if (event.tag === 'sync-offline-data') {
    event.waitUntil(syncOfflineData());
  }
});

async function syncOfflineData() {
  console.log('Service Worker: Syncing offline data...');
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({ type: 'SYNC_OFFLINE_DATA' });
  });
}

// Push notifications
self.addEventListener('push', (event) => {
  console.log('Service Worker: Push received');
  
  let data = { title: 'Prayer App', body: 'You have a new notification' };
  
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text() || 'New notification';
    }
  }

  const options = {
    body: data.body,
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1,
      url: data.url || '/'
    },
    actions: [
      { action: 'open', title: 'Open' },
      { action: 'close', title: 'Close' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  console.log('Service Worker: Notification clicked');
  event.notification.close();

  if (event.action === 'close') return;

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // If a window is already open, focus it
        for (const client of clientList) {
          if (client.url === urlToOpen && 'focus' in client) {
            return client.focus();
          }
        }
        // Otherwise open a new window
        if (self.clients.openWindow) {
          return self.clients.openWindow(urlToOpen);
        }
      })
  );
});

// Message handler for cache management
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CACHE_URLS') {
    const urls = event.data.urls;
    event.waitUntil(
      caches.open(DYNAMIC_CACHE)
        .then((cache) => Promise.allSettled(
          urls.map(url => 
            cache.add(url).catch(err => {
              console.warn(`Failed to cache ${url}:`, err);
              return null;
            })
          )
        ))
    );
  }
});
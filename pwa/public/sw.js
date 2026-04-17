/* Prize Clube — Push Notification + Runtime Cache Service Worker */

const CACHE_VERSION = 'v1';
const IMG_CACHE = `pc-images-${CACHE_VERSION}`;
const STATIC_CACHE = `pc-static-${CACHE_VERSION}`;
const API_CACHE = `pc-api-${CACHE_VERSION}`;

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Clean up old caches when version bumps
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith('pc-') && !k.endsWith(`-${CACHE_VERSION}`))
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* ─── Runtime caching ─────────────────────────────────────────────────
 *
 *  IMAGES (jpg/png/webp/avif/svg/gif + /_next/image?url=…)
 *    → cache-first, with background refresh. Keeps the UI instant even
 *      offline, and the next visit transparently upgrades stale copies.
 *
 *  STATIC (fonts, css, js from /_next/static)
 *    → cache-first. These are content-hashed by Next.js so freshness is
 *      guaranteed by the URL itself.
 *
 *  API GETs (same-origin /api/v1/**)
 *    → network-first with stale-fallback. If the server is slow or the
 *      network is down the user still sees the last known payload.
 *
 *  Anything else passes through untouched.
 */
function isImageRequest(req, url) {
  if (req.destination === 'image') return true;
  if (url.pathname.startsWith('/_next/image')) return true;
  return /\.(?:png|jpe?g|gif|webp|avif|svg|ico)$/i.test(url.pathname);
}

function isStaticAsset(url) {
  return url.pathname.startsWith('/_next/static/');
}

function isApiGet(req, url) {
  if (req.method !== 'GET') return false;
  // Same-origin API proxied through the PWA host, or direct api.*
  if (url.pathname.startsWith('/api/v1/')) return true;
  if (url.hostname === 'api.marinaprizeclub.com' && url.pathname.includes('/api/v1/')) return true;
  return false;
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) {
    // Background refresh so the next visit is already up to date
    fetch(req).then((res) => { if (res && res.ok) cache.put(req, res.clone()); }).catch(() => {});
    return hit;
  }
  try {
    const res = await fetch(req);
    if (res && res.ok && (res.type === 'basic' || res.type === 'cors' || res.type === 'default')) {
      cache.put(req, res.clone());
    }
    return res;
  } catch (err) {
    const fallback = await cache.match(req);
    if (fallback) return fallback;
    throw err;
  }
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const cached = await cache.match(req);
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Only handle GETs — mutations should always go to the network
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch { return; }

  // Skip extensions, websockets, service-worker-only routes
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Never cache auth endpoints or websocket polling
  if (url.pathname.startsWith('/api/v1/auth')) return;
  if (url.pathname.startsWith('/socket.io')) return;

  if (isImageRequest(req, url)) {
    event.respondWith(cacheFirst(req, IMG_CACHE));
    return;
  }
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(req, STATIC_CACHE));
    return;
  }
  if (isApiGet(req, url)) {
    event.respondWith(networkFirst(req, API_CACHE));
    return;
  }
  // default: pass-through
});

/* ─── Push event: display notification ─── */
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Prize Clube', body: event.data.text() };
  }

  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icon-192.png',
    badge: payload.badge || '/icon-192.png',
    tag: payload.tag || 'prize-clube',
    data: payload.data || {},
    actions: payload.actions || [],
    vibrate: [200, 100, 200],
    renotify: true,
  };

  event.waitUntil(
    self.registration.showNotification(payload.title || 'Prize Clube', options)
  );
});

/* ─── Notification click: route to correct page ─── */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  let url = '/';

  // Route based on data.url or infer from notification type
  if (data.url) {
    url = data.url;
  } else if (data.chargeId) {
    url = '/faturas';
  } else if (data.reservationId) {
    url = '/boats';
  } else if (data.swapId) {
    url = '/reservations';
  }

  // Handle action buttons
  if (event.action === 'confirm' && data.reservationId) {
    url = '/boats';
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Try to focus an existing window
      for (const client of clients) {
        if (new URL(client.url).pathname === url && 'focus' in client) {
          return client.focus();
        }
      }
      // If no matching window, try any open window and navigate
      for (const client of clients) {
        if ('navigate' in client) {
          return client.navigate(url).then((c) => c && c.focus());
        }
      }
      // Last resort: open new window
      return self.clients.openWindow(url);
    })
  );
});

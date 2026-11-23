/* Lyft offline service worker (generated at build time) */
const CACHE = 'lyft-0452211e3e98';
const PRECACHE = ["./","./index.html","./apple-touch-icon.png","./assets/dist-js-DZsdQ2mS.js","./assets/esm-B94mcS-n.js","./assets/esm-BdPPiznZ.js","./assets/esm-DdRUwMJU.js","./assets/esm-Duf20yqz.js","./assets/esm-ol9BBEaG.js","./assets/index-CdfbXUJp.js","./assets/index-DKWKWwbS.js","./assets/index-DmW7pROS.css","./assets/inter-latin-Dx4kXJAl.woff2","./assets/inter-latin-ext-DO1Apj_S.woff2","./assets/web-bRz8bjAQ.js","./assets/web-y9ZQ6WRM.js","./assets/web-yB39eEu6.js","./fonts/Inter-OFL.txt","./icon-192.png","./icon-512.png","./icon.svg","./manifest.json"];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('lyft-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Daily 21:00 reminder (Malta time). The push server sends an empty ping; the text lives
// here, so no data travels with it. Each push must show a notification (iOS requires it).
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Lyft', {
      body: data.body || "Time to log today. Add your workout and food before bed.",
      icon: './icon-192.png',
      badge: './icon-192.png',
      tag: 'lyft-daily-reminder',
      renotify: true,
      data: { url: './' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || './', self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url.startsWith(self.registration.scope) && 'focus' in w) return w.focus();
      }
      return self.clients.openWindow(target);
    })
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put('./index.html', copy));
          }
          return res;
        })
        .catch(() => caches.match('./index.html', { ignoreSearch: true }).then((r) => r || caches.match('./')))
    );
    return;
  }

  if (url.origin === self.location.origin) {
    if (url.pathname.includes('/api/')) return;
    event.respondWith(
      caches.match(req, { ignoreSearch: true }).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
      )
    );
    return;
  }
});

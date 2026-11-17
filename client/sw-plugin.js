/**
 * Vite plugin that emits `sw.js`, a small offline service worker for the web build.
 *
 * The worker precaches every file in the build (hashed JS/CSS chunks, index.html and the
 * public icons/manifest), so the installed app opens without a connection. The cache name
 * includes a hash of the file list, so each deploy installs a fresh cache and drops the
 * old one.
 *
 * Strategy:
 * - Page navigations: network first (always get the newest index.html), cache fallback offline.
 * - Same-origin files: cache first. Hashed file names never change, so this is always safe.
 * - Everything else (Open Food Facts, the sync API): not intercepted.
 *
 * It also shows the 9pm daily reminder when the push server pings it (see lib/reminders.js).
 */
import { createHash } from 'node:crypto';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

function listFiles(dir, root = dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listFiles(full, root));
    else out.push(relative(root, full).split('\\').join('/'));
  }
  return out;
}

const workerSource = (version, files) => `/* Lyft offline service worker (generated at build time) */
const CACHE = 'lyft-${version}';
const PRECACHE = ${JSON.stringify(['./', './index.html', ...files.map((f) => `./${f}`)], null, 0)};

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
`;

export function offlineServiceWorker() {
  let publicDir = '';
  return {
    name: 'lyft-offline-service-worker',
    apply: 'build',
    configResolved(config) {
      publicDir = config.publicDir;
    },
    generateBundle(_options, bundle) {
      const publicFiles = publicDir ? listFiles(publicDir) : [];
      const files = [...new Set([...Object.keys(bundle), ...publicFiles])]
        .filter((f) => f !== 'sw.js' && f !== 'index.html' && !f.endsWith('.map'))
        .sort();
      const version = createHash('sha256')
        .update(files.join('\n'))
        .update(Object.values(bundle).map((c) => (c.type === 'chunk' ? c.code : String(c.source))).join(''))
        .digest('hex')
        .slice(0, 12);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: workerSource(version, files) });
    },
  };
}

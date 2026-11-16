/**
 * Lyft push server (Cloudflare Worker).
 *
 * Stores Web Push subscriptions from the Lyft web app and, every evening at 21:00 Malta
 * time, sends each one an empty push. The Lyft service worker turns that into the
 * "log today" notification. Only the push endpoint URL is stored: no names, no diary data.
 *
 *   POST /subscribe    { subscription: PushSubscriptionJSON }  -> 204
 *   POST /unsubscribe  { endpoint }                            -> 204
 *   POST /test         { endpoint }                            -> sends one push now
 *   GET  /health                                               -> "ok"
 *
 * Cron: `0 19,20 * * *` (UTC). Whichever of those is 21:00 in Malta (19 in summer, 20 in
 * winter) sends; the other does nothing.
 */
import { importVapidKey, sendPush } from './webpush.js';

const TZ = 'Europe/Malta';
const REMINDER_HOUR = 21;

// Only real browser push services, so the worker can't be used to POST to arbitrary URLs.
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^android\.googleapis\.com$/,
  /(^|\.)push\.apple\.com$/,
  /(^|\.)push\.services\.mozilla\.com$/,
  /(^|\.)notify\.windows\.com$/,
];

export function isPushEndpoint(value) {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && PUSH_HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}

export function maltaHour(now = new Date()) {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(now));
}

async function keyFor(endpoint) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return 'sub:' + [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const ok = allowed.includes(origin);
  return {
    ...(ok ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

async function readJson(request) {
  const text = await request.text();
  if (text.length > 8192) throw new Error('Body too large');
  return JSON.parse(text);
}

async function pushOptions(env) {
  return {
    key: await importVapidKey(env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY),
    publicKey: env.VAPID_PUBLIC_KEY,
    subject: env.VAPID_SUBJECT,
    jwtCache: new Map(),
  };
}

/** Sends the reminder to every stored subscription and removes dead ones. */
export async function sendAll(env) {
  const opts = await pushOptions(env);
  let cursor;
  let sent = 0;
  let removed = 0;
  let failed = 0;
  do {
    const page = await env.SUBS.list({ prefix: 'sub:', cursor });
    cursor = page.list_complete ? undefined : page.cursor;
    const batch = await Promise.all(page.keys.map((k) => env.SUBS.get(k.name, 'json').then((v) => [k.name, v])));
    for (let i = 0; i < batch.length; i += 20) {
      await Promise.all(
        batch.slice(i, i + 20).map(async ([name, rec]) => {
          if (!rec?.endpoint) return env.SUBS.delete(name);
          try {
            const r = await sendPush(rec.endpoint, opts);
            if (r.ok) sent++;
            else if (r.gone) {
              removed++;
              await env.SUBS.delete(name);
            } else failed++;
          } catch {
            failed++;
          }
        })
      );
    }
  } while (cursor);
  console.log(JSON.stringify({ event: 'daily-reminder', sent, removed, failed }));
  return { sent, removed, failed };
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    const url = new URL(request.url);
    const reply = (body, status = 200) =>
      new Response(body === null ? null : typeof body === 'string' ? body : JSON.stringify(body), {
        status,
        headers: { ...cors, ...(typeof body === 'object' && body !== null ? { 'Content-Type': 'application/json' } : {}) },
      });

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method === 'GET' && url.pathname === '/health') return reply('ok');
    if (request.method !== 'POST') return reply({ error: 'Not found' }, 404);
    if (!cors['Access-Control-Allow-Origin']) return reply({ error: 'Origin not allowed' }, 403);

    let body;
    try {
      body = await readJson(request);
    } catch {
      return reply({ error: 'Invalid JSON' }, 400);
    }

    if (url.pathname === '/subscribe') {
      const endpoint = body?.subscription?.endpoint;
      if (!isPushEndpoint(endpoint)) return reply({ error: 'Invalid subscription' }, 400);
      await env.SUBS.put(await keyFor(endpoint), JSON.stringify({ endpoint, seen: new Date().toISOString().slice(0, 10) }));
      return reply(null, 204);
    }

    if (url.pathname === '/unsubscribe') {
      if (!isPushEndpoint(body?.endpoint)) return reply({ error: 'Invalid endpoint' }, 400);
      await env.SUBS.delete(await keyFor(body.endpoint));
      return reply(null, 204);
    }

    if (url.pathname === '/test') {
      // Only for endpoints that are already subscribed, so it can't be used to spam.
      if (!isPushEndpoint(body?.endpoint)) return reply({ error: 'Invalid endpoint' }, 400);
      const key = await keyFor(body.endpoint);
      if (!(await env.SUBS.get(key))) return reply({ error: 'Not subscribed' }, 404);
      const r = await sendPush(body.endpoint, await pushOptions(env));
      if (r.gone) await env.SUBS.delete(key);
      return reply({ ok: r.ok, status: r.status }, r.ok ? 200 : 502);
    }

    return reply({ error: 'Not found' }, 404);
  },

  async scheduled(event, env, ctx) {
    if (maltaHour(new Date(event.scheduledTime)) !== REMINDER_HOUR) return;
    ctx.waitUntil(sendAll(env));
  },
};

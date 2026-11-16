import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPublicKey, generateKeyPairSync, verify } from 'node:crypto';
import worker, { isPushEndpoint, maltaHour } from '../src/index.js';
import { b64urlDecode, importVapidKey, vapidJwt } from '../src/webpush.js';

function keys() {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const pub = publicKey.export({ format: 'jwk' });
  const raw = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, 'base64url'), Buffer.from(pub.y, 'base64url')]);
  return { publicKey: raw.toString('base64url'), privateKey: privateKey.export({ format: 'jwk' }).d, pubJwk: pub };
}

function memoryKV() {
  const m = new Map();
  return {
    m,
    async get(k, type) {
      const v = m.get(k);
      return v === undefined ? null : type === 'json' ? JSON.parse(v) : v;
    },
    async put(k, v) {
      m.set(k, v);
    },
    async delete(k) {
      m.delete(k);
    },
    async list({ prefix }) {
      return { keys: [...m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true };
    },
  };
}

const ORIGIN = 'https://bonniciethan.github.io';
const k = keys();
const env = () => ({
  SUBS: memoryKV(),
  ALLOWED_ORIGINS: ORIGIN,
  VAPID_PUBLIC_KEY: k.publicKey,
  VAPID_PRIVATE_KEY: k.privateKey,
  VAPID_SUBJECT: 'https://bonniciethan.github.io/Lyft/',
});
const post = (path, body, origin = ORIGIN) =>
  new Request(`https://push.example${path}`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('VAPID JWT is a valid ES256 signature with the right claims', async () => {
  const key = await importVapidKey(k.publicKey, k.privateKey);
  const jwt = await vapidJwt(key, 'https://web.push.apple.com', 'https://bonniciethan.github.io/Lyft/');
  const [h, c, s] = jwt.split('.');
  const claims = JSON.parse(Buffer.from(c, 'base64url'));
  assert.equal(claims.aud, 'https://web.push.apple.com');
  assert.ok(claims.exp > Date.now() / 1000 && claims.exp <= Date.now() / 1000 + 24 * 3600);
  const ok = verify('sha256', Buffer.from(`${h}.${c}`), { key: createPublicKey({ key: k.pubJwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363' }, Buffer.from(b64urlDecode(s)));
  assert.equal(ok, true);
});

test('only real push services are accepted as endpoints', () => {
  assert.equal(isPushEndpoint('https://web.push.apple.com/QGx'), true);
  assert.equal(isPushEndpoint('https://fcm.googleapis.com/fcm/send/abc'), true);
  assert.equal(isPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x'), true);
  assert.equal(isPushEndpoint('https://wns2-par02p.notify.windows.com/w/?token=x'), true);
  assert.equal(isPushEndpoint('https://evil.example/push.apple.com'), false);
  assert.equal(isPushEndpoint('https://push.apple.com.evil.example/x'), false);
  assert.equal(isPushEndpoint('http://fcm.googleapis.com/x'), false);
});

test('maltaHour follows DST', () => {
  assert.equal(maltaHour(new Date('2026-07-01T19:00:00Z')), 21);
  assert.equal(maltaHour(new Date('2026-12-01T20:00:00Z')), 21);
});

test('subscribe stores only the endpoint; unsubscribe removes it; bad origin is refused', async () => {
  const e = env();
  const endpoint = 'https://web.push.apple.com/abc';
  let res = await worker.fetch(post('/subscribe', { subscription: { endpoint, keys: { p256dh: 'x', auth: 'y' } } }), e);
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  const [stored] = [...e.SUBS.m.values()].map((v) => JSON.parse(v));
  assert.deepEqual(Object.keys(stored).sort(), ['endpoint', 'seen']);

  res = await worker.fetch(post('/subscribe', { subscription: { endpoint } }, 'https://other.example'), e);
  assert.equal(res.status, 403);

  res = await worker.fetch(post('/unsubscribe', { endpoint }), e);
  assert.equal(res.status, 204);
  assert.equal(e.SUBS.m.size, 0);
});

test('cron sends only at 21:00 Malta and drops expired subscriptions', async () => {
  const e = env();
  const live = 'https://fcm.googleapis.com/fcm/send/live';
  const dead = 'https://web.push.apple.com/dead';
  for (const endpoint of [live, dead]) await worker.fetch(post('/subscribe', { subscription: { endpoint } }), e);

  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response(null, { status: url === dead ? 410 : 201 });
  };
  try {
    const pending = [];
    const ctx = { waitUntil: (p) => pending.push(p) };
    await worker.scheduled({ scheduledTime: Date.parse('2026-12-01T19:00:00Z') }, e, ctx); // 20:00 Malta
    assert.equal(pending.length, 0);
    await worker.scheduled({ scheduledTime: Date.parse('2026-12-01T20:00:00Z') }, e, ctx); // 21:00 Malta
    const [result] = await Promise.all(pending);
    assert.deepEqual(result, { sent: 1, removed: 1, failed: 0 });
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(calls.length, 2);
  const h = calls[0].init.headers;
  assert.match(h.Authorization, new RegExp(`^vapid t=[^.]+\\.[^.]+\\.[^.]+, k=${k.publicKey}$`));
  assert.equal(h['Content-Length'], '0');
  assert.equal(e.SUBS.m.size, 1);
});

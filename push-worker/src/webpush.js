/**
 * Minimal Web Push sender (RFC 8030 + VAPID, RFC 8292) using only WebCrypto, so it runs
 * on Cloudflare Workers and in Node 20+.
 *
 * Pushes are sent with no payload. That needs no message encryption, and the Lyft service
 * worker supplies the reminder text itself. Apple (iOS/macOS Safari), Google (Chrome,
 * Android), Mozilla and Microsoft push services all accept payload-less pushes.
 */

const enc = new TextEncoder();

export function b64urlEncode(bytes) {
  let bin = '';
  for (const b of bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** Imports the VAPID signing key from the public key (65-byte uncompressed point) and the private scalar `d`. */
export async function importVapidKey(publicKeyB64url, privateKeyB64url) {
  const pub = b64urlDecode(publicKeyB64url);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error('VAPID public key must be a 65-byte uncompressed P-256 point');
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: b64urlEncode(pub.slice(1, 33)),
    y: b64urlEncode(pub.slice(33, 65)),
    d: privateKeyB64url,
    ext: true,
  };
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

/** Signed VAPID JWT for one push service origin. */
export async function vapidJwt(key, audience, subject, now = Date.now()) {
  const header = b64urlEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64urlEncode(
    enc.encode(JSON.stringify({ aud: audience, exp: Math.floor(now / 1000) + 12 * 60 * 60, sub: subject }))
  );
  const input = `${header}.${claims}`;
  // WebCrypto returns the raw r||s signature, which is exactly what JWS ES256 wants.
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(input));
  return `${input}.${b64urlEncode(sig)}`;
}

/**
 * Sends one payload-less push. Returns { ok, status, gone } where `gone` means the
 * subscription is dead (unsubscribed / expired) and should be deleted.
 */
export async function sendPush(endpoint, { key, publicKey, subject, ttl = 3 * 60 * 60, jwtCache = new Map() }) {
  const audience = new URL(endpoint).origin;
  let jwt = jwtCache.get(audience);
  if (!jwt) {
    jwt = await vapidJwt(key, audience, subject);
    jwtCache.set(audience, jwt);
  }
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `vapid t=${jwt}, k=${publicKey}`,
      TTL: String(ttl),
      Urgency: 'normal',
      Topic: 'lyft-daily',
      'Content-Length': '0',
    },
  });
  return { ok: res.ok, status: res.status, gone: res.status === 404 || res.status === 410 };
}

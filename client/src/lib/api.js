import { cleanServerUrl, getServerUrl } from './storage.js';

async function request(path, { method = 'GET', body, timeout = 10000, baseUrl } = {}) {
  const base = baseUrl !== undefined ? cleanServerUrl(baseUrl) : getServerUrl();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(`${base}${path}`, {
      method,
      cache: 'no-store',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok) {
      throw new Error((data && data.error) || `Server responded ${res.status}`);
    }
    if (data === null) throw new Error('Server returned an invalid response');
    return data;
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Request timed out');
    if (err instanceof TypeError) throw new Error('Server unreachable');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export function pushState(state) {
  const { lastSynced, split, workouts, logs, goals, profile } = state;
  return request('/api/sync', { method: 'POST', body: { lastSynced, split, workouts, logs, goals, profile }, timeout: 20000 });
}

export function pullState() {
  return request('/api/sync', { timeout: 20000 });
}

export async function testConnection(baseUrl) {
  const started = performance.now();
  const data = await request('/api/health', { baseUrl, timeout: 6000 });
  const latency = Math.round(performance.now() - started);
  if (data.status !== 'ok') throw new Error('Unexpected health response');
  return { latency, timestamp: data.timestamp };
}

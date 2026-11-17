import { test } from 'node:test';
import assert from 'node:assert/strict';
import { THEME_KEY, getTheme, resolveTheme, setTheme } from '../src/lib/theme.js';

const memory = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
};

test('resolveTheme follows the OS only for system', () => {
  assert.equal(resolveTheme('system', true), 'light');
  assert.equal(resolveTheme('system', false), 'dark');
  assert.equal(resolveTheme('dark', true), 'dark');
  assert.equal(resolveTheme('light', false), 'light');
  assert.equal(resolveTheme(undefined, false), 'dark');
});

test('theme preference persists under a lyft_ key so data deletion clears it', () => {
  assert.match(THEME_KEY, /^lyft_/);
  const s = memory();
  assert.equal(getTheme(s), 'system');
  setTheme('light', s);
  assert.equal(getTheme(s), 'light');
  setTheme('system', s);
  assert.equal(s.m.has(THEME_KEY), false);
  s.setItem(THEME_KEY, 'neon');
  assert.equal(getTheme(s), 'system');
});

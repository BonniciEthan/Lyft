import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownStorageKeys } from '../src/lib/privacy.js';

function fakeStorage(keys) {
  return { length: keys.length, key: (i) => keys[i] ?? null };
}

test('ownStorageKeys picks only Lyft keys', () => {
  const keys = ['gym_tracker_state_v1', 'gym_tracker_server_url', 'lyft_off_barcode_cache_v1', 'lyft_age_ok_v1', 'other_app', 'lyftish'];
  assert.deepEqual(ownStorageKeys(fakeStorage(keys)), keys.slice(0, 4));
});

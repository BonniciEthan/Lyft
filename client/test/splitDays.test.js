import test from 'node:test';
import assert from 'node:assert/strict';
import { badgeClass, clampSets, dayOptions, fitSets, resolveDayName } from '../src/lib/splitDays.js';

const empty = () => ({ weight: null, reps: null, spotted: false });

test('badgeClass makes safe class names', () => {
  assert.equal(badgeClass('Push'), 'badge-push');
  assert.equal(badgeClass('Full Body'), 'badge-full-body');
  assert.equal(badgeClass('  !! '), 'badge-custom');
});

test('dayOptions lists existing routines then missing presets', () => {
  const opts = dayOptions({ Push: [], 'Full Body': [], chest: [] });
  assert.deepEqual(opts.slice(0, 3), ['Push', 'Full Body', 'chest']);
  assert.ok(opts.includes('Shoulders'));
  assert.ok(!opts.includes('Chest'), 'case-insensitive match keeps the existing spelling');
  assert.ok(!opts.includes('Rest'));
});

test('resolveDayName validates and reuses existing routines', () => {
  assert.ok(resolveDayName('   ', {}).error);
  assert.ok(resolveDayName('x'.repeat(25), {}).error);
  assert.deepEqual(resolveDayName('rest', {}), { name: 'Rest' });
  assert.deepEqual(resolveDayName('  full   body ', { 'Full Body': [] }), { name: 'Full Body' });
  assert.deepEqual(resolveDayName('Cardio', {}), { name: 'Cardio' });
});

test('clampSets keeps 1 to 6', () => {
  assert.equal(clampSets(0), 1);
  assert.equal(clampSets(9), 6);
  assert.equal(clampSets(undefined), 3);
});

test('fitSets pads and trims only empty trailing sets', () => {
  assert.equal(fitSets([empty()], 3).length, 3);
  assert.equal(fitSets([empty(), empty(), empty(), empty()], 2).length, 2);
  const withData = [empty(), { weight: 50, reps: 8, spotted: false }, empty()];
  assert.equal(fitSets(withData, 1).length, 2, 'stops at a set with data');
});

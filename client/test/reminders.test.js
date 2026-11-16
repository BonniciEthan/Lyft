import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isReminderHour, nextReminderTime, zoneOffsetMinutes } from '../src/lib/maltaTime.js';

test('Malta offset is +1h in winter and +2h in summer', () => {
  assert.equal(zoneOffsetMinutes(new Date('2026-01-15T12:00:00Z')), 60);
  assert.equal(zoneOffsetMinutes(new Date('2026-07-15T12:00:00Z')), 120);
});

test('next reminder in winter is 20:00 UTC the same day', () => {
  assert.equal(nextReminderTime(new Date('2026-11-16T10:00:00Z')).toISOString(), '2026-11-16T20:00:00.000Z');
});

test('next reminder in summer is 19:00 UTC the same day', () => {
  assert.equal(nextReminderTime(new Date('2026-07-01T08:00:00Z')).toISOString(), '2026-07-01T19:00:00.000Z');
});

test('after 21:00 Malta the reminder rolls to tomorrow', () => {
  assert.equal(nextReminderTime(new Date('2026-11-16T20:00:00Z')).toISOString(), '2026-11-17T20:00:00.000Z');
  assert.equal(nextReminderTime(new Date('2026-11-16T22:30:00Z')).toISOString(), '2026-11-17T20:00:00.000Z');
});

test('just after midnight Malta (still previous day in UTC) targets that Malta day', () => {
  // 2026-07-01 00:30 Malta = 2026-06-30 22:30 UTC
  assert.equal(nextReminderTime(new Date('2026-06-30T22:30:00Z')).toISOString(), '2026-07-01T19:00:00.000Z');
});

test('handles the spring-forward and fall-back days', () => {
  // EU clocks change on 2026-03-29 and 2026-10-25.
  assert.equal(nextReminderTime(new Date('2026-03-29T00:30:00Z')).toISOString(), '2026-03-29T19:00:00.000Z');
  assert.equal(nextReminderTime(new Date('2026-10-25T00:30:00Z')).toISOString(), '2026-10-25T20:00:00.000Z');
  // The evening before the change, the next one is the day after with the new offset.
  assert.equal(nextReminderTime(new Date('2026-03-28T21:00:00Z')).toISOString(), '2026-03-29T19:00:00.000Z');
});

test('reminder hour matches exactly one of the two cron times', () => {
  assert.equal(isReminderHour(new Date('2026-07-01T19:00:00Z')), true);
  assert.equal(isReminderHour(new Date('2026-07-01T20:00:00Z')), false);
  assert.equal(isReminderHour(new Date('2026-12-01T19:00:00Z')), false);
  assert.equal(isReminderHour(new Date('2026-12-01T20:00:00Z')), true);
});

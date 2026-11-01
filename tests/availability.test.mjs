import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sastParts, timeToMinutes, isOpenAt, resolveDeliveryZone,
} from '../api/_lib/availability.js';

const WEEKDAY = [
  { weekday: 3, open_time: '08:00', close_time: '17:00', is_closed: false },
];

test('sastParts converts UTC to South African time', () => {
  // 2026-06-03 is a Wednesday. 10:00 UTC is 12:00 SAST.
  assert.deepEqual(sastParts(new Date('2026-06-03T10:00:00Z')), { weekday: 3, minutes: 12 * 60 });
  // 22:30 UTC on Wednesday is 00:30 SAST on Thursday.
  assert.deepEqual(sastParts(new Date('2026-06-03T22:30:00Z')), { weekday: 4, minutes: 30 });
});

test('timeToMinutes parses strict HH:MM values', () => {
  assert.equal(timeToMinutes('09:30'), 570);
  assert.equal(timeToMinutes('00:00'), 0);
  assert.equal(timeToMinutes('23:59'), 1439);
  assert.equal(timeToMinutes('9:30'), null);
  assert.equal(timeToMinutes('24:00'), null);
  assert.equal(timeToMinutes('12:60'), null);
  assert.equal(timeToMinutes(''), null);
  assert.equal(timeToMinutes(null), null);
});

test('isOpenAt treats fully unconfigured hours as always open', () => {
  assert.deepEqual(isOpenAt([], new Date('2026-06-03T10:00:00Z')), {
    configured: false, open: true, reason: null,
  });
  assert.equal(isOpenAt(null).open, true);
  assert.equal(isOpenAt([{ weekday: 3 }]).configured, false);
});

test('isOpenAt respects the configured weekday window in SAST', () => {
  // 12:00 SAST on Wednesday.
  assert.equal(isOpenAt(WEEKDAY, new Date('2026-06-03T10:00:00Z')).open, true);
  // 07:59 SAST — before opening.
  const early = isOpenAt(WEEKDAY, new Date('2026-06-03T05:59:00Z'));
  assert.equal(early.open, false);
  assert.match(early.reason, /08:00/);
  // 17:00 SAST is closing time, so it counts as closed.
  assert.equal(isOpenAt(WEEKDAY, new Date('2026-06-03T15:00:00Z')).open, false);
  // 16:59 SAST — still open.
  assert.equal(isOpenAt(WEEKDAY, new Date('2026-06-03T14:59:00Z')).open, true);
});

test('isOpenAt rejects days without a row or marked closed', () => {
  // 2026-06-07 is a Sunday; there is no Sunday row.
  const missing = isOpenAt(WEEKDAY, new Date('2026-06-07T10:00:00Z'));
  assert.equal(missing.configured, true);
  assert.equal(missing.open, false);

  const sunday = [...WEEKDAY, { weekday: 0, is_closed: true }];
  const closed = isOpenAt(sunday, new Date('2026-06-07T10:00:00Z'));
  assert.equal(closed.open, false);
  assert.match(closed.reason, /closed/);
});

test('isOpenAt handles overnight windows', () => {
  const hours = [{ weekday: 5, open_time: '20:00', close_time: '02:00', is_closed: false }];
  // Friday 2026-06-05, 21:00 SAST.
  assert.equal(isOpenAt(hours, new Date('2026-06-05T19:00:00Z')).open, true);
  // Friday 23:30 SAST.
  assert.equal(isOpenAt(hours, new Date('2026-06-05T21:30:00Z')).open, true);
  // Friday 01:30 SAST (after the window opened the previous evening).
  assert.equal(isOpenAt(hours, new Date('2026-06-04T23:30:00Z')).open, true);
  // Friday 12:00 SAST — outside the overnight window.
  assert.equal(isOpenAt(hours, new Date('2026-06-05T10:00:00Z')).open, false);
});

test('isOpenAt reports malformed times instead of guessing', () => {
  const bad = [{ weekday: 3, open_time: '8am', close_time: '17:00' }];
  const result = isOpenAt(bad, new Date('2026-06-03T10:00:00Z'));
  assert.equal(result.open, false);
  assert.match(result.reason, /not configured/);
});

test('resolveDeliveryZone picks the smallest covering zone', () => {
  const zones = [
    { name: 'City', radius_km: 10, fee: 25 },
    { name: 'Metro', radius_km: 25, fee: 45 },
    { name: 'Regional', radius_km: 50, fee: 80 },
  ];
  const near = resolveDeliveryZone(zones, 4);
  assert.equal(near.zone.name, 'City');
  assert.equal(near.fee, 25);
  assert.equal(near.outOfArea, false);
  assert.equal(near.hasZones, true);

  const mid = resolveDeliveryZone(zones, 20);
  assert.equal(mid.zone.name, 'Metro');
  assert.equal(mid.fee, 45);

  const edge = resolveDeliveryZone(zones, 50);
  assert.equal(edge.zone.name, 'Regional');
});

test('resolveDeliveryZone flags out-of-area distances', () => {
  const zones = [{ name: 'City', radius_km: 10, fee: 25 }];
  const far = resolveDeliveryZone(zones, 11);
  assert.equal(far.zone, null);
  assert.equal(far.fee, null);
  assert.equal(far.outOfArea, true);
  assert.equal(far.hasZones, true);
});

test('resolveDeliveryZone handles missing zones and distances', () => {
  const none = resolveDeliveryZone([], 5);
  assert.equal(none.zone, null);
  assert.equal(none.hasZones, false);
  assert.equal(none.outOfArea, false);

  const unknown = resolveDeliveryZone([{ name: 'City', radius_km: 10, fee: 0 }], null);
  assert.equal(unknown.zone, null);
  assert.equal(unknown.fee, null);
  assert.equal(unknown.outOfArea, false);
  assert.equal(unknown.hasZones, true);
});

test('resolveDeliveryZone defaults a missing fee to zero', () => {
  const result = resolveDeliveryZone([{ name: 'City', radius_km: 10 }], 3);
  assert.equal(result.fee, 0);
  assert.equal(result.zone.name, 'City');
});

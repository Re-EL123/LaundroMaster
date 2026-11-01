import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  haversineKm, validLatLng, rankByDistance, addressQuery, addressScore, pickBestPlace,
} from '../api/_lib/geo.js';

const JOBURG = { lat: -26.2041, lng: 28.0473 };
const PRETORIA = { lat: -25.7479, lng: 28.2293 }; // ~55 km from Johannesburg
const CAPE_TOWN = { lat: -33.9249, lng: 18.4241 };

test('haversineKm measures known distances', () => {
  assert.equal(haversineKm(JOBURG.lat, JOBURG.lng, JOBURG.lat, JOBURG.lng), 0);
  const jhbToCpt = haversineKm(JOBURG.lat, JOBURG.lng, CAPE_TOWN.lat, CAPE_TOWN.lng);
  assert.ok(jhbToCpt > 1250 && jhbToCpt < 1280, `expected ~1263 km, got ${jhbToCpt}`);
  const jhbToPta = haversineKm(JOBURG.lat, JOBURG.lng, PRETORIA.lat, PRETORIA.lng);
  assert.ok(jhbToPta > 45 && jhbToPta < 65, `expected ~55 km, got ${jhbToPta}`);
});

test('validLatLng rejects missing, out-of-range and null-island coordinates', () => {
  assert.equal(validLatLng(-26.2, 28.04), true);
  assert.equal(validLatLng('-26.2', '28.04'), true);
  assert.equal(validLatLng(91, 28), false);
  assert.equal(validLatLng(-26.2, 181), false);
  assert.equal(validLatLng(0, 0), false);
  assert.equal(validLatLng(null, null), false);
  assert.equal(validLatLng(undefined, undefined), false);
  assert.equal(validLatLng(NaN, 28), false);
});

test('rankByDistance sorts nearest first and flags the radius', () => {
  const rows = [
    { id: 'far', latitude: PRETORIA.lat, longitude: PRETORIA.lng },
    { id: 'near', latitude: -26.21, longitude: 28.05 },
    { id: 'unknown', latitude: null, longitude: null },
  ];
  const ranked = rankByDistance(rows, JOBURG, { radiusKm: 10, limit: 10 });
  assert.deepEqual(ranked.map((row) => row.id), ['near', 'far', 'unknown']);
  assert.equal(ranked[0].within_radius, true);
  assert.equal(ranked[0].has_coordinates, true);
  assert.equal(ranked[1].within_radius, false);
  assert.equal(ranked[1].has_coordinates, true);
  assert.equal(ranked[2].distance_km, null);
  assert.equal(ranked[2].within_radius, false);
  assert.equal(ranked[2].has_coordinates, false);
});

test('rankByDistance strict mode hides everything outside the radius', () => {
  const rows = [
    { id: 'far', latitude: PRETORIA.lat, longitude: PRETORIA.lng },
    { id: 'near', latitude: -26.21, longitude: 28.05 },
    { id: 'unknown', latitude: null, longitude: null },
  ];
  const strict = rankByDistance(rows, JOBURG, { radiusKm: 10, limit: 10, strict: true });
  assert.deepEqual(strict.map((row) => row.id), ['near']);
});

test('rankByDistance respects the limit and the default radius', () => {
  const rows = Array.from({ length: 8 }, (_, i) => ({
    id: `row-${i}`,
    latitude: JOBURG.lat + i * 0.1,
    longitude: JOBURG.lng,
  }));
  assert.equal(rankByDistance(rows, JOBURG, { limit: 3 }).length, 3);
  // 0.1 degrees of latitude is ~11 km, so the 25 km default keeps the first
  // three rows and marks the rest as outside.
  const ranked = rankByDistance(rows, JOBURG, { limit: 10 });
  assert.equal(ranked.filter((row) => row.within_radius).length, 3);
});

test('rankByDistance tolerates a missing origin', () => {
  const rows = [{ id: 'a' }, { id: 'b' }];
  assert.deepEqual(rankByDistance(rows, null).map((row) => row.id), ['a', 'b']);
  assert.deepEqual(rankByDistance([], JOBURG), []);
});

test('addressQuery joins structured fields and passes strings through', () => {
  assert.equal(addressQuery(null), '');
  assert.equal(addressQuery('  12  Main Rd,  Sandton '), '12 Main Rd, Sandton');
  assert.equal(
    addressQuery({ line1: '12 Main Rd', line2: 'Unit 3', suburb: 'Sandton', city: 'Johannesburg', postal_code: '2196' }),
    '12 Main Rd, Unit 3, Sandton, Johannesburg, 2196',
  );
  assert.equal(addressQuery({ city: 'Durban' }), 'Durban');
});

test('addressScore ranks a street address above a suburb centroid', () => {
  const suburb = { label: 'Sandton, Johannesburg, South Africa', city: 'Johannesburg', has_address: false };
  const address = {
    label: '12 Main Rd, Sandton, Johannesburg, South Africa',
    housenumber: '12',
    street: 'Main Rd',
    city: 'Johannesburg',
    has_address: true,
  };
  assert.ok(addressScore(address, '12 Main Rd Sandton') > addressScore(suburb, '12 Main Rd Sandton'));
  assert.equal(addressScore(null, 'anything'), -1);
});

test('pickBestPlace chooses the most precise candidate', () => {
  const suburb = { label: 'Sandton, Johannesburg', city: 'Johannesburg' };
  const address = {
    label: '12 Main Rd, Sandton, Johannesburg',
    housenumber: '12',
    street: 'Main Rd',
    has_address: true,
  };
  assert.equal(pickBestPlace([suburb, address], '12 Main Rd Sandton'), address);
  assert.equal(pickBestPlace([suburb], '12 Main Rd Sandton'), suburb);
  assert.equal(pickBestPlace([], 'x'), null);
  assert.equal(pickBestPlace(null, 'x'), null);
});

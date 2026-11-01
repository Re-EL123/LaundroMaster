import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  haversineKm, validLatLng, rankByDistance, addressQuery, addressScore, pickBestPlace,
  geocodeCandidates, reverseGeocode,
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

// Photon has no country parameter, so without a bounding box an address search
// returns whichever "Main Rd" is most popular — often in New Zealand.
function stubFetch(photonFeatures, nominatimHits = []) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const href = String(url);
    calls.push(href);
    const body = href.includes('photon.komoot.io') ? { features: photonFeatures } : nominatimHits;
    return { ok: true, json: async () => body };
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}

test('geocodeCandidates drops Photon hits outside South Africa and falls back to Nominatim', async () => {
  const stub = stubFetch([
    {
      properties: { name: 'Main Rd Fairfield, 12', street: 'Main Road', country: 'New Zealand', countrycode: 'NZ' },
      geometry: { coordinates: [170.4022, -45.8971] },
    },
    {
      // Lesotho sits inside the South African bounding box.
      properties: { name: 'Katlehong', country: 'Lesotho', countrycode: 'LS' },
      geometry: { coordinates: [27.4885, -29.3296] },
    },
  ], [{
    lat: '-26.1075',
    lon: '28.0567',
    display_name: '12 Main Rd, Sandton, Johannesburg, South Africa',
    address: { house_number: '12', road: 'Main Rd', suburb: 'Sandton', city: 'Johannesburg' },
  }]);
  try {
    const places = await geocodeCandidates('12 Main Rd Sandton', { limit: 3 });
    assert.equal(stub.calls.length, 2, 'foreign hits must not satisfy the query');
    assert.ok(stub.calls[0].includes('bbox='), 'Photon must be asked to prefer South Africa');
    assert.equal(places.length, 1);
    assert.equal(places[0].provider, 'nominatim');
    assert.ok(places[0].label.includes('South Africa'));
  } finally {
    stub.restore();
  }
});

test('geocodeCandidates keeps South African Photon hits without calling Nominatim', async () => {
  const stub = stubFetch([{
    properties: {
      name: 'Main Road', street: 'Main Road', locality: 'Melville', city: 'Johannesburg',
      state: 'Gauteng', country: 'South Africa', countrycode: 'ZA', postcode: '2092',
    },
    geometry: { coordinates: [28.0009, -26.1764] },
  }]);
  try {
    const places = await geocodeCandidates('Main Road Johannesburg', { limit: 3 });
    assert.equal(stub.calls.length, 1);
    assert.equal(places.length, 1);
    assert.equal(places[0].provider, 'photon');
    assert.equal(places[0].city, 'Johannesburg');
  } finally {
    stub.restore();
  }
});

test('reverseGeocode returns a short street label, not the raw display_name', async () => {
  const stub = stubFetch([], {
    display_name: '12 Main Rd, Sandton, Johannesburg Ward 100, City of Johannesburg'
      + ' Metropolitan Municipality, Gauteng, 2196, South Africa',
    address: {
      house_number: '12', road: 'Main Rd', suburb: 'Sandton', city: 'Johannesburg', postcode: '2196',
    },
  });
  try {
    const loc = await reverseGeocode(-26.1076, 28.0567);
    assert.equal(loc.label, '12 Main Rd, Sandton, Johannesburg, 2196');
    assert.equal(loc.city, 'Johannesburg');
    assert.ok(stub.calls[0].includes('zoom=18'), 'reverse must ask for street precision');
  } finally {
    stub.restore();
  }
});

test('reverseGeocode trims ward/municipality noise when no street is mapped', async () => {
  const stub = stubFetch([], {
    display_name: 'eThekwini Ward 45, KwaMashu, eThekwini Metropolitan Municipality,'
      + ' KwaZulu-Natal, 4360, South Africa',
    address: { suburb: 'eThekwini Ward 45', city: 'KwaMashu', postcode: '4360' },
  });
  try {
    const loc = await reverseGeocode(-29.7333, 30.9833);
    assert.equal(loc.label, 'eThekwini Ward 45, KwaMashu, 4360');
  } finally {
    stub.restore();
  }
});

test('reverseGeocode falls back to display_name when the response has no address detail', async () => {
  const stub = stubFetch([], { display_name: 'Somewhere, South Africa' });
  try {
    const loc = await reverseGeocode(-26.2041, 28.0473);
    assert.equal(loc.label, 'Somewhere, South Africa');
    assert.equal(loc.suburb, null);
  } finally {
    stub.restore();
  }
});

test('reverseGeocode rejects invalid coordinates without calling the provider', async () => {
  const stub = stubFetch([], { display_name: 'never used' });
  try {
    assert.equal(await reverseGeocode(null, null), null);
    assert.equal(stub.calls.length, 0);
  } finally {
    stub.restore();
  }
});

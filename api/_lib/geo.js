// Geocoding + distance helpers shared by /api/geo, the owner profile editor and
// booking serviceability checks. Everything degrades gracefully: a failed
// provider must never take a request down.

const PHOTON_URL = 'https://photon.komoot.io/api/';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';
const DEFAULT_TIMEOUT_MS = 4500;
const USER_AGENT = 'LaundroMaster/1.0 (+https://laundromaster.re-el.co.za)';

// The platform only serves South Africa (Nominatim is already restricted to it
// via countrycodes=za). Photon has no country parameter, so without a bounding
// box "12 Main Rd Sandton" happily resolves to Dunedin, New Zealand. Order is
// minLon, minLat, maxLon, maxLat.
const ZA_BBOX = '16.45,-34.85,32.90,-22.10';
const [ZA_MIN_LNG, ZA_MIN_LAT, ZA_MAX_LNG, ZA_MAX_LAT] = ZA_BBOX.split(',').map(Number);

function inSouthAfrica(lng, lat) {
  return Number.isFinite(lng) && Number.isFinite(lat)
    && lng >= ZA_MIN_LNG && lng <= ZA_MAX_LNG
    && lat >= ZA_MIN_LAT && lat <= ZA_MAX_LAT;
}

export function toRad(deg) {
  return (deg * Math.PI) / 180;
}

export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function validLatLng(lat, lng) {
  const a = Number(lat);
  const b = Number(lng);
  return Number.isFinite(a) && Number.isFinite(b)
    && a >= -90 && a <= 90 && b >= -180 && b <= 180
    && !(a === 0 && b === 0);
}

async function fetchJson(url, { timeoutMs = DEFAULT_TIMEOUT_MS, headers = {} } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT, ...headers },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function clean(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function labelFromProperties(p = {}) {
  const parts = [];
  if (p.name) parts.push(p.name);
  if (p.housenumber && p.street) parts.push(`${p.housenumber} ${p.street}`);
  else if (p.street) parts.push(p.street);
  if (p.suburb && p.suburb !== p.city) parts.push(p.suburb);
  if (p.city) parts.push(p.city);
  if (p.state) parts.push(p.state);
  if (p.postcode) parts.push(p.postcode);
  if (p.country) parts.push(p.country);
  return [...new Set(parts.map(clean).filter(Boolean))].join(', ');
}

function photonPlace(feature) {
  const p = (feature && feature.properties) || {};
  const coords = feature && feature.geometry && feature.geometry.coordinates;
  const lat = Number(coords && coords[1]);
  const lng = Number(coords && coords[0]);
  if (!validLatLng(lat, lng)) return null;
  const housenumber = clean(p.housenumber) || null;
  const street = clean(p.street) || null;
  return {
    lat,
    lng,
    name: clean(p.name) || null,
    housenumber,
    street,
    suburb: clean(p.suburb || p.district || p.locality) || null,
    city: clean(p.city) || null,
    state: clean(p.state) || null,
    country: clean(p.country) || null,
    postcode: clean(p.postcode) || null,
    has_address: Boolean(housenumber || street),
    label: labelFromProperties(p) || clean(p.name) || `${lat}, ${lng}`,
    provider: 'photon',
  };
}

function nominatimPlace(hit) {
  const a = (hit && hit.address) || {};
  const lat = Number(hit && hit.lat);
  const lng = Number(hit && hit.lon);
  if (!validLatLng(lat, lng)) return null;
  const housenumber = clean(a.house_number) || null;
  const street = clean(a.road || a.pedestrian || a.footway || a.path) || null;
  return {
    lat,
    lng,
    name: clean(hit.name) || null,
    housenumber,
    street,
    suburb: clean(a.suburb || a.neighbourhood) || null,
    city: clean(a.city || a.town || a.village || a.municipality) || null,
    state: clean(a.state) || null,
    country: clean(a.country) || null,
    postcode: clean(a.postcode) || null,
    has_address: Boolean(housenumber || street),
    label: clean(hit.display_name) || '',
    provider: 'nominatim',
  };
}

/**
 * Score a candidate so an exact street address beats a suburb or city centroid.
 * This is what stops "12 Main Rd" from silently resolving to the middle of the
 * suburb it happens to sit in.
 */
export function addressScore(place, query) {
  if (!place) return -1;
  let score = 0;
  if (place.housenumber) score += 6;
  if (place.street) score += 3;
  if (place.postcode) score += 1;
  if (place.city) score += 1;
  if (place.has_address) score += 2;
  const label = String(place.label || '').toLowerCase();
  const tokens = clean(query).toLowerCase().split(/[ ,]+/).filter((token) => token.length > 1);
  tokens.forEach((token) => { if (label.includes(token)) score += 2; });
  return score;
}

/** Choose the most precise candidate for a free-form address query. */
export function pickBestPlace(places, query) {
  const list = Array.isArray(places) ? places.filter(Boolean) : [];
  if (!list.length) return null;
  let best = list[0];
  let bestScore = addressScore(best, query);
  for (let i = 1; i < list.length; i += 1) {
    const score = addressScore(list[i], query);
    if (score > bestScore) {
      best = list[i];
      bestScore = score;
    }
  }
  return best;
}

/**
 * Return several candidate locations so a caller can offer address
 * suggestions. Photon (fast, OSM-backed) first; its South African coverage is
 * patchy, so we fall back to Nominatim.
 */
export async function geocodeCandidates(queryText, { limit = 6, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const q = clean(queryText);
  if (q.length < 3) return [];
  const capped = Math.max(1, Math.min(Number(limit) || 6, 10));

  const photonUrl = `${PHOTON_URL}?q=${encodeURIComponent(q)}&limit=${capped}&lang=en&bbox=${ZA_BBOX}`;
  const photon = await fetchJson(photonUrl, { timeoutMs });
  const features = photon && Array.isArray(photon.features) ? photon.features : [];
  const fromPhoton = features
    // A bbox only biases Photon's ranking, so verify each hit really is in
    // South Africa — otherwise Lesotho (an enclave inside the box) leaks in.
    .filter((feature) => {
      const p = (feature && feature.properties) || {};
      if (p.countrycode) return String(p.countrycode).toUpperCase() === 'ZA';
      const coords = feature && feature.geometry && feature.geometry.coordinates;
      return Boolean(coords) && inSouthAfrica(Number(coords[0]), Number(coords[1]));
    })
    .map(photonPlace)
    .filter(Boolean);
  if (fromPhoton.length) return fromPhoton;

  const parts = [`q=${encodeURIComponent(q)}`];
  parts.push('format=jsonv2', `limit=${capped}`, 'addressdetails=1', 'countrycodes=za');
  const osm = await fetchJson(`${NOMINATIM_URL}?${parts.join('&')}`, { timeoutMs });
  return (Array.isArray(osm) ? osm : []).map(nominatimPlace).filter(Boolean);
}

/**
 * Turn a free-form address (or suburb/city) into the most precise coordinates
 * we can find. Prefers an exact street address over a suburb centroid.
 */
export async function geocode(queryText, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const candidates = await geocodeCandidates(queryText, { limit: 5, timeoutMs });
  return pickBestPlace(candidates, queryText);
}

/** Resolve coordinates into a human-readable suburb/city label. */
export async function reverseGeocode(lat, lng, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (!validLatLng(lat, lng)) return null;
  const url = `${NOMINATIM_REVERSE_URL}?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`
    + '&format=jsonv2&zoom=16&addressdetails=1';
  const data = await fetchJson(url, { timeoutMs });
  if (!data) return null;
  return {
    label: clean(data.display_name) || null,
    suburb: clean(data.address && (data.address.suburb || data.address.neighbourhood)) || null,
    city: clean(data.address && (data.address.city || data.address.town || data.address.village)) || null,
    postcode: clean(data.address && data.address.postcode) || null,
  };
}

/** Build a geocoding query from structured address fields. */
export function addressQuery(address) {
  if (!address) return '';
  if (typeof address === 'string') return clean(address);
  return [
    address.line1, address.line2, address.suburb, address.city,
    address.state, address.postal_code, address.country,
  ].map(clean).filter(Boolean).join(', ');
}

/**
 * Rank laundromats for a searcher.
 * - Rows with coordinates get a distance and are sorted nearest-first.
 * - Rows inside the radius come first; the rest follow so a user always sees
 *   *something* instead of an empty screen (unless `strict`).
 */
export function rankByDistance(rows = [], origin = null, { radiusKm = 25, limit = 20, strict = false } = {}) {
  const items = Array.isArray(rows) ? rows : [];
  if (!origin || !validLatLng(origin.lat, origin.lng)) {
    return items.slice(0, limit);
  }
  const radius = Number(radiusKm) > 0 ? Number(radiusKm) : 25;
  const withDistance = items.map((row) => {
    const hasCoords = validLatLng(row.latitude, row.longitude);
    if (!hasCoords) return { row, distance: null };
    return {
      row,
      distance: Number(haversineKm(origin.lat, origin.lng, Number(row.latitude), Number(row.longitude)).toFixed(2)),
    };
  });

  const decorated = withDistance.map(({ row, distance }) => ({
    ...row,
    distance_km: distance,
    within_radius: distance != null ? distance <= radius : false,
    has_coordinates: distance != null,
  }));

  // Nearest first; unknown-location rows last, keeping a stable name order.
  decorated.sort((a, b) => {
    if (a.distance_km == null && b.distance_km == null) {
      return String(a.name || '').localeCompare(String(b.name || ''));
    }
    if (a.distance_km == null) return 1;
    if (b.distance_km == null) return -1;
    return a.distance_km - b.distance_km;
  });

  if (strict) return decorated.filter((r) => r.within_radius).slice(0, limit);
  return decorated.slice(0, limit);
}

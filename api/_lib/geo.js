// Geocoding + distance helpers shared by /api/geo, the owner profile editor and
// booking serviceability checks. Everything degrades gracefully: a failed
// provider must never take a request down.

const PHOTON_URL = 'https://photon.komoot.io/api/';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';
const DEFAULT_TIMEOUT_MS = 4500;
const USER_AGENT = 'LaundroMaster/1.0 (+https://laundromaster.re-el.co.za)';

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

function nicknameFromProperties(p = {}) {
  return clean(p.name || p.street || p.city) || null;
}

/** Turn a free-form address (or suburb/city) into coordinates. */
export async function geocode(queryText, { limit = 1, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const q = clean(queryText);
  if (q.length < 3) return null;

  const photonUrl = `${PHOTON_URL}?q=${encodeURIComponent(q)}&limit=${Math.max(1, Math.min(limit, 5))}`;
  const photon = await fetchJson(photonUrl, { timeoutMs });
  const feature = photon && Array.isArray(photon.features) ? photon.features[0] : null;
  const coords = feature && feature.geometry && feature.geometry.coordinates;
  if (coords && coords.length >= 2 && validLatLng(coords[1], coords[0])) {
    return {
      lat: Number(coords[1]),
      lng: Number(coords[0]),
      label: labelFromProperties(feature.properties) || q,
      name: nicknameFromProperties(feature.properties),
      provider: 'photon',
    };
  }

  // Photon is fast but its South African coverage is patchy. Fall back to OSM.
  const parts = [];
  if (q) parts.push(`q=${encodeURIComponent(q)}`);
  parts.push('format=jsonv2', 'limit=1', 'addressdetails=1', 'countrycodes=za');
  const osm = await fetchJson(`${NOMINATIM_URL}?${parts.join('&')}`, { timeoutMs });
  const hit = Array.isArray(osm) ? osm[0] : null;
  if (hit && validLatLng(hit.lat, hit.lon)) {
    return {
      lat: Number(hit.lat),
      lng: Number(hit.lon),
      label: clean(hit.display_name) || q,
      name: nicknameFromProperties(hit.address || {}),
      provider: 'nominatim',
    };
  }

  return null;
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

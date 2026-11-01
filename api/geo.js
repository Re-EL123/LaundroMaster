import { createHandler } from './_lib/handler.js';
import { successEnvelope, errorEnvelope, ApiError } from './_lib/errors.js';
import { adminClient } from './_lib/supabase-admin.js';
import { query, body } from './_lib/req.js';
import { getUser, isAdmin } from './_lib/auth.js';
import {
  geocode, reverseGeocode, validLatLng, rankByDistance,
} from './_lib/geo.js';

const SEARCH_FIELDS = [
  'id', 'name', 'description', 'address', 'phone', 'logo_path', 'photos',
  'latitude', 'longitude', 'rating_average', 'rating_count', 'is_featured',
  'featured_until', 'verification_status', 'view_count', 'created_at',
].join(', ');

function textMatch(row, term) {
  if (!term) return true;
  const needle = String(term).toLowerCase();
  return [row.name, row.address, row.description]
    .some((value) => String(value || '').toLowerCase().includes(needle));
}

// When we cannot geocode the query, only trust fields that imply a place.
function placeMatch(row, term) {
  if (!term) return true;
  const needle = String(term).toLowerCase();
  return [row.name, row.address]
    .some((value) => String(value || '').toLowerCase().includes(needle));
}

// Best-effort: fill coordinates for listings that only have a postal address.
// Runs at most `max` geocodes per request so search stays inside the 10s budget.
async function backfillCoordinates(supa, rows, { max = 6, timeoutMs = 3500 } = {}) {
  const missing = rows
    .filter((row) => !validLatLng(row.latitude, row.longitude) && row.address)
    .slice(0, max);
  if (!missing.length) return;

  await Promise.all(missing.map(async (row) => {
    const loc = await geocode(row.address, { timeoutMs });
    if (!loc) return;
    row.latitude = loc.lat;
    row.longitude = loc.lng;
    try {
      await supa.from('laundromats')
        .update({ latitude: loc.lat, longitude: loc.lng, updated_at: new Date().toISOString() })
        .eq('id', row.id);
    } catch { /* backfill is best effort */ }
  }));
}

export default createHandler(async function handler(req, res) {
  const q = query(req);
  const supa = adminClient();
  if (!supa) return res.status(503).json(errorEnvelope(new ApiError('NOT_CONFIGURED', 'Supabase not configured', 503)));

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json(errorEnvelope(new ApiError('METHOD_NOT_ALLOWED', 'Method not allowed', 405)));
  }

  const action = q.action || (req.method === 'POST' ? body(req).action : '') || 'search';

  if (action === 'geocode') {
    const term = q.q || body(req).q || q.address;
    const loc = await geocode(term, { limit: 1 });
    if (!loc) return res.status(200).json(successEnvelope(null));
    return res.status(200).json(successEnvelope(loc));
  }

  if (action === 'reverse') {
    const lat = Number(q.lat != null ? q.lat : body(req).lat);
    const lng = Number(q.lng != null ? q.lng : body(req).lng);
    if (!validLatLng(lat, lng)) {
      return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', 'Valid lat and lng are required')));
    }
    const loc = await reverseGeocode(lat, lng);
    return res.status(200).json(successEnvelope(loc));
  }

  // Admin utility: geocode every listing that is missing coordinates.
  if (action === 'backfill') {
    const ctx = await getUser(req);
    if (!isAdmin(ctx)) {
      return res.status(403).json(errorEnvelope(new ApiError('FORBIDDEN', 'Admins only', 403)));
    }
    if (req.method !== 'POST') {
      return res.status(405).json(errorEnvelope(new ApiError('METHOD_NOT_ALLOWED', 'Use POST', 405)));
    }
    const limit = Math.min(Number(body(req).limit) || 50, 200);
    const { data: pending, error } = await supa
      .from('laundromats')
      .select('id, name, address, latitude, longitude')
      .not('address', 'is', null)
      .or('latitude.is.null,longitude.is.null')
      .order('created_at', { ascending: true })
      .limit(limit);
    if (error) return res.status(500).json(errorEnvelope(error));

    const targets = (pending || []).filter((row) => !validLatLng(row.latitude, row.longitude));
    let updated = 0;
    let failed = 0;
    for (const row of targets) {
      const loc = await geocode(row.address);
      if (!loc) { failed += 1; continue; }
      const { error: updateError } = await supa.from('laundromats')
        .update({ latitude: loc.lat, longitude: loc.lng, updated_at: new Date().toISOString() })
        .eq('id', row.id);
      if (updateError) failed += 1;
      else updated += 1;
    }
    return res.status(200).json(successEnvelope({ checked: targets.length, updated, failed }));
  }

  if (action !== 'search') {
    return res.status(200).json(successEnvelope({ service: 'geo', ok: true }));
  }

  const limit = Math.min(Number(q.limit) || 20, 50);
  const radiusKm = Number(q.radius_km) > 0 ? Number(q.radius_km) : 25;
  // Near-me is a *radius* search by default. Results farther than the radius
  // are only returned when the customer explicitly asks for them.
  const includeFar = q.include_far === '1' || q.include_far === 'true';
  const browseAll = q.all === '1' || q.all === 'true';
  const term = String(q.q || '').trim().slice(0, 120);
  const wantBackfill = q.backfill !== '0';

  let lat = Number(q.lat);
  let lng = Number(q.lng);
  let originLabel = null;
  let origin = null;

  if (validLatLng(lat, lng)) {
    origin = { lat, lng };
  } else if (term && !browseAll) {
    // Let a suburb/city (or full address) stand in for browser geolocation.
    // "Browse all" is explicit: it must not be narrowed to the radius.
    const loc = await geocode(term, { limit: 1, timeoutMs: 4000 });
    if (loc) {
      origin = { lat: loc.lat, lng: loc.lng };
      originLabel = loc.label;
      lat = loc.lat;
      lng = loc.lng;
    }
  }

  const { data, error } = await supa
    .from('laundromats')
    .select(`${SEARCH_FIELDS}, services(base_price, is_active)`)
    .eq('verification_status', 'approved');
  if (error) return res.status(500).json(errorEnvelope(error));

  const rows = (data || []).map((row) => {
    const active = (row.services || []).filter((s) => s.is_active !== false);
    const prices = active.map((s) => Number(s.base_price)).filter((n) => Number.isFinite(n));
    return {
      ...row,
      starting_price: prices.length ? Math.min(...prices) : null,
    };
  });

  // No anchor for distance: only show rows that obviously match the typed
  // place (or everything when the customer explicitly chose "browse all").
  if (!origin) {
    if (!term && !browseAll) {
      return res.status(200).json(successEnvelope([], {
        origin: null,
        originLabel: null,
        radiusKm,
        includeFar,
        needsLocation: true,
        totalExamined: rows.length,
        totalWithin: 0,
        totalOutside: 0,
        totalUnknown: 0,
      }));
    }

    const matches = rows.filter((row) => (browseAll ? textMatch(row, term) : placeMatch(row, term)));
    matches.sort((a, b) => {
      const featured = Number(Boolean(b.is_featured)) - Number(Boolean(a.is_featured));
      if (featured) return featured;
      return (Number(b.rating_average) || 0) - (Number(a.rating_average) || 0);
    });
    return res.status(200).json(successEnvelope(matches.slice(0, limit).map((row) => ({
      ...row,
      distance_km: null,
      within_radius: false,
      has_coordinates: false,
    })), {
      origin: null,
      originLabel: term || null,
      radiusKm,
      includeFar,
      browseAll,
      needsLocation: false,
      approximate: Boolean(term) && !browseAll,
      totalExamined: rows.length,
      totalWithin: 0,
      totalOutside: 0,
      totalUnknown: matches.length,
    }));
  }

  if (wantBackfill) {
    await backfillCoordinates(supa, rows, { max: 6 });
  }

  // Decorate and sort every listing, then decide what the customer may see.
  const decorated = rankByDistance(rows, origin, {
    radiusKm,
    limit: Math.max(rows.length, limit),
    strict: false,
  });
  const within = decorated.filter((row) => row.within_radius);
  const unknown = decorated.filter((row) => !row.has_coordinates).length;
  const visible = includeFar ? decorated : within;

  return res.status(200).json(successEnvelope(visible.slice(0, limit), {
    origin,
    originLabel,
    radiusKm,
    includeFar,
    needsLocation: false,
    totalExamined: rows.length,
    totalWithin: within.length,
    totalOutside: decorated.length - within.length - unknown,
    totalUnknown: unknown,
  }));
});

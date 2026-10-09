import { createHandler } from './_lib/handler.js';
import { successEnvelope, errorEnvelope, ApiError } from './_lib/errors.js';
import { adminClient } from './_lib/supabase-admin.js';
import { query } from './_lib/req.js';

function toRad(deg) { return (deg * Math.PI) / 180; }

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export default createHandler(async function handler(req, res) {
  const q = query(req);
  const supa = adminClient();
  if (!supa) return res.status(503).json(errorEnvelope(new ApiError('NOT_CONFIGURED', 'Supabase not configured', 503)));

  if (req.method !== 'GET') {
    return res.status(405).json(errorEnvelope(new ApiError('METHOD_NOT_ALLOWED', 'Method not allowed', 405)));
  }

  const action = q.action || 'search';
  if (action !== 'search') {
    return res.status(200).json(successEnvelope({ service: 'geo', ok: true }));
  }

  const lat = Number(q.lat);
  const lng = Number(q.lng);
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', 'lat and lng are required')));
  }
  const radius = Number(q.radius_km) > 0 ? Number(q.radius_km) : 25;
  const limit = Math.min(Number(q.limit) || 20, 50);

  const { data, error } = await supa
    .from('laundromats')
    .select('*')
    .eq('verification_status', 'approved')
    .not('latitude', 'is', null)
    .not('longitude', 'is', null);
  if (error) return res.status(500).json(errorEnvelope(error));

  const withDistance = (data || [])
    .map((b) => ({ ...b, distance_km: Number(haversineKm(lat, lng, Number(b.latitude), Number(b.longitude)).toFixed(2)) }))
    .filter((b) => b.distance_km <= radius)
    .sort((a, b) => a.distance_km - b.distance_km)
    .slice(0, limit);

  return res.status(200).json(successEnvelope(withDistance));
});

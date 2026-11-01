// Serviceability helpers: operating hours and delivery zones.

/** South Africa has no DST, so a fixed +02:00 shift is safe. */
export function sastParts(date = new Date()) {
  const shifted = new Date(new Date(date).getTime() + 2 * 60 * 60 * 1000);
  return {
    weekday: shifted.getUTCDay(), // 0 = Sunday
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

export function timeToMinutes(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * Returns { configured, open, reason }. A laundromat with no hours configured
 * is always bookable (we should not punish incomplete onboarding).
 */
export function isOpenAt(hours = [], date = new Date()) {
  const rows = Array.isArray(hours) ? hours : [];
  const configured = rows.some((row) => row && (row.open_time || row.close_time || row.is_closed));
  if (!configured) return { configured: false, open: true, reason: null };

  const { weekday, minutes } = sastParts(date);
  const row = rows.find((r) => Number(r.weekday) === weekday);
  if (!row || row.is_closed) {
    return { configured: true, open: false, reason: 'The laundromat is closed on that day.' };
  }
  const open = timeToMinutes(row.open_time);
  const close = timeToMinutes(row.close_time);
  if (open == null || close == null) {
    return { configured: true, open: false, reason: 'Opening hours are not configured for that day.' };
  }
  const isOpen = close <= open
    ? (minutes >= open || minutes < close) // overnight window
    : (minutes >= open && minutes < close);
  return {
    configured: true,
    open: isOpen,
    reason: isOpen ? null : `The laundromat is open ${row.open_time}–${row.close_time} on that day.`,
  };
}

/** Pick the smallest configured zone that covers `distanceKm`. */
export function resolveDeliveryZone(zones = [], distanceKm) {
  const rows = (Array.isArray(zones) ? zones : [])
    .filter((zone) => zone && zone.radius_km != null && Number(zone.radius_km) >= 0);
  if (!rows.length || distanceKm == null || !Number.isFinite(Number(distanceKm))) {
    return { zone: null, fee: null, outOfArea: false, hasZones: rows.length > 0 };
  }
  const distance = Number(distanceKm);
  const matches = rows
    .filter((zone) => distance <= Number(zone.radius_km))
    .sort((a, b) => Number(a.radius_km) - Number(b.radius_km));
  if (!matches.length) {
    return { zone: null, fee: null, outOfArea: true, hasZones: true };
  }
  return { zone: matches[0], fee: Number(matches[0].fee) || 0, outOfArea: false, hasZones: true };
}

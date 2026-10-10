let lastRun = 0;
const INTERVAL_MS = 5 * 60 * 1000;

// Reconciles time-based promotion state:
//   - flips past-due active promotions to "expired"
//   - clears stale laundromats.is_featured flags whose featured_until has passed
// Best-effort and throttled (at most once per interval per warm instance), so it is
// safe to call from low-traffic admin/owner endpoints and the public discover list.
export async function reconcilePromotions(supa, { force = false } = {}) {
  if (!supa) return;
  const now = Date.now();
  if (!force && now - lastRun < INTERVAL_MS) return;
  lastRun = now;
  const iso = new Date(now).toISOString();
  try {
    await supa.from('promotions').update({ status: 'expired' }).eq('status', 'active').lt('ends_at', iso);
  } catch { /* best-effort */ }
  try {
    await supa.from('laundromats')
      .update({ is_featured: false })
      .eq('is_featured', true)
      .or(`featured_until.is.null,featured_until.lt.${iso}`);
  } catch { /* best-effort */ }
}

// Increments the impression counter for live featured promotions shown in a
// result set. Best-effort; never throws into the request path.
export async function recordImpressions(supa, laundromatIds) {
  const ids = (laundromatIds || []).filter(Boolean);
  if (!supa || !ids.length) return;
  const iso = new Date().toISOString();
  try {
    const { data } = await supa.from('promotions')
      .select('id, impressions')
      .in('laundromat_id', ids)
      .eq('kind', 'featured')
      .eq('status', 'active')
      .gt('ends_at', iso);
    if (!data || !data.length) return;
    await Promise.all(data.map((p) => supa.from('promotions')
      .update({ impressions: (Number(p.impressions) || 0) + 1 })
      .eq('id', p.id)));
  } catch { /* best-effort */ }
}

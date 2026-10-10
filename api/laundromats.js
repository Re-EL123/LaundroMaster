import { createHandler } from './_lib/handler.js';
import { successEnvelope, errorEnvelope, ApiError } from './_lib/errors.js';
import { adminClient } from './_lib/supabase-admin.js';
import { query, body } from './_lib/req.js';
import { getUser, isAdmin } from './_lib/auth.js';
import { favoriteToggle } from './_lib/validation.js';
import { reconcilePromotions, recordImpressions } from './_lib/promotions.js';

export default createHandler(async function handler(req, res) {
  const q = query(req);
  const action = q.action || '';
  const supa = adminClient();
  if (!supa) return res.status(503).json(errorEnvelope(new ApiError('NOT_CONFIGURED', 'Supabase not configured', 503)));

  if (req.method === 'GET') {
    if (action === 'services') {
      const id = q.id;
      if (!id) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', 'Missing laundromat id')));
      const ctx = await getUser(req);
      const { data: biz } = await supa.from('laundromats').select('id, owner_id, verification_status').eq('id', id).maybeSingle();
      if (!biz) return res.status(404).json(errorEnvelope(new ApiError('NOT_FOUND', 'Laundromat not found', 404)));
      const privileged = isAdmin(ctx) || (ctx.user && biz.owner_id === ctx.user.id);
      let request = supa.from('services').select('*').eq('laundromat_id', id).order('base_price', { ascending: true });
      if (!privileged) request = request.eq('is_active', true);
      const { data, error } = await request;
      if (error) return res.status(500).json(errorEnvelope(error));
      return res.status(200).json(successEnvelope(data || []));
    }

    if (action === 'favorites') {
      const ctx = await getUser(req);
      if (!ctx.user) return res.status(401).json(errorEnvelope(new ApiError('UNAUTHORIZED', 'Authentication required', 401)));
      const { data, error } = await supa
        .from('favorites')
        .select('created_at, laundromats(*)')
        .eq('user_id', ctx.user.id)
        .order('created_at', { ascending: false });
      if (error) return res.status(500).json(errorEnvelope(error));
      const items = (data || []).map((row) => row.laundromats).filter(Boolean);
      return res.status(200).json(successEnvelope(items));
    }

    const { id } = q;
    if (id) {
      const { data, error } = await supa.from('laundromats').select('*').eq('id', id).maybeSingle();
      if (error || !data) return res.status(404).json(errorEnvelope(new ApiError('NOT_FOUND', 'Laundromat not found', 404)));
      const ctx = await getUser(req);
      const visible = data.verification_status === 'approved' || isAdmin(ctx) || (ctx.user && data.owner_id === ctx.user.id);
      if (!visible) return res.status(404).json(errorEnvelope(new ApiError('NOT_FOUND', 'Laundromat not found', 404)));
      try {
        await supa.from('laundromats').update({ view_count: (Number(data.view_count) || 0) + 1 }).eq('id', id);
      } catch { /* view counting is best-effort */ }
      return res.status(200).json(successEnvelope(data));
    }

    await reconcilePromotions(supa);
    const limit = Math.min(Number(q.limit) || 20, 100);
    const offset = Math.max(Number(q.offset) || 0, 0);
    const maxPrice = q.max_price != null && q.max_price !== '' ? Number(q.max_price) : null;
    const select = maxPrice != null ? '*, services!inner(base_price, is_active)' : '*';
    let request = supa
      .from('laundromats')
      .select(select)
      .eq('verification_status', 'approved')
      .range(offset, offset + limit - 1);
    const term = q.q ? String(q.q).replace(/[,()\\*]/g, ' ').trim().slice(0, 80) : '';
    if (term) request = request.or(`name.ilike.%${term}%,address.ilike.%${term}%,description.ilike.%${term}%`);
    if (q.min_rating) request = request.gte('rating_average', Number(q.min_rating));
    if (maxPrice != null) request = request.lte('services.base_price', maxPrice).eq('services.is_active', true);
    const sort = q.sort || 'featured';
    if (sort === 'rating') request = request.order('rating_average', { ascending: false });
    else if (sort === 'name') request = request.order('name', { ascending: true });
    else if (sort === 'newest') request = request.order('created_at', { ascending: false });
    else request = request.order('is_featured', { ascending: false }).order('rating_average', { ascending: false });
    const { data, error } = await request;
    if (error) return res.status(500).json(errorEnvelope(error));
    if (sort === 'featured') {
      await recordImpressions(supa, (data || []).filter((l) => l.is_featured).map((l) => l.id));
    }
    return res.status(200).json(successEnvelope(data || []));
  }

  if (req.method === 'POST') {
    if (action === 'favorite') {
      const ctx = await getUser(req);
      if (!ctx.user) return res.status(401).json(errorEnvelope(new ApiError('UNAUTHORIZED', 'Authentication required', 401)));
      const parsed = favoriteToggle.safeParse(body(req));
      if (!parsed.success) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', parsed.error.message)));
      const { laundromat_id } = parsed.data;
      const { data: existing } = await supa.from('favorites').select('id').eq('user_id', ctx.user.id).eq('laundromat_id', laundromat_id).maybeSingle();
      if (existing) {
        await supa.from('favorites').delete().eq('id', existing.id);
        return res.status(200).json(successEnvelope({ favorited: false }));
      }
      const { error } = await supa.from('favorites').insert({ user_id: ctx.user.id, laundromat_id });
      if (error) return res.status(400).json(errorEnvelope(error));
      return res.status(201).json(successEnvelope({ favorited: true }));
    }

    if (action === 'promotion-click') {
      const laundromat_id = body(req).laundromat_id;
      if (!laundromat_id) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', 'Missing laundromat_id')));
      const { data: promo } = await supa.from('promotions')
        .select('id, clicks')
        .eq('laundromat_id', laundromat_id)
        .eq('status', 'active')
        .gt('ends_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (promo) {
        try {
          await supa.from('promotions').update({ clicks: (Number(promo.clicks) || 0) + 1 }).eq('id', promo.id);
        } catch { /* ignore */ }
      }
      return res.status(200).json(successEnvelope({ ok: true }));
    }
    return res.status(405).json(errorEnvelope(new ApiError('METHOD_NOT_ALLOWED', 'Method not allowed', 405)));
  }

  return res.status(405).json(errorEnvelope(new ApiError('METHOD_NOT_ALLOWED', 'Method not allowed', 405)));
});

import { createHandler } from './_lib/handler.js';
import { successEnvelope, errorEnvelope, ApiError } from './_lib/errors.js';
import { adminClient } from './_lib/supabase-admin.js';
import { query, body } from './_lib/req.js';
import { requireUser, getUser, isAdmin } from './_lib/auth.js';
import { reviewCreate } from './_lib/validation.js';
import { getSettings, bool } from './_lib/settings.js';

async function recomputeRating(supa, laundromatId) {
  const { data } = await supa.from('reviews')
    .select('rating')
    .eq('laundromat_id', laundromatId)
    .eq('moderation_status', 'published');
  const rows = data || [];
  const count = rows.length;
  const avg = count ? rows.reduce((s, r) => s + (Number(r.rating) || 0), 0) / count : 0;
  await supa.from('laundromats')
    .update({ rating_average: Number(avg.toFixed(2)), rating_count: count })
    .eq('id', laundromatId);
}

export default createHandler(async function handler(req, res) {
  const q = query(req);
  const supa = adminClient();
  if (!supa) return res.status(503).json(errorEnvelope(new ApiError('NOT_CONFIGURED', 'Supabase not configured', 503)));

  if (req.method === 'GET') {
    const action = q.action || '';
    if (action === 'pending' || action === 'all') {
      const ctx = await getUser(req);
      if (!isAdmin(ctx)) return res.status(403).json(errorEnvelope(new ApiError('FORBIDDEN', 'Admins only', 403)));
      let request = supa.from('reviews')
        .select('id, rating, review_text, photos, moderation_status, created_at, laundromat_id, booking_id, customer_id, laundromats(id, name), profiles!reviews_customer_id_fkey(full_name, email, avatar_path)')
        .order('created_at', { ascending: false })
        .limit(Math.min(Number(q.limit) || 100, 200));
      if (action === 'pending') request = request.eq('moderation_status', 'pending');
      if (q.status) request = request.eq('moderation_status', q.status);
      const { data, error } = await request;
      if (error) return res.status(500).json(errorEnvelope(error));
      return res.status(200).json(successEnvelope(data || []));
    }

    if (!q.laundromat_id) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', 'Missing laundromat_id')));
    const { data, error } = await supa
      .from('reviews')
      .select('id, rating, review_text, photos, created_at, profiles!reviews_customer_id_fkey(full_name, avatar_path)')
      .eq('laundromat_id', q.laundromat_id)
      .eq('moderation_status', 'published')
      .order('created_at', { ascending: false })
      .limit(Math.min(Number(q.limit) || 50, 100));
    if (error) return res.status(500).json(errorEnvelope(error));
    return res.status(200).json(successEnvelope(data || []));
  }

  if (req.method === 'POST') {
    const action = q.action || body(req).action || '';
    const ctx = await requireUser(req);

    if (action === 'moderate') {
      if (!isAdmin(ctx)) return res.status(403).json(errorEnvelope(new ApiError('FORBIDDEN', 'Admins only', 403)));
      const input = body(req);
      const reviewId = input.review_id || input.id;
      const status = input.status;
      if (!reviewId || !['pending', 'published', 'hidden'].includes(status)) {
        return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', 'review_id and a valid status are required')));
      }
      const { data: review } = await supa.from('reviews')
        .select('id, laundromat_id').eq('id', reviewId).maybeSingle();
      if (!review) return res.status(404).json(errorEnvelope(new ApiError('NOT_FOUND', 'Review not found', 404)));
      const { data, error } = await supa.from('reviews')
        .update({ moderation_status: status })
        .eq('id', reviewId)
        .select()
        .single();
      if (error) return res.status(400).json(errorEnvelope(error));
      await recomputeRating(supa, review.laundromat_id);
      return res.status(200).json(successEnvelope(data));
    }

    if (action === 'delete') {
      if (!isAdmin(ctx)) return res.status(403).json(errorEnvelope(new ApiError('FORBIDDEN', 'Admins only', 403)));
      const reviewId = body(req).review_id || body(req).id;
      if (!reviewId) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', 'Missing review_id')));
      const { data: review } = await supa.from('reviews')
        .select('id, laundromat_id').eq('id', reviewId).maybeSingle();
      if (!review) return res.status(404).json(errorEnvelope(new ApiError('NOT_FOUND', 'Review not found', 404)));
      const { error } = await supa.from('reviews').delete().eq('id', reviewId);
      if (error) return res.status(400).json(errorEnvelope(error));
      await recomputeRating(supa, review.laundromat_id);
      return res.status(200).json(successEnvelope({ id: reviewId, deleted: true }));
    }

    const settings = await getSettings(supa);
    if (bool(settings.feature_reviews, true) === false) {
      return res.status(403).json(errorEnvelope(new ApiError('FEATURE_DISABLED', 'Reviews are temporarily disabled', 403)));
    }

    const parsed = reviewCreate.safeParse(body(req));
    if (!parsed.success) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', parsed.error.message)));
    const p = parsed.data;
    // validate booking
    if (p.booking_id) {
      const { data: b } = await supa.from('bookings').select('id,customer_id,status,laundromat_id').eq('id', p.booking_id).single();
      if (!b || b.customer_id !== ctx.user.id || String(b.status).toLowerCase() !== 'completed' || b.laundromat_id !== p.laundromat_id) {
        return res.status(403).json(errorEnvelope(new ApiError('FORBIDDEN', 'Invalid booking for review', 403)));
      }
      const { data: ex } = await supa.from('reviews').select('id').eq('booking_id', p.booking_id).limit(1);
      if (ex && ex.length > 0) {
        return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', 'Review exists', 400)));
      }
    }
    const payload = { ...p, customer_id: ctx.user.id, moderation_status: 'pending' };
    const { data, error } = await supa.from('reviews').insert(payload).select().single();
    if (error) return res.status(400).json(errorEnvelope(error));
    return res.status(201).json(successEnvelope({
      ...data,
      message: 'Thanks! Your review will appear once it has been reviewed.',
    }));
  }

  return res.status(405).json(errorEnvelope(new ApiError('METHOD_NOT_ALLOWED', 'Method not allowed', 405)));
});

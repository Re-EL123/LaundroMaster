import { createHandler } from './_lib/handler.js';
import { successEnvelope, errorEnvelope, ApiError } from './_lib/errors.js';
import { adminClient } from './_lib/supabase-admin.js';
import { query, body } from './_lib/req.js';
import { requireUser } from './_lib/auth.js';
import { reviewCreate } from './_lib/validation.js';

async function recomputeRating(supa, laundromatId) {
  const { data } = await supa.from('reviews').select('rating').eq('laundromat_id', laundromatId).eq('moderation_status', 'published');
  const rows = data || [];
  const count = rows.length;
  const avg = count ? rows.reduce((s, r) => s + (Number(r.rating) || 0), 0) / count : 0;
  await supa.from('laundromats').update({ rating_average: Number(avg.toFixed(2)), rating_count: count }).eq('id', laundromatId);
}

export default createHandler(async function handler(req, res) {
  const q = query(req);
  const supa = adminClient();
  if (!supa) return res.status(503).json(errorEnvelope(new ApiError('NOT_CONFIGURED', 'Supabase not configured', 503)));

  if (req.method === 'GET') {
    if (!q.laundromat_id) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', 'Missing laundromat_id')));
    const { data, error } = await supa
      .from('reviews')
      .select('id, rating, review_text, created_at, profiles!reviews_customer_id_fkey(full_name)')
      .eq('laundromat_id', q.laundromat_id)
      .eq('moderation_status', 'published')
      .order('created_at', { ascending: false })
      .limit(Math.min(Number(q.limit) || 50, 100));
    if (error) return res.status(500).json(errorEnvelope(error));
    return res.status(200).json(successEnvelope(data || []));
  }

  if (req.method === 'POST') {
    const ctx = await requireUser(req);
    const parsed = reviewCreate.safeParse(body(req));
    if (!parsed.success) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', parsed.error.message)));
    const payload = { ...parsed.data, customer_id: ctx.user.id, moderation_status: 'published' };
    const { data, error } = await supa.from('reviews').insert(payload).select().single();
    if (error) return res.status(400).json(errorEnvelope(error));
    await recomputeRating(supa, payload.laundromat_id);
    return res.status(201).json(successEnvelope(data));
  }

  return res.status(405).json(errorEnvelope(new ApiError('METHOD_NOT_ALLOWED', 'Method not allowed', 405)));
});

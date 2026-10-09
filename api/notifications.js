import { createHandler } from './_lib/handler.js';
import { successEnvelope, errorEnvelope, ApiError } from './_lib/errors.js';
import { adminClient } from './_lib/supabase-admin.js';
import { query, body } from './_lib/req.js';
import { requireUser } from './_lib/auth.js';

export default createHandler(async function handler(req, res) {
  const q = query(req);
  const supa = adminClient();
  if (!supa) return res.status(503).json(errorEnvelope(new ApiError('NOT_CONFIGURED', 'Supabase not configured', 503)));

  const ctx = await requireUser(req);

  if (req.method === 'GET') {
    const { data, error } = await supa
      .from('notifications')
      .select('*')
      .eq('user_id', ctx.user.id)
      .order('created_at', { ascending: false })
      .limit(Math.min(Number(q.limit) || 50, 100));
    if (error) return res.status(500).json(errorEnvelope(error));
    return res.status(200).json(successEnvelope(data || []));
  }

  if (req.method === 'PATCH') {
    const id = q.id || body(req).id;
    if (!id) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', 'Missing id')));
    const { data, error } = await supa
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', ctx.user.id)
      .select()
      .maybeSingle();
    if (error) return res.status(400).json(errorEnvelope(error));
    return res.status(200).json(successEnvelope(data));
  }

  if (req.method === 'POST') {
    if ((q.action || '') === 'read-all') {
      const { error } = await supa
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', ctx.user.id)
        .is('read_at', null);
      if (error) return res.status(400).json(errorEnvelope(error));
      return res.status(200).json(successEnvelope({ ok: true }));
    }
    return res.status(405).json(errorEnvelope(new ApiError('METHOD_NOT_ALLOWED', 'Method not allowed', 405)));
  }

  return res.status(405).json(errorEnvelope(new ApiError('METHOD_NOT_ALLOWED', 'Method not allowed', 405)));
});

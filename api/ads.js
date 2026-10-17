import { createHandler } from './_lib/handler.js';
import { successEnvelope, errorEnvelope, ApiError } from './_lib/errors.js';
import { adminClient } from './_lib/supabase-admin.js';
import { query } from './_lib/req.js';

export default createHandler(async function handler(req, res) {
  const q = query(req);
  const supa = adminClient();
  if (!supa) return res.status(503).json(errorEnvelope(new ApiError('NOT_CONFIGURED', 'Supabase not configured', 503)));

  if (req.method === 'GET') {
    const placement = q.placement;
    let reqq = supa.from('ads').select('*')
      .eq('is_active', true)
      .lte('starts_at', new Date().toISOString())
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false });
    if (placement) reqq = reqq.eq('placement', placement);
    const { data, error } = await reqq;
    if (error) return res.status(500).json(errorEnvelope(error));
    const now = Date.now();
    const rows = (data || []).filter(a => !a.ends_at || new Date(a.ends_at).getTime() > now);
    return res.status(200).json(successEnvelope(rows));
  }

  if (req.method === 'POST') {
    const id = q.id;
    const action = q.action || '';
    if (action === 'click' && id) {
      await supa.rpc('increment_ad_click', { ad_id: id }).catch(() => {});
      return res.status(200).json(successEnvelope({ ok: true }));
    }
    if (action === 'impression' && id) {
      await supa.rpc('increment_ad_impression', { ad_id: id }).catch(() => {});
      return res.status(200).json(successEnvelope({ ok: true }));
    }
  }

  return res.status(405).json(errorEnvelope(new ApiError('METHOD_NOT_ALLOWED', 'Method not allowed', 405)));
});

import { createHandler } from './_lib/handler.js';
import { successEnvelope, errorEnvelope } from './_lib/errors.js';
import { adminClient } from './_lib/supabase-admin.js';

export default createHandler(async function handler(req, res) {
  const supa = adminClient();
  if (!supa) return res.status(503).json(errorEnvelope({ code: 'NOT_CONFIGURED', message: 'Supabase not configured' }));
  const { id } = req.query;
  if (req.method === 'GET') {
    if (id) {
      const { data, error } = await supa.from('laundromats').select('*').eq('id', id).single();
      if (error) return res.status(404).json(errorEnvelope({ code: 'NOT_FOUND', message: 'Laundromat not found' }));
      return res.status(200).json(successEnvelope(data));
    }
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const { data, error } = await supa.from('laundromats').select('*').eq('verification_status', 'approved').limit(limit);
    if (error) return res.status(500).json(errorEnvelope(error));
    return res.status(200).json(successEnvelope(data || []));
  }
  return res.status(405).json(errorEnvelope({ code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }));
});

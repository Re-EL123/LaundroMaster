import { successEnvelope, errorEnvelope } from './_lib/errors.js';
import { adminClient } from './_lib/supabase-admin.js';

export default async function handler(req, res) {
  try {
    const supa = adminClient();
    const { id } = req.query;
    if (req.method === 'GET') {
      if (id) {
        const { data } = await supa.from('laundromats').select('*').eq('id', id).single();
        return res.status(200).json(successEnvelope(data));
      }
      const limit = Number(req.query.limit) || 20;
      const { data } = await supa.from('laundromats').select('*').limit(limit);
      return res.status(200).json(successEnvelope(data||[]));
    }
    return res.status(405).json(errorEnvelope({ code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }));
  } catch (err) {
    return res.status(500).json(errorEnvelope(err));
  }
}

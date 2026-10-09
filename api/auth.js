import { createHandler } from './_lib/handler.js';
import { successEnvelope, errorEnvelope } from './_lib/errors.js';
import { userClient } from './_lib/supabase-user.js';

export default createHandler(async function handler(req, res) {
  const action = req.query.action || '';
  if (req.method === 'GET') {
    if (action === 'me') {
      const supa = userClient({ req });
      if (!supa) return res.status(503).json(errorEnvelope({ code: 'NOT_CONFIGURED', message: 'Supabase not configured' }));
      const token = (req.headers.authorization || '').replace('Bearer ', '');
      const { data, error } = await supa.auth.getUser(token);
      if (error) return res.status(401).json(errorEnvelope({ code: 'UNAUTHORIZED', message: 'Invalid session' }));
      return res.status(200).json(successEnvelope({ user: data.user }));
    }
    return res.status(200).json(successEnvelope({ service: 'auth', ok: true }));
  }
  return res.status(405).json(errorEnvelope({ code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }));
});

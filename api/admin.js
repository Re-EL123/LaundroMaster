import { createHandler } from './_lib/handler.js';
import { successEnvelope, errorEnvelope, ApiError } from './_lib/errors.js';
import { adminClient } from './_lib/supabase-admin.js';
import { query, body } from './_lib/req.js';
import { requireRoles } from './_lib/auth.js';
import { verifyLaundromat } from './_lib/validation.js';

export default createHandler(async function handler(req, res) {
  const q = query(req);
  const action = q.action || '';
  const supa = adminClient();
  if (!supa) return res.status(503).json(errorEnvelope(new ApiError('NOT_CONFIGURED', 'Supabase not configured', 503)));

  const ctx = await requireRoles(req, ['admin', 'super_admin']);

  if (req.method === 'GET') {
    if (action === 'stats') {
      const [{ count: pending }, { count: approved }, { count: users }, { count: bookings }] = await Promise.all([
        supa.from('laundromats').select('*', { count: 'exact', head: true }).eq('verification_status', 'pending'),
        supa.from('laundromats').select('*', { count: 'exact', head: true }).eq('verification_status', 'approved'),
        supa.from('profiles').select('*', { count: 'exact', head: true }),
        supa.from('bookings').select('*', { count: 'exact', head: true }),
      ]);
      return res.status(200).json(successEnvelope({ pending: pending || 0, approved: approved || 0, users: users || 0, bookings: bookings || 0 }));
    }

    if (action === 'laundromats' || action === 'verifications') {
      let request = supa.from('laundromats').select('*, profiles!laundromats_owner_id_fkey(id, full_name, email)').order('created_at', { ascending: false });
      if (action === 'verifications') request = request.in('verification_status', ['pending', 'rejected']);
      if (q.status) request = request.eq('verification_status', q.status);
      const { data, error } = await request;
      if (error) return res.status(500).json(errorEnvelope(error));
      return res.status(200).json(successEnvelope(data || []));
    }

    if (action === 'users') {
      const { data, error } = await supa.from('profiles').select('*, user_roles(role)').order('created_at', { ascending: false }).limit(200);
      if (error) return res.status(500).json(errorEnvelope(error));
      return res.status(200).json(successEnvelope(data || []));
    }

    if (action === 'audit') {
      const { data, error } = await supa.from('admin_logs').select('*').order('created_at', { ascending: false }).limit(200);
      if (error) return res.status(500).json(errorEnvelope(error));
      return res.status(200).json(successEnvelope(data || []));
    }

    return res.status(200).json(successEnvelope({ service: 'admin', ok: true }));
  }

  if (req.method === 'POST') {
    if (action === 'verify') {
      const parsed = verifyLaundromat.safeParse(body(req));
      if (!parsed.success) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', parsed.error.message)));
      const { laundromat_id, status, reason } = parsed.data;
      const { data, error } = await supa.from('laundromats').update({ verification_status: status }).eq('id', laundromat_id).select().single();
      if (error) return res.status(400).json(errorEnvelope(error));
      await supa.from('admin_logs').insert({
        actor_id: ctx.user.id,
        action: `verification.${status}`,
        target_type: 'laundromat',
        target_id: laundromat_id,
        detail: { reason: reason || null },
      });
      return res.status(200).json(successEnvelope(data));
    }

    return res.status(405).json(errorEnvelope(new ApiError('METHOD_NOT_ALLOWED', 'Method not allowed', 405)));
  }

  return res.status(405).json(errorEnvelope(new ApiError('METHOD_NOT_ALLOWED', 'Method not allowed', 405)));
});

import { createHandler } from './_lib/handler.js';
import { successEnvelope, errorEnvelope, ApiError } from './_lib/errors.js';
import { adminClient } from './_lib/supabase-admin.js';
import { query, body } from './_lib/req.js';
import { requireRoles, isAdmin } from './_lib/auth.js';
import { serviceCreate, serviceUpdate } from './_lib/validation.js';

async function myLaundromatIds(supa, ctx) {
  const { data } = await supa.from('laundromats').select('id').eq('owner_id', ctx.user.id);
  return (data || []).map((r) => r.id);
}

export default createHandler(async function handler(req, res) {
  const q = query(req);
  const action = q.action || '';
  const supa = adminClient();
  if (!supa) return res.status(503).json(errorEnvelope(new ApiError('NOT_CONFIGURED', 'Supabase not configured', 503)));

  const ctx = await requireRoles(req, ['owner', 'staff', 'admin', 'super_admin']);
  const ids = await myLaundromatIds(supa, ctx);

  if (req.method === 'GET') {
    if (action === 'stats') {
      if (!ids.length) return res.status(200).json(successEnvelope({ laundromats: 0, pending: 0, active: 0, completed: 0, revenue: 0 }));
      const { data: bookings } = await supa.from('bookings').select('status, total_amount').in('laundromat_id', ids);
      const rows = bookings || [];
      const count = (s) => rows.filter((b) => b.status === s).length;
      const revenue = rows.filter((b) => b.status === 'completed').reduce((sum, b) => sum + (Number(b.total_amount) || 0), 0);
      return res.status(200).json(successEnvelope({
        laundromats: ids.length,
        pending: count('pending_acceptance') + count('pending_payment'),
        active: rows.length - count('completed') - count('cancelled') - count('rejected'),
        completed: count('completed'),
        revenue,
      }));
    }

    if (action === 'services') {
      if (!ids.length) return res.status(200).json(successEnvelope([]));
      const { data, error } = await supa.from('services').select('*').in('laundromat_id', ids).order('created_at', { ascending: false });
      if (error) return res.status(500).json(errorEnvelope(error));
      return res.status(200).json(successEnvelope(data || []));
    }

    if (action === 'earnings') {
      if (!ids.length) return res.status(200).json(successEnvelope({ total: 0, transactions: [] }));
      const { data, error } = await supa.from('transactions').select('*').in('laundromat_id', ids).order('created_at', { ascending: false }).limit(100);
      if (error) return res.status(500).json(errorEnvelope(error));
      const total = (data || []).reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
      return res.status(200).json(successEnvelope({ total, transactions: data || [] }));
    }

    if (action === 'laundromats') {
      const { data, error } = await supa.from('laundromats').select('*').eq('owner_id', ctx.user.id);
      if (error) return res.status(500).json(errorEnvelope(error));
      return res.status(200).json(successEnvelope(data || []));
    }

    return res.status(200).json(successEnvelope({ service: 'owner', ok: true }));
  }

  if (req.method === 'POST') {
    if (action === 'service-create') {
      const parsed = serviceCreate.safeParse(body(req));
      if (!parsed.success) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', parsed.error.message)));
      if (!ids.includes(parsed.data.laundromat_id)) {
        return res.status(403).json(errorEnvelope(new ApiError('FORBIDDEN', 'Not your laundromat', 403)));
      }
      const { data, error } = await supa.from('services').insert(parsed.data).select().single();
      if (error) return res.status(400).json(errorEnvelope(error));
      return res.status(201).json(successEnvelope(data));
    }

    if (action === 'service-update') {
      const parsed = serviceUpdate.safeParse(body(req));
      if (!parsed.success) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', parsed.error.message)));
      const { id, ...patch } = parsed.data;
      const { data: svc } = await supa.from('services').select('laundromat_id').eq('id', id).maybeSingle();
      if (!svc || !ids.includes(svc.laundromat_id)) {
        return res.status(403).json(errorEnvelope(new ApiError('FORBIDDEN', 'Not your service', 403)));
      }
      const { data, error } = await supa.from('services').update(patch).eq('id', id).select().single();
      if (error) return res.status(400).json(errorEnvelope(error));
      return res.status(200).json(successEnvelope(data));
    }

    if (action === 'service-delete') {
      const id = body(req).id || q.id;
      if (!id) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', 'Missing id')));
      const { data: svc } = await supa.from('services').select('laundromat_id').eq('id', id).maybeSingle();
      if (!svc || !ids.includes(svc.laundromat_id)) {
        return res.status(403).json(errorEnvelope(new ApiError('FORBIDDEN', 'Not your service', 403)));
      }
      const { error } = await supa.from('services').update({ is_active: false }).eq('id', id);
      if (error) return res.status(400).json(errorEnvelope(error));
      return res.status(200).json(successEnvelope({ id, deactivated: true }));
    }

    return res.status(405).json(errorEnvelope(new ApiError('METHOD_NOT_ALLOWED', 'Method not allowed', 405)));
  }

  return res.status(405).json(errorEnvelope(new ApiError('METHOD_NOT_ALLOWED', 'Method not allowed', 405)));
});

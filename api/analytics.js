import { createHandler } from './_lib/handler.js';
import { successEnvelope, errorEnvelope, ApiError } from './_lib/errors.js';
import { adminClient } from './_lib/supabase-admin.js';
import { query } from './_lib/req.js';
import { requireRoles } from './_lib/auth.js';
import { memberLaundromatIds } from './owner.js';

export default createHandler(async function handler(req, res) {
  const q = query(req);
  const supa = adminClient();
  if (!supa) return res.status(503).json(errorEnvelope(new ApiError('NOT_CONFIGURED', 'Supabase not configured', 503)));

  const ctx = await requireRoles(req, ['owner', 'staff', 'admin', 'super_admin']);
  const isAdminScope = ctx.roles.some((r) => r === 'admin' || r === 'super_admin') && q.scope !== 'owner';

  let bookingQuery = supa.from('bookings').select('status, total_amount, created_at, laundromat_id');
  if (!isAdminScope) {
    const ids = await memberLaundromatIds(supa, ctx);
    if (!ids.length) return res.status(200).json(successEnvelope({ byStatus: {}, revenue: 0, count: 0, recent: [] }));
    bookingQuery = bookingQuery.in('laundromat_id', ids);
  }

  const { data: bookings, error } = await bookingQuery.limit(1000);
  if (error) return res.status(500).json(errorEnvelope(error));

  const rows = bookings || [];
  const byStatus = rows.reduce((acc, b) => { acc[b.status] = (acc[b.status] || 0) + 1; return acc; }, {});
  const revenue = rows.filter((b) => b.status === 'completed').reduce((s, b) => s + (Number(b.total_amount) || 0), 0);
  const recent = rows
    .slice()
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 10);

  return res.status(200).json(successEnvelope({ scope: isAdminScope ? 'admin' : 'owner', byStatus, revenue, count: rows.length, recent }));
});

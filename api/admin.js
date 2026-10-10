import { createHandler } from './_lib/handler.js';
import { successEnvelope, errorEnvelope, ApiError } from './_lib/errors.js';
import { adminClient } from './_lib/supabase-admin.js';
import { query, body } from './_lib/req.js';
import { requireRoles } from './_lib/auth.js';
import {
  verifyLaundromat, adminSettingsUpdate, planUpsert, planToggle, adminUserUpdate,
  adminLaundromatUpdate, adminPayoutUpdate, adminRefundUpdate, adminPromotionUpdate,
  adminCommissionUpdate, adminNotification, adminRefundCreate,
} from './_lib/validation.js';
import { getSettings, setSettings, num } from './_lib/settings.js';
import { round2 } from './_lib/pricing.js';
import { notifyUser, notifyUsers } from './_lib/push.js';

async function logAdmin(supa, ctx, action, targetType, targetId, detail) {
  try {
    await supa.from('admin_logs').insert({
      actor_id: ctx.user.id,
      action,
      target_type: targetType || null,
      target_id: targetId || null,
      detail: detail || null,
    });
  } catch { /* auditing is best-effort */ }
}

export default createHandler(async function handler(req, res) {
  const q = query(req);
  const action = q.action || '';
  const supa = adminClient();
  if (!supa) return res.status(503).json(errorEnvelope(new ApiError('NOT_CONFIGURED', 'Supabase not configured', 503)));

  const ctx = await requireRoles(req, ['admin', 'super_admin']);

  if (req.method === 'GET') {
    if (action === 'stats') {
      const head = (t, filter) => {
        let r = supa.from(t).select('*', { count: 'exact', head: true });
        if (filter) r = filter(r);
        return r;
      };
      const [
        { count: pending }, { count: approved }, { count: users }, { count: bookings },
      ] = await Promise.all([
        head('laundromats', (r) => r.eq('verification_status', 'pending')),
        head('laundromats', (r) => r.eq('verification_status', 'approved')),
        head('profiles'),
        head('bookings'),
      ]);

      const { data: completed } = await supa.from('bookings').select('total_amount, commission_amount, platform_fee, owner_net').eq('status', 'completed');
      const gmv = round2((completed || []).reduce((s, b) => s + num(b.total_amount, 0), 0));
      const commissionRevenue = round2((completed || []).reduce((s, b) => s + num(b.commission_amount, 0) + num(b.platform_fee, 0), 0));

      const { data: subs } = await supa.from('subscriptions').select('status, plans(price_monthly)').in('status', ['active', 'trialing']);
      const activeSubscriptions = (subs || []).length;
      const mrr = round2((subs || []).reduce((s, x) => s + num(x.plans && x.plans.price_monthly, 0), 0));

      const { data: po } = await supa.from('payouts').select('amount, status').in('status', ['requested', 'processing']);
      const payoutsPending = round2((po || []).reduce((s, p) => s + num(p.amount, 0), 0));
      const { count: payoutsPendingCount } = await supa.from('payouts').select('*', { count: 'exact', head: true }).in('status', ['requested', 'processing']);
      const { count: promotionsActive } = await supa.from('promotions').select('*', { count: 'exact', head: true }).eq('status', 'active');
      const { count: refundsPending } = await supa.from('refunds').select('*', { count: 'exact', head: true }).in('status', ['pending', 'approved']);
      const { count: commissionsPending } = await supa.from('commissions').select('*', { count: 'exact', head: true }).eq('status', 'pending');

      return res.status(200).json(successEnvelope({
        pending: pending || 0,
        approved: approved || 0,
        users: users || 0,
        bookings: bookings || 0,
        gmv,
        commission_revenue: commissionRevenue,
        active_subscriptions: activeSubscriptions,
        mrr,
        payouts_pending: payoutsPending,
        payouts_pending_count: payoutsPendingCount || 0,
        promotions_active: promotionsActive || 0,
        refunds_pending: refundsPending || 0,
        commissions_pending: commissionsPending || 0,
      }));
    }

    if (action === 'settings') {
      return res.status(200).json(successEnvelope(await getSettings(supa)));
    }

    if (action === 'plans') {
      const { data, error } = await supa.from('plans').select('*').order('audience', { ascending: true }).order('sort', { ascending: true });
      if (error) return res.status(500).json(errorEnvelope(error));
      return res.status(200).json(successEnvelope(data || []));
    }

    if (action === 'subscriptions') {
      const { data, error } = await supa.from('subscriptions')
        .select('*, plans(name, code, audience, price_monthly), profiles(id, full_name, email)')
        .order('created_at', { ascending: false }).limit(200);
      if (error) return res.status(500).json(errorEnvelope(error));
      return res.status(200).json(successEnvelope(data || []));
    }

    if (action === 'laundromats' || action === 'verifications') {
      let request = supa.from('laundromats').select('*, profiles!laundromats_owner_id_fkey(id, full_name, email)').order('created_at', { ascending: false });
      if (action === 'verifications') request = request.in('verification_status', ['pending', 'rejected']);
      if (q.status) request = request.eq('verification_status', q.status);
      const { data, error } = await request;
      if (error) return res.status(500).json(errorEnvelope(error));
      return res.status(200).json(successEnvelope(data || []));
    }

    if (action === 'verification-detail') {
      const id = q.id;
      if (!id) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', 'Missing id')));
      const [{ data: biz }, { data: docs }, { data: services }] = await Promise.all([
        supa.from('laundromats').select('*, profiles!laundromats_owner_id_fkey(id, full_name, email, phone)').eq('id', id).maybeSingle(),
        supa.from('documents').select('*').eq('laundromat_id', id).order('created_at', { ascending: false }),
        supa.from('services').select('id, name, base_price, is_active').eq('laundromat_id', id),
      ]);
      if (!biz) return res.status(404).json(errorEnvelope(new ApiError('NOT_FOUND', 'Laundromat not found', 404)));
      const { data: history } = await supa.from('admin_logs').select('*').eq('target_id', id).order('created_at', { ascending: false }).limit(20);
      return res.status(200).json(successEnvelope({ laundromat: biz, documents: docs || [], services: services || [], history: history || [] }));
    }

    if (action === 'users') {
      const { data, error } = await supa.from('profiles').select('*, user_roles(role)').order('created_at', { ascending: false }).limit(200);
      if (error) return res.status(500).json(errorEnvelope(error));
      return res.status(200).json(successEnvelope(data || []));
    }

    if (action === 'commissions') {
      const { data, error } = await supa.from('commissions')
        .select('*, laundromats(id, name)')
        .order('created_at', { ascending: false }).limit(200);
      if (error) return res.status(500).json(errorEnvelope(error));
      return res.status(200).json(successEnvelope(data || []));
    }

    if (action === 'payouts') {
      const { data, error } = await supa.from('payouts')
        .select('*, profiles(id, full_name, email)')
        .order('created_at', { ascending: false }).limit(200);
      if (error) return res.status(500).json(errorEnvelope(error));
      return res.status(200).json(successEnvelope(data || []));
    }

    if (action === 'refunds') {
      const { data, error } = await supa.from('refunds')
        .select('*, payments(id, booking_id, amount, currency)')
        .order('created_at', { ascending: false }).limit(200);
      if (error) return res.status(500).json(errorEnvelope(error));
      return res.status(200).json(successEnvelope(data || []));
    }

    if (action === 'payments') {
      let request = supa.from('payments')
        .select('*, bookings(id, status, laundromats(name)), profiles!payments_user_id_fkey(id, full_name, email)')
        .order('created_at', { ascending: false })
        .limit(Math.min(Number(q.limit) || 200, 500));
      if (q.status) request = request.eq('status', q.status);
      if (q.purpose) request = request.eq('purpose', q.purpose);
      const { data, error } = await request;
      if (error) return res.status(500).json(errorEnvelope(error));
      const rows = data || [];
      const totals = {
        collected: round2(rows.filter((p) => p.status === 'succeeded').reduce((s, p) => s + num(p.amount, 0), 0)),
        pending: rows.filter((p) => ['created', 'pending'].includes(p.status)).length,
        failed: rows.filter((p) => p.status === 'failed').length,
        refunded: round2(rows.filter((p) => ['refunded', 'partially_refunded'].includes(p.status)).reduce((s, p) => s + num(p.amount, 0), 0)),
      };
      return res.status(200).json(successEnvelope({ payments: rows, totals }));
    }

    if (action === 'promotions') {
      const { data, error } = await supa.from('promotions')
        .select('*, laundromats(id, name), profiles(id, full_name, email)')
        .order('created_at', { ascending: false }).limit(200);
      if (error) return res.status(500).json(errorEnvelope(error));
      return res.status(200).json(successEnvelope(data || []));
    }

    if (action === 'audit') {
      let request = supa.from('admin_logs').select('*').order('created_at', { ascending: false }).limit(Math.min(Number(q.limit) || 200, 500));
      if (q.target_type) request = request.eq('target_type', q.target_type);
      if (q.actor) request = request.eq('actor_id', q.actor);
      if (q.q) request = request.ilike('action', `%${q.q}%`);
      const { data, error } = await request;
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
      await logAdmin(supa, ctx, `verification.${status}`, 'laundromat', laundromat_id, { reason: reason || null });
      if (data && data.owner_id) {
        const messages = {
          approved: ['Your business is live', 'Your laundromat has been approved and is now visible to customers.'],
          rejected: ['Verification needs attention', `Your listing was not approved. ${reason ? `Reason: ${reason}` : 'Please review your details and resubmit.'}`],
          suspended: ['Listing suspended', 'Your listing has been suspended. Contact support for details.'],
          pending: ['Verification in progress', 'Your listing is back under review.'],
        };
        const [title, body] = messages[status] || ['Listing updated', 'Your listing status changed.'];
        await notifyUser(supa, data.owner_id, { type: `verification_${status}`, title, body, url: 'apps/owner/index.html' });
      }
      return res.status(200).json(successEnvelope(data));
    }

    if (action === 'settings-update') {
      const parsed = adminSettingsUpdate.safeParse(body(req));
      if (!parsed.success) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', parsed.error.message)));
      const data = await setSettings(supa, parsed.data.settings);
      await logAdmin(supa, ctx, 'settings.update', 'platform', null, { keys: Object.keys(parsed.data.settings) });
      return res.status(200).json(successEnvelope({ updated: data.length, settings: await getSettings(supa) }));
    }

    if (action === 'plan-upsert') {
      const parsed = planUpsert.safeParse(body(req));
      if (!parsed.success) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', parsed.error.message)));
      const { id, ...rest } = parsed.data;
      const payload = { ...rest, features: rest.features || [], updated_at: new Date().toISOString() };
      const builder = id
        ? supa.from('plans').update(payload).eq('id', id)
        : supa.from('plans').insert(payload);
      const { data, error } = await builder.select().single();
      if (error) return res.status(400).json(errorEnvelope(error));
      await logAdmin(supa, ctx, id ? 'plan.update' : 'plan.create', 'plan', data.id, { code: data.code });
      return res.status(200).json(successEnvelope(data));
    }

    if (action === 'plan-toggle') {
      const parsed = planToggle.safeParse(body(req));
      if (!parsed.success) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', parsed.error.message)));
      const { data, error } = await supa.from('plans').update({ is_active: parsed.data.is_active }).eq('id', parsed.data.id).select().single();
      if (error) return res.status(400).json(errorEnvelope(error));
      await logAdmin(supa, ctx, 'plan.toggle', 'plan', data.id, { is_active: data.is_active });
      return res.status(200).json(successEnvelope(data));
    }

    if (action === 'user-update') {
      const parsed = adminUserUpdate.safeParse(body(req));
      if (!parsed.success) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', parsed.error.message)));
      const { user_id, account_status, full_name } = parsed.data;
      const patch = {};
      if (account_status) patch.account_status = account_status;
      if (full_name) patch.full_name = full_name;
      if (Object.keys(patch).length) {
        const { error } = await supa.from('profiles').update(patch).eq('id', user_id);
        if (error) return res.status(400).json(errorEnvelope(error));
      }
      await logAdmin(supa, ctx, 'user.update', 'user', user_id, patch);
      const { data } = await supa.from('profiles').select('*, user_roles(role)').eq('id', user_id).maybeSingle();
      return res.status(200).json(successEnvelope(data));
    }

    if (action === 'user-roles') {
      const parsed = adminUserUpdate.safeParse(body(req));
      if (!parsed.success) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', parsed.error.message)));
      const { user_id, roles } = parsed.data;
      if (!roles || !roles.length) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', 'At least one role is required')));
      await supa.from('user_roles').delete().eq('user_id', user_id);
      const rows = [...new Set(roles)].map((role) => ({ user_id, role }));
      const { error } = await supa.from('user_roles').insert(rows);
      if (error) return res.status(400).json(errorEnvelope(error));
      await logAdmin(supa, ctx, 'user.roles', 'user', user_id, { roles });
      const { data } = await supa.from('profiles').select('*, user_roles(role)').eq('id', user_id).maybeSingle();
      return res.status(200).json(successEnvelope(data));
    }

    if (action === 'laundromat-update') {
      const parsed = adminLaundromatUpdate.safeParse(body(req));
      if (!parsed.success) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', parsed.error.message)));
      const { laundromat_id, ...patch } = parsed.data;
      const { data, error } = await supa.from('laundromats').update(patch).eq('id', laundromat_id).select().single();
      if (error) return res.status(400).json(errorEnvelope(error));
      await logAdmin(supa, ctx, 'laundromat.update', 'laundromat', laundromat_id, patch);
      return res.status(200).json(successEnvelope(data));
    }

    if (action === 'payout-update') {
      const parsed = adminPayoutUpdate.safeParse(body(req));
      if (!parsed.success) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', parsed.error.message)));
      const { payout_id, status, reference, notes } = parsed.data;
      const { data, error } = await supa.from('payouts')
        .update({ status, reference: reference || null, notes: notes || null, updated_at: new Date().toISOString() })
        .eq('id', payout_id).select().single();
      if (error) return res.status(400).json(errorEnvelope(error));
      await logAdmin(supa, ctx, `payout.${status}`, 'payout', payout_id, { reference, notes });
      return res.status(200).json(successEnvelope(data));
    }

    if (action === 'refund-update') {
      const parsed = adminRefundUpdate.safeParse(body(req));
      if (!parsed.success) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', parsed.error.message)));
      const { refund_id, status, amount } = parsed.data;
      const patch = { status };
      if (amount != null) patch.amount = amount;
      const { data, error } = await supa.from('refunds').update(patch).eq('id', refund_id).select().single();
      if (error) return res.status(400).json(errorEnvelope(error));
      await logAdmin(supa, ctx, `refund.${status}`, 'refund', refund_id, patch);
      try {
        const { data: payment } = await supa.from('payments').select('booking_id').eq('id', data.payment_id).maybeSingle();
        if (payment && payment.booking_id) {
          const { data: booking } = await supa.from('bookings').select('customer_id').eq('id', payment.booking_id).maybeSingle();
          if (booking && booking.customer_id) {
            const messages = {
              approved: ['Refund approved', 'Your refund has been approved and will be processed shortly.'],
              rejected: ['Refund declined', 'Your refund request was declined. Contact support if you have questions.'],
              processed: ['Refund processed', 'Your refund has been processed.'],
              pending: ['Refund update', 'Your refund request is pending review.'],
            };
            const [title, body] = messages[status] || ['Refund update', 'Your refund status changed.'];
            await notifyUser(supa, booking.customer_id, { type: 'refund', title, body, url: 'apps/customer/pages/orders.html' });
          }
        }
      } catch { /* notification is best effort */ }
      return res.status(200).json(successEnvelope(data));
    }

    if (action === 'promotion-update') {
      const parsed = adminPromotionUpdate.safeParse(body(req));
      if (!parsed.success) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', parsed.error.message)));
      const { promotion_id, status, ends_at } = parsed.data;
      const patch = { status };
      if (ends_at) patch.ends_at = ends_at;
      const { data, error } = await supa.from('promotions').update(patch).eq('id', promotion_id).select().single();
      if (error) return res.status(400).json(errorEnvelope(error));
      if (status !== 'active' && data.laundromat_id) {
        await supa.from('laundromats').update({ is_featured: false }).eq('id', data.laundromat_id);
      }
      await logAdmin(supa, ctx, `promotion.${status}`, 'promotion', promotion_id, patch);
      return res.status(200).json(successEnvelope(data));
    }

    if (action === 'commission-settle-all') {
      const { data, error } = await supa.from('commissions')
        .update({ status: 'settled', settled_at: new Date().toISOString() })
        .eq('status', 'pending').select();
      if (error) return res.status(400).json(errorEnvelope(error));
      await logAdmin(supa, ctx, 'commission.settle_all', 'commission', null, { count: (data || []).length });
      return res.status(200).json(successEnvelope({ settled: (data || []).length }));
    }

    if (action === 'commission-update') {
      const parsed = adminCommissionUpdate.safeParse(body(req));
      if (!parsed.success) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', parsed.error.message)));
      const { commission_id, status } = parsed.data;
      const patch = { status };
      if (status === 'settled') patch.settled_at = new Date().toISOString();
      const { data, error } = await supa.from('commissions').update(patch).eq('id', commission_id).select().single();
      if (error) return res.status(400).json(errorEnvelope(error));
      await logAdmin(supa, ctx, `commission.${status}`, 'commission', commission_id, patch);
      return res.status(200).json(successEnvelope(data));
    }

    if (action === 'broadcast') {
      const parsed = adminNotification.safeParse(body(req));
      if (!parsed.success) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', parsed.error.message)));
      const { title, message, audience, user_id } = parsed.data;
      let recipients = [];
      if (audience === 'user') {
        if (!user_id) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', 'user_id is required for a single user')));
        recipients = [user_id];
      } else if (audience === 'owners' || audience === 'customers') {
        const role = audience === 'owners' ? 'owner' : 'customer';
        const { data } = await supa.from('user_roles').select('user_id').eq('role', role).limit(5000);
        recipients = [...new Set((data || []).map((r) => r.user_id))];
      } else {
        const { data } = await supa.from('profiles').select('id').limit(5000);
        recipients = (data || []).map((r) => r.id);
      }
      if (recipients.length) {
        await notifyUsers(supa, recipients, { type: 'admin', title, body: message, url: null });
      }
      await logAdmin(supa, ctx, 'notification.broadcast', 'platform', null, { audience, count: recipients.length });
      return res.status(200).json(successEnvelope({ sent: recipients.length }));
    }

    if (action === 'refund-create') {
      const parsed = adminRefundCreate.safeParse(body(req));
      if (!parsed.success) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', parsed.error.message)));
      const { data: payment } = await supa.from('payments').select('*').eq('id', parsed.data.payment_id).maybeSingle();
      if (!payment) return res.status(404).json(errorEnvelope(new ApiError('NOT_FOUND', 'Payment not found', 404)));
      if (payment.status !== 'succeeded' && payment.status !== 'partially_refunded') {
        return res.status(400).json(errorEnvelope(new ApiError('INVALID_STATE', 'Only a successful payment can be refunded')));
      }
      const amount = parsed.data.amount != null ? round2(parsed.data.amount) : num(payment.amount, 0);
      if (amount <= 0 || amount > num(payment.amount, 0)) {
        return res.status(400).json(errorEnvelope(new ApiError('INVALID_AMOUNT', 'Refund amount exceeds the payment')));
      }
      const { data: refund, error } = await supa.from('refunds').insert({
        payment_id: payment.id, amount, status: 'pending',
      }).select().single();
      if (error) return res.status(400).json(errorEnvelope(error));
      await supa.from('payments').update({ status: 'refund_pending', updated_at: new Date().toISOString() }).eq('id', payment.id);
      if (payment.booking_id) {
        await supa.from('bookings').update({ status: 'refund_pending', updated_at: new Date().toISOString() }).eq('id', payment.booking_id);
      }
      await logAdmin(supa, ctx, 'refund.create', 'refund', refund.id, { payment_id: payment.id, amount, reason: parsed.data.reason || null });
      return res.status(201).json(successEnvelope(refund));
    }

    return res.status(405).json(errorEnvelope(new ApiError('METHOD_NOT_ALLOWED', 'Method not allowed', 405)));
  }

  return res.status(405).json(errorEnvelope(new ApiError('METHOD_NOT_ALLOWED', 'Method not allowed', 405)));
});

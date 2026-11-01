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
import { reverseCompletionLedger } from './_lib/pricing.js';
import { notifyUser, notifyUsers } from './_lib/push.js';
import { money, appLink } from './_lib/email.js';
import { reconcilePromotions } from './_lib/promotions.js';
import { geocode, validLatLng } from './_lib/geo.js';

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

const PAYOUT_STATUS_COPY = {
  requested: ['Payout queued', 'Your payout request is back in the queue for review.'],
  processing: ['Payout processing', 'Your payout is being processed and will land in your account shortly.'],
  paid: ['Payout paid', 'Your payout has been paid out. This email is your payout statement.'],
  rejected: ['Payout declined', 'Your payout request was declined.'],
};

// Tell an owner what happened to their money, with the amounts they need to
// reconcile it against their bank statement.
async function notifyPayoutStatus(supa, payout, { reference = null, notes = null } = {}) {
  const [title, body] = PAYOUT_STATUS_COPY[payout.status] || ['Payout updated', `Your payout is now ${payout.status}.`];
  try {
    await notifyUser(supa, payout.owner_id, {
      type: `payout_${payout.status}`,
      title,
      body,
      url: 'apps/owner/pages/payouts.html',
      email: {
        subject: `${title} — ${money(payout.amount, payout.currency)}`,
        preheader: body,
        heading: title,
        paragraphs: [body],
        details: [
          { label: 'Amount', value: money(payout.amount, payout.currency), emphasis: true },
          { label: 'Status', value: String(payout.status || '').replace(/^\w/, (c) => c.toUpperCase()) },
          { label: 'Reference', value: reference || String(payout.id).slice(0, 8) },
          ...(notes ? [{ label: 'Note', value: notes }] : []),
        ],
        ctaLabel: 'View your payouts',
        ctaUrl: appLink('apps/owner/pages/payouts.html'),
      },
    });
  } catch { /* the payout status change is the important part */ }
}

export default createHandler(async function handler(req, res) {
  const q = query(req);
  const action = q.action || '';
  const supa = adminClient();
  if (!supa) return res.status(503).json(errorEnvelope(new ApiError('NOT_CONFIGURED', 'Supabase not configured', 503)));

  const ctx = await requireRoles(req, ['admin', 'super_admin']);

  if (req.method === 'GET') {
    if (action === 'stats') {
      await reconcilePromotions(supa);
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

      // Trend + status breakdown for the dashboard charts.
      const monthsBack = 12;
      const since = new Date();
      since.setMonth(since.getMonth() - (monthsBack - 1));
      since.setDate(1);
      since.setHours(0, 0, 0, 0);
      const { data: trendRows } = await supa.from('bookings')
        .select('status, commission_amount, platform_fee, created_at')
        .gte('created_at', since.toISOString());
      const months = [];
      const cursor = new Date(since);
      for (let i = 0; i < monthsBack; i++) {
        const key = `${cursor.getFullYear()}-${cursor.getMonth()}`;
        months.push({ key, label: cursor.toLocaleString('en-ZA', { month: 'short' }), bookings: 0, revenue: 0 });
        cursor.setMonth(cursor.getMonth() + 1);
      }
      const monthByKey = new Map(months.map((m) => [m.key, m]));
      const statusMap = new Map();
      (trendRows || []).forEach((b) => {
        const d = new Date(b.created_at);
        const bucket = monthByKey.get(`${d.getFullYear()}-${d.getMonth()}`);
        if (bucket) {
          bucket.bookings += 1;
          if (b.status === 'completed') bucket.revenue += num(b.commission_amount, 0) + num(b.platform_fee, 0);
        }
        statusMap.set(b.status, (statusMap.get(b.status) || 0) + 1);
      });
      months.forEach((m) => { m.revenue = round2(m.revenue); });
      const byStatus = [...statusMap.entries()].map(([status, count]) => ({ status, count }));

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
        months,
        by_status: byStatus,
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
      await reconcilePromotions(supa);
      const { data, error } = await supa.from('promotions')
        .select('*, laundromats(id, name), profiles(id, full_name, email)')
        .order('created_at', { ascending: false }).limit(200);
      if (error) return res.status(500).json(errorEnvelope(error));
      return res.status(200).json(successEnvelope(data || []));
    }


    if (action === 'analytics-lite' || action === 'analytics') {
      const { data: bookings } = await supa.from('bookings').select('status, total_amount, created_at').limit(1000);
      const rows = bookings || [];
      const byStatus = rows.reduce((acc, b) => { acc[b.status] = (acc[b.status] || 0) + 1; return acc; }, {});
      const revenue = rows.filter((b) => b.status === 'completed').reduce((s, b) => s + (Number(b.total_amount) || 0), 0);
      const recent = rows.slice().sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,10);
      return res.status(200).json(successEnvelope({ scope: 'admin', byStatus, revenue, count: rows.length, recent }));
    }

    if (action === 'ads') {
      const { data, error } = await supa.from('ads').select('*').order('created_at', { ascending: false }).limit(200);
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

    if (action === 'ad-create') {
      const b = body(req);
      const payload = {
        title: String(b.title || '').trim(),
        placement: b.placement || 'banner',
        media_type: b.media_type || 'image',
        media_path: b.media_path,
        link_url: b.link_url || null,
        starts_at: b.starts_at || new Date().toISOString(),
        ends_at: b.ends_at || null,
        is_active: b.is_active !== false,
        priority: Number(b.priority || 0),
        created_by: ctx.user.id,
      };
      const { data, error } = await supa.from('ads').insert(payload).select().single();
      if (error) return res.status(400).json(errorEnvelope(error));
      await logAdmin(supa, ctx, 'ad_create', 'ad', data.id, payload);
      return res.status(201).json(successEnvelope(data));
    }
    if (action === 'ad-update') {
      const b = body(req);
      const id = b.id;
      if (!id) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', 'Missing id')));
      // Whitelist editable fields so the payload cannot move an ad between
      // tenants or overwrite audit columns.
      const patch = { updated_at: new Date().toISOString() };
      for (const key of ['title', 'placement', 'media_type', 'media_path', 'link_url', 'starts_at', 'ends_at', 'is_active', 'priority']) {
        if (b[key] !== undefined) patch[key] = b[key];
      }
      if (patch.priority !== undefined) patch.priority = Number(patch.priority) || 0;
      if (patch.is_active !== undefined) patch.is_active = patch.is_active !== false && patch.is_active !== 'false';
      if (patch.placement !== undefined && !['hero', 'banner', 'popup'].includes(patch.placement)) {
        return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', 'Invalid placement')));
      }
      if (patch.media_type !== undefined && !['image', 'video'].includes(patch.media_type)) {
        return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', 'Invalid media type')));
      }
      if (patch.title !== undefined) patch.title = String(patch.title || '').trim().slice(0, 120);
      const { data, error } = await supa.from('ads').update(patch).eq('id', id).select().single();
      if (error) return res.status(400).json(errorEnvelope(error));
      await logAdmin(supa, ctx, 'ad_update', 'ad', id, patch);
      return res.status(200).json(successEnvelope(data));
    }
    if (action === 'ad-delete') {
      const b = body(req);
      const id = b.id;
      if (!id) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', 'Missing id')));
      const { error } = await supa.from('ads').delete().eq('id', id);
      if (error) return res.status(400).json(errorEnvelope(error));
      await logAdmin(supa, ctx, 'ad_delete', 'ad', id);
      return res.status(200).json(successEnvelope({ id, deleted: true }));
    }
    if (action === 'verify') {
      const parsed = verifyLaundromat.safeParse(body(req));
      if (!parsed.success) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', parsed.error.message)));
      const { laundromat_id, status, reason } = parsed.data;
      const { data, error } = await supa.from('laundromats').update({ verification_status: status }).eq('id', laundromat_id).select().single();
      if (error) return res.status(400).json(errorEnvelope(error));
      // Approving a listing without coordinates would hide it from "near me".
      const approved = status === 'approved';
      if (approved && data && !validLatLng(data.latitude, data.longitude) && data.address) {
        const loc = await geocode(data.address, { timeoutMs: 3500 });
        if (loc) {
          await supa.from('laundromats')
            .update({ latitude: loc.lat, longitude: loc.lng, updated_at: new Date().toISOString() })
            .eq('id', laundromat_id);
          data.latitude = loc.lat;
          data.longitude = loc.lng;
        }
      }
      // An approved listing with no usable pin (nothing to geocode) is live but
      // unreachable in "Near me": report that rather than claiming it is visible.
      const approvedWithoutPin = approved && data && !validLatLng(data.latitude, data.longitude);
      await logAdmin(supa, ctx, `verification.${status}`, 'laundromat', laundromat_id, { reason: reason || null });
      if (data && data.owner_id) {
        const messages = {
          approved: approvedWithoutPin
            ? ['Your business is approved', 'Your listing is approved, but it has no map pin yet. Add an address or drop a pin so customers can find it in "Near me".']
            : ['Your business is live', 'Your laundromat has been approved and is now visible to customers.'],
          rejected: ['Verification needs attention', `Your listing was not approved. ${reason ? `Reason: ${reason}` : 'Please review your details and resubmit.'}`],
          suspended: ['Listing suspended', 'Your listing has been suspended. Contact support for details.'],
          pending: ['Verification in progress', 'Your listing is back under review.'],
        };
        const [title, body] = messages[status] || ['Listing updated', 'Your listing status changed.'];
        await notifyUser(supa, data.owner_id, { type: `verification_${status}`, title, body, url: 'apps/owner/index.html' });
      }
      return res.status(200).json(successEnvelope(data, approvedWithoutPin ? { warning: 'APPROVED_WITHOUT_PIN' } : {}));
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
      const nextRoles = [...new Set(roles)];

      // Never allow the platform to be left without a super admin.
      const { data: currentRoles } = await supa.from('user_roles').select('role').eq('user_id', user_id);
      const wasSuper = (currentRoles || []).some((r) => r.role === 'super_admin');
      if (wasSuper && !nextRoles.includes('super_admin')) {
        const { count } = await supa.from('user_roles')
          .select('*', { count: 'exact', head: true })
          .eq('role', 'super_admin');
        if ((count || 0) <= 1) {
          return res.status(400).json(errorEnvelope(new ApiError(
            'LAST_SUPER_ADMIN',
            'This is the last super admin. Grant the role to someone else first.',
          )));
        }
      }

      // Add first, then remove: a failed insert must not strip every role.
      const { error: insertError } = await supa.from('user_roles')
        .upsert(nextRoles.map((role) => ({ user_id, role })), { onConflict: 'user_id,role', ignoreDuplicates: true });
      if (insertError) return res.status(400).json(errorEnvelope(insertError));
      const stale = (currentRoles || []).map((r) => r.role).filter((role) => !nextRoles.includes(role));
      if (stale.length) {
        const { error: deleteError } = await supa.from('user_roles')
          .delete().eq('user_id', user_id).in('role', stale);
        if (deleteError) return res.status(400).json(errorEnvelope(deleteError));
      }
      await logAdmin(supa, ctx, 'user.roles', 'user', user_id, { roles: nextRoles });
      const { data } = await supa.from('profiles').select('*, user_roles(role)').eq('id', user_id).maybeSingle();
      return res.status(200).json(successEnvelope(data));
    }

    if (action === 'laundromat-update') {
      const parsed = adminLaundromatUpdate.safeParse(body(req));
      if (!parsed.success) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', parsed.error.message)));
      const { laundromat_id, geocode: shouldGeocode, ...patch } = parsed.data;
      if (patch.latitude == null && patch.longitude == null && (patch.address || shouldGeocode)) {
        const address = patch.address || (await supa.from('laundromats').select('address').eq('id', laundromat_id).maybeSingle()).data?.address;
        if (address) {
          const loc = await geocode(address, { timeoutMs: 3500 });
          if (loc) { patch.latitude = loc.lat; patch.longitude = loc.lng; }
        }
      }
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
      if (data && data.owner_id) await notifyPayoutStatus(supa, data, { reference, notes });
      return res.status(200).json(successEnvelope(data));
    }

    if (action === 'refund-update') {
      const parsed = adminRefundUpdate.safeParse(body(req));
      if (!parsed.success) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', parsed.error.message)));
      const { refund_id, status, amount } = parsed.data;

      const { data: existingRefund } = await supa.from('refunds').select('*').eq('id', refund_id).maybeSingle();
      if (!existingRefund) return res.status(404).json(errorEnvelope(new ApiError('NOT_FOUND', 'Refund not found', 404)));

      // Re-applying the same state must not reverse the ledger or restore
      // store credit twice.
      if (existingRefund.status === status && amount == null) {
        return res.status(200).json(successEnvelope(existingRefund));
      }

      const patch = { status };
      if (amount != null) patch.amount = round2(amount);
      if (status === 'processed') patch.processed_at = new Date().toISOString();
      const { data, error } = await supa.from('refunds').update(patch).eq('id', refund_id).select().single();
      if (error) return res.status(400).json(errorEnvelope(error));
      await logAdmin(supa, ctx, `refund.${status}`, 'refund', refund_id, patch);

      const { data: payment } = await supa.from('payments')
        .select('*').eq('id', data.payment_id).maybeSingle();

      // Processed: reconcile the payment, the booking, the owner ledger and
      // any store credit applied at checkout. Rejected: put the order back.
      if (payment && status === 'processed') {
        const { data: siblings } = await supa.from('refunds')
          .select('amount, status').eq('payment_id', payment.id).eq('status', 'processed');
        const refundedTotal = round2((siblings || []).reduce((sum, r) => sum + num(r.amount, 0), 0));
        const paymentStatus = refundedTotal >= num(payment.amount, 0) ? 'refunded' : 'partially_refunded';
        await supa.from('payments')
          .update({ status: paymentStatus, updated_at: new Date().toISOString() })
          .eq('id', payment.id);

        if (payment.booking_id) {
          const { data: booking } = await supa.from('bookings')
            .select('id, customer_id, status').eq('id', payment.booking_id).maybeSingle();
          if (booking && booking.status !== 'refunded') {
            await supa.from('bookings')
              .update({ status: 'refunded', updated_at: new Date().toISOString() })
              .eq('id', booking.id);
            await supa.from('booking_status_history')
              .insert({ booking_id: booking.id, status: 'refunded', actor_id: ctx.user.id, reason: 'Refund processed by admin' });
          }
          // Reverse owner earnings/commission recorded at completion.
          await reverseCompletionLedger(supa, payment.booking_id, 'refund_reversal');

          // Give back store credit that was consumed when the order was paid.
          const creditApplied = num(payment.metadata && payment.metadata.credit_applied, 0);
          if (creditApplied > 0 && booking && booking.customer_id) {
            const { data: profile } = await supa.from('profiles')
              .select('credit_balance').eq('id', booking.customer_id).maybeSingle();
            await supa.from('profiles')
              .update({ credit_balance: round2(num(profile && profile.credit_balance, 0) + creditApplied) })
              .eq('id', booking.customer_id);
            await supa.from('credit_events').insert({
              user_id: booking.customer_id,
              amount: creditApplied,
              reason: 'refund_restore',
              booking_id: payment.booking_id,
            });
          }
        }
      } else if (payment && status === 'rejected') {
        await supa.from('payments')
          .update({ status: 'succeeded', updated_at: new Date().toISOString() })
          .eq('id', payment.id)
          .in('status', ['refund_pending', 'partially_refunded']);
        if (payment.booking_id) {
          const { data: history } = await supa.from('booking_status_history')
            .select('status').eq('booking_id', payment.booking_id)
            .order('created_at', { ascending: false }).limit(2);
          const previous = (history || []).map((h) => h.status).find((s) => s !== 'refund_pending');
          await supa.from('bookings')
            .update({ status: previous || 'completed', updated_at: new Date().toISOString() })
            .eq('id', payment.booking_id);
        }
      }

      try {
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
      if (data.laundromat_id) {
        const now = Date.now();
        const stillLive = data.ends_at && new Date(data.ends_at).getTime() > now;
        const featured = status === 'active' && data.kind === 'featured' && stillLive;
        await supa.from('laundromats')
          .update({ is_featured: featured, featured_until: featured ? data.ends_at : null })
          .eq('id', data.laundromat_id);
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

import { createHandler } from './_lib/handler.js';
import { successEnvelope, errorEnvelope, ApiError } from './_lib/errors.js';
import { adminClient } from './_lib/supabase-admin.js';
import { query, body } from './_lib/req.js';
import { requireRoles } from './_lib/auth.js';
import { serviceCreate, serviceUpdate, promotionCreate, payoutRequest, ownerLaundromatUpdate } from './_lib/validation.js';
import { getSettings, num } from './_lib/settings.js';
import { round2, activeSubscription, defaultPlan } from './_lib/pricing.js';

async function myLaundromatIds(supa, ctx) {
  const { data } = await supa.from('laundromats').select('id').eq('owner_id', ctx.user.id);
  return (data || []).map((r) => r.id);
}

async function ownerBalance(supa, ownerId) {
  const { data: comms } = await supa.from('commissions').select('net_amount, status').eq('owner_id', ownerId);
  const earned = round2((comms || []).filter((c) => c.status !== 'reversed').reduce((s, c) => s + num(c.net_amount, 0), 0));
  const { data: po } = await supa.from('payouts').select('amount, status').eq('owner_id', ownerId).in('status', ['requested', 'processing', 'paid']);
  const paidOut = round2((po || []).reduce((s, p) => s + num(p.amount, 0), 0));
  return { earned, paidOut, available: round2(earned - paidOut) };
}

export default createHandler(async function handler(req, res) {
  const q = query(req);
  const action = q.action || '';
  const supa = adminClient();
  if (!supa) return res.status(503).json(errorEnvelope(new ApiError('NOT_CONFIGURED', 'Supabase not configured', 503)));

  const ctx = await requireRoles(req, ['owner', 'staff', 'admin', 'super_admin']);
  const ids = await myLaundromatIds(supa, ctx);
  const settings = await getSettings(supa);

  if (req.method === 'GET') {
    if (action === 'stats') {
      if (!ids.length) return res.status(200).json(successEnvelope({ laundromats: 0, pending: 0, active: 0, completed: 0, revenue: 0, net: 0, commission: 0, repeat_rate: 0, rating: 0, reviews: 0 }));
      const { data: bookings } = await supa.from('bookings').select('status, total_amount, owner_net, commission_amount, customer_id').in('laundromat_id', ids);
      const rows = bookings || [];
      const count = (s) => rows.filter((b) => b.status === s).length;
      const completedRows = rows.filter((b) => b.status === 'completed');
      const revenue = completedRows.reduce((sum, b) => sum + (Number(b.total_amount) || 0), 0);
      const net = completedRows.reduce((sum, b) => sum + (Number(b.owner_net) || 0), 0);
      const commission = completedRows.reduce((sum, b) => sum + (Number(b.commission_amount) || 0), 0);
      const byCustomer = new Map();
      completedRows.forEach((b) => byCustomer.set(b.customer_id, (byCustomer.get(b.customer_id) || 0) + 1));
      const uniqueCustomers = byCustomer.size;
      const repeatCustomers = [...byCustomer.values()].filter((n) => n > 1).length;
      const repeatRate = uniqueCustomers ? Math.round((repeatCustomers / uniqueCustomers) * 100) : 0;
      const { data: reviews } = await supa.from('reviews').select('rating').in('laundromat_id', ids);
      const reviewRows = reviews || [];
      const rating = reviewRows.length ? reviewRows.reduce((s, r) => s + (Number(r.rating) || 0), 0) / reviewRows.length : 0;
      return res.status(200).json(successEnvelope({
        laundromats: ids.length,
        pending: count('pending_acceptance') + count('pending_payment'),
        active: rows.length - count('completed') - count('cancelled') - count('rejected') - count('refund_pending'),
        completed: completedRows.length,
        revenue,
        net,
        commission,
        repeat_rate: repeatRate,
        unique_customers: uniqueCustomers,
        rating: round2(rating),
        reviews: reviewRows.length,
      }));
    }

    if (action === 'analytics') {
      if (!ids.length) return res.status(200).json(successEnvelope({ months: [], top_services: [] }));
      const monthsBack = 6;
      const since = new Date();
      since.setMonth(since.getMonth() - (monthsBack - 1));
      since.setDate(1);
      since.setHours(0, 0, 0, 0);
      const { data: bookings } = await supa.from('bookings')
        .select('status, total_amount, owner_net, created_at, booking_items(service_name_snapshot, quantity, line_total)')
        .in('laundromat_id', ids)
        .gte('created_at', since.toISOString());
      const rows = (bookings || []).filter((b) => b.status === 'completed');
      const buckets = [];
      const cursor = new Date(since);
      for (let i = 0; i < monthsBack; i++) {
        const key = `${cursor.getFullYear()}-${cursor.getMonth()}`;
        buckets.push({ key, label: cursor.toLocaleString('en-ZA', { month: 'short' }), bookings: 0, revenue: 0 });
        cursor.setMonth(cursor.getMonth() + 1);
      }
      const byKey = new Map(buckets.map((b) => [b.key, b]));
      const serviceTotals = new Map();
      rows.forEach((b) => {
        const d = new Date(b.created_at);
        const bucket = byKey.get(`${d.getFullYear()}-${d.getMonth()}`);
        if (bucket) { bucket.bookings += 1; bucket.revenue += Number(b.owner_net) || 0; }
        (b.booking_items || []).forEach((it) => {
          const cur = serviceTotals.get(it.service_name_snapshot) || { name: it.service_name_snapshot, quantity: 0, revenue: 0 };
          cur.quantity += it.quantity || 0;
          cur.revenue += Number(it.line_total) || 0;
          serviceTotals.set(it.service_name_snapshot, cur);
        });
      });
      const topServices = [...serviceTotals.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
      return res.status(200).json(successEnvelope({ months: buckets, top_services: topServices }));
    }

    if (action === 'verification') {
      if (!ids.length) return res.status(200).json(successEnvelope([]));
      const [{ data: laundromats }, { data: services }, { data: hours }, { data: zones }] = await Promise.all([
        supa.from('laundromats').select('id, name, verification_status, business_status, is_featured, featured_until, address, phone, description, logo_path').in('id', ids),
        supa.from('services').select('laundromat_id, is_active').in('laundromat_id', ids),
        supa.from('operating_hours').select('laundromat_id').in('laundromat_id', ids),
        supa.from('delivery_zones').select('laundromat_id').in('laundromat_id', ids),
      ]);
      const svcCount = new Map();
      (services || []).forEach((s) => { if (s.is_active) svcCount.set(s.laundromat_id, (svcCount.get(s.laundromat_id) || 0) + 1); });
      const hourSet = new Set((hours || []).map((h) => h.laundromat_id));
      const zoneSet = new Set((zones || []).map((z) => z.laundromat_id));
      const out = (laundromats || []).map((l) => {
        const checks = [
          { key: 'profile', label: 'Business profile complete', done: Boolean(l.name && l.address && l.phone) },
          { key: 'description', label: 'Description added', done: Boolean(l.description) },
          { key: 'logo', label: 'Logo uploaded', done: Boolean(l.logo_path) },
          { key: 'services', label: 'At least one active service', done: (svcCount.get(l.id) || 0) > 0 },
          { key: 'hours', label: 'Operating hours set', done: hourSet.has(l.id) },
          { key: 'zones', label: 'Delivery zones configured', done: zoneSet.has(l.id) },
        ];
        const doneCount = checks.filter((c) => c.done).length;
        return { id: l.id, name: l.name, verification_status: l.verification_status, business_status: l.business_status, is_featured: l.is_featured, featured_until: l.featured_until, checks, done: doneCount, total: checks.length, percent: Math.round((doneCount / checks.length) * 100) };
      });
      return res.status(200).json(successEnvelope(out));
    }

    if (action === 'services') {
      if (!ids.length) return res.status(200).json(successEnvelope([]));
      const { data, error } = await supa.from('services').select('*').in('laundromat_id', ids).order('created_at', { ascending: false });
      if (error) return res.status(500).json(errorEnvelope(error));
      return res.status(200).json(successEnvelope(data || []));
    }

    if (action === 'earnings') {
      const balance = await ownerBalance(supa, ctx.user.id);
      if (!ids.length) return res.status(200).json(successEnvelope({ total: 0, ...balance, transactions: [] }));
      const { data, error } = await supa.from('transactions').select('*').in('laundromat_id', ids).order('created_at', { ascending: false }).limit(100);
      if (error) return res.status(500).json(errorEnvelope(error));
      const txns = (data || []).filter((t) => !String(t.type || '').startsWith('platform_') && !String(t.type || '').startsWith('subscription:'));
      const total = round2(txns.reduce((sum, t) => sum + (Number(t.amount) || 0), 0));
      return res.status(200).json(successEnvelope({ total, ...balance, transactions: txns }));
    }

    if (action === 'laundromats') {
      const { data, error } = await supa.from('laundromats').select('*').eq('owner_id', ctx.user.id);
      if (error) return res.status(500).json(errorEnvelope(error));
      return res.status(200).json(successEnvelope(data || []));
    }

    if (action === 'plan') {
      const subscription = await activeSubscription(supa, ctx.user.id, 'owner');
      const plan = subscription ? subscription.plans : await defaultPlan(supa, 'owner');
      const { data: plans } = await supa.from('plans').select('*').eq('audience', 'owner').eq('is_active', true).order('sort', { ascending: true });
      return res.status(200).json(successEnvelope({ subscription, plan, plans: plans || [] }));
    }

    if (action === 'branding') {
      const { data, error } = await supa.from('laundromats')
        .select('id, name, description, address, phone, logo_path, photos, verification_status')
        .in('id', ids)
        .order('name');
      if (error) return res.status(400).json(errorEnvelope(error));
      return res.status(200).json(successEnvelope(data || []));
    }

    if (action === 'promotions') {
      const { data, error } = await supa.from('promotions').select('*, laundromats(id, name, view_count)').eq('owner_id', ctx.user.id).order('created_at', { ascending: false });
      if (error) return res.status(500).json(errorEnvelope(error));
      const rows = data || [];
      const active = rows.filter((p) => p.status === 'active' && (!p.ends_at || new Date(p.ends_at) > new Date())).length;
      const summary = {
        total: rows.length,
        active,
        impressions: rows.reduce((s, p) => s + (Number(p.impressions) || 0), 0),
        clicks: rows.reduce((s, p) => s + (Number(p.clicks) || 0), 0),
        spend: round2(rows.reduce((s, p) => s + (Number(p.amount_paid) || 0), 0)),
      };
      return res.status(200).json(successEnvelope({
        promotions: rows,
        summary,
        price: num(settings.promotion_price, 199),
        days: num(settings.promotion_days, 30),
      }));
    }

    if (action === 'payouts') {
      const balance = await ownerBalance(supa, ctx.user.id);
      const { data, error } = await supa.from('payouts').select('*').eq('owner_id', ctx.user.id).order('created_at', { ascending: false });
      if (error) return res.status(500).json(errorEnvelope(error));
      return res.status(200).json(successEnvelope({ ...balance, min: num(settings.payout_min, 200), payouts: data || [] }));
    }

    return res.status(200).json(successEnvelope({ service: 'owner', ok: true }));
  }

  if (req.method === 'POST') {
    if (action === 'laundromat-update') {
      const parsed = ownerLaundromatUpdate.safeParse(body(req));
      if (!parsed.success) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', parsed.error.message)));
      const { laundromat_id, ...patch } = parsed.data;
      if (!ids.includes(laundromat_id)) return res.status(403).json(errorEnvelope(new ApiError('FORBIDDEN', 'Not your laundromat', 403)));
      const { data, error } = await supa.from('laundromats')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', laundromat_id)
        .select()
        .single();
      if (error) return res.status(400).json(errorEnvelope(error));
      return res.status(200).json(successEnvelope(data));
    }

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

    if (action === 'promote') {
      const parsed = promotionCreate.safeParse(body(req));
      if (!parsed.success) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', parsed.error.message)));
      const { laundromat_id, kind } = parsed.data;
      if (!ids.includes(laundromat_id)) {
        return res.status(403).json(errorEnvelope(new ApiError('FORBIDDEN', 'Not your laundromat', 403)));
      }
      const days = parsed.data.days || num(settings.promotion_days, 30);
      const price = num(settings.promotion_price, 199);
      const ends = new Date();
      ends.setDate(ends.getDate() + days);
      const { data, error } = await supa.from('promotions').insert({
        laundromat_id,
        owner_id: ctx.user.id,
        kind,
        amount_paid: price,
        starts_at: new Date().toISOString(),
        ends_at: ends.toISOString(),
        status: 'active',
      }).select().single();
      if (error) return res.status(400).json(errorEnvelope(error));
      if (kind === 'featured') {
        await supa.from('laundromats').update({ is_featured: true, featured_until: ends.toISOString() }).eq('id', laundromat_id);
      }
      await supa.from('transactions').insert({ laundromat_id, type: 'promotion', amount: price, currency: settings.currency || 'ZAR' });
      return res.status(201).json(successEnvelope(data));
    }

    if (action === 'payout-request') {
      const parsed = payoutRequest.safeParse(body(req));
      if (!parsed.success) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', parsed.error.message)));
      const balance = await ownerBalance(supa, ctx.user.id);
      const min = num(settings.payout_min, 200);
      const amount = parsed.data.amount != null ? round2(parsed.data.amount) : balance.available;
      if (amount < min) return res.status(400).json(errorEnvelope(new ApiError('BELOW_MINIMUM', `Minimum payout is ${min}`)));
      if (amount > balance.available) return res.status(400).json(errorEnvelope(new ApiError('INSUFFICIENT_BALANCE', 'Amount exceeds available balance')));
      const { data, error } = await supa.from('payouts').insert({
        owner_id: ctx.user.id,
        amount,
        currency: settings.currency || 'ZAR',
        status: 'requested',
        method: parsed.data.method || null,
        notes: parsed.data.notes || null,
      }).select().single();
      if (error) return res.status(400).json(errorEnvelope(error));
      return res.status(201).json(successEnvelope(data));
    }

    return res.status(405).json(errorEnvelope(new ApiError('METHOD_NOT_ALLOWED', 'Method not allowed', 405)));
  }

  return res.status(405).json(errorEnvelope(new ApiError('METHOD_NOT_ALLOWED', 'Method not allowed', 405)));
});

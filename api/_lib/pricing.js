import { getSettings, num, bool } from './settings.js';

export function round2(n) {
  return Math.round((num(n, 0) + Number.EPSILON) * 100) / 100;
}

export async function activeSubscription(supa, userId, audience) {
  if (!userId) return null;
  try {
    const { data } = await supa
      .from('subscriptions')
      .select('*, plans(*)')
      .eq('user_id', userId)
      .eq('audience', audience)
      .in('status', ['active', 'trialing'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    // Auto-downgrade: a paid period that has ended is no longer active.
    if (data.current_period_end && new Date(data.current_period_end).getTime() < Date.now()) {
      await supa.from('subscriptions')
        .update({ status: 'canceled', canceled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', data.id);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

// Activate (or replace) the single active subscription for a user + audience.
export async function activateSubscription(supa, { userId, plan, paymentId = null, periodEnd = null }) {
  if (!userId || !plan) return null;
  const now = new Date().toISOString();
  await supa.from('subscriptions')
    .update({ status: 'canceled', canceled_at: now, updated_at: now })
    .eq('user_id', userId).eq('audience', plan.audience).in('status', ['active', 'trialing']);

  let end = periodEnd;
  if (!end && num(plan.price_monthly, 0) > 0) {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    end = d.toISOString();
  }

  const { data, error } = await supa.from('subscriptions').insert({
    user_id: userId,
    plan_id: plan.id,
    audience: plan.audience,
    status: 'active',
    payment_id: paymentId,
    current_period_start: now,
    current_period_end: end,
  }).select('*, plans(*)').single();
  if (error) throw error;
  return data;
}

export async function defaultPlan(supa, audience) {
  try {
    const { data } = await supa
      .from('plans')
      .select('*')
      .eq('audience', audience)
      .eq('is_active', true)
      .order('sort', { ascending: true })
      .limit(1)
      .maybeSingle();
    return data || null;
  } catch {
    return null;
  }
}

export async function ownerCommissionPercent(supa, ownerId, settings) {
  const s = settings || await getSettings(supa);
  const sub = ownerId ? await activeSubscription(supa, ownerId, 'owner') : null;
  const planPercent = sub && sub.plans ? sub.plans.commission_percent : null;
  return num(planPercent, num(s.commission_percent, 8));
}

export async function isCustomerSubscriber(supa, userId) {
  if (!userId) return false;
  const sub = await activeSubscription(supa, userId, 'customer');
  return Boolean(sub);
}

export function computeDeliveryFee(settings, { deliveryRequired = false, pickupRequired = false, hasCustomerPlan = false } = {}) {
  if (!deliveryRequired && !pickupRequired) return 0;
  if (hasCustomerPlan && bool(settings.customer_plus_free_delivery, true)) return 0;
  return round2(num(settings.delivery_fee, 0));
}

export function computeCharges({ subtotal, deliveryFee = 0, tax = 0, discount = 0, commissionPercent = 0 }) {
  const sub = round2(subtotal);
  const total = round2(sub + deliveryFee + tax - discount);
  const commission = round2(sub * (num(commissionPercent, 0) / 100));
  const platformFee = round2(deliveryFee);
  const ownerNet = round2(sub - commission);
  return { subtotal: sub, total, commission, platformFee, ownerNet };
}

// Idempotent: record the commission ledger + earnings transactions when a
// booking completes. Safe to call more than once.
export async function recordCompletionLedger(supa, bookingId) {
  const { data: booking } = await supa
    .from('bookings')
    .select('*, laundromats(id, owner_id)')
    .eq('id', bookingId)
    .maybeSingle();
  if (!booking || !booking.laundromats) return null;

  const { data: existing } = await supa.from('commissions').select('id').eq('booking_id', bookingId).maybeSingle();
  if (existing) return existing;

  const subtotal = num(booking.subtotal_amount, 0);
  const commissionAmount = num(booking.commission_amount, 0);
  const percent = subtotal > 0 ? round2((commissionAmount / subtotal) * 100) : 0;
  const net = num(booking.owner_net, subtotal - commissionAmount);

  const { data: commission, error } = await supa
    .from('commissions')
    .insert({
      booking_id: bookingId,
      laundromat_id: booking.laundromat_id,
      owner_id: booking.laundromats.owner_id,
      gross_amount: subtotal,
      delivery_fee: num(booking.delivery_fee, 0),
      commission_percent: percent,
      commission_amount: commissionAmount,
      net_amount: net,
      status: 'pending',
    })
    .select()
    .single();
  if (error) return null;

  const rows = [
    { laundromat_id: booking.laundromat_id, type: 'booking_earning', amount: net, currency: booking.currency || 'ZAR' },
  ];
  if (commissionAmount > 0) {
    rows.push({ laundromat_id: booking.laundromat_id, type: 'platform_commission', amount: commissionAmount, currency: booking.currency || 'ZAR' });
  }
  await supa.from('transactions').insert(rows);
  return commission;
}

export async function reverseCompletionLedger(supa, bookingId, reason = 'booking_reversed') {
  const { data: commission } = await supa.from('commissions').select('*').eq('booking_id', bookingId).maybeSingle();
  if (!commission || commission.status === 'reversed') return commission || null;
  await supa.from('commissions').update({ status: 'reversed' }).eq('id', commission.id);
  await supa.from('transactions').insert({
    laundromat_id: commission.laundromat_id,
    type: reason,
    amount: -num(commission.net_amount, 0),
    currency: 'ZAR',
  });
  return { ...commission, status: 'reversed' };
}

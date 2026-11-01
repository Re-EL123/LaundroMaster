import { activateSubscription } from './pricing.js';
import { notifyUser } from './push.js';
import { money, appLink } from './email.js';

const SUCCESS_STATES = new Set(['success', 'successful', 'succeeded', 'paid', 'complete', 'completed', '00']);
const FAILURE_STATES = new Set(['failure', 'failed', 'declined', 'error', 'cancelled', 'canceled']);
const PENDING_STATES = new Set(['pending', 'created', 'processing', 'initiated']);

// Normalise a PayFast status string/code into our internal payment status.
export function normalizeStatus(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (SUCCESS_STATES.has(s)) return 'succeeded';
  if (FAILURE_STATES.has(s)) return 'failed';
  if (PENDING_STATES.has(s)) return 'pending';
  if (s === 'refunded') return 'refunded';
  return null;
}

export async function markPaymentStatus(supa, payment, status, rawStatus = null, extra = {}, { onlyIfNotSucceeded = false } = {}) {
  const now = new Date().toISOString();
  const patch = { status, updated_at: now };
  if (rawStatus != null) patch.raw_status = String(rawStatus);
  if (status === 'succeeded') patch.paid_at = now;
  if (extra && Object.keys(extra).length) {
    patch.metadata = { ...(payment.metadata || {}), ...extra };
  }
  let update = supa.from('payments').update(patch).eq('id', payment.id);
  if (onlyIfNotSucceeded) update = update.neq('status', 'succeeded');
  const { data } = await update.select().maybeSingle();
  if (data) return data;
  // A guarded update matched nothing: another worker already completed it.
  if (onlyIfNotSucceeded) return null;
  return { ...payment, ...patch };
}

async function activatePromotion(supa, payment) {
  const meta = payment.metadata || {};
  const laundromatId = meta.laundromat_id || payment.laundromat_id;
  const ownerId = meta.owner_id || payment.user_id;
  const kind = meta.kind || 'featured';
  const days = Number(meta.days) || 30;
  if (!laundromatId || !ownerId) return null;
  const ends = new Date();
  ends.setDate(ends.getDate() + days);
  const nowIso = new Date().toISOString();
  const { data, error } = await supa.from('promotions').insert({
    laundromat_id: laundromatId,
    owner_id: ownerId,
    kind,
    amount_paid: Number(payment.amount) || 0,
    currency: payment.currency || 'ZAR',
    starts_at: nowIso,
    ends_at: ends.toISOString(),
    status: 'active',
  }).select().single();
  if (error) throw error;
  if (kind === 'featured') {
    await supa.from('laundromats').update({ is_featured: true, featured_until: ends.toISOString() }).eq('id', laundromatId);
  }
  await supa.from('transactions').insert({
    laundromat_id: laundromatId,
    type: 'promotion',
    amount: Number(payment.amount) || 0,
    currency: payment.currency || 'ZAR',
  });
  return data;
}

// Apply a payment outcome to its booking or subscription. Safe to call repeatedly.
export async function reconcilePayment(supa, payment, rawStatus) {
  if (!payment) return null;
  const status = normalizeStatus(rawStatus);
  if (!status) return payment;

  const wasSucceeded = payment.status === 'succeeded';
  if (wasSucceeded && status === 'succeeded') return payment; // idempotent
  // Guard the transition into `succeeded` so duplicate/concurrent ITNs cannot
  // activate the same subscription or promotion twice.
  const updated = await markPaymentStatus(supa, payment, status, rawStatus, {}, {
    onlyIfNotSucceeded: status === 'succeeded',
  });
  if (!updated) return { ...payment, status: 'succeeded' };
  if (status !== 'succeeded') {
    if (status === 'failed' && payment.purpose === 'booking' && payment.booking_id) {
      await supa.from('bookings')
        .update({ status: 'payment_failed', updated_at: new Date().toISOString() })
        .eq('id', payment.booking_id)
        .in('status', ['pending_payment', 'payment_failed']);
    }
    return updated;
  }

  if (payment.purpose === 'subscription' && payment.plan_id) {
    const { data: plan } = await supa.from('plans').select('*').eq('id', payment.plan_id).maybeSingle();
    if (plan) {
      const sub = await activateSubscription(supa, { userId: payment.user_id, plan, paymentId: payment.id });
      const amount = Number(payment.amount) || 0;
      if (amount > 0) {
        await supa.from('transactions').insert({
          laundromat_id: null,
          type: `subscription:${plan.code}`,
          amount,
          currency: payment.currency || 'ZAR',
        });
      }
      if (payment.user_id) {
        await notifyUser(supa, payment.user_id, {
          type: 'subscription_active',
          title: `${plan.name} is active`,
          body: 'Your subscription is active. Thanks for choosing LaundroMaster.',
          url: plan.audience === 'owner' ? 'apps/owner/pages/plan.html' : 'apps/customer/pages/profile.html',
        });
      }
      return { ...updated, subscription: sub };
    }
    return updated;
  }

  if (payment.purpose === 'promotion') {
    const promo = await activatePromotion(supa, payment);
    return { ...updated, promotion: promo };
  }

  if (payment.purpose === 'booking' && payment.booking_id) {
    const { data: booking } = await supa.from('bookings')
      .select('id, customer_id, status, subtotal_amount, delivery_fee, discount_amount, total_amount, currency, scheduled_at, laundromats(name, owner_id), booking_items(service_name_snapshot, quantity, line_total)')
      .eq('id', payment.booking_id)
      .maybeSingle();
    if (booking && (booking.status === 'pending_payment' || booking.status === 'payment_failed')) {
      await supa.from('bookings')
        .update({ status: 'pending_acceptance', updated_at: new Date().toISOString() })
        .eq('id', payment.booking_id)
        .in('status', ['pending_payment', 'payment_failed']);
      await supa.from('booking_status_history').insert({
        booking_id: payment.booking_id,
        status: 'pending_acceptance',
        reason: 'payment_received',
      });
      const bizName = (booking.laundromats && booking.laundromats.name) || 'the laundromat';
      if (booking.laundromats && booking.laundromats.owner_id) {
        await notifyUser(supa, booking.laundromats.owner_id, {
          type: 'booking_paid',
          title: 'New paid order',
          body: 'A customer paid for an order — review and accept it.',
          url: 'apps/owner/pages/bookings.html',
        });
      }
      if (booking.customer_id) {
        await notifyUser(supa, booking.customer_id, {
          type: 'booking_receipt',
          title: 'Payment received — order placed',
          body: `We received your payment for order ${String(booking.id).slice(0, 8)}. ${bizName} will confirm it shortly.`,
          url: 'apps/customer/pages/orders.html',
          email: receiptEmail(booking, bizName),
        });
      }
    }
    return updated;
  }
  return updated;
}

/** The customer's receipt/invoice, rendered once we know the order was paid. */
function receiptEmail(booking, bizName) {
  const currency = booking.currency || 'ZAR';
  const reference = String(booking.id || '').slice(0, 8);
  const total = money(booking.total_amount, currency);

  const details = [
    { label: 'Invoice', value: reference },
    { label: 'Laundromat', value: bizName },
  ];
  if (booking.scheduled_at) {
    details.push({ label: 'Scheduled', value: new Date(booking.scheduled_at).toUTCString() });
  }
  for (const item of booking.booking_items || []) {
    details.push({
      label: `${item.quantity} × ${item.service_name_snapshot}`,
      value: money(item.line_total, currency),
    });
  }
  if (Number(booking.delivery_fee) > 0) details.push({ label: 'Delivery', value: money(booking.delivery_fee, currency) });
  if (Number(booking.discount_amount) > 0) details.push({ label: 'Discount', value: `-${money(booking.discount_amount, currency)}` });
  details.push({ label: 'Total paid', value: total, emphasis: true });

  return {
    subject: `Your LaundroMaster order ${reference} is placed`,
    preheader: `Payment of ${total} received.`,
    heading: 'Payment received — order placed',
    paragraphs: [
      `Your payment of ${total} went through and your order was sent to ${bizName}.`,
      'You will get another email as soon as they accept the order. This email is your receipt.',
    ],
    details,
    ctaLabel: 'View your order',
    ctaUrl: appLink('apps/customer/pages/orders.html'),
  };
}

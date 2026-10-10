import { activateSubscription } from './pricing.js';
import { notifyUser } from './push.js';

const SUCCESS_STATES = new Set(['success', 'succeeded', 'paid', 'complete', 'completed', '00']);
const FAILURE_STATES = new Set(['failure', 'failed', 'declined', 'error', 'cancelled', 'canceled']);
const PENDING_STATES = new Set(['pending', 'created', 'processing', 'initiated']);

// Normalise an iKhokha status string/code into our internal payment status.
export function normalizeStatus(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (SUCCESS_STATES.has(s)) return 'succeeded';
  if (FAILURE_STATES.has(s)) return 'failed';
  if (PENDING_STATES.has(s)) return 'pending';
  if (s === 'refunded') return 'refunded';
  return null;
}

export async function markPaymentStatus(supa, payment, status, rawStatus = null, extra = {}) {
  const now = new Date().toISOString();
  const patch = { status, updated_at: now };
  if (rawStatus != null) patch.raw_status = String(rawStatus);
  if (status === 'succeeded') patch.paid_at = now;
  if (extra && Object.keys(extra).length) {
    patch.metadata = { ...(payment.metadata || {}), ...extra };
  }
  const { data } = await supa.from('payments').update(patch).eq('id', payment.id).select().single();
  return data || { ...payment, ...patch };
}

// Apply a payment outcome to its booking or subscription. Safe to call repeatedly.
export async function reconcilePayment(supa, payment, rawStatus) {
  if (!payment) return null;
  const status = normalizeStatus(rawStatus);
  if (!status) return payment;

  const wasSucceeded = payment.status === 'succeeded';
  const updated = await markPaymentStatus(supa, payment, status, rawStatus);
  if (status === 'succeeded' && wasSucceeded) return updated; // idempotent
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

  if (payment.purpose === 'booking' && payment.booking_id) {
    const { data: booking } = await supa.from('bookings')
      .select('id, customer_id, status, laundromats(name, owner_id)')
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
      if (booking.laundromats && booking.laundromats.owner_id) {
        await notifyUser(supa, booking.laundromats.owner_id, {
          type: 'booking_paid',
          title: 'New paid order',
          body: 'A customer paid for an order — review and accept it.',
          url: 'apps/owner/pages/bookings.html',
        });
      }
    }
    return updated;
  }
  return updated;
}

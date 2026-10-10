import { createHandler } from './_lib/handler.js';
import { successEnvelope, errorEnvelope, ApiError } from './_lib/errors.js';
import { adminClient } from './_lib/supabase-admin.js';
import { query, body } from './_lib/req.js';
import { requireUser, requireRoles, isAdmin, isOwner } from './_lib/auth.js';
import { bookingCreate, bookingUpdateStatus, bookingAssignStaff, bookingMessage, bookingNote } from './_lib/validation.js';
import { getSettings } from './_lib/settings.js';
import {
  ownerCommissionPercent, isCustomerSubscriber, computeDeliveryFee,
  computeCharges, recordCompletionLedger, reverseCompletionLedger,
} from './_lib/pricing.js';
import { notifyUser } from './_lib/push.js';

const CANCELLABLE = ['pending_payment', 'pending_acceptance'];
const REFUNDABLE = ['completed', 'cancelled', 'rejected', 'payment_failed'];
const LOYALTY_POINTS_PER_CURRENCY = 10;

// Allowed forward transitions for the order lifecycle. Admins bypass this.
const TRANSITIONS = {
  pending_payment: ['pending_acceptance', 'cancelled'],
  pending_acceptance: ['accepted', 'rejected', 'cancelled'],
  accepted: ['pickup_scheduled', 'collected', 'cancelled'],
  pickup_scheduled: ['collected', 'cancelled'],
  collected: ['washing', 'cancelled'],
  washing: ['drying', 'cancelled'],
  drying: ['ironing', 'ready', 'cancelled'],
  ironing: ['ready', 'cancelled'],
  ready: ['out_for_delivery', 'completed', 'cancelled'],
  out_for_delivery: ['completed', 'cancelled'],
  completed: ['refund_pending'],
  refund_pending: ['completed'],
};

const STATUS_LABEL = {
  pending_payment: 'Awaiting payment',
  pending_acceptance: 'Placed',
  accepted: 'Accepted',
  pickup_scheduled: 'Pickup scheduled',
  collected: 'Collected',
  washing: 'Washing',
  drying: 'Drying',
  ironing: 'Ironing',
  ready: 'Ready',
  out_for_delivery: 'Out for delivery',
  completed: 'Completed',
  cancelled: 'Cancelled',
  rejected: 'Rejected',
  payment_failed: 'Payment failed',
  refund_pending: 'Refund requested',
};

async function ownedLaundromatIds(supa, userId) {
  const { data } = await supa.from('laundromats').select('id').eq('owner_id', userId);
  return (data || []).map((r) => r.id);
}

async function scopedLaundromatIds(supa, userId) {
  const owned = await ownedLaundromatIds(supa, userId);
  const { data } = await supa.from('laundromat_members').select('laundromat_id').eq('user_id', userId);
  return [...new Set([...owned, ...(data || []).map((r) => r.laundromat_id)])];
}

async function loadBooking(supa, id) {
  const { data, error } = await supa
    .from('bookings')
    .select('*, laundromats(id, name, address, owner_id), booking_items(*)')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) throw new ApiError('NOT_FOUND', 'Booking not found', 404);
  return data;
}

async function isMemberOf(supa, userId, laundromatId) {
  if (!userId || !laundromatId) return false;
  const { data } = await supa.from('laundromat_members')
    .select('id').eq('laundromat_id', laundromatId).eq('user_id', userId).maybeSingle();
  return Boolean(data);
}

async function canAccessBooking(supa, ctx, booking) {
  if (isAdmin(ctx)) return true;
  if (booking.customer_id === ctx.user.id) return true;
  const ownerId = booking.laundromats && booking.laundromats.owner_id;
  if (ownerId && ownerId === ctx.user.id) return true;
  return isMemberOf(supa, ctx.user.id, booking.laundromat_id);
}

// Award loyalty points for a completed order and settle any referral.
async function awardCompletion(supa, booking) {
  const { data: existing } = await supa.from('loyalty_events')
    .select('id').eq('booking_id', booking.id).eq('reason', 'order_completed').maybeSingle();
  if (!existing) {
    const points = Math.max(1, Math.round((Number(booking.total_amount) || 0) / LOYALTY_POINTS_PER_CURRENCY));
    await supa.from('loyalty_events').insert({
      user_id: booking.customer_id, points, reason: 'order_completed', booking_id: booking.id,
    });
  }
  const { data: ref } = await supa.from('referrals')
    .select('id, referrer_id, status').eq('referee_id', booking.customer_id).eq('status', 'pending').maybeSingle();
  if (ref) {
    await supa.from('referrals').update({ status: 'rewarded', completed_at: new Date().toISOString() }).eq('id', ref.id);
    await supa.from('loyalty_events').insert([
      { user_id: ref.referrer_id, points: 100, reason: 'referral_bonus', booking_id: null },
      { user_id: booking.customer_id, points: 50, reason: 'referral_welcome', booking_id: booking.id },
    ]);
    const { data: profile } = await supa.from('profiles').select('credit_balance').eq('id', booking.customer_id).maybeSingle();
    const currentCredit = Number(profile && profile.credit_balance) || 0;
    await supa.from('profiles').update({ credit_balance: currentCredit + 50 }).eq('id', booking.customer_id);
    await notifyUser(supa, ref.referrer_id, {
      type: 'referral_reward',
      title: 'You earned referral points',
      body: 'Someone you referred completed their first order. 100 points added!',
      url: 'apps/customer/pages/profile.html',
    });
  }
}

export default createHandler(async function handler(req, res) {
  const q = query(req);
  const action = q.action || '';
  const supa = adminClient();
  if (!supa) return res.status(503).json(errorEnvelope(new ApiError('NOT_CONFIGURED', 'Supabase not configured', 503)));

  if (req.method === 'GET') {
    const ctx = await requireUser(req);

    if (q.id) {
      const booking = await loadBooking(supa, q.id);
      const permitted = await canAccessBooking(supa, ctx, booking);
      if (!permitted) return res.status(403).json(errorEnvelope(new ApiError('FORBIDDEN', 'You do not have access to this booking', 403)));
      const [{ data: payment }, { data: history }, { data: messages }, { data: refunds }] = await Promise.all([
        supa.from('payments').select('*').eq('booking_id', booking.id).order('created_at', { ascending: false }),
        supa.from('booking_status_history').select('*').eq('booking_id', booking.id).order('created_at', { ascending: true }),
        supa.from('booking_messages').select('id, sender_id, sender_role, body, created_at').eq('booking_id', booking.id).order('created_at', { ascending: true }),
        supa.from('refunds').select('*').eq('booking_id', booking.id).order('created_at', { ascending: false }).limit(1),
      ]);
      const myPayment = (payment || [])[0] || null;
      const refund = (refunds || [])[0] || null;
      if (!isAdmin(ctx) && booking.customer_id !== ctx.user.id) {
        // Owners/staff do not see internal payout internals; keep booking row but strip nothing sensitive here.
      }
      return res.status(200).json(successEnvelope({ ...booking, payment: myPayment, refund, history: history || [], messages: messages || [] }));
    }

    if (action === 'messages') {
      if (!q.id) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', 'Missing booking id')));
      const booking = await loadBooking(supa, q.id);
      const permitted = await canAccessBooking(supa, ctx, booking);
      if (!permitted) return res.status(403).json(errorEnvelope(new ApiError('FORBIDDEN', 'You do not have access to this booking', 403)));
      const { data, error } = await supa.from('booking_messages')
        .select('id, sender_id, sender_role, body, created_at')
        .eq('booking_id', q.id).order('created_at', { ascending: true });
      if (error) return res.status(500).json(errorEnvelope(error));
      return res.status(200).json(successEnvelope(data || []));
    }

    if (action === 'loyalty') {
      const [{ data: events }, { data: profile }] = await Promise.all([
        supa.from('loyalty_events').select('*').eq('user_id', ctx.user.id).order('created_at', { ascending: false }).limit(50),
        supa.from('profiles').select('referral_code, credit_balance').eq('id', ctx.user.id).maybeSingle(),
      ]);
      const rows = events || [];
      const points = rows.reduce((s, e) => s + (Number(e.points) || 0), 0);
      return res.status(200).json(successEnvelope({
        points,
        credit: Number(profile && profile.credit_balance) || 0,
        referral_code: profile ? profile.referral_code : null,
        events: rows,
      }));
    }

    let request = supa
      .from('bookings')
      .select('*, laundromats(id, name, address), booking_items(*), customer:profiles!bookings_customer_id_fkey(full_name, phone)')
      .order('created_at', { ascending: false })
      .limit(Math.min(Number(q.limit) || 50, 100));

    if (q.status) request = request.eq('status', q.status);

    if (isAdmin(ctx)) {
      // all bookings
    } else if (isOwner(ctx)) {
      const ids = await scopedLaundromatIds(supa, ctx.user.id);
      if (!ids.length) return res.status(200).json(successEnvelope([]));
      request = request.in('laundromat_id', ids).neq('status', 'pending_payment');
    } else {
      request = request.eq('customer_id', ctx.user.id);
    }

    const { data, error } = await request;
    if (error) return res.status(500).json(errorEnvelope(error));
    return res.status(200).json(successEnvelope(data || []));
  }

  if (req.method === 'POST') {
    if (action === 'create') {
      const ctx = await requireUser(req);
      const parsed = bookingCreate.safeParse(body(req));
      if (!parsed.success) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', parsed.error.message)));
      const input = parsed.data;

      const { data: biz } = await supa.from('laundromats').select('id, owner_id, verification_status, accepting_orders, max_orders_per_day, extra_delivery_fee').eq('id', input.laundromat_id).maybeSingle();
      if (!biz || (biz.verification_status !== 'approved' && !isAdmin(ctx))) {
        return res.status(400).json(errorEnvelope(new ApiError('INVALID_LAUNDROMAT', 'Laundromat is not available for booking')));
      }
      if (biz.accepting_orders === false && !isAdmin(ctx)) {
        return res.status(400).json(errorEnvelope(new ApiError('NOT_ACCEPTING', 'This laundromat is not accepting new orders right now')));
      }
      if (biz.max_orders_per_day) {
        const start = new Date(); start.setHours(0, 0, 0, 0);
        const { count } = await supa.from('bookings')
          .select('*', { count: 'exact', head: true })
          .eq('laundromat_id', input.laundromat_id)
          .gte('created_at', start.toISOString())
          .in('status', ['pending_payment', 'pending_acceptance', 'accepted', 'pickup_scheduled', 'collected', 'washing', 'drying', 'ironing', 'ready', 'out_for_delivery']);
        if ((count || 0) >= biz.max_orders_per_day) {
          return res.status(400).json(errorEnvelope(new ApiError('AT_CAPACITY', 'This laundromat has reached its daily order limit')));
        }
      }

      const serviceIds = [...new Set(input.items.map((i) => i.service_id))];
      const { data: services, error: svcErr } = await supa
        .from('services')
        .select('id, name, base_price, is_active, laundromat_id')
        .in('id', serviceIds);
      if (svcErr) return res.status(400).json(errorEnvelope(svcErr));

      const byId = new Map((services || []).map((s) => [s.id, s]));
      const items = [];
      let subtotal = 0;
      for (const line of input.items) {
        const svc = byId.get(line.service_id);
        if (!svc || svc.laundromat_id !== input.laundromat_id || !svc.is_active) {
          return res.status(400).json(errorEnvelope(new ApiError('INVALID_SERVICE', `Service ${line.service_id} is unavailable`)));
        }
        const unit = Number(svc.base_price) || 0;
        const lineTotal = unit * line.quantity;
        subtotal += lineTotal;
        items.push({
          service_id: svc.id,
          service_name_snapshot: svc.name,
          unit_price_snapshot: unit,
          quantity: line.quantity,
          line_total: lineTotal,
        });
      }

      const customerId = isAdmin(ctx) && input.customer_id ? input.customer_id : ctx.user.id;

      const settings = await getSettings(supa);
      const commissionPercent = await ownerCommissionPercent(supa, biz.owner_id, settings);
      const hasCustomerPlan = await isCustomerSubscriber(supa, customerId);
      const deliveryFee = computeDeliveryFee(settings, {
        deliveryRequired: input.delivery_required,
        pickupRequired: input.pickup_required,
        hasCustomerPlan,
        extraFee: biz.extra_delivery_fee,
      });
      const tax = 0;
      const discount = 0;
      const charges = computeCharges({ subtotal, deliveryFee, tax, discount, commissionPercent });

      const { data: booking, error: bookingErr } = await supa
        .from('bookings')
        .insert({
          customer_id: customerId,
          laundromat_id: input.laundromat_id,
          status: 'pending_payment',
          currency: settings.currency || 'ZAR',
          subtotal_amount: charges.subtotal,
          delivery_fee: deliveryFee,
          tax_amount: tax,
          discount_amount: discount,
          total_amount: charges.total,
          commission_amount: charges.commission,
          platform_fee: charges.platformFee,
          owner_net: charges.ownerNet,
          pickup_required: input.pickup_required || false,
          delivery_required: input.delivery_required || false,
          pickup_address: input.pickup_address || null,
          delivery_address: input.delivery_address || null,
          scheduled_at: input.scheduled_at || null,
          customer_notes: input.customer_notes || null,
        })
        .select()
        .single();
      if (bookingErr) return res.status(400).json(errorEnvelope(bookingErr));

      await supa.from('booking_items').insert(items.map((i) => ({ ...i, booking_id: booking.id })));
      await supa.from('booking_status_history').insert({ booking_id: booking.id, status: 'pending_payment', actor_id: ctx.user.id });

      // The owner is notified only once payment is confirmed (see api/_lib/billing.js),
      // so unpaid shopping carts never reach the booking inbox.
      const full = await loadBooking(supa, booking.id);
      return res.status(201).json(successEnvelope(full));
    }

    if (action === 'update-status') {
      const ctx = await requireRoles(req, ['owner', 'staff', 'admin', 'super_admin']);
      const parsed = bookingUpdateStatus.safeParse(body(req));
      if (!parsed.success) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', parsed.error.message)));
      const { booking_id, status, reason } = parsed.data;

      const existing = await loadBooking(supa, booking_id);
      const permitted = await canAccessBooking(supa, ctx, existing);
      if (!permitted) return res.status(403).json(errorEnvelope(new ApiError('FORBIDDEN', 'Not your booking', 403)));
      if (!isAdmin(ctx) && (existing.status === 'pending_payment' || existing.status === 'payment_failed')) {
        return res.status(400).json(errorEnvelope(new ApiError('UNPAID', 'This order is awaiting payment and cannot be updated yet')));
      }
      if (!isAdmin(ctx) && status !== existing.status) {
        const allowed = TRANSITIONS[existing.status] || [];
        if (!allowed.includes(status)) {
          return res.status(400).json(errorEnvelope(new ApiError('INVALID_TRANSITION', `Cannot move this order from "${STATUS_LABEL[existing.status] || existing.status}" to "${STATUS_LABEL[status] || status}"`)));
        }
      }

      const { data, error } = await supa
        .from('bookings')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', booking_id)
        .select()
        .single();
      if (error) return res.status(400).json(errorEnvelope(error));
      await supa.from('booking_status_history').insert({ booking_id, status, actor_id: ctx.user.id, reason: reason || null });

      if (status === 'completed') {
        await recordCompletionLedger(supa, booking_id);
        await awardCompletion(supa, existing);
      } else if (status === 'cancelled' || status === 'rejected') {
        await reverseCompletionLedger(supa, booking_id, 'booking_reversal');
      }
      await notifyUser(supa, existing.customer_id, {
        type: `booking_${status}`,
        title: `Order ${STATUS_LABEL[status] || status}`,
        body: `Your order with ${existing.laundromats ? existing.laundromats.name : 'the laundromat'} is now "${STATUS_LABEL[status] || status}".${reason ? ` Note: ${reason}` : ''}`,
        url: 'apps/customer/pages/orders.html',
      });
      return res.status(200).json(successEnvelope(data));
    }

    if (action === 'cancel') {
      const ctx = await requireUser(req);
      const bookingId = (body(req).booking_id) || q.id;
      if (!bookingId) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', 'Missing booking_id')));
      const existing = await loadBooking(supa, bookingId);
      const permitted = existing.customer_id === ctx.user.id || isAdmin(ctx);
      if (!permitted) return res.status(403).json(errorEnvelope(new ApiError('FORBIDDEN', 'Not your booking', 403)));
      if (!CANCELLABLE.includes(existing.status) && !isAdmin(ctx)) {
        return res.status(400).json(errorEnvelope(new ApiError('INVALID_STATE', 'This booking can no longer be cancelled')));
      }
      const { data, error } = await supa
        .from('bookings')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', bookingId)
        .select()
        .single();
      if (error) return res.status(400).json(errorEnvelope(error));
      await supa.from('booking_status_history').insert({ booking_id: bookingId, status: 'cancelled', actor_id: ctx.user.id });
      await reverseCompletionLedger(supa, bookingId, 'booking_reversal');
      if (existing.laundromats && existing.laundromats.owner_id) {
        await notifyUser(supa, existing.laundromats.owner_id, {
          type: 'booking_cancelled',
          title: 'Order cancelled',
          body: 'A customer cancelled their order.',
          url: 'apps/owner/pages/bookings.html',
        });
      }
      return res.status(200).json(successEnvelope(data));
    }

    if (action === 'request-refund') {
      const ctx = await requireUser(req);
      const bookingId = (body(req).booking_id) || q.id;
      const reason = (body(req).reason || '').slice(0, 500) || null;
      if (!bookingId) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', 'Missing booking_id')));
      const existing = await loadBooking(supa, bookingId);
      if (existing.customer_id !== ctx.user.id && !isAdmin(ctx)) {
        return res.status(403).json(errorEnvelope(new ApiError('FORBIDDEN', 'Not your booking', 403)));
      }
      if (!['completed', 'cancelled', 'rejected', 'payment_failed', 'refund_pending'].includes(existing.status)) {
        return res.status(400).json(errorEnvelope(new ApiError('INVALID_STATE', 'This booking is not eligible for a refund')));
      }
      const { data: payment } = await supa.from('payments').select('*').eq('booking_id', bookingId).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (!payment) return res.status(400).json(errorEnvelope(new ApiError('NO_PAYMENT', 'No payment was found for this booking')));
      const { data: dup } = await supa.from('refunds').select('id, status').eq('payment_id', payment.id).in('status', ['pending', 'approved']).maybeSingle();
      if (dup) return res.status(409).json(errorEnvelope(new ApiError('REFUND_EXISTS', 'A refund for this booking is already in progress')));
      const { data: refund, error } = await supa.from('refunds').insert({
        payment_id: payment.id,
        amount: Number(payment.amount) || 0,
        status: 'pending',
      }).select().single();
      if (error) return res.status(400).json(errorEnvelope(error));
      await supa.from('bookings').update({ status: 'refund_pending', updated_at: new Date().toISOString() }).eq('id', bookingId);
      await supa.from('booking_status_history').insert({ booking_id: bookingId, status: 'refund_pending', actor_id: ctx.user.id, reason });
      if (existing.laundromats && existing.laundromats.owner_id) {
        await notifyUser(supa, existing.laundromats.owner_id, {
          type: 'refund_requested',
          title: 'Refund requested',
          body: `A customer requested a refund.${reason ? ` Reason: ${reason}` : ''}`,
          url: 'apps/owner/pages/bookings.html',
        });
      }
      return res.status(201).json(successEnvelope(refund));
    }

    if (action === 'assign-staff') {
      const ctx = await requireRoles(req, ['owner', 'staff', 'admin', 'super_admin']);
      const parsed = bookingAssignStaff.safeParse(body(req));
      if (!parsed.success) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', parsed.error.message)));
      const { booking_id, staff_id } = parsed.data;
      const existing = await loadBooking(supa, booking_id);
      if (!(await canAccessBooking(supa, ctx, existing))) {
        return res.status(403).json(errorEnvelope(new ApiError('FORBIDDEN', 'Not your booking', 403)));
      }
      if (staff_id) {
        const ownerId = existing.laundromats && existing.laundromats.owner_id;
        const valid = staff_id === ownerId || (await isMemberOf(supa, staff_id, existing.laundromat_id));
        if (!valid) return res.status(400).json(errorEnvelope(new ApiError('INVALID_STAFF', 'That person is not part of this laundromat')));
      }
      const { data, error } = await supa.from('bookings')
        .update({ assigned_staff_id: staff_id, updated_at: new Date().toISOString() })
        .eq('id', booking_id).select().single();
      if (error) return res.status(400).json(errorEnvelope(error));
      if (staff_id) {
        await notifyUser(supa, staff_id, {
          type: 'booking_assigned',
          title: 'You were assigned an order',
          body: `Order ${String(booking_id).slice(0, 8)} at ${existing.laundromats ? existing.laundromats.name : 'your laundromat'}.`,
          url: 'apps/owner/pages/bookings.html',
        });
      }
      return res.status(200).json(successEnvelope(data));
    }

    if (action === 'message') {
      const ctx = await requireUser(req);
      const parsed = bookingMessage.safeParse(body(req));
      if (!parsed.success) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', parsed.error.message)));
      const { booking_id, body: text } = parsed.data;
      const existing = await loadBooking(supa, booking_id);
      if (!(await canAccessBooking(supa, ctx, existing))) {
        return res.status(403).json(errorEnvelope(new ApiError('FORBIDDEN', 'Not your booking', 403)));
      }
      const senderRole = existing.customer_id === ctx.user.id ? 'customer' : ctx.role;
      const { data, error } = await supa.from('booking_messages').insert({
        booking_id, sender_id: ctx.user.id, sender_role: senderRole, body: text,
      }).select('id, sender_id, sender_role, body, created_at').single();
      if (error) return res.status(400).json(errorEnvelope(error));
      // Notify the other party.
      const ownerId = existing.laundromats && existing.laundromats.owner_id;
      if (senderRole === 'customer' && ownerId) {
        await notifyUser(supa, ownerId, {
          type: 'booking_message', title: 'New message about an order',
          body: text.slice(0, 120), url: 'apps/owner/pages/bookings.html',
        });
      } else if (senderRole !== 'customer') {
        await notifyUser(supa, existing.customer_id, {
          type: 'booking_message', title: 'New message about your order',
          body: text.slice(0, 120), url: 'apps/customer/pages/order-details.html',
        });
      }
      return res.status(201).json(successEnvelope(data));
    }

    if (action === 'note') {
      const ctx = await requireRoles(req, ['owner', 'staff', 'admin', 'super_admin']);
      const parsed = bookingNote.safeParse(body(req));
      if (!parsed.success) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', parsed.error.message)));
      const { booking_id, internal_notes } = parsed.data;
      const existing = await loadBooking(supa, booking_id);
      if (!(await canAccessBooking(supa, ctx, existing))) {
        return res.status(403).json(errorEnvelope(new ApiError('FORBIDDEN', 'Not your booking', 403)));
      }
      const { data, error } = await supa.from('bookings')
        .update({ internal_notes, updated_at: new Date().toISOString() })
        .eq('id', booking_id).select().single();
      if (error) return res.status(400).json(errorEnvelope(error));
      return res.status(200).json(successEnvelope(data));
    }

    return res.status(405).json(errorEnvelope(new ApiError('METHOD_NOT_ALLOWED', 'Method not allowed', 405)));
  }

  return res.status(405).json(errorEnvelope(new ApiError('METHOD_NOT_ALLOWED', 'Method not allowed', 405)));
});

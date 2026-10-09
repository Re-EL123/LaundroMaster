import { createHandler } from './_lib/handler.js';
import { successEnvelope, errorEnvelope, ApiError } from './_lib/errors.js';
import { adminClient } from './_lib/supabase-admin.js';
import { query, body } from './_lib/req.js';
import { requireUser, requireRoles, isAdmin, isOwner } from './_lib/auth.js';
import { bookingCreate, bookingUpdateStatus } from './_lib/validation.js';
import { getSettings } from './_lib/settings.js';
import {
  ownerCommissionPercent, isCustomerSubscriber, computeDeliveryFee,
  computeCharges, recordCompletionLedger, reverseCompletionLedger,
} from './_lib/pricing.js';

const CANCELLABLE = ['pending_payment', 'pending_acceptance'];
const REFUNDABLE = ['completed', 'cancelled', 'rejected', 'payment_failed'];

async function ownedLaundromatIds(supa, userId) {
  const { data } = await supa.from('laundromats').select('id').eq('owner_id', userId);
  return (data || []).map((r) => r.id);
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

export default createHandler(async function handler(req, res) {
  const q = query(req);
  const action = q.action || '';
  const supa = adminClient();
  if (!supa) return res.status(503).json(errorEnvelope(new ApiError('NOT_CONFIGURED', 'Supabase not configured', 503)));

  if (req.method === 'GET') {
    const ctx = await requireUser(req);

    if (q.id) {
      const booking = await loadBooking(supa, q.id);
      const permitted = isAdmin(ctx)
        || booking.customer_id === ctx.user.id
        || (booking.laundromats && booking.laundromats.owner_id === ctx.user.id);
      if (!permitted) return res.status(403).json(errorEnvelope(new ApiError('FORBIDDEN', 'You do not have access to this booking', 403)));
      const [{ data: payment }, { data: history }] = await Promise.all([
        supa.from('payments').select('*').eq('booking_id', booking.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supa.from('booking_status_history').select('*').eq('booking_id', booking.id).order('created_at', { ascending: true }),
      ]);
      let refund = null;
      if (payment) {
        const { data } = await supa.from('refunds').select('*').eq('payment_id', payment.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
        refund = data || null;
      }
      return res.status(200).json(successEnvelope({ ...booking, payment: payment || null, refund, history: history || [] }));
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
      const ids = await ownedLaundromatIds(supa, ctx.user.id);
      if (!ids.length) return res.status(200).json(successEnvelope([]));
      request = request.in('laundromat_id', ids);
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

      const { data: biz } = await supa.from('laundromats').select('id, owner_id, verification_status').eq('id', input.laundromat_id).maybeSingle();
      if (!biz || (biz.verification_status !== 'approved' && !isAdmin(ctx))) {
        return res.status(400).json(errorEnvelope(new ApiError('INVALID_LAUNDROMAT', 'Laundromat is not available for booking')));
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

      const full = await loadBooking(supa, booking.id);
      return res.status(201).json(successEnvelope(full));
    }

    if (action === 'update-status') {
      const ctx = await requireRoles(req, ['owner', 'staff', 'admin', 'super_admin']);
      const parsed = bookingUpdateStatus.safeParse(body(req));
      if (!parsed.success) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', parsed.error.message)));
      const { booking_id, status, reason } = parsed.data;

      const existing = await loadBooking(supa, booking_id);
      const permitted = isAdmin(ctx) || (existing.laundromats && existing.laundromats.owner_id === ctx.user.id);
      if (!permitted) return res.status(403).json(errorEnvelope(new ApiError('FORBIDDEN', 'Not your booking', 403)));

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
      } else if (status === 'cancelled' || status === 'rejected') {
        await reverseCompletionLedger(supa, booking_id, 'booking_reversal');
      }
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
      return res.status(201).json(successEnvelope(refund));
    }

    return res.status(405).json(errorEnvelope(new ApiError('METHOD_NOT_ALLOWED', 'Method not allowed', 405)));
  }

  return res.status(405).json(errorEnvelope(new ApiError('METHOD_NOT_ALLOWED', 'Method not allowed', 405)));
});

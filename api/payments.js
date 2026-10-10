import { createHandler } from './_lib/handler.js';
import { successEnvelope, errorEnvelope, ApiError } from './_lib/errors.js';
import { adminClient } from './_lib/supabase-admin.js';
import { query, body } from './_lib/req.js';
import { requireUser, isAdmin } from './_lib/auth.js';
import { paymentCreate, subscribePlan, cancelSubscription } from './_lib/validation.js';
import { getSettings, num } from './_lib/settings.js';
import { activeSubscription, activateSubscription, round2 } from './_lib/pricing.js';
import { reconcilePayment } from './_lib/billing.js';
import { isConfigured, createPaymentLink, getPaymentStatus } from './_lib/ikhokha.js';

function appBase() {
  return (process.env.PUBLIC_APP_URL || process.env.APP_BASE_URL || 'https://laundromaster.re-el.co.za').replace(/\/$/, '');
}

function apiBase(req) {
  if (process.env.API_PUBLIC_URL) return process.env.API_PUBLIC_URL.replace(/\/$/, '');
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'laundromaster-sable.vercel.app';
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${host}`;
}

function bookingReturnUrls(req, bookingId, paymentId) {
  const base = process.env.PUBLIC_APP_URL || process.env.APP_BASE_URL || 'https://laundromaster.re-el.co.za';
  const q = `id=${encodeURIComponent(bookingId)}&payment=${encodeURIComponent(paymentId)}`;
  return {
    callbackUrl: `${apiBase(req)}/api/webhooks`,
    successPageUrl: `${base}/apps/customer/pages/order-details.html?${q}&paid=1`,
    failurePageUrl: `${base}/apps/customer/pages/order-details.html?${q}&failed=1`,
    cancelUrl: `${base}/apps/customer/pages/order-details.html?${q}&canceled=1`,
  };
}

function subscriptionReturnUrls(req, audience, paymentId) {
  const base = process.env.PUBLIC_APP_URL || process.env.APP_BASE_URL || 'https://laundromaster.re-el.co.za';
  const page = audience === 'owner'
    ? `${base}/apps/owner/pages/plan.html`
    : `${base}/apps/customer/pages/profile.html`;
  const q = `payment=${encodeURIComponent(paymentId)}`;
  return {
    callbackUrl: `${apiBase(req)}/api/webhooks`,
    successPageUrl: `${page}?${q}&sub=paid`,
    failurePageUrl: `${page}?${q}&sub=failed`,
    cancelUrl: `${page}?${q}&sub=canceled`,
  };
}

async function listPlans(supa, audience) {
  let req = supa.from('plans').select('*').eq('is_active', true).order('audience', { ascending: true }).order('sort', { ascending: true });
  if (audience) req = req.eq('audience', audience);
  const { data, error } = await req;
  if (error) throw error;
  return data || [];
}

async function startCheckout(supa, payment, urls, description) {
  const link = await createPaymentLink({
    amount: payment.amount,
    currency: payment.currency || 'ZAR',
    reference: payment.id,
    description,
    requesterUrl: urls.successPageUrl,
    ...urls,
  });
  const { data } = await supa.from('payments').update({
    provider_reference: payment.id,
    paylink_id: link.paylinkID || null,
    checkout_url: link.paylinkUrl || null,
    status: 'pending',
    raw_status: link.responseCode || null,
    updated_at: new Date().toISOString(),
  }).eq('id', payment.id).select().single();
  return { payment: data || payment, checkout_url: link.paylinkUrl || null, paylink_id: link.paylinkID || null };
}

export default createHandler(async function handler(req, res) {
  const q = query(req);
  const action = q.action || '';
  const supa = adminClient();
  if (!supa) return res.status(503).json(errorEnvelope(new ApiError('NOT_CONFIGURED', 'Supabase not configured', 503)));

  const ctx = await requireUser(req);

  if (req.method === 'GET') {
    if (action === 'plans') {
      const plans = await listPlans(supa, q.audience);
      return res.status(200).json(successEnvelope(plans));
    }

    if (action === 'subscription') {
      const audience = q.audience === 'owner' ? 'owner' : 'customer';
      const subscription = await activeSubscription(supa, ctx.user.id, audience);
      return res.status(200).json(successEnvelope({ subscription, plan: subscription ? subscription.plans : null }));
    }

    if (action === 'savings') {
      const settings = await getSettings(supa);
      const deliveryFee = num(settings.delivery_fee, 0);
      const subscription = await activeSubscription(supa, ctx.user.id, 'customer');
      if (!subscription) {
        return res.status(200).json(successEnvelope({ active: false, orders: 0, saved: 0, delivery_fee: deliveryFee, member_since: null }));
      }
      const since = subscription.current_period_start || subscription.created_at || new Date().toISOString();
      const { data: bookings } = await supa.from('bookings')
        .select('id, status, delivery_required')
        .eq('customer_id', ctx.user.id)
        .gte('created_at', since)
        .not('status', 'in', '(cancelled,rejected)');
      const deliveredOrders = (bookings || []).filter((b) => b.delivery_required).length;
      const saved = round2(deliveredOrders * deliveryFee);
      return res.status(200).json(successEnvelope({
        active: true,
        orders: (bookings || []).length,
        delivered_orders: deliveredOrders,
        saved,
        delivery_fee: deliveryFee,
        member_since: since,
        subscription,
      }));
    }

    if (action === 'payment') {
      if (!q.id) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', 'Missing payment id')));
      const { data: payment } = await supa.from('payments').select('*').eq('id', q.id).maybeSingle();
      if (!payment) return res.status(404).json(errorEnvelope(new ApiError('NOT_FOUND', 'Payment not found', 404)));
      if (payment.user_id && payment.user_id !== ctx.user.id && !isAdmin(ctx)) {
        return res.status(403).json(errorEnvelope(new ApiError('FORBIDDEN', 'Not your payment', 403)));
      }
      return res.status(200).json(successEnvelope(payment));
    }

    if (!q.booking_id && !q.id) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', 'Missing booking_id or id')));
    let request = supa.from('payments').select('*');
    request = q.id ? request.eq('id', q.id) : request.eq('booking_id', q.booking_id);
    const { data, error } = await request.order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (error || !data) return res.status(404).json(errorEnvelope(new ApiError('NOT_FOUND', 'Payment not found', 404)));
    return res.status(200).json(successEnvelope(data));
  }

  if (req.method === 'POST') {
    if (action === 'create') {
      const parsed = paymentCreate.safeParse(body(req));
      if (!parsed.success) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', parsed.error.message)));
      const { booking_id } = parsed.data;
      const { data: booking } = await supa.from('bookings')
        .select('id, customer_id, total_amount, currency, status')
        .eq('id', booking_id).maybeSingle();
      if (!booking) return res.status(404).json(errorEnvelope(new ApiError('NOT_FOUND', 'Booking not found', 404)));
      if (booking.customer_id !== ctx.user.id && !isAdmin(ctx)) {
        return res.status(403).json(errorEnvelope(new ApiError('FORBIDDEN', 'Not your booking', 403)));
      }

      const amount = Number(booking.total_amount) || 0;
      const { data: existing } = await supa.from('payments').select('*')
        .eq('booking_id', booking_id).order('created_at', { ascending: false }).limit(1).maybeSingle();

      // Free orders (or already-paid) skip the gateway entirely.
      if (amount <= 0) {
        let payment = existing;
        if (!payment) {
          const ins = await supa.from('payments').insert({
            booking_id, user_id: booking.customer_id, purpose: 'booking',
            provider: 'ikhokha', amount: 0, currency: booking.currency || 'ZAR',
            status: 'succeeded', paid_at: new Date().toISOString(),
            idempotency_key: `booking:${booking_id}`,
          }).select().single();
          payment = ins.data;
        }
        // Force reconciliation to advance the booking exactly once (guarded by status).
        let reconciled = payment;
        if (booking.status === 'pending_payment') {
          reconciled = await reconcilePayment(supa, { ...payment, booking_id, purpose: 'booking', status: 'pending' }, 'SUCCESS') || payment;
        }
        const { data: fresh } = await supa.from('bookings').select('status').eq('id', booking_id).maybeSingle();
        return res.status(200).json(successEnvelope({ payment: reconciled, paid: true, checkout_url: null, configured: false, booking_status: fresh && fresh.status }));
      }

      if (existing && existing.status === 'succeeded') {
        return res.status(200).json(successEnvelope({ payment: existing, paid: true, checkout_url: null, configured: true }));
      }

      const configured = await Promise.resolve(isConfigured());
      if (!configured) {
        return res.status(503).json(errorEnvelope(new ApiError('GATEWAY_NOT_CONFIGURED', 'Online payments are temporarily unavailable. Please try again later.', 503)));
      }

      let payment = existing;
      if (!payment) {
        const ins = await supa.from('payments').insert({
          booking_id, user_id: booking.customer_id, purpose: 'booking',
          provider: 'ikhokha', amount, currency: booking.currency || 'ZAR',
          status: 'created', idempotency_key: `booking:${booking_id}`,
        }).select().single();
        if (ins.error && ins.error.code === '23505') {
          const retry = await supa.from('payments').select('*').eq('booking_id', booking_id).order('created_at', { ascending: false }).limit(1).maybeSingle();
          payment = retry.data;
        } else {
          payment = ins.data;
        }
      }
      if (!payment) return res.status(500).json(errorEnvelope(new ApiError('PAYMENT_ERROR', 'Could not start payment')));

      if (payment.checkout_url && payment.status === 'pending') {
        return res.status(200).json(successEnvelope({ payment, paid: false, checkout_url: payment.checkout_url, configured: true }));
      }

      const urls = bookingReturnUrls(req, booking_id, payment.id);
      const started = await startCheckout(supa, payment, urls, `LaundroMaster order ${String(booking_id).slice(0, 8)}`);
      return res.status(201).json(successEnvelope({ ...started, paid: false, configured: true }));
    }

    if (action === 'subscribe') {
      const parsed = subscribePlan.safeParse(body(req));
      if (!parsed.success) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', parsed.error.message)));
      const { data: plan } = await supa.from('plans').select('*').eq('id', parsed.data.plan_id).eq('is_active', true).maybeSingle();
      if (!plan) return res.status(404).json(errorEnvelope(new ApiError('NOT_FOUND', 'Plan not available', 404)));

      const price = num(plan.price_monthly, 0);

      // Free plans activate immediately.
      if (price <= 0) {
        const subscription = await activateSubscription(supa, { userId: ctx.user.id, plan });
        return res.status(201).json(successEnvelope({ subscription, plan, paid: true, checkout_url: null }));
      }

      if (!isConfigured()) {
        return res.status(503).json(errorEnvelope(new ApiError('GATEWAY_NOT_CONFIGURED', 'Online payments are temporarily unavailable. Please try again later.', 503)));
      }

      const { data: payment, error } = await supa.from('payments').insert({
        booking_id: null,
        user_id: ctx.user.id,
        purpose: 'subscription',
        plan_id: plan.id,
        audience: plan.audience,
        provider: 'ikhokha',
        amount: price,
        currency: plan.currency || 'ZAR',
        status: 'created',
      }).select().single();
      if (error) return res.status(400).json(errorEnvelope(error));

      const urls = subscriptionReturnUrls(req, plan.audience, payment.id);
      const started = await startCheckout(supa, payment, urls, `${plan.name} subscription`);
      return res.status(201).json(successEnvelope({ ...started, plan, paid: false, configured: true }));
    }

    if (action === 'cancel-subscription') {
      const parsed = cancelSubscription.safeParse(body(req));
      if (!parsed.success) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', parsed.error.message)));
      await supa.from('subscriptions')
        .update({ status: 'canceled', canceled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('user_id', ctx.user.id).eq('audience', parsed.data.audience).in('status', ['active', 'trialing']);
      return res.status(200).json(successEnvelope({ canceled: true, audience: parsed.data.audience }));
    }

    if (action === 'verify') {
      const paymentId = body(req).payment_id || q.id;
      if (!paymentId) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', 'Missing payment_id')));
      const { data: payment } = await supa.from('payments').select('*').eq('id', paymentId).maybeSingle();
      if (!payment) return res.status(404).json(errorEnvelope(new ApiError('NOT_FOUND', 'Payment not found', 404)));
      if (payment.user_id && payment.user_id !== ctx.user.id && !isAdmin(ctx)) {
        return res.status(403).json(errorEnvelope(new ApiError('FORBIDDEN', 'Not your payment', 403)));
      }

      let updated = payment;
      if (payment.status !== 'succeeded' && payment.status !== 'failed' && payment.paylink_id) {
        const statusData = await getPaymentStatus(payment.paylink_id);
        const raw = statusData && (statusData.status || statusData.paymentStatus || statusData.responseCode);
        if (raw) updated = await reconcilePayment(supa, payment, raw) || payment;
      }
      let subscription = null;
      if (updated.purpose === 'subscription') {
        subscription = await activeSubscription(supa, updated.user_id, updated.audience);
      }
      return res.status(200).json(successEnvelope({ payment: updated, subscription }));
    }

    return res.status(405).json(errorEnvelope(new ApiError('METHOD_NOT_ALLOWED', 'Method not allowed', 405)));
  }

  return res.status(405).json(errorEnvelope(new ApiError('METHOD_NOT_ALLOWED', 'Method not allowed', 405)));
});

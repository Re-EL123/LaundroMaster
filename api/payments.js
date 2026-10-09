import { createHandler } from './_lib/handler.js';
import { successEnvelope, errorEnvelope, ApiError } from './_lib/errors.js';
import { adminClient } from './_lib/supabase-admin.js';
import { query, body } from './_lib/req.js';
import { requireUser, isAdmin } from './_lib/auth.js';
import { paymentCreate, subscribePlan, cancelSubscription } from './_lib/validation.js';
import { getSettings, num } from './_lib/settings.js';
import { activeSubscription, round2 } from './_lib/pricing.js';

async function listPlans(supa, audience) {
  let req = supa.from('plans').select('*').eq('is_active', true).order('audience', { ascending: true }).order('sort', { ascending: true });
  if (audience) req = req.eq('audience', audience);
  const { data, error } = await req;
  if (error) throw error;
  return data || [];
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
      const { data: booking } = await supa.from('bookings').select('id, customer_id, total_amount, currency, status').eq('id', booking_id).maybeSingle();
      if (!booking) return res.status(404).json(errorEnvelope(new ApiError('NOT_FOUND', 'Booking not found', 404)));
      if (booking.customer_id !== ctx.user.id && !isAdmin(ctx)) {
        return res.status(403).json(errorEnvelope(new ApiError('FORBIDDEN', 'Not your booking', 403)));
      }

      const configured = Boolean(process.env.IKHOKHA_API_KEY && process.env.IKHOKHA_API_SECRET);
      const { data: payment, error } = await supa
        .from('payments')
        .insert({
          booking_id,
          provider: 'ikhokha',
          amount: Number(booking.total_amount) || 0,
          currency: booking.currency || 'ZAR',
          status: configured ? 'pending' : 'created',
          idempotency_key: `booking:${booking_id}`,
        })
        .select()
        .single();
      if (error && error.code !== '23505') return res.status(400).json(errorEnvelope(error));

      return res.status(201).json(successEnvelope({
        payment: payment || { booking_id, status: 'created' },
        provider: 'ikhokha',
        checkout_url: null,
        configured,
      }));
    }

    if (action === 'subscribe') {
      const parsed = subscribePlan.safeParse(body(req));
      if (!parsed.success) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', parsed.error.message)));
      const { data: plan } = await supa.from('plans').select('*').eq('id', parsed.data.plan_id).eq('is_active', true).maybeSingle();
      if (!plan) return res.status(404).json(errorEnvelope(new ApiError('NOT_FOUND', 'Plan not available', 404)));

      // replace any existing active subscription for this audience
      await supa.from('subscriptions')
        .update({ status: 'canceled', updated_at: new Date().toISOString() })
        .eq('user_id', ctx.user.id).eq('audience', plan.audience).in('status', ['active', 'trialing']);

      const periodEnd = new Date();
      periodEnd.setMonth(periodEnd.getMonth() + 1);
      const { data: subscription, error } = await supa.from('subscriptions').insert({
        user_id: ctx.user.id,
        plan_id: plan.id,
        audience: plan.audience,
        status: 'active',
        current_period_end: periodEnd.toISOString(),
      }).select().single();
      if (error) return res.status(400).json(errorEnvelope(error));

      if (num(plan.price_monthly, 0) > 0) {
        await supa.from('transactions').insert({
          laundromat_id: null,
          type: `subscription:${plan.code}`,
          amount: num(plan.price_monthly, 0),
          currency: plan.currency || 'ZAR',
        });
      }
      return res.status(201).json(successEnvelope({ subscription, plan }));
    }

    if (action === 'cancel-subscription') {
      const parsed = cancelSubscription.safeParse(body(req));
      if (!parsed.success) return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', parsed.error.message)));
      await supa.from('subscriptions')
        .update({ status: 'canceled', updated_at: new Date().toISOString() })
        .eq('user_id', ctx.user.id).eq('audience', parsed.data.audience).in('status', ['active', 'trialing']);
      return res.status(200).json(successEnvelope({ canceled: true, audience: parsed.data.audience }));
    }

    return res.status(405).json(errorEnvelope(new ApiError('METHOD_NOT_ALLOWED', 'Method not allowed', 405)));
  }

  return res.status(405).json(errorEnvelope(new ApiError('METHOD_NOT_ALLOWED', 'Method not allowed', 405)));
});

import { createHandler } from './_lib/handler.js';
import { successEnvelope, errorEnvelope, ApiError } from './_lib/errors.js';
import { adminClient } from './_lib/supabase-admin.js';
import { query, body } from './_lib/req.js';
import { requireUser, isAdmin } from './_lib/auth.js';
import { paymentCreate } from './_lib/validation.js';

export default createHandler(async function handler(req, res) {
  const q = query(req);
  const action = q.action || '';
  const supa = adminClient();
  if (!supa) return res.status(503).json(errorEnvelope(new ApiError('NOT_CONFIGURED', 'Supabase not configured', 503)));

  const ctx = await requireUser(req);

  if (req.method === 'GET') {
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
    return res.status(405).json(errorEnvelope(new ApiError('METHOD_NOT_ALLOWED', 'Method not allowed', 405)));
  }

  return res.status(405).json(errorEnvelope(new ApiError('METHOD_NOT_ALLOWED', 'Method not allowed', 405)));
});

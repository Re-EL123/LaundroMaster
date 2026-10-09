import { createHmac, timingSafeEqual } from 'node:crypto';
import { createHandler } from './_lib/handler.js';
import { successEnvelope, errorEnvelope, ApiError } from './_lib/errors.js';
import { adminClient } from './_lib/supabase-admin.js';
import { body } from './_lib/req.js';

function verifySignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && timingSafeEqual(a, b);
}

const STATUS_MAP = {
  success: 'succeeded',
  succeeded: 'succeeded',
  paid: 'succeeded',
  pending: 'pending',
  failed: 'failed',
  cancelled: 'cancelled',
  refunded: 'refunded',
};

export default createHandler(async function handler(req, res) {
  const supa = adminClient();
  if (!supa) return res.status(503).json(errorEnvelope(new ApiError('NOT_CONFIGURED', 'Supabase not configured', 503)));

  if (req.method !== 'POST') {
    return res.status(405).json(errorEnvelope(new ApiError('METHOD_NOT_ALLOWED', 'Method not allowed', 405)));
  }

  const secret = process.env.IKHOKHA_WEBHOOK_SECRET;
  if (!secret) return res.status(503).json(errorEnvelope(new ApiError('NOT_CONFIGURED', 'Webhook secret not configured', 503)));

  const payload = body(req);
  const raw = typeof req.body === 'string' ? req.body : JSON.stringify(payload);
  const signature = req.headers['x-ikhokha-signature'] || req.headers['x-signature'];
  if (!verifySignature(raw, signature, secret)) {
    return res.status(401).json(errorEnvelope(new ApiError('INVALID_SIGNATURE', 'Signature verification failed', 401)));
  }

  const reference = payload.provider_reference || payload.reference || (payload.data && payload.data.reference);
  const rawStatus = (payload.status || (payload.data && payload.data.status) || payload.event || '').toLowerCase();
  const status = STATUS_MAP[rawStatus] || null;
  if (!reference || !status) {
    return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', 'Unrecognised webhook payload')));
  }

  const { data: payment } = await supa.from('payments').select('id, status, booking_id').eq('provider_reference', reference).maybeSingle();
  if (!payment) return res.status(202).json(successEnvelope({ ignored: true, reason: 'unknown reference' }));

  if (payment.status === 'succeeded' && status === 'succeeded') {
    return res.status(200).json(successEnvelope({ idempotent: true, payment_id: payment.id }));
  }

  await supa.from('payments').update({ status, updated_at: new Date().toISOString() }).eq('id', payment.id);

  if (status === 'succeeded') {
    await supa.from('bookings').update({ status: 'pending_acceptance', updated_at: new Date().toISOString() }).eq('id', payment.booking_id);
    await supa.from('booking_status_history').insert({ booking_id: payment.booking_id, status: 'pending_acceptance' });
  } else if (status === 'failed') {
    await supa.from('bookings').update({ status: 'payment_failed', updated_at: new Date().toISOString() }).eq('id', payment.booking_id);
  }

  return res.status(200).json(successEnvelope({ payment_id: payment.id, status }));
});

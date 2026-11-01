import { createHandler } from './_lib/handler.js';
import { successEnvelope, errorEnvelope, ApiError } from './_lib/errors.js';
import { adminClient } from './_lib/supabase-admin.js';
import { body } from './_lib/req.js';
import {
  payfastConfig, verifyWebhookSignature, confirmItnWithPayfast, itnAmount,
} from './_lib/payfast.js';
import { reconcilePayment, normalizeStatus } from './_lib/billing.js';
import { round2 } from './_lib/pricing.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default createHandler(async function handler(req, res) {
  const supa = adminClient();
  if (!supa) return res.status(503).json(errorEnvelope(new ApiError('NOT_CONFIGURED', 'Supabase not configured', 503)));

  if (req.method !== 'POST') {
    return res.status(405).json(errorEnvelope(new ApiError('METHOD_NOT_ALLOWED', 'Method not allowed', 405)));
  }

  const cfg = payfastConfig();
  const payload = body(req);
  const raw = typeof req.body === 'string' ? req.body : null;
  const signature = payload.signature || payload.Signature
    || req.headers['x-payfast-signature'] || req.headers['payfast-signature'];

  if (payload.merchant_id && cfg.merchantId && String(payload.merchant_id) !== String(cfg.merchantId)) {
    return res.status(401).json(errorEnvelope(new ApiError('INVALID_MERCHANT', 'Unknown merchant id', 401)));
  }
  if (!verifyWebhookSignature({ body: payload, raw, signature, headers: req.headers })) {
    return res.status(401).json(errorEnvelope(new ApiError('INVALID_SIGNATURE', 'Signature verification failed', 401)));
  }
  if (!(await confirmItnWithPayfast(payload))) {
    return res.status(401).json(errorEnvelope(new ApiError('INVALID_ITN', 'PayFast could not confirm this notification', 401)));
  }

  const reference = payload.m_payment_id || payload.M_PAYMENT_ID || payload.custom_str1 || payload.CUSTOM_STR1
    || payload.externalTransactionID
    || (payload.data && (payload.data.externalTransactionID || payload.data.m_payment_id || payload.data.custom_str1))
    || payload.provider_reference
    || payload.reference;
  const paylinkId = payload.pf_payment_id || payload.PF_PAYMENT_ID
    || payload.paylinkID || (payload.data && (payload.data.paylinkID || payload.data.pf_payment_id)) || null;
  const rawStatus = payload.payment_status || payload.PAYMENT_STATUS || payload.status
    || (payload.data && payload.data.status) || '';

  if (!reference && !paylinkId) {
    return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', 'Unrecognised webhook payload')));
  }

  let payment = null;
  if (reference) {
    const { data } = await supa.from('payments').select('*').eq('provider_reference', reference).maybeSingle();
    payment = data;
    // `m_payment_id` is our own payment UUID, so this also works if the row
    // predates `provider_reference` being filled in.
    if (!payment && UUID_RE.test(String(reference))) {
      const { data: byId } = await supa.from('payments').select('*').eq('id', reference).maybeSingle();
      payment = byId;
    }
  }
  if (!payment && paylinkId) {
    const { data } = await supa.from('payments').select('*').eq('paylink_id', paylinkId).maybeSingle();
    payment = data;
  }
  if (!payment) return res.status(202).json(successEnvelope({ ignored: true, reason: 'unknown reference' }));

  const status = normalizeStatus(rawStatus);
  if (!status) {
    return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', 'Unrecognised payment status')));
  }

  // A valid ITN must also be for the amount we asked for.
  if (status === 'succeeded') {
    const paidAmount = itnAmount(payload);
    if (paidAmount == null) {
      return res.status(400).json(errorEnvelope(new ApiError('AMOUNT_MISSING', 'Notification did not include an amount')));
    }
    if (Math.abs(round2(paidAmount - Number(payment.amount || 0))) > 0.01) {
      return res.status(400).json(errorEnvelope(new ApiError(
        'AMOUNT_MISMATCH',
        'Notification amount does not match the payment',
      )));
    }
  }

  if (paylinkId && payment.paylink_id !== paylinkId) {
    await supa.from('payments').update({ paylink_id: paylinkId, updated_at: new Date().toISOString() }).eq('id', payment.id);
    payment = { ...payment, paylink_id: paylinkId };
  }

  const updated = await reconcilePayment(supa, payment, rawStatus);
  return res.status(200).json(successEnvelope({ payment_id: payment.id, status: updated ? updated.status : null }));
});

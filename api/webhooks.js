import { createHandler } from './_lib/handler.js';
import { successEnvelope, errorEnvelope, ApiError } from './_lib/errors.js';
import { adminClient } from './_lib/supabase-admin.js';
import { body } from './_lib/req.js';
import { payfastConfig, verifyWebhookSignature, confirmItnWithPayfast } from './_lib/payfast.js';
import { reconcilePayment, normalizeStatus } from './_lib/billing.js';

export default createHandler(async function handler(req, res) {
  const supa = adminClient();
  if (!supa) return res.status(503).json(errorEnvelope(new ApiError('NOT_CONFIGURED', 'Supabase not configured', 503)));

  if (req.method !== 'POST') {
    return res.status(405).json(errorEnvelope(new ApiError('METHOD_NOT_ALLOWED', 'Method not allowed', 405)));
  }

  const cfg = payfastConfig();
  const payload = body(req);
  const signature = payload.signature || payload.Signature || payload.sign
    || req.headers['ik-sign'] || req.headers['x-payfast-signature'] || req.headers['x-signature'] || req.headers['payfast-signature'];
  const headerAppId = req.headers['ik-appid'] || req.headers['x-application-id'];

  if (headerAppId && cfg.appId && headerAppId !== cfg.appId) {
    return res.status(401).json(errorEnvelope(new ApiError('INVALID_APPID', 'Unknown application id', 401)));
  }
  if (!verifyWebhookSignature({ body: payload, signature, headers: req.headers })) {
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
  const paylinkId = payload.paylinkID || (payload.data && payload.data.paylinkID) || payload.pf_payment_id || payload.PF_PAYMENT_ID || null;
  const rawStatus = payload.payment_status || payload.PAYMENT_STATUS || payload.status || (payload.data && payload.data.status) || '';

  if (!reference && !paylinkId) {
    return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', 'Unrecognised webhook payload')));
  }

  let payment = null;
  if (reference) {
    const { data } = await supa.from('payments').select('*').eq('provider_reference', reference).maybeSingle();
    payment = data;
  }
  if (!payment && paylinkId) {
    const { data } = await supa.from('payments').select('*').eq('paylink_id', paylinkId).maybeSingle();
    payment = data;
  }
  if (!payment) return res.status(202).json(successEnvelope({ ignored: true, reason: 'unknown reference' }));

  if (!normalizeStatus(rawStatus)) {
    return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', 'Unrecognised payment status')));
  }

  if (paylinkId && payment.paylink_id !== paylinkId) {
    await supa.from('payments').update({ paylink_id: paylinkId, updated_at: new Date().toISOString() }).eq('id', payment.id);
    payment = { ...payment, paylink_id: paylinkId };
  }

  const updated = await reconcilePayment(supa, payment, rawStatus);
  return res.status(200).json(successEnvelope({ payment_id: payment.id, status: updated ? updated.status : null }));
});

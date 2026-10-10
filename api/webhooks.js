import { createHandler } from './_lib/handler.js';
import { successEnvelope, errorEnvelope, ApiError } from './_lib/errors.js';
import { adminClient } from './_lib/supabase-admin.js';
import { body } from './_lib/req.js';
import { ikhokhaConfig, verifyWebhookSignature } from './_lib/ikhokha.js';
import { reconcilePayment, normalizeStatus } from './_lib/billing.js';

function requestPathname(req) {
  const raw = req.url || '/api/webhooks';
  return raw.split('?')[0] || '/api/webhooks';
}

export default createHandler(async function handler(req, res) {
  const supa = adminClient();
  if (!supa) return res.status(503).json(errorEnvelope(new ApiError('NOT_CONFIGURED', 'Supabase not configured', 503)));

  if (req.method !== 'POST') {
    return res.status(405).json(errorEnvelope(new ApiError('METHOD_NOT_ALLOWED', 'Method not allowed', 405)));
  }

  const { appId, webhookSecret } = ikhokhaConfig();
  if (!webhookSecret) return res.status(503).json(errorEnvelope(new ApiError('NOT_CONFIGURED', 'Webhook secret not configured', 503)));

  const payload = body(req);
  // Prefer the exact raw string when available; Vercel may parse JSON for us.
  const raw = typeof req.body === 'string' ? req.body : JSON.stringify(payload || {});
  const signature = req.headers['ik-sign'] || req.headers['x-ikhokha-signature'] || req.headers['x-signature'];
  const headerAppId = req.headers['ik-appid'];

  if (headerAppId && appId && headerAppId !== appId) {
    return res.status(401).json(errorEnvelope(new ApiError('INVALID_APPID', 'Unknown application id', 401)));
  }
  if (!verifyWebhookSignature({ pathname: requestPathname(req), rawBody: raw, signature })) {
    return res.status(401).json(errorEnvelope(new ApiError('INVALID_SIGNATURE', 'Signature verification failed', 401)));
  }

  const reference = payload.externalTransactionID
    || (payload.data && payload.data.externalTransactionID)
    || payload.provider_reference
    || payload.reference;
  const paylinkId = payload.paylinkID || (payload.data && payload.data.paylinkID) || null;
  const rawStatus = payload.status || (payload.data && payload.data.status) || '';

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

  const updated = await reconcilePayment(supa, payment, rawStatus);
  return res.status(200).json(successEnvelope({ payment_id: payment.id, status: updated ? updated.status : null }));
});

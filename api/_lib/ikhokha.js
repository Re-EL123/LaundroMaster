import { createHmac, timingSafeEqual } from 'node:crypto';

// iKhokha iK Pay API (hosted payment links).
// Docs: https://developer.ikhokha.com/ — POST /public-api/v1/api/payment
//
// Signature: IK-SIGN = HMAC_SHA256(path + rawRequestBodyJSON, appSecret), hex.
// Amounts are in the smallest currency unit (cents for ZAR).

const PAYMENT_PATH = '/public-api/v1/api/payment';

export function ikhokhaConfig() {
  const appId = (process.env.IKHOKHA_APP_ID || process.env.IKHOKHA_API_KEY || '').trim();
  const appSecret = (process.env.IKHOKHA_APP_SECRET || process.env.IKHOKHA_API_SECRET || '').trim();
  const entityId = (process.env.IKHOKHA_ENTITY_ID || appId).trim();
  const webhookSecret = (process.env.IKHOKHA_WEBHOOK_SECRET || appSecret).trim();
  const baseUrl = (process.env.IKHOKHA_BASE_URL || 'https://api.ikhokha.com').replace(/\/$/, '');
  const mode = process.env.IKHOKHA_MODE === 'live' ? 'live' : 'test';
  return { appId, appSecret, entityId, webhookSecret, baseUrl, mode };
}

export function isConfigured() {
  const { appId, appSecret, entityId } = ikhokhaConfig();
  return Boolean(appId && appSecret && entityId);
}

export function signPayload(path, rawBody, secret) {
  return createHmac('sha256', secret).update(`${path}${rawBody}`).digest('hex');
}

function toCents(amount) {
  return Math.round(Number(amount || 0) * 100);
}

// Create a hosted payment link. Returns { responseCode, message, paylinkUrl, paylinkID, externalTransactionID }.
export async function createPaymentLink({
  amount,
  currency = 'ZAR',
  reference,
  description = '',
  requesterUrl,
  callbackUrl,
  successPageUrl,
  failurePageUrl,
  cancelUrl,
}) {
  const cfg = ikhokhaConfig();
  if (!isConfigured()) {
    const err = new Error('Payment gateway is not configured');
    err.code = 'NOT_CONFIGURED';
    err.status = 503;
    throw err;
  }

  const payload = {
    entityID: cfg.entityId,
    externalEntityID: cfg.entityId,
    amount: toCents(amount),
    currency,
    requesterUrl: requesterUrl || 'https://laundromaster.re-el.co.za',
    description: description.slice(0, 200),
    paymentReference: reference,
    mode: cfg.mode,
    externalTransactionID: reference,
    urls: {
      callbackUrl,
      successPageUrl,
      failurePageUrl,
      cancelUrl,
    },
  };
  const rawBody = JSON.stringify(payload);
  const signature = signPayload(PAYMENT_PATH, rawBody, cfg.appSecret);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  let res;
  try {
    res = await fetch(`${cfg.baseUrl}${PAYMENT_PATH}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'IK-APPID': cfg.appId,
        'IK-SIGN': signature,
      },
      body: rawBody,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  let data = {};
  try { data = await res.json(); } catch { /* non-JSON */ }

  if (!res.ok || (data && data.responseCode && data.responseCode !== '00')) {
    const err = new Error((data && data.message) || `iKhokha request failed (${res.status})`);
    err.code = 'GATEWAY_ERROR';
    err.status = 502;
    err.gateway = data;
    throw err;
  }
  return data;
}

// Look up the status of a payment link. Returns { responseCode, status, ... }.
export async function getPaymentStatus(paylinkId) {
  const cfg = ikhokhaConfig();
  if (!isConfigured() || !paylinkId) return null;
  const path = `/public-api/v1/api/getStatus/${encodeURIComponent(paylinkId)}`;
  const signature = signPayload(path, '', cfg.appSecret);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${cfg.baseUrl}${path}`, {
      headers: { Accept: 'application/json', 'IK-APPID': cfg.appId, 'IK-SIGN': signature },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Verify an inbound webhook using HMAC over `pathname + rawBody`.
export function verifyWebhookSignature({ pathname, rawBody, signature }) {
  const { webhookSecret } = ikhokhaConfig();
  if (!signature || !webhookSecret) return false;
  const expected = signPayload(pathname, rawBody, webhookSecret);
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && timingSafeEqual(a, b);
}

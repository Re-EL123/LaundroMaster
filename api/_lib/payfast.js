import { createHmac, timingSafeEqual } from 'node:crypto';

// PayFast Integration (hosted payment)
// Docs: https://developers.payfast.co.za/docs
// Generate signature: MD5 of parameter string (or custom per PayFast docs).

const PAYMENT_PATH = '/public-api/v1/api/payment';

export function payfastConfig() {
  const merchantId = (process.env.PAYFAST_MERCHANT_ID || process.env.PAYFAST_APP_ID || '').trim();
  const merchantKey = (process.env.PAYFAST_MERCHANT_KEY || process.env.PAYFAST_API_KEY || '').trim();
  const passphrase = (process.env.PAYFAST_PASSPHRASE || process.env.PAYFAST_WEBHOOK_SECRET || '').trim();
  const baseUrl = (process.env.PAYFAST_BASE_URL || 'https://www.payfast.co.za').replace(/\/$/, '');
  const mode = process.env.PAYFAST_MODE === 'live' ? 'live' : 'test';
  return { merchantId, merchantKey, passphrase, baseUrl, mode, appId: process.env.PAYFAST_MERCHANT_ID || process.env.PAYFAST_APP_ID || '' };
}

export function isConfigured() {
  const { merchantId, merchantKey } = payfastConfig();
  return Boolean(merchantId && merchantKey);
}

import { createHash } from 'node:crypto';
export function signPayload(params, passphrase = null) {
  const data = { ...(params || {}) };
  const pass = passphrase !== null && passphrase !== undefined ? String(passphrase).trim() : '';
  const entries = Object.keys(data)
    .filter((k) => k !== 'signature')
    .filter((k) => data[k] !== undefined && data[k] !== null && String(data[k]).trim() !== '')
    .sort();
  let str = entries
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(data[k]).trim())}`)
    .join('&');
  if (pass) {
    str = `${str}${str ? '&' : ''}passphrase=${encodeURIComponent(pass)}`;
  }
  return createHash('md5').update(str).digest('hex');
}

function toCents(amount) {
  return Math.round(Number(amount || 0) * 100);
}

// Create a hosted PayFast payment. Returns minimal shape compatible with existing callers.
// PayFast expects a form POST to /eng/process; here we return a checkout_url that the
// client can redirect to, containing signed parameters.
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
  const cfg = payfastConfig();
  if (!isConfigured()) {
    const err = new Error('Payment gateway is not configured');
    err.code = 'NOT_CONFIGURED';
    err.status = 503;
    throw err;
  }

  const amountStr = (Number(amount || 0)).toFixed(2);
  const params = {
    merchant_id: cfg.merchantId,
    merchant_key: cfg.merchantKey,
    return_url: successPageUrl,
    cancel_url: cancelUrl || failurePageUrl,
    notify_url: callbackUrl,
    name_first: 'LaundroMaster',
    name_last: 'Customer',
    email_address: '',
    m_payment_id: reference,
    amount: amountStr,
    item_name: description.slice(0, 100) || 'LaundroMaster Payment',
    item_description: description.slice(0, 255),
    custom_str1: reference,
  };

  const pfBase = cfg.mode === 'live' ? cfg.baseUrl : 'https://sandbox.payfast.co.za';
  let query = Object.keys(params).filter(k => params[k] !== undefined && params[k] !== null && params[k] !== '').map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join('&');
  const sig = signPayload(params, cfg.passphrase);
  if (query) query += `&signature=${encodeURIComponent(sig)}`;

  return {
    paylinkUrl: `${pfBase}/eng/process?${query}`,
    paylinkID: reference,
    externalTransactionID: reference,
    responseCode: '00',
    message: 'OK',
  };
}

// PayFast hosted payments don't expose a paylink status lookup via a simple ID in the same way;
// webhooks provide authoritative status. Return null to keep existing reconciliation flow.
export async function getPaymentStatus(paylinkId) {
  return null;
}

// Verify PayFast ITN signature (server-to-server). PayFast posts all fields; signature
// is the MD5 of the concatenated sorted key=value pairs, excluding the signature field itself.
export function verifyWebhookSignature({ body = {}, signature, rawBody, pathname } = {}) {
  if (!signature || typeof body !== 'object') return false;
  const cfg = payfastConfig();
  const expected = signPayload(body, cfg.passphrase);
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && timingSafeEqual(a, b);
}


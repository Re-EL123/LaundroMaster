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


export async function validatePayment({ m_payment_id, payment_id, amount_gross } = {}) {
  const cfg = payfastConfig();
  if (!isConfigured() || !m_payment_id) return { valid: false };
  const params = {
    merchant_id: cfg.merchantId,
    merchant_key: cfg.merchantKey,
    m_payment_id,
  };
  const sig = signPayload(params, cfg.passphrase);
  const query = Object.keys(params).filter(k => params[k]).map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join('&') + `&signature=${encodeURIComponent(sig)}`;
  const base = cfg.mode === 'live' ? cfg.baseUrl : 'https://sandbox.payfast.co.za';
  const url = `${base}/eng/query/validate?${query}`;
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return { valid: false };
    const data = await res.json();
    if (data && data.code === '000') return { valid: true, data };
  } catch {}
  return { valid: false };
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

// Look up payment status via validate endpoint if possible.
export async function getPaymentStatus(paylinkId) {
  if (!paylinkId) return null;
  const res = await validatePayment({ m_payment_id: paylinkId });
  if (res && res.valid && res.data) {
    return { status: res.data.status || res.data.payment_status || null, data: res.data };
  }
  return null;
}

// Verify PayFast ITN signature (server-to-server). PayFast posts all fields; signature
// is the MD5 of the concatenated sorted key=value pairs, excluding the signature field itself.
export function verifyWebhookSignature({ body = {}, signature, headers = {} } = {}) {
  const sig = signature || body.signature || body.SIGNATURE || headers['x-payfast-signature'] || headers['X-PayFast-Signature'] || headers.signature;
  if (!sig || typeof body !== 'object') return false;
  const params = { ...body };
  const cfg = payfastConfig();
  const expected1 = signPayload(params, cfg.passphrase);
  const expected2 = signPayload(params, cfg.passphrase ? cfg.passphrase : undefined);
  const candidates = [expected1, expected2];
  // also try without passphrase
  candidates.push(signPayload(params));
  const b = Buffer.from(String(sig));
  for (const c of candidates) {
    const a = Buffer.from(c);
    if (a.length === b.length) {
      try {
        if (timingSafeEqual(a, b)) return true;
      } catch {}
    }
  }
  // try case-insensitive? maybe
  return false;
}

import { createHash, timingSafeEqual } from 'node:crypto';

// PayFast Integration (hosted payment)
// Docs: https://developers.payfast.co.za/docs

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

function payfastProcessBase(cfg) {
  return cfg.mode === 'live' ? cfg.baseUrl : 'https://sandbox.payfast.co.za';
}

/** PayFast ITN server confirmation — POST the received fields back to PayFast. */
export async function confirmItnWithPayfast(params) {
  const cfg = payfastConfig();
  if (!isConfigured() || !params || typeof params !== 'object') return false;

  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === 'signature' || value == null || String(value).trim() === '') continue;
    body.append(key, String(value).trim());
  }
  if (!body.toString()) return false;

  const url = `${payfastProcessBase(cfg)}/eng/query/validate`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!res.ok) return false;
    const text = (await res.text()).trim();
    return text === 'VALID';
  } catch {
    return false;
  }
}

/** Validate an ITN payload (full PayFast notification body). */
export async function validatePayment(itnParams = {}) {
  if (!itnParams || typeof itnParams !== 'object') return { valid: false };
  const valid = await confirmItnWithPayfast(itnParams);
  if (!valid) return { valid: false };
  const status = itnParams.payment_status || itnParams.PAYMENT_STATUS || 'COMPLETE';
  return { valid: true, data: { payment_status: status, ...itnParams } };
}

// Create a hosted PayFast payment. Returns a POST form payload for the browser.
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

  const pfBase = payfastProcessBase(cfg);
  const action = `${pfBase}/eng/process`;
  const signature = signPayload(params, cfg.passphrase);
  const fields = { ...params, signature };

  return {
    paylinkUrl: action,
    paylinkID: reference,
    externalTransactionID: reference,
    responseCode: '00',
    message: 'OK',
    checkout: { action, fields },
  };
}

// Best-effort status lookup when the client returns before the ITN webhook lands.
export async function getPaymentStatus(paylinkId, itnParams = null) {
  if (itnParams && typeof itnParams === 'object') {
    const res = await validatePayment(itnParams);
    if (res.valid) {
      const status = res.data.payment_status || res.data.status || 'COMPLETE';
      return { status, data: res.data };
    }
    return null;
  }
  if (!paylinkId) return null;
  const res = await validatePayment({ m_payment_id: paylinkId });
  if (res.valid) {
    const status = res.data.payment_status || res.data.status || 'COMPLETE';
    return { status, data: res.data };
  }
  return null;
}

export function verifyWebhookSignature({ body = {}, signature, headers = {} } = {}) {
  const sig = signature || body.signature || body.SIGNATURE || headers['x-payfast-signature'] || headers['X-PayFast-Signature'] || headers.signature;
  if (!sig || typeof body !== 'object') return false;
  const params = { ...body };
  const cfg = payfastConfig();
  const candidates = [
    signPayload(params, cfg.passphrase),
    signPayload(params),
  ];
  const b = Buffer.from(String(sig));
  for (const c of candidates) {
    const a = Buffer.from(c);
    if (a.length === b.length) {
      try {
        if (timingSafeEqual(a, b)) return true;
      } catch { /* length mismatch */ }
    }
  }
  return false;
}

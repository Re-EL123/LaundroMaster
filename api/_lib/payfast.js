import { createHash, timingSafeEqual } from 'node:crypto';

// PayFast Integration (hosted payment)
// Docs: https://developers.payfast.co.za/docs

export function payfastConfig() {
  const merchantId = (process.env.PAYFAST_MERCHANT_ID || process.env.PAYFAST_APP_ID || '').trim();
  const merchantKey = (process.env.PAYFAST_MERCHANT_KEY || process.env.PAYFAST_API_KEY || '').trim();
  const passphrase = (process.env.PAYFAST_PASSPHRASE || process.env.PAYFAST_WEBHOOK_SECRET || '').trim();
  const baseUrl = (process.env.PAYFAST_BASE_URL || 'https://www.payfast.co.za').replace(/\/$/, '');
  const mode = process.env.PAYFAST_MODE === 'live' ? 'live' : 'test';
  return {
    merchantId,
    merchantKey,
    passphrase,
    baseUrl,
    mode,
    appId: process.env.PAYFAST_MERCHANT_ID || process.env.PAYFAST_APP_ID || '',
  };
}

export function isConfigured() {
  const { merchantId, merchantKey } = payfastConfig();
  return Boolean(merchantId && merchantKey);
}

/**
 * PHP's `urlencode()` — what PayFast uses when it computes signatures.
 * `encodeURIComponent` is close, but leaves `!'()*~` alone and encodes spaces
 * as %20, both of which change the MD5.
 */
export function phpUrlEncode(value) {
  return encodeURIComponent(String(value))
    .replace(/%20/g, '+')
    .replace(/[!'()*~]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function signatureString(params, passphrase = '', { sortKeys = false } = {}) {
  const data = params || {};
  let keys = Object.keys(data).filter((key) => key !== 'signature' && key !== 'Signature');
  if (sortKeys) keys = keys.slice().sort();
  const pairs = [];
  for (const key of keys) {
    const value = data[key];
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text === '') continue;
    pairs.push(`${key}=${phpUrlEncode(text)}`);
  }
  let str = pairs.join('&');
  const pass = String(passphrase || '').trim();
  if (pass) str = `${str}${str ? '&' : ''}passphrase=${phpUrlEncode(pass)}`;
  return str;
}

/**
 * Build a PayFast signature. Fields are hashed in object insertion order —
 * that is the order PayFast reads the form fields in. `sortKeys` exists only
 * for tolerant ITN verification.
 */
export function signPayload(params, passphrase = null, { sortKeys = false } = {}) {
  const pass = passphrase !== null && passphrase !== undefined ? String(passphrase).trim() : '';
  return createHash('md5').update(signatureString(params, pass, { sortKeys })).digest('hex');
}

function payfastProcessBase(cfg) {
  return cfg.mode === 'live' ? cfg.baseUrl : 'https://sandbox.payfast.co.za';
}

/** PayFast ITN server confirmation — POST the received fields back to PayFast. */
export async function confirmItnWithPayfast(params) {
  const cfg = payfastConfig();
  if (!isConfigured() || !params || typeof params !== 'object') return false;

  // Preserve the field order PayFast sent: the validation endpoint compares
  // the raw body against the transaction it recorded.
  const body = Object.entries(params)
    .filter(([key]) => key !== 'signature' && key !== 'Signature')
    .map(([key, value]) => `${key}=${phpUrlEncode(value == null ? '' : String(value).trim())}`)
    .join('&');
  if (!body) return false;

  const url = `${payfastProcessBase(cfg)}/eng/query/validate`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
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
  // Object order matters: PayFast signs the fields in the order they appear.
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

/**
 * PayFast has no synchronous "get status" API — the ITN is the source of
 * truth. If the caller supplies ITN fields (for example from a server-side
 * callback) they are validated; otherwise the caller keeps its stored status.
 */
export async function getPaymentStatus(reference, itnParams = null) {
  if (itnParams && typeof itnParams === 'object' && Object.keys(itnParams).length) {
    const res = await validatePayment(itnParams);
    if (res.valid) {
      const status = res.data.payment_status || res.data.status || 'COMPLETE';
      return { status, data: res.data };
    }
    return null;
  }
  return null;
}

/** Accepts an object, a URL-encoded body, or an already-parsed payload. */
function payloadEntries(source) {
  if (!source) return [];
  if (typeof source === 'string') {
    try {
      return [...new URLSearchParams(source).entries()];
    } catch {
      return [];
    }
  }
  const entries = Object.entries(source);
  // Fastify/Vercel may hand us a nested `{ data: {...} }` payload.
  if (entries.length === 1 && entries[0][0] === 'data' && entries[0][1] && typeof entries[0][1] === 'object') {
    return Object.entries(entries[0][1]);
  }
  return entries;
}

export function verifyWebhookSignature({ body = {}, raw = null, signature, headers = {} } = {}) {
  const headerBag = headers || {};
  const sig = signature
    || (body && (body.signature || body.Signature))
    || headerBag['x-payfast-signature']
    || headerBag['X-PayFast-Signature']
    || headerBag.signature;
  if (!sig || typeof sig !== 'string') return false;

  const params = Object.fromEntries(payloadEntries(raw || body));
  if (!Object.keys(params).length) return false;

  const cfg = payfastConfig();
  // PayFast signs in form order; we also try the sorted order because some
  // integrations rebuild the payload alphabetically. Never accept a signature
  // computed without the configured passphrase: those fields are public, so
  // anyone could recreate them.
  const candidates = new Set([
    signPayload(params, cfg.passphrase),
    signPayload(params, cfg.passphrase, { sortKeys: true }),
  ].map((value) => value.toLowerCase()));

  const provided = String(sig).trim().toLowerCase();
  const a = Buffer.from(provided);
  for (const candidate of candidates) {
    const b = Buffer.from(candidate);
    if (a.length !== b.length) continue;
    try {
      if (timingSafeEqual(a, b)) return true;
    } catch { /* unreachable — lengths match */ }
  }
  return false;
}

/** Numeric amount from an ITN payload (`amount_gross` is PayFast's). */
export function itnAmount(params = {}) {
  const source = params && params.data && typeof params.data === 'object' ? params.data : params;
  const raw = source.amount_gross ?? source.AMOUNT_GROSS ?? source.amount ?? source.AMOUNT;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

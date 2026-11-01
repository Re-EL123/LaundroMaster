import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStatus } from '../api/_lib/billing.js';
import {
  signPayload, payfastConfig, isConfigured, phpUrlEncode,
  verifyWebhookSignature, itnAmount,
} from '../api/_lib/payfast.js';

test('normalizeStatus maps PayFast outcomes to internal statuses', () => {
  assert.equal(normalizeStatus('SUCCESS'), 'succeeded');
  assert.equal(normalizeStatus('successful'), 'succeeded');
  assert.equal(normalizeStatus('succeeded'), 'succeeded');
  assert.equal(normalizeStatus('00'), 'succeeded');
  assert.equal(normalizeStatus('FAILURE'), 'failed');
  assert.equal(normalizeStatus('declined'), 'failed');
  assert.equal(normalizeStatus('pending'), 'pending');
  assert.equal(normalizeStatus('refunded'), 'refunded');
  assert.equal(normalizeStatus('nonsense'), null);
  assert.equal(normalizeStatus(undefined), null);
});

test('signPayload produces the documented PayFast signature', () => {
  const sig = signPayload({ a: '1', b: '2' });
  assert.equal(sig, 'ed04c91cf6f6ab5a01a31c0295c5da34');
  assert.equal(signPayload({ a: '1', b: '2' }, 'secret pass'), '5a89e32e1e7d98b9ec3fa8524f4ba67e');
});

test('phpUrlEncode matches PHP urlencode', () => {
  assert.equal(phpUrlEncode('12 Main Rd'), '12+Main+Rd');
  assert.equal(phpUrlEncode("a!b'c(d)e*f"), 'a%21b%27c%28d%29e%2Af');
  assert.equal(phpUrlEncode('a-b_c.d~e'), 'a-b_c.d%7Ee');
  assert.equal(phpUrlEncode('R100 & up'), 'R100+%26+up');
});

test('signPayload skips empty fields and the signature itself', () => {
  assert.equal(
    signPayload({ a: '1', b: '', c: null, d: undefined, signature: 'nope' }),
    signPayload({ a: '1' }),
  );
});

test('verifyWebhookSignature accepts a passphrase signature and rejects forgery', () => {
  const saved = process.env.PAYFAST_PASSPHRASE;
  process.env.PAYFAST_PASSPHRASE = 'secret pass';
  try {
    const params = { m_payment_id: 'abc', amount_gross: '100.00', payment_status: 'COMPLETE' };
    const good = signPayload(params, 'secret pass');
    assert.equal(verifyWebhookSignature({ body: { ...params, signature: good } }), true);

    // Without the passphrase the fields are public, so the signature is
    // derivable by anyone — it must not be accepted.
    const forged = signPayload(params);
    assert.notEqual(forged, good);
    assert.equal(verifyWebhookSignature({ body: { ...params, signature: forged } }), false);

    // Tampering with a signed field must fail.
    assert.equal(verifyWebhookSignature({ body: { ...params, amount_gross: '1.00', signature: good } }), false);
    assert.equal(verifyWebhookSignature({ body: params }), false);
  } finally {
    if (saved === undefined) delete process.env.PAYFAST_PASSPHRASE;
    else process.env.PAYFAST_PASSPHRASE = saved;
  }
});

test('itnAmount reads gross amounts from flat and wrapped payloads', () => {
  assert.equal(itnAmount({ amount_gross: '99.50' }), 99.5);
  assert.equal(itnAmount({ AMOUNT_GROSS: '12' }), 12);
  assert.equal(itnAmount({ data: { amount_gross: '7.25' } }), 7.25);
  assert.equal(itnAmount({ amount: '3' }), 3);
  assert.equal(itnAmount({}), null);
  assert.equal(itnAmount({ amount_gross: 'nope' }), null);
});

test('payfastConfig defaults to sandbox and known aliases', () => {
  const saved = { ...process.env };
  for (const k of Object.keys(process.env)) {
    if (k.startsWith('IKHOKHA_') || k.startsWith('PAYFAST_')) delete process.env[k];
  }
  try {
    const cfg = payfastConfig();
    assert.equal(cfg.mode, 'test');
    assert.equal(cfg.baseUrl, 'https://www.payfast.co.za');
    assert.equal(isConfigured(), false);

    process.env.PAYFAST_MERCHANT_ID = 'm-id';
    process.env.PAYFAST_MERCHANT_KEY = 'm-key';
    process.env.PAYFAST_MODE = 'live';
    const live = payfastConfig();
    assert.equal(live.merchantId, 'm-id');
    assert.equal(live.merchantKey, 'm-key');
    assert.equal(live.mode, 'live');
    assert.equal(isConfigured(), true);
  } finally {
    for (const k of Object.keys(process.env)) {
      if (k.startsWith('IKHOKHA_') || k.startsWith('PAYFAST_')) delete process.env[k];
    }
    Object.assign(process.env, saved);
  }
});

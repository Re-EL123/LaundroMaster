import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStatus } from '../api/_lib/billing.js';
import { signPayload, payfastConfig, isConfigured } from '../api/_lib/payfast.js';

test('normalizeStatus maps PayFast outcomes to internal statuses', () => {
  assert.equal(normalizeStatus('SUCCESS'), 'succeeded');
  assert.equal(normalizeStatus('successful'), null);
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
  assert.equal(typeof sig, 'string');
  assert.equal(sig.length > 0, true);
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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { normalizeStatus } from '../api/_lib/billing.js';
import { signPayload, ikhokhaConfig, isConfigured } from '../api/_lib/ikhokha.js';

test('normalizeStatus maps iKhokha outcomes to internal statuses', () => {
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

test('signPayload produces the documented HMAC-SHA256 hex signature', () => {
  const secret = 's3cret';
  const path = '/public-api/v1/api/payment';
  const raw = '{"amount":1000}';
  const expected = createHmac('sha256', secret).update(`${path}${raw}`).digest('hex');
  assert.equal(signPayload(path, raw, secret), expected);
});

test('ikhokhaConfig defaults to sandbox and known aliases', () => {
  const saved = { ...process.env };
  for (const k of Object.keys(process.env)) {
    if (k.startsWith('IKHOKHA_')) delete process.env[k];
  }
  try {
    const cfg = ikhokhaConfig();
    assert.equal(cfg.mode, 'test');
    assert.equal(cfg.baseUrl, 'https://api.ikhokha.com');
    assert.equal(isConfigured(), false);

    process.env.IKHOKHA_API_KEY = 'app-id';
    process.env.IKHOKHA_API_SECRET = 'api-secret';
    process.env.IKHOKHA_ENTITY_ID = 'entity';
    process.env.IKHOKHA_MODE = 'live';
    const live = ikhokhaConfig();
    assert.equal(live.appId, 'app-id');
    assert.equal(live.appSecret, 'api-secret');
    assert.equal(live.webhookSecret, 'api-secret');
    assert.equal(live.mode, 'live');
    assert.equal(isConfigured(), true);
  } finally {
    for (const k of Object.keys(process.env)) {
      if (k.startsWith('IKHOKHA_')) delete process.env[k];
    }
    Object.assign(process.env, saved);
  }
});

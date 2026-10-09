import { test } from 'node:test';
import assert from 'node:assert/strict';
import { round2, computeDeliveryFee, computeCharges } from '../api/_lib/pricing.js';

test('round2 rounds to two decimals', () => {
  assert.equal(round2(1.005), 1.01);
  assert.equal(round2('12.345'), 12.35);
  assert.equal(round2(undefined), 0);
});

test('computeDeliveryFee is zero without delivery or pickup', () => {
  assert.equal(computeDeliveryFee({ delivery_fee: 25 }, {}), 0);
});

test('computeDeliveryFee charges the configured fee', () => {
  assert.equal(computeDeliveryFee({ delivery_fee: 25 }, { deliveryRequired: true }), 25);
  assert.equal(computeDeliveryFee({ delivery_fee: 25 }, { pickupRequired: true }), 25);
});

test('computeDeliveryFee is waived for customer plan members', () => {
  const settings = { delivery_fee: 25, customer_plus_free_delivery: true };
  assert.equal(computeDeliveryFee(settings, { deliveryRequired: true, hasCustomerPlan: true }), 0);
});

test('computeCharges splits commission, platform fee and owner net', () => {
  const c = computeCharges({ subtotal: 200, deliveryFee: 25, commissionPercent: 8 });
  assert.equal(c.total, 225);
  assert.equal(c.commission, 16);
  assert.equal(c.platformFee, 25);
  assert.equal(c.ownerNet, 184);
});

test('computeCharges applies tax and discount to the total', () => {
  const c = computeCharges({ subtotal: 100, deliveryFee: 0, tax: 15, discount: 10, commissionPercent: 10 });
  assert.equal(c.total, 105);
  assert.equal(c.commission, 10);
  assert.equal(c.ownerNet, 90);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bookingCreate,
  bookingUpdateStatus,
  serviceCreate,
  serviceUpdate,
  reviewCreate,
  profileUpdate,
  verifyLaundromat,
  subscribePlan,
  cancelSubscription,
  promotionCreate,
  payoutRequest,
  adminSettingsUpdate,
  planUpsert,
  adminUserUpdate,
  adminPayoutUpdate,
  adminNotification,
} from '../api/_lib/validation.js';

const uuid = '11111111-1111-1111-1111-111111111111';
const uuid2 = '22222222-2222-2222-2222-222222222222';
const uuid3 = '33333333-3333-3333-3333-333333333333';

test('bookingCreate accepts a valid payload', () => {
  const r = bookingCreate.safeParse({
    laundromat_id: uuid,
    customer_id: uuid2,
    items: [{ service_id: uuid3, quantity: 2 }],
  });
  assert.equal(r.success, true);
});

test('bookingCreate requires at least one item', () => {
  const r = bookingCreate.safeParse({ laundromat_id: uuid, items: [] });
  assert.equal(r.success, false);
});

test('bookingCreate rejects a non-uuid id', () => {
  const r = bookingCreate.safeParse({ laundromat_id: 'nope', customer_id: 'x' });
  assert.equal(r.success, false);
});

test('bookingUpdateStatus requires booking_id and status', () => {
  assert.equal(bookingUpdateStatus.safeParse({ booking_id: 'x', status: 'accepted' }).success, false);
  assert.equal(bookingUpdateStatus.safeParse({ booking_id: uuid, status: 'accepted' }).success, true);
  assert.equal(bookingUpdateStatus.safeParse({ booking_id: uuid, status: 'nonsense' }).success, false);
});

test('serviceCreate validates price and name', () => {
  assert.equal(serviceCreate.safeParse({ laundromat_id: uuid, name: 'Wash & Fold', base_price: 50 }).success, true);
  assert.equal(serviceCreate.safeParse({ laundromat_id: uuid, name: 'X', base_price: 50 }).success, false);
  assert.equal(serviceCreate.safeParse({ laundromat_id: uuid, name: 'Wash', base_price: -1 }).success, false);
});

test('serviceUpdate requires a valid id', () => {
  assert.equal(serviceUpdate.safeParse({ id: 'nope' }).success, false);
  assert.equal(serviceUpdate.safeParse({ id: uuid, is_active: false }).success, true);
});

test('reviewCreate clamps rating 1-5', () => {
  assert.equal(reviewCreate.safeParse({ laundromat_id: uuid, rating: 5 }).success, true);
  assert.equal(reviewCreate.safeParse({ laundromat_id: uuid, rating: 6 }).success, false);
  assert.equal(reviewCreate.safeParse({ laundromat_id: uuid, rating: 0 }).success, false);
});

test('profileUpdate allows partial updates', () => {
  assert.equal(profileUpdate.safeParse({ full_name: 'Jane Doe' }).success, true);
  assert.equal(profileUpdate.safeParse({ phone: '0123456789' }).success, true);
  assert.equal(profileUpdate.safeParse({ full_name: 'J' }).success, false);
});

test('verifyLaundromat constrains status', () => {
  assert.equal(verifyLaundromat.safeParse({ laundromat_id: uuid, status: 'approved' }).success, true);
  assert.equal(verifyLaundromat.safeParse({ laundromat_id: uuid, status: 'whatever' }).success, false);
});

test('subscribePlan and cancelSubscription validate input', () => {
  assert.equal(subscribePlan.safeParse({ plan_id: uuid }).success, true);
  assert.equal(subscribePlan.safeParse({ plan_id: 'nope' }).success, false);
  assert.equal(cancelSubscription.safeParse({ audience: 'owner' }).success, true);
  assert.equal(cancelSubscription.safeParse({ audience: 'admin' }).success, false);
});

test('promotionCreate validates laundromat and days', () => {
  assert.equal(promotionCreate.safeParse({ laundromat_id: uuid }).success, true);
  assert.equal(promotionCreate.safeParse({ laundromat_id: uuid, days: 30 }).success, true);
  assert.equal(promotionCreate.safeParse({ laundromat_id: uuid, days: 0 }).success, false);
});

test('payoutRequest is optional-amount tolerant', () => {
  assert.equal(payoutRequest.safeParse({}).success, true);
  assert.equal(payoutRequest.safeParse({ amount: 100 }).success, true);
  assert.equal(payoutRequest.safeParse({ amount: -5 }).success, false);
});

test('adminSettingsUpdate requires an object', () => {
  assert.equal(adminSettingsUpdate.safeParse({ settings: { commission_percent: 9 } }).success, true);
  assert.equal(adminSettingsUpdate.safeParse({}).success, false);
});

test('planUpsert enforces audience and commission range', () => {
  const base = { code: 'owner_x', name: 'Pro X', audience: 'owner', price_monthly: 10, commission_percent: 5 };
  assert.equal(planUpsert.safeParse(base).success, true);
  assert.equal(planUpsert.safeParse({ ...base, audience: 'nobody' }).success, false);
  assert.equal(planUpsert.safeParse({ ...base, commission_percent: 150 }).success, false);
});

test('adminUserUpdate constrains roles', () => {
  assert.equal(adminUserUpdate.safeParse({ user_id: uuid, roles: ['admin'] }).success, true);
  assert.equal(adminUserUpdate.safeParse({ user_id: uuid, roles: ['root'] }).success, false);
});

test('adminPayoutUpdate and adminNotification validate enums', () => {
  assert.equal(adminPayoutUpdate.safeParse({ payout_id: uuid, status: 'paid' }).success, true);
  assert.equal(adminPayoutUpdate.safeParse({ payout_id: uuid, status: 'done' }).success, false);
  assert.equal(adminNotification.safeParse({ title: 'Hello' }).success, true);
  assert.equal(adminNotification.safeParse({ title: 'H' }).success, false);
});


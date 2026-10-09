import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bookingCreate, bookingUpdateStatus } from '../api/_lib/validation.js';

test('bookingCreate accepts a valid payload', () => {
  const r = bookingCreate.safeParse({
    laundromat_id: '11111111-1111-1111-1111-111111111111',
    customer_id: '22222222-2222-2222-2222-222222222222',
    items: [{ service_id: '33333333-3333-3333-3333-333333333333', quantity: 2 }],
  });
  assert.equal(r.success, true);
});

test('bookingCreate rejects a non-uuid id', () => {
  const r = bookingCreate.safeParse({ laundromat_id: 'nope', customer_id: 'x' });
  assert.equal(r.success, false);
});

test('bookingUpdateStatus requires booking_id and status', () => {
  assert.equal(bookingUpdateStatus.safeParse({ booking_id: 'x', status: 'accepted' }).success, false);
  assert.equal(bookingUpdateStatus.safeParse({ booking_id: '11111111-1111-1111-1111-111111111111', status: 'accepted' }).success, true);
});

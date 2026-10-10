import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  staffInvite,
  staffUpdate,
  staffRemove,
  capacityUpdate,
  addressSave,
  bookingAssignStaff,
  bookingMessage,
  bookingNote,
  adminRefundCreate,
} from '../api/_lib/validation.js';

const uuid = '11111111-1111-1111-1111-111111111111';
const uuid2 = '22222222-2222-2222-2222-222222222222';

test('staffInvite requires a valid laundromat and email', () => {
  assert.equal(staffInvite.safeParse({ laundromat_id: uuid, email: 'a@b.com' }).success, true);
  assert.equal(staffInvite.safeParse({ laundromat_id: 'nope', email: 'a@b.com' }).success, false);
  assert.equal(staffInvite.safeParse({ laundromat_id: uuid, email: 'nope' }).success, false);
});

test('staffInvite defaults role to staff and rejects unknown roles', () => {
  const r = staffInvite.safeParse({ laundromat_id: uuid, email: 'a@b.com' });
  assert.equal(r.success, true);
  assert.equal(r.data.member_role, 'staff');
  assert.equal(staffInvite.safeParse({ laundromat_id: uuid, email: 'a@b.com', member_role: 'owner' }).success, false);
});

test('staffUpdate and staffRemove require a member id', () => {
  assert.equal(staffUpdate.safeParse({ member_id: uuid, member_role: 'manager' }).success, true);
  assert.equal(staffUpdate.safeParse({ member_id: 'nope', member_role: 'manager' }).success, false);
  assert.equal(staffRemove.safeParse({ member_id: 'nope' }).success, false);
  assert.equal(staffRemove.safeParse({ member_id: uuid }).success, true);
});

test('capacityUpdate accepts nullable max orders and rejects negatives', () => {
  const ok = capacityUpdate.safeParse({ laundromat_id: uuid, accepting_orders: false, max_orders_per_day: null, extra_delivery_fee: 15 });
  assert.equal(ok.success, true);
  assert.equal(capacityUpdate.safeParse({ laundromat_id: uuid, max_orders_per_day: -1 }).success, false);
  assert.equal(capacityUpdate.safeParse({ laundromat_id: uuid, extra_delivery_fee: -5 }).success, false);
});

test('addressSave allows an empty list but requires a street address otherwise', () => {
  const ok = addressSave.safeParse({ addresses: [{ label: 'Home', line1: '12 Main Rd', city: 'Durban' }] });
  assert.equal(ok.success, true);
  assert.equal(addressSave.safeParse({ addresses: [] }).success, true);
  assert.equal(addressSave.safeParse({ addresses: [{ label: 'Home' }] }).success, false);
});

test('booking messaging schemas require a non-empty body', () => {
  assert.equal(bookingAssignStaff.safeParse({ booking_id: uuid, staff_id: uuid2 }).success, true);
  assert.equal(bookingAssignStaff.safeParse({ booking_id: uuid, staff_id: null }).success, true);
  assert.equal(bookingMessage.safeParse({ booking_id: uuid, body: 'Hi there' }).success, true);
  assert.equal(bookingMessage.safeParse({ booking_id: uuid, body: '' }).success, false);
  assert.equal(bookingNote.safeParse({ booking_id: uuid, internal_notes: null }).success, true);
});

test('adminRefundCreate requires a payment id and positive amount', () => {
  assert.equal(adminRefundCreate.safeParse({ payment_id: uuid }).success, true);
  assert.equal(adminRefundCreate.safeParse({ payment_id: uuid, amount: 50, reason: 'Damaged' }).success, true);
  assert.equal(adminRefundCreate.safeParse({ payment_id: uuid, amount: 0 }).success, false);
  assert.equal(adminRefundCreate.safeParse({ payment_id: 'nope' }).success, false);
});

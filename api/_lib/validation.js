import { z } from 'zod';

const uuid = z.string().uuid();

export const bookingCreate = z.object({
  laundromat_id: uuid,
  customer_id: uuid.optional(),
  items: z.array(z.object({
    service_id: uuid,
    quantity: z.number().int().positive().max(999),
  })).min(1),
  pickup_required: z.boolean().optional().default(false),
  delivery_required: z.boolean().optional().default(false),
  pickup_address: z.record(z.any()).optional().nullable(),
  delivery_address: z.record(z.any()).optional().nullable(),
  scheduled_at: z.string().datetime().optional().nullable(),
  customer_notes: z.string().max(1000).optional().nullable(),
});

export const bookingUpdateStatus = z.object({
  booking_id: uuid,
  status: z.enum([
    'pending_payment', 'pending_acceptance', 'accepted', 'pickup_scheduled', 'collected',
    'washing', 'drying', 'ironing', 'ready', 'out_for_delivery', 'completed',
    'cancelled', 'rejected', 'payment_failed', 'refund_pending',
  ]),
  reason: z.string().max(500).optional(),
});

export const serviceCreate = z.object({
  laundromat_id: uuid,
  category_id: uuid.optional().nullable(),
  name: z.string().min(2).max(120),
  description: z.string().max(1000).optional().nullable(),
  base_price: z.number().nonnegative(),
  turnaround_hours: z.number().int().nonnegative().optional().default(24),
  is_active: z.boolean().optional().default(true),
});

export const serviceUpdate = z.object({
  id: uuid,
  name: z.string().min(2).max(120).optional(),
  description: z.string().max(1000).optional().nullable(),
  base_price: z.number().nonnegative().optional(),
  turnaround_hours: z.number().int().nonnegative().optional(),
  is_active: z.boolean().optional(),
});

export const reviewCreate = z.object({
  laundromat_id: uuid,
  booking_id: uuid.optional().nullable(),
  rating: z.number().int().min(1).max(5),
  review_text: z.string().max(1000).optional().nullable(),
});

export const profileUpdate = z.object({
  full_name: z.string().min(2).max(120).optional(),
  phone: z.string().max(30).optional().nullable(),
  avatar_path: z.string().max(500).optional().nullable(),
});

export const favoriteToggle = z.object({
  laundromat_id: uuid,
});

export const verifyLaundromat = z.object({
  laundromat_id: uuid,
  status: z.enum(['approved', 'rejected', 'suspended', 'pending']),
  reason: z.string().max(500).optional(),
});

export const paymentCreate = z.object({
  booking_id: uuid,
});

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
  image_path: z.string().max(500).optional().nullable(),
  base_price: z.number().nonnegative(),
  turnaround_hours: z.number().int().nonnegative().optional().default(24),
  is_active: z.boolean().optional().default(true),
});

export const serviceUpdate = z.object({
  id: uuid,
  name: z.string().min(2).max(120).optional(),
  description: z.string().max(1000).optional().nullable(),
  image_path: z.string().max(500).optional().nullable(),
  base_price: z.number().nonnegative().optional(),
  turnaround_hours: z.number().int().nonnegative().optional(),
  is_active: z.boolean().optional(),
});

export const reviewCreate = z.object({
  laundromat_id: uuid,
  booking_id: uuid.optional().nullable(),
  rating: z.number().int().min(1).max(5),
  review_text: z.string().max(1000).optional().nullable(),
  photos: z.array(z.string().max(500)).max(6).optional().default([]),
});

export const pushSubscribe = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({
    p256dh: z.string().min(10).max(500),
    auth: z.string().min(4).max(200),
  }),
});

export const ownerLaundromatUpdate = z.object({
  laundromat_id: uuid,
  name: z.string().min(2).max(160).optional(),
  description: z.string().max(2000).optional().nullable(),
  address: z.string().max(300).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  logo_path: z.string().max(500).optional().nullable(),
  photos: z.array(z.string().max(500)).max(12).optional(),
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

/* ---------- Business model: plans, subscriptions, promotions, payouts ---------- */

export const subscribePlan = z.object({
  plan_id: uuid,
});

export const cancelSubscription = z.object({
  audience: z.enum(['owner', 'customer']),
});

export const promotionCreate = z.object({
  laundromat_id: uuid,
  kind: z.enum(['featured', 'discount']).optional().default('featured'),
  days: z.number().int().positive().max(365).optional(),
});

export const payoutRequest = z.object({
  amount: z.number().positive().optional(),
  method: z.string().max(60).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

/* ---------- Admin control ---------- */

export const adminSettingsUpdate = z.object({
  settings: z.record(z.any()),
});

export const planUpsert = z.object({
  id: uuid.optional(),
  code: z.string().min(2).max(60),
  name: z.string().min(2).max(80),
  audience: z.enum(['owner', 'customer']),
  description: z.string().max(300).optional().nullable(),
  price_monthly: z.number().nonnegative(),
  commission_percent: z.number().min(0).max(100),
  includes_branches: z.number().int().nonnegative().optional().default(1),
  features: z.array(z.string().max(120)).optional().default([]),
  is_active: z.boolean().optional().default(true),
  sort: z.number().int().optional().default(0),
});

export const planToggle = z.object({
  id: uuid,
  is_active: z.boolean(),
});

export const adminUserUpdate = z.object({
  user_id: uuid,
  account_status: z.enum(['active', 'suspended']).optional(),
  full_name: z.string().min(2).max(120).optional(),
  roles: z.array(z.enum(['customer', 'owner', 'staff', 'admin', 'super_admin'])).optional(),
});

export const adminLaundromatUpdate = z.object({
  laundromat_id: uuid,
  verification_status: z.enum(['approved', 'rejected', 'suspended', 'pending']).optional(),
  business_status: z.string().max(40).optional(),
  is_featured: z.boolean().optional(),
  featured_until: z.string().datetime().optional().nullable(),
  name: z.string().min(2).max(160).optional(),
  address: z.string().max(300).optional().nullable(),
});

export const adminPayoutUpdate = z.object({
  payout_id: uuid,
  status: z.enum(['requested', 'processing', 'paid', 'rejected']),
  reference: z.string().max(120).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export const adminRefundUpdate = z.object({
  refund_id: uuid,
  status: z.enum(['pending', 'approved', 'rejected', 'processed']),
  amount: z.number().positive().optional(),
  reason: z.string().max(500).optional().nullable(),
});

export const adminPromotionUpdate = z.object({
  promotion_id: uuid,
  status: z.enum(['active', 'expired', 'cancelled']),
  ends_at: z.string().datetime().optional().nullable(),
});

export const adminCommissionUpdate = z.object({
  commission_id: uuid,
  status: z.enum(['pending', 'settled', 'reversed']),
});

export const adminNotification = z.object({
  title: z.string().min(2).max(120),
  message: z.string().max(1000).optional().nullable(),
  audience: z.enum(['all', 'owners', 'customers', 'user']).default('all'),
  user_id: uuid.optional(),
});

import { z } from 'zod';

export const bookingCreate = z.object({
  laundromat_id: z.string().uuid(),
  customer_id: z.string().uuid(),
  items: z.array(z.object({ service_id: z.string().uuid(), quantity: z.number().int().positive() })).optional(),
});

export const bookingUpdateStatus = z.object({
  booking_id: z.string().uuid(),
  status: z.string(),
});

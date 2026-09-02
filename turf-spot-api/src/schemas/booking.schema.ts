import { z } from 'zod';

export const lockSlotSchema = z.object({
  turfId: z.string().length(24),
  slotStart: z.string().datetime(), // ISO instant from the availability grid
});

export const initiatePaymentSchema = z.object({
  bookingId: z.string().length(24),
  email: z.string().email().optional(),
});

export const reconcileSchema = z.object({
  txnid: z.string().min(6).max(64),
});

export const cancelSchema = z.object({
  reason: z.string().trim().max(300).optional(),
});

export const myBookingsQuerySchema = z.object({
  tab: z.enum(['upcoming', 'completed', 'cancelled']).optional(),
});

export const pushTokenSchema = z.object({
  token: z.string().min(10),
});

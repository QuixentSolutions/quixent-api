import { z } from 'zod';

export const rejectTurfSchema = z.object({
  reason: z.string().trim().min(3).max(300),
});

export const roleSchema = z.object({
  userId: z.string().length(24),
  role: z.enum(['turf_admin', 'super_admin']),
});

export const configSchema = z.object({
  commissionPercent: z.number().min(0).max(100).optional(),
  gstPercent: z.number().min(0).max(100).optional(),
  platformFeeFlat: z.number().min(0).max(100000).optional(),
  slotLockMinutes: z.number().int().min(2).max(60).optional(),
  businessModel: z.enum(['commission', 'subscription', 'hybrid']).optional(),
  refundPolicy: z
    .array(z.object({ minHoursBefore: z.number().min(0), refundPercent: z.number().min(0).max(100) }))
    .min(1)
    .optional(),
});

import { z } from 'zod';

export const initiatePaymentSchema = z.object({
  bookingId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid booking id'),
});

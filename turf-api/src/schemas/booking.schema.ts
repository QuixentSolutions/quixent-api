import { z } from 'zod';

export const createBookingSchema = z.object({
  turfId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid turf id'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'startTime must be HH:mm'),
  slotCount: z.number().int().min(1).max(12).optional(), // consecutive base slots; default 1
  sport: z.string().trim().max(40).optional(),
  playerCount: z.number().int().min(1).max(100).optional(),
  notes: z.string().trim().max(500).optional(),
});

export const cancelBookingSchema = z.object({
  reason: z.string().trim().max(300).optional(),
});

export const myBookingsQuerySchema = z.object({
  scope: z.enum(['upcoming', 'past', 'all']).optional(),
  status: z.enum(['pending', 'confirmed', 'cancelled', 'completed', 'no_show']).optional(),
});

export const ownerBookingsQuerySchema = z.object({
  turfId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  scope: z.enum(['upcoming', 'past', 'all']).optional(),
  status: z.enum(['pending', 'confirmed', 'cancelled', 'completed', 'no_show']).optional(),
});

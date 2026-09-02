import { z } from 'zod';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'expected HH:mm');
const day = z.enum(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']);

const pricingRuleSchema = z.object({
  label: z.string().trim().min(1).max(40),
  days: z.array(day).min(1),
  startTime: hhmm,
  endTime: hhmm,
  pricePerHour: z.number().min(0).max(100000),
});

export const createTurfSchema = z.object({
  name: z.string().trim().min(2).max(100),
  sports: z.array(z.string().trim().min(1)).min(1).max(10),
  description: z.string().trim().max(2000).optional(),
  address: z.string().trim().max(300).optional(),
  city: z.string().trim().max(80).optional(),
  contactEmail: z.string().trim().email().max(160).optional(),
  contactPhone: z.string().trim().max(20).optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  facilities: z.array(z.string().trim()).max(30).optional(),
  photos: z.array(z.string().url()).max(15).optional(),
  operatingHours: z.object({ open: hhmm, close: hhmm }).optional(),
  slotDurationMins: z.number().int().min(30).max(240).optional(),
  basePricePerHour: z.number().min(0).max(100000),
  pricingRules: z.array(pricingRuleSchema).max(20).optional(),
});

export const updateTurfSchema = createTurfSchema.partial();

export const pricingSchema = z.object({
  basePricePerHour: z.number().min(0).max(100000).optional(),
  pricingRules: z.array(pricingRuleSchema).max(20),
});

export const nearbyQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce.number().min(0.5).max(50).optional(),
  sport: z.string().trim().optional(),
  city: z.string().trim().optional(),
});

export const availabilityQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD'),
});

export const blockSchema = z.object({
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  reason: z.enum(['maintenance', 'holiday', 'manual']).optional(),
  note: z.string().trim().max(200).optional(),
});

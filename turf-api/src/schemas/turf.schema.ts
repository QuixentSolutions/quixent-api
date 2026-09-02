import { z } from 'zod';

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be HH:mm 24-hour');
const weekday = z.number().int().min(0).max(6);

const priceRuleSchema = z
  .object({
    label: z.string().trim().max(60).optional(),
    days: z.array(weekday).max(7).optional(),
    startHour: z.number().int().min(0).max(23),
    endHour: z.number().int().min(1).max(24),
    pricePerHour: z.number().min(0).max(100000),
  })
  .refine((r) => r.endHour > r.startHour, { message: 'endHour must be after startHour' });

export const createTurfSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).optional(),
  sports: z.array(z.string().trim().min(1)).min(1, 'Pick at least one sport').max(15),
  surface: z.string().trim().max(40).optional(),
  size: z.string().trim().max(60).optional(),
  amenities: z.array(z.string().trim().min(1)).max(40).optional(),

  address: z.string().trim().min(4).max(300),
  city: z.string().trim().min(2).max(80),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),

  photos: z.array(z.string().url()).max(15).optional(),
  contactPhone: z.string().trim().max(20).optional(),

  pricePerHour: z.number().min(0).max(100000),
  priceRules: z.array(priceRuleSchema).max(20).optional(),

  openTime: timeSchema.optional(),
  closeTime: timeSchema.optional(),
  slotDurationMinutes: z.number().int().min(30).max(180).optional(),
  weeklyClosedDays: z.array(weekday).max(7).optional(),

  isActive: z.boolean().optional(),
});

export const updateTurfSchema = createTurfSchema.partial();

export const listTurfsQuerySchema = z.object({
  city: z.string().trim().optional(),
  sport: z.string().trim().optional(),
  q: z.string().trim().max(120).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().min(0.5).max(100).optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  sort: z.enum(['recommended', 'price_asc', 'price_desc', 'rating', 'distance']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export const availabilityQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
});

export const rejectTurfSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export const blockSlotSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
    startTime: timeSchema,
    endTime: timeSchema,
    reason: z.string().trim().max(200).optional(),
  })
  .refine((b) => b.startTime !== b.endTime, { message: 'startTime and endTime cannot be equal' });

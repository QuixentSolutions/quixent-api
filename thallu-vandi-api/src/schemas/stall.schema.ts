import { z } from 'zod';

const menuItemSchema = z.object({
  name: z.string().trim().min(1).max(80),
  price: z.number().min(0).optional(),
  photoUrl: z.string().url().optional(),
});

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be in HH:mm 24-hour format');

export const createStallSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
  categories: z.array(z.string().trim().min(1).max(50)).min(1).max(5),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  photos: z.array(z.string().url()).max(10).optional(),
  menuItems: z.array(menuItemSchema).max(100).optional(),
  openTime: timeSchema.optional(),
  closeTime: timeSchema.optional(),
});

export const updateStallSchema = createStallSchema.partial();

export const nearbyQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce.number().min(0.1).max(50).optional(),
  category: z.string().trim().optional(),
});

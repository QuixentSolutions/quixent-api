import { Document, Schema, Types } from 'mongoose';
import { turfDb } from '../config/db';

export type TurfStatus = 'pending' | 'approved' | 'rejected';

// 0 = Sunday … 6 = Saturday, matching JS Date.getDay().
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface ITurfDocument extends Document {
  ownerId: string; // shared auth user's _id (auth/src/models/User.ts) — plain string, no cross-DB ref
  name: string;
  description?: string;
  sports: string[]; // e.g. ['football', 'cricket'] — keys from the app's sport list
  surface?: string; // 'natural-grass' | 'artificial-turf' | 'astro-turf' | 'clay' | 'wooden' | 'synthetic'
  size?: string; // free text, e.g. '5-a-side', '7-a-side', '100x60 ft'
  amenities: string[]; // keys from the app's amenity list (parking, floodlights, ...)

  address: string;
  city: string;
  location: {
    type: 'Point';
    coordinates: [number, number]; // [lng, lat]
  };

  photos: string[];
  contactPhone?: string;

  // Owner's PAN — required for payout/GST compliance (platform fee invoicing
  // needs it). Required by the API on new registrations (see turf.schema.ts)
  // but not enforced at the model level, so an unrelated edit to a turf
  // created before this field existed doesn't fail validation. Sensitive:
  // never returned on public browse/detail reads, only to the owner
  // themselves and admin — see turf.service.ts's public queries.
  panNumber?: string;

  pricePerHour: number; // base slot price, INR
  // Optional overrides so evening / weekend slots can cost more without a
  // full pricing-rules engine. Each entry: match on weekday and/or hour range.
  priceRules: {
    _id: Types.ObjectId;
    label?: string;
    days?: Weekday[]; // empty/undefined = every day
    startHour: number; // 0-23 inclusive
    endHour: number; // 1-24 exclusive
    pricePerHour: number;
  }[];

  openTime: string; // "HH:mm" 24h, turf-local
  closeTime: string; // "HH:mm" — may be <= openTime for venues open past midnight
  slotDurationMinutes: number; // slot granularity, default 60
  weeklyClosedDays: Weekday[]; // days the turf is fully closed

  status: TurfStatus;
  rejectionReason?: string;

  ratingAvg: number;
  ratingCount: number;

  isActive: boolean; // owner can pause bookings without deleting the listing

  createdAt: Date;
  updatedAt: Date;
}

const PriceRuleSchema = new Schema(
  {
    label: { type: String, trim: true },
    days: { type: [Number], default: undefined },
    startHour: { type: Number, required: true, min: 0, max: 23 },
    endHour: { type: Number, required: true, min: 1, max: 24 },
    pricePerHour: { type: Number, required: true, min: 0 },
  },
  { _id: true },
);

const TurfSchema = new Schema<ITurfDocument>(
  {
    ownerId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, maxlength: 2000 },
    sports: { type: [String], default: [], index: true },
    surface: { type: String, trim: true },
    size: { type: String, trim: true },
    amenities: { type: [String], default: [] },

    address: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true, index: true },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true },
    },

    photos: { type: [String], default: [] },
    contactPhone: { type: String, trim: true },

    panNumber: {
      type: String,
      trim: true,
      uppercase: true,
      match: [/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'Invalid PAN format'],
    },

    pricePerHour: { type: Number, required: true, min: 0 },
    priceRules: { type: [PriceRuleSchema], default: [] },

    openTime: { type: String, required: true, default: '06:00' },
    closeTime: { type: String, required: true, default: '23:00' },
    // No upper bound — some turfs book by the half-day/full-day. Must stay
    // positive: it's used as the step in a slot-generation loop, so 0 would
    // hang it forever.
    slotDurationMinutes: { type: Number, default: 60, min: 1 },
    weeklyClosedDays: { type: [Number], default: [] },

    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
    rejectionReason: { type: String, trim: true },

    ratingAvg: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

TurfSchema.index({ location: '2dsphere' });
TurfSchema.index({ status: 1, city: 1 });
TurfSchema.index({ name: 'text', description: 'text', address: 'text' });

export default turfDb.model<ITurfDocument>('Turf', TurfSchema);

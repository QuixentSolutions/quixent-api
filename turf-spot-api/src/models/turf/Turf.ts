import { Document, Schema, Types } from 'mongoose';
import { turfSpotDb } from '../../config/db';

export type TurfStatus = 'pending' | 'approved' | 'rejected' | 'blocked';

export interface IPricingRule {
  _id: Types.ObjectId;
  label: string;                 // "Weekday", "Weekday Peak", "Weekend"
  days: string[];                // ['mon','tue',...]
  startTime: string;             // "06:00" (inclusive, IST wall clock)
  endTime: string;               // "18:00" (exclusive)
  pricePerHour: number;
}

export interface ITurfDocument extends Document {
  ownerId: string;               // shared auth user's _id — the turf_admin
  name: string;
  sports: string[];              // ['football','cricket']
  description: string;
  address: string;
  city: string;
  contactEmail: string;          // applicant's contact email (approval/rejection notices)
  contactPhone: string;          // optional public contact number for the turf
  location: { type: 'Point'; coordinates: [number, number] }; // [lng, lat]
  facilities: string[];          // ['parking','washroom','changing_room']
  photos: string[];
  operatingHours: { open: string; close: string };           // "06:00" / "23:00"
  slotDurationMins: number;      // 60
  basePricePerHour: number;      // fallback when no pricing rule matches
  pricingRules: IPricingRule[];
  status: TurfStatus;
  rejectionReason: string;
  ratingAvg: number;
  ratingCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const PricingRuleSchema = new Schema<IPricingRule>(
  {
    label: { type: String, required: true, trim: true },
    days: { type: [String], required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    pricePerHour: { type: Number, required: true, min: 0 },
  },
  { _id: true },
);

const TurfSchema = new Schema<ITurfDocument>(
  {
    ownerId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    contactEmail: { type: String, default: '', trim: true, lowercase: true },
    contactPhone: { type: String, default: '', trim: true },
    sports: { type: [String], default: [] },
    description: { type: String, default: '', trim: true, maxlength: 2000 },
    address: { type: String, default: '', trim: true },
    city: { type: String, default: '', trim: true, index: true },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true },
    },
    facilities: { type: [String], default: [] },
    photos: { type: [String], default: [] },
    operatingHours: {
      open: { type: String, default: '06:00' },
      close: { type: String, default: '23:00' },
    },
    slotDurationMins: { type: Number, default: 60, min: 30 },
    basePricePerHour: { type: Number, required: true, min: 0 },
    pricingRules: { type: [PricingRuleSchema], default: [] },
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'blocked'], default: 'pending', index: true },
    rejectionReason: { type: String, default: '' },
    ratingAvg: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

TurfSchema.index({ location: '2dsphere' });

export default turfSpotDb.model<ITurfDocument>('Turf', TurfSchema, 'turfs');

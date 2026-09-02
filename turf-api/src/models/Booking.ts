import { Document, Schema, Types } from 'mongoose';
import { turfDb } from '../config/db';

// pending    — created, awaiting owner action (only used if a turf ever opts
//              into manual approval; default flow skips straight to confirmed)
// confirmed  — slot is reserved for the user
// cancelled  — released; freed the slot
// completed  — slot time has passed and it wasn't cancelled
// no_show    — owner marked the user absent
export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show';

// Payment is intentionally out of scope for now — every booking is 'unpaid'
// and settled at the venue. The field exists so adding an online-payment
// flow later doesn't need a migration.
export type PaymentStatus = 'unpaid' | 'paid' | 'refunded';

export interface IBookingDocument extends Document {
  turfId: Types.ObjectId;
  turfName: string; // denormalised so a user's booking list renders without a turf lookup
  userId: string; // shared auth user's _id
  ownerId: string; // denormalised from the turf for fast owner-side queries

  date: string; // "YYYY-MM-DD", turf-local calendar day
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm" — may be "24:00"+ conceptually; stored clamped to same-day math
  slotCount: number; // number of base slots booked
  durationMinutes: number;

  sport?: string;
  playerCount?: number;
  notes?: string;

  pricePerSlot: number;
  totalPrice: number;

  status: BookingStatus;
  paymentStatus: PaymentStatus;

  cancelledBy?: 'user' | 'owner' | 'admin';
  cancellationReason?: string;
  cancelledAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

const BookingSchema = new Schema<IBookingDocument>(
  {
    turfId: { type: Schema.Types.ObjectId, ref: 'Turf', required: true, index: true },
    turfName: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    ownerId: { type: String, required: true, index: true },

    date: { type: String, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    slotCount: { type: Number, required: true, min: 1 },
    durationMinutes: { type: Number, required: true },

    sport: { type: String, trim: true },
    playerCount: { type: Number, min: 1, max: 100 },
    notes: { type: String, trim: true, maxlength: 500 },

    pricePerSlot: { type: Number, required: true, min: 0 },
    totalPrice: { type: Number, required: true, min: 0 },

    status: {
      type: String,
      enum: ['pending', 'confirmed', 'cancelled', 'completed', 'no_show'],
      default: 'confirmed',
      index: true,
    },
    paymentStatus: { type: String, enum: ['unpaid', 'paid', 'refunded'], default: 'unpaid' },

    cancelledBy: { type: String, enum: ['user', 'owner', 'admin'] },
    cancellationReason: { type: String, trim: true },
    cancelledAt: { type: Date },
  },
  { timestamps: true },
);

// Fast "is this slot taken" lookups per turf+day.
BookingSchema.index({ turfId: 1, date: 1, status: 1 });
// A partial unique index is the hard guard against double-booking the exact
// same start on the same day — only enforced for live bookings, so a
// cancelled slot can be re-taken.
BookingSchema.index(
  { turfId: 1, date: 1, startTime: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ['pending', 'confirmed'] } } },
);

export default turfDb.model<IBookingDocument>('Booking', BookingSchema);

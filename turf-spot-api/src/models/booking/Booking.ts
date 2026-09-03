import { Document, Schema, Types } from 'mongoose';
import { turfSpotDb } from '../../config/db';

export type BookingStatus = 'locked' | 'confirmed' | 'cancelled' | 'expired' | 'completed';

export interface IPriceBreakup {
  turfCharge: number;
  platformFee: number;
  gst: number;
  total: number;
}

export interface ICancellation {
  cancelledAt: Date;
  by: 'customer' | 'owner' | 'admin';
  refundPercent: number;
  refundAmount: number;
  reason: string;
}

export interface IBookingDocument extends Document {
  turfId: Types.ObjectId;
  ownerId: string;
  customerId: string;
  bookingCode: string | null;    // assigned on confirm
  slotStart: Date;               // absolute UTC instant
  slotEnd: Date;
  status: BookingStatus;
  slotHeld: boolean;             // true while locked/confirmed -> drives the anti-double-book index
  lockExpiresAt: Date | null;    // for `locked` rows only
  priceBreakup: IPriceBreakup;
  commissionAmount: number | null;
  ownerEarning: number | null;
  paymentId: Types.ObjectId | null;
  cancellation: ICancellation | null;
  reminderSentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const PriceBreakupSchema = new Schema<IPriceBreakup>(
  {
    turfCharge: { type: Number, required: true },
    platformFee: { type: Number, required: true },
    gst: { type: Number, required: true },
    total: { type: Number, required: true },
  },
  { _id: false },
);

const CancellationSchema = new Schema<ICancellation>(
  {
    cancelledAt: { type: Date, required: true },
    by: { type: String, enum: ['customer', 'owner', 'admin'], required: true },
    refundPercent: { type: Number, required: true },
    refundAmount: { type: Number, required: true },
    reason: { type: String, default: '' },
  },
  { _id: false },
);

const BookingSchema = new Schema<IBookingDocument>(
  {
    turfId: { type: Schema.Types.ObjectId, ref: 'Turf', required: true, index: true },
    ownerId: { type: String, required: true, index: true },
    customerId: { type: String, required: true, index: true },
    // NOTE: no `default: null` here on purpose. A sparse index skips documents
    // where the field is entirely ABSENT, but a Mongoose schema default of
    // `null` would set the field explicitly on every insert — which the
    // sparse index still counts, so every booking after the very first one
    // would collide on this unique index. Leaving it unset until confirm()
    // assigns a real code is what makes the sparse index actually sparse.
    bookingCode: { type: String },
    slotStart: { type: Date, required: true },
    slotEnd: { type: Date, required: true },
    status: {
      type: String,
      enum: ['locked', 'confirmed', 'cancelled', 'expired', 'completed'],
      default: 'locked',
      index: true,
    },
    slotHeld: { type: Boolean, default: true },
    lockExpiresAt: { type: Date, default: null },
    priceBreakup: { type: PriceBreakupSchema, required: true },
    commissionAmount: { type: Number, default: null },
    ownerEarning: { type: Number, default: null },
    paymentId: { type: Schema.Types.ObjectId, ref: 'TurfPayment', default: null },
    cancellation: { type: CancellationSchema, default: null },
    reminderSentAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// THE anti-double-booking guard: at most one held booking per turf per slot.
// `slotHeld` is set false when a booking is cancelled/expired, which drops it
// out of this partial index and frees the slot.
BookingSchema.index(
  { turfId: 1, slotStart: 1 },
  { unique: true, partialFilterExpression: { slotHeld: true } },
);

BookingSchema.index({ bookingCode: 1 }, { unique: true, sparse: true });
BookingSchema.index({ customerId: 1, slotStart: -1 });
BookingSchema.index({ status: 1, lockExpiresAt: 1 });
BookingSchema.index({ status: 1, slotEnd: 1 });

export default turfSpotDb.model<IBookingDocument>('TurfBooking', BookingSchema, 'bookings');

import { Document, Schema, Types } from 'mongoose';
import { turfDb } from '../config/db';

// pending    — created, holding the slot, awaiting PayU payment to confirm.
//              Auto-cancelled if unpaid past TURFSPOT_PAYMENT_HOLD_MINUTES.
// confirmed  — payment verified (paymentStatus 'paid'); slot is reserved
// cancelled  — released (user/owner cancel, or payment failed/expired) —
//              frees the slot
// completed  — slot time has passed and it wasn't cancelled
// no_show    — owner marked the user absent
export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show';

// unpaid   — no successful payment yet (booking is still 'pending')
// paid     — payment verified via the PayU callback
// refunded — set manually by the owner after refunding the player IN PERSON
//            at the venue (cash/UPI) — cancelling a paid booking does NOT
//            trigger an automatic PayU/online refund; see ownerMarkRefunded.
export type PaymentStatus = 'unpaid' | 'paid' | 'refunded';

// online  — must clear PayU before the booking confirms (see payment.service).
//           The only mode new bookings are created with.
// offline — legacy value from before "pay at venue" was removed; kept only
//           so old records already in the DB stay valid, never written anymore.
export type PaymentMode = 'online' | 'offline';

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
  totalPrice: number; // baseAmount + platformFeeAmount + gstAmount — what the customer is actually charged via PayU

  // Platform fee + GST breakdown, computed at creation time from baseAmount
  // (see config/fees.ts) and ADDED ON TOP of it — never deducted from the
  // owner's side. GST applies only to the platform's own commission, not the
  // turf rental itself. Stored (not just computed on read) so this stays
  // fixed and auditable even if the fee rates change later.
  //
  // NOT required at the model level (only enforced by createTurfSchema/
  // createBookingSchema for brand-new bookings) — bookings created before
  // this breakdown existed don't have these fields, and Mongoose re-validates
  // the WHOLE document on every .save() (e.g. cancelling), so marking them
  // required here would make an old booking un-cancellable forever.
  baseAmount?: number; // sum of slot prices — the owner's price, paid out to them in full
  platformFeePercent?: number;
  gstPercent?: number;
  platformFeeAmount?: number;
  cgstAmount?: number;
  sgstAmount?: number;
  gstAmount?: number;
  ownerPayoutAmount?: number; // == baseAmount — the owner always gets exactly their listed price

  status: BookingStatus;
  paymentStatus: PaymentStatus;
  paymentMode: PaymentMode;
  paymentId?: Types.ObjectId; // the successful (or most recent) Payment doc

  cancelledBy?: 'user' | 'owner' | 'admin' | 'system';
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

    // Not `required` — see the interface comment above (old bookings predate
    // these fields; required here would break re-saving them, e.g. on cancel).
    baseAmount: { type: Number, min: 0 },
    platformFeePercent: { type: Number, min: 0 },
    gstPercent: { type: Number, min: 0 },
    platformFeeAmount: { type: Number, min: 0 },
    cgstAmount: { type: Number, min: 0 },
    sgstAmount: { type: Number, min: 0 },
    gstAmount: { type: Number, min: 0 },
    ownerPayoutAmount: { type: Number, min: 0 },

    status: {
      type: String,
      enum: ['pending', 'confirmed', 'cancelled', 'completed', 'no_show'],
      default: 'pending',
      index: true,
    },
    paymentStatus: { type: String, enum: ['unpaid', 'paid', 'refunded'], default: 'unpaid' },
    paymentMode: { type: String, enum: ['online', 'offline'], default: 'online' },
    paymentId: { type: Schema.Types.ObjectId, ref: 'Payment' },

    cancelledBy: { type: String, enum: ['user', 'owner', 'admin', 'system'] },
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

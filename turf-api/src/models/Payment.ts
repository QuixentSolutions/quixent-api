import { Document, Schema, Types } from 'mongoose';
import { turfDb } from '../config/db';

// initiated — form built & shown to the user, no verdict from PayU yet
// success   — reverse-hash verified AND PayU reported status "success"
// failure   — PayU reported failure, or the reverse hash didn't verify
// cancelled — the payment window (TURFSPOT_PAYMENT_HOLD_MINUTES) lapsed
export type PaymentStatus = 'initiated' | 'success' | 'failure' | 'cancelled';

export interface IPaymentDocument extends Document {
  bookingId: Types.ObjectId;
  userId: string;
  turfId: Types.ObjectId;

  txnid: string;
  amount: number; // charged to the customer via PayU — baseAmount + platformFee + gstAmount
  status: PaymentStatus;
  gateway: 'payu';

  // Fee breakdown snapshot, copied from the Booking at initiate time (see
  // config/fees.ts — the server-side source of truth; the client never
  // supplies these, it only ever sends a bookingId).
  baseAmount: number;
  platformFee: number;
  gstAmount: number;
  cgstAmount: number;
  sgstAmount: number;

  // Exact fields the request hash was built from — re-served verbatim by the
  // redirect page so what PayU received always matches what we hashed.
  requestSnapshot: {
    amount: string;
    productinfo: string;
    firstname: string;
    email: string;
    phone: string;
  };

  payuMihpayid?: string;
  payuMode?: string;
  payuStatus?: string;
  errorMessage?: string;
  rawResponse?: Record<string, unknown>;

  createdAt: Date;
  updatedAt: Date;
}

const PaymentSchema = new Schema<IPaymentDocument>(
  {
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
    userId: { type: String, required: true, index: true },
    turfId: { type: Schema.Types.ObjectId, ref: 'Turf', required: true },

    txnid: { type: String, required: true, unique: true },
    amount: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['initiated', 'success', 'failure', 'cancelled'], default: 'initiated', index: true },
    gateway: { type: String, enum: ['payu'], default: 'payu' },

    baseAmount: { type: Number, required: true, min: 0 },
    platformFee: { type: Number, required: true, min: 0 },
    gstAmount: { type: Number, required: true, min: 0 },
    cgstAmount: { type: Number, required: true, min: 0 },
    sgstAmount: { type: Number, required: true, min: 0 },

    requestSnapshot: {
      amount: { type: String, required: true },
      productinfo: { type: String, required: true },
      firstname: { type: String, required: true },
      email: { type: String, required: true },
      phone: { type: String, required: true },
    },

    payuMihpayid: { type: String },
    payuMode: { type: String },
    payuStatus: { type: String },
    errorMessage: { type: String },
    rawResponse: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

export default turfDb.model<IPaymentDocument>('Payment', PaymentSchema);

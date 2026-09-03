import { Document, Schema, Types } from 'mongoose';
import { turfSpotDb } from '../../config/db';

export type PaymentStatus = 'created' | 'paid' | 'failed' | 'refunded' | 'partially_refunded';

export interface IPaymentDocument extends Document {
  bookingId: Types.ObjectId;
  customerId: string;
  gateway: 'payu';
  txnid: string;                 // our merchant txn id (var1 for PayU verify)
  amount: number;
  currency: 'INR';
  status: PaymentStatus;
  payuMihpayid: string | null;   // PayU's payment id
  payuMode: string | null;       // UPI / CC / NB ...
  rawResponse: Record<string, unknown> | null;
  refund: { refundId: string; amount: number; status: string } | null;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentSchema = new Schema<IPaymentDocument>(
  {
    bookingId: { type: Schema.Types.ObjectId, ref: 'TurfBooking', required: true, index: true },
    customerId: { type: String, required: true, index: true },
    gateway: { type: String, enum: ['payu'], default: 'payu' },
    txnid: { type: String, required: true, unique: true },
    amount: { type: Number, required: true },
    currency: { type: String, enum: ['INR'], default: 'INR' },
    status: {
      type: String,
      enum: ['created', 'paid', 'failed', 'refunded', 'partially_refunded'],
      default: 'created',
      index: true,
    },
    payuMihpayid: { type: String, default: null },
    payuMode: { type: String, default: null },
    rawResponse: { type: Schema.Types.Mixed, default: null },
    refund: {
      type: new Schema(
        { refundId: String, amount: Number, status: String },
        { _id: false },
      ),
      default: null,
    },
  },
  { timestamps: true },
);

export default turfSpotDb.model<IPaymentDocument>('TurfPayment', PaymentSchema, 'payments');

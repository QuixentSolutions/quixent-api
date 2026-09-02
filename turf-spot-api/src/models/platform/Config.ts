import { Document, Schema } from 'mongoose';
import { turfSpotDb } from '../../config/db';

export interface IRefundRule {
  minHoursBefore: number;   // slot is >= this many hours away
  refundPercent: number;    // -> this much is refunded
}

export interface IPlatformConfigDocument extends Document {
  key: 'default';           // singleton
  commissionPercent: number;
  gstPercent: number;
  platformFeeFlat: number;
  slotLockMinutes: number;
  refundPolicy: IRefundRule[];
  businessModel: 'commission' | 'subscription' | 'hybrid';
  updatedAt: Date;
}

const RefundRuleSchema = new Schema<IRefundRule>(
  { minHoursBefore: { type: Number, required: true }, refundPercent: { type: Number, required: true } },
  { _id: false },
);

const PlatformConfigSchema = new Schema<IPlatformConfigDocument>(
  {
    key: { type: String, enum: ['default'], default: 'default', unique: true },
    commissionPercent: { type: Number, default: 10 },
    gstPercent: { type: Number, default: 18 },
    platformFeeFlat: { type: Number, default: 50 },
    slotLockMinutes: { type: Number, default: 10 },
    refundPolicy: {
      type: [RefundRuleSchema],
      default: [
        { minHoursBefore: 24, refundPercent: 100 },
        { minHoursBefore: 6, refundPercent: 50 },
        { minHoursBefore: 1, refundPercent: 0 },
      ],
    },
    businessModel: { type: String, enum: ['commission', 'subscription', 'hybrid'], default: 'commission' },
  },
  { timestamps: true },
);

export default turfSpotDb.model<IPlatformConfigDocument>('TurfSpotConfig', PlatformConfigSchema, 'config');

import { Document, Schema, Types } from 'mongoose';
import { turfSpotDb } from '../../config/db';

// Owner-declared unavailability: maintenance windows, holidays, or a manual
// block of a specific period. Any slot that overlaps an active block is
// unbookable.
export interface ITurfBlockDocument extends Document {
  turfId: Types.ObjectId;
  startsAt: Date;
  endsAt: Date;
  reason: 'maintenance' | 'holiday' | 'manual';
  note: string;
  createdBy: string;
  createdAt: Date;
}

const TurfBlockSchema = new Schema<ITurfBlockDocument>(
  {
    turfId: { type: Schema.Types.ObjectId, ref: 'Turf', required: true, index: true },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    reason: { type: String, enum: ['maintenance', 'holiday', 'manual'], default: 'manual' },
    note: { type: String, default: '', trim: true },
    createdBy: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

TurfBlockSchema.index({ turfId: 1, startsAt: 1, endsAt: 1 });

export default turfSpotDb.model<ITurfBlockDocument>('TurfBlock', TurfBlockSchema, 'blocks');

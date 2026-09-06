import { Document, Schema, Types } from 'mongoose';
import { turfDb } from '../config/db';

// An owner-declared unavailability window (maintenance, private event, ...).
// Treated exactly like a booking when computing slot availability.
export interface IBlockedSlotDocument extends Document {
  turfId: Types.ObjectId;
  ownerId: string;
  date: string; // "YYYY-MM-DD"
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
  reason?: string;
  createdAt: Date;
}

const BlockedSlotSchema = new Schema<IBlockedSlotDocument>(
  {
    turfId: { type: Schema.Types.ObjectId, ref: 'Turf', required: true, index: true },
    ownerId: { type: String, required: true, index: true },
    date: { type: String, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    reason: { type: String, trim: true, maxlength: 200 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

BlockedSlotSchema.index({ turfId: 1, date: 1 });

export default turfDb.model<IBlockedSlotDocument>('BlockedSlot', BlockedSlotSchema);

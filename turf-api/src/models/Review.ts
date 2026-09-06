import { Document, Schema, Types } from 'mongoose';
import { turfDb } from '../config/db';

export interface IReviewDocument extends Document {
  turfId: Types.ObjectId;
  userId: string; // shared auth user's _id
  bookingId?: Types.ObjectId; // the completed booking that unlocked this review
  rating: number;
  text?: string;
  createdAt: Date;
}

const ReviewSchema = new Schema<IReviewDocument>(
  {
    turfId: { type: Schema.Types.ObjectId, ref: 'Turf', required: true, index: true },
    userId: { type: String, required: true },
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking' },
    rating: { type: Number, required: true, min: 1, max: 5 },
    text: { type: String, trim: true, maxlength: 1000 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// One review per user per turf — posting again edits the existing review.
ReviewSchema.index({ turfId: 1, userId: 1 }, { unique: true });

export default turfDb.model<IReviewDocument>('Review', ReviewSchema);

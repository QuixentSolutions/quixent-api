import { Document, Schema, Types } from 'mongoose';
import { turfSpotDb } from '../../config/db';

export interface ITurfReviewDocument extends Document {
  turfId: Types.ObjectId;
  customerId: string;                 // shared auth user's _id
  bookingId: Types.ObjectId | null;   // optional provenance; a review no longer requires a booking
  rating: number;                     // 1..5
  text: string;
  createdAt: Date;
  updatedAt: Date;
}

const ReviewSchema = new Schema<ITurfReviewDocument>(
  {
    turfId: { type: Schema.Types.ObjectId, ref: 'Turf', required: true, index: true },
    customerId: { type: String, required: true },
    bookingId: { type: Schema.Types.ObjectId, ref: 'TurfBooking', default: null },
    rating: { type: Number, required: true, min: 1, max: 5 },
    text: { type: String, default: '', trim: true, maxlength: 1000 },
  },
  { timestamps: true },
);

// One review per customer per turf — re-posting edits the existing one.
ReviewSchema.index({ turfId: 1, customerId: 1 }, { unique: true });

export default turfSpotDb.model<ITurfReviewDocument>('TurfReview', ReviewSchema, 'reviews');

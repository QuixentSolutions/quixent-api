import { Document, Schema, Types } from 'mongoose';
import { thalluVandiDb } from '../config/db';

export interface IReviewDocument extends Document {
  stallId: Types.ObjectId;
  userId: string; // shared auth user's _id
  rating: number;
  text?: string;
  createdAt: Date;
}

const ReviewSchema = new Schema<IReviewDocument>(
  {
    stallId: { type: Schema.Types.ObjectId, ref: 'Stall', required: true, index: true },
    userId: { type: String, required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    text: { type: String, trim: true, maxlength: 1000 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// One review per user per stall — posting again edits the existing review.
ReviewSchema.index({ stallId: 1, userId: 1 }, { unique: true });

export default thalluVandiDb.model<IReviewDocument>('Review', ReviewSchema);

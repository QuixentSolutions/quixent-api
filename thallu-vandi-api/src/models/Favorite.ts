import { Document, Schema, Types } from 'mongoose';
import { thalluVandiDb } from '../config/db';

export interface IFavoriteDocument extends Document {
  stallId: Types.ObjectId;
  userId: string; // shared auth user's _id
  createdAt: Date;
}

const FavoriteSchema = new Schema<IFavoriteDocument>(
  {
    stallId: { type: Schema.Types.ObjectId, ref: 'Stall', required: true, index: true },
    userId: { type: String, required: true, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// One favorite per user per stall — favoriting again is a no-op, not a duplicate.
FavoriteSchema.index({ stallId: 1, userId: 1 }, { unique: true });

export default thalluVandiDb.model<IFavoriteDocument>('Favorite', FavoriteSchema);

import { Document, Schema } from 'mongoose';
import { turfSpotDb } from '../config/db';

// Own collection in TurfSpot's own `turf-spot` database.
export interface IPushTokenDocument extends Document {
  userId: string;
  token: string;
  updatedAt: Date;
}

const PushTokenSchema = new Schema<IPushTokenDocument>(
  {
    userId: { type: String, required: true, unique: true },
    token: { type: String, required: true },
  },
  { timestamps: true },
);

export default turfSpotDb.model<IPushTokenDocument>('TurfPushToken', PushTokenSchema, 'pushtokens');

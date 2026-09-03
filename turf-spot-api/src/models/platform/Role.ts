import { Document, Schema } from 'mongoose';
import { turfSpotDb } from '../../config/db';

export type TurfRole = 'turf_admin' | 'super_admin';

export interface ITurfSpotRoleDocument extends Document {
  userId: string;            // shared auth user's _id
  role: TurfRole;
  status: 'active' | 'suspended';
  createdBy: string | null;  // userId of the super_admin who granted it, or null (self / bootstrap)
  createdAt: Date;
  updatedAt: Date;
}

const TurfSpotRoleSchema = new Schema<ITurfSpotRoleDocument>(
  {
    userId: { type: String, required: true, index: true },
    role: { type: String, enum: ['turf_admin', 'super_admin'], required: true },
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
    createdBy: { type: String, default: null },
  },
  { timestamps: true },
);

// One row per user per role.
TurfSpotRoleSchema.index({ userId: 1, role: 1 }, { unique: true });

export default turfSpotDb.model<ITurfSpotRoleDocument>('TurfSpotRole', TurfSpotRoleSchema, 'roles');

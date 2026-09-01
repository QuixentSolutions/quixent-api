import { Document, Schema, Types } from 'mongoose';
import { thalluVandiDb } from '../config/db';

export type StallStatus = 'pending' | 'approved' | 'rejected';

export interface IMenuItem {
  _id: Types.ObjectId;
  name: string;
  price?: number;
  photoUrl?: string;
}

export interface IStallDocument extends Document {
  vendorId: string; // shared auth user's _id (auth/src/models/User.ts) — plain string, no cross-DB ref
  name: string;
  category: string;
  location: {
    type: 'Point';
    coordinates: [number, number]; // [lng, lat]
  };
  photos: string[];
  menuItems: IMenuItem[];
  openTime?: string; // "HH:mm", 24-hour, stall-local time — single-city pilot, no timezone field needed
  closeTime?: string;
  status: StallStatus;
  ratingAvg: number;
  ratingCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const MenuItemSchema = new Schema<IMenuItem>(
  {
    name: { type: String, required: true, trim: true },
    price: { type: Number, min: 0 },
    photoUrl: { type: String },
  },
  { _id: true },
);

const StallSchema = new Schema<IStallDocument>(
  {
    vendorId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true },
    },
    photos: { type: [String], default: [] },
    menuItems: { type: [MenuItemSchema], default: [] },
    openTime: { type: String },
    closeTime: { type: String },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
    ratingAvg: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

StallSchema.index({ location: '2dsphere' });

export default thalluVandiDb.model<IStallDocument>('Stall', StallSchema);

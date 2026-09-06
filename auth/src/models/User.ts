import { Document, Schema } from 'mongoose';
import { Gender } from '../types';
import { authDb } from '../config/db';

export interface IUserDocument extends Document {
  mobile: string;
  name: string;
  email: string;
  gender: Gender;
  age: number;
  city: string;
  bio: string;
  profileImage: string;
  isActive: boolean;
  role: 'user' | 'admin';
  lastLogin: Date;
  createdAt: Date;
}

const UserSchema = new Schema<IUserDocument>(
  {
    mobile: { type: String, required: true, unique: true, trim: true },
    name: { type: String, default: '' },
    // Optional — the platform is phone-first (mobile is the login identity).
    // Not unique: several accounts leaving it blank shouldn't collide, and
    // nothing here enforces one email per person across products.
    email: { type: String, default: '', trim: true, lowercase: true },
    gender: { type: String, enum: ['male', 'female'], default: null },
    age: { type: Number, default: null },
    city: { type: String, default: '', trim: true },
    bio: { type: String, default: '', trim: true, maxlength: 200 },
    profileImage: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    lastLogin: { type: Date, default: null },
  },
  { timestamps: true },
);

export default authDb.model<IUserDocument>('User', UserSchema);

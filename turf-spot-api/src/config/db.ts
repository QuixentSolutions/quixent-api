import mongoose, { Connection } from 'mongoose';

// Same Atlas cluster match-calculator-api / thallu-vandi-api use (same
// APPS_MONGO_URI, no new env var or Atlas resource), but its own database
// via the dbName option — so TurfSpot's collections (turfs, bookings,
// payments, reviews, roles, blocks, config, pushtokens) live in a clean
// `turf-spot` db instead of being prefixed into a shared one.
export let turfSpotDb: Connection;

export const connectTurfSpotDB = async (): Promise<void> => {
  const mongoUri = process.env.APPS_MONGO_URI;
  if (!mongoUri) throw new Error('APPS_MONGO_URI is not set in .env');
  turfSpotDb = mongoose.createConnection(mongoUri, { dbName: 'turf-spot' });
  await turfSpotDb.asPromise();
  console.log('✅ TurfSpot MongoDB connected (db: turf-spot)');
};

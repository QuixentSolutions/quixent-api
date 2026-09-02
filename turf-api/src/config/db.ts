import mongoose, { Connection } from 'mongoose';

// Same Atlas cluster the other app modules use (shared APPS_MONGO_URI — no
// new env var or Atlas resource needed), but its own logical database via the
// dbName option so Turf's collections don't mingle with thallu-vandi / match.
export let turfDb: Connection;

export const connectTurfDB = async (): Promise<void> => {
  const mongoUri = process.env.APPS_MONGO_URI;
  if (!mongoUri) throw new Error('APPS_MONGO_URI is not set in .env');
  turfDb = mongoose.createConnection(mongoUri, { dbName: 'turf' });
  await turfDb.asPromise();
  console.log('✅ Turf MongoDB connected (db: turf)');
};

import mongoose, { Connection } from 'mongoose';

// Same shared "applications" cluster match-calculator-api uses — Stall/Review
// collections just live alongside its Answer/Match/Question collections in
// the same database, distinguished by collection name only (no dbName override,
// matching match-calculator-api/src/config/db.ts exactly).
export let thalluVandiDb: Connection;

export const connectThalluVandiDB = async (): Promise<void> => {
  const mongoUri = process.env.APPS_MONGO_URI;
  if (!mongoUri) throw new Error('APPS_MONGO_URI is not set in .env');
  thalluVandiDb = mongoose.createConnection(mongoUri);
  await thalluVandiDb.asPromise();
  console.log('✅ Thallu Vandi MongoDB connected');
};

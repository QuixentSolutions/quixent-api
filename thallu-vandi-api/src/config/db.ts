import mongoose, { Connection } from 'mongoose';

// Same Atlas cluster match-calculator-api uses (same APPS_MONGO_URI, no new
// env var or Atlas resource needed), but its own database via the dbName
// option — previously had no dbName override, which silently landed both
// products' collections in Mongo's default "test" database together.
export let thalluVandiDb: Connection;

export const connectThalluVandiDB = async (): Promise<void> => {
  const mongoUri = process.env.APPS_MONGO_URI;
  if (!mongoUri) throw new Error('APPS_MONGO_URI is not set in .env');
  thalluVandiDb = mongoose.createConnection(mongoUri, { dbName: 'thallu-vandi' });
  await thalluVandiDb.asPromise();
  console.log('✅ Thallu Vandi MongoDB connected (db: thallu-vandi)');
};

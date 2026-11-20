import mongoose from 'mongoose';

export async function connectMongo(uri: string): Promise<void> {
  // Give up after 5s instead of hanging forever if Mongo is unreachable.
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
}

export async function disconnectMongo(): Promise<void> {
  await mongoose.disconnect();
}

// Used by /health: a real round trip to the database, not just "was it connected once".
export async function pingMongo(): Promise<boolean> {
  try {
    const db = mongoose.connection.db;
    if (!db) return false;
    await db.command({ ping: 1 });
    return true;
  } catch {
    return false;
  }
}

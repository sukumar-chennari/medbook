import os from 'node:os';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

// Starts a real, temporary MongoDB inside the test process. No Docker needed,
// and every test run starts from an empty database.
let server: MongoMemoryServer | undefined;

export async function startTestDb(): Promise<void> {
  server = await MongoMemoryServer.create();
  // The MongoDB driver loads Node's "os" module with a dynamic import(), which Jest's sandbox
  // cannot do. Without this option the driver sends an empty handshake and the server rejects it
  // ("Missing required sub-document 'driver'"). We hand it "os" directly. Tests only.
  await mongoose.connect(server.getUri(), { runtimeAdapters: { os } });
}

export async function clearTestDb(): Promise<void> {
  const collections = await mongoose.connection.db!.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
}

export async function stopTestDb(): Promise<void> {
  await mongoose.disconnect();
  await server?.stop();
}

// The first run downloads a mongod binary (one time), so allow extra time.
export const DB_START_TIMEOUT_MS = 180_000;

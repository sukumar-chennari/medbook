import os from 'node:os';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

// Starts a real, temporary MongoDB inside the test process. No Docker needed,
// and every test run starts from an empty database.
let server: MongoMemoryServer | undefined;

// Several test files start their own temporary MongoDB at the same time, and two of them can
// pick the same random port by bad luck ("Port already in use"). If that happens, just try again.
async function createServerWithRetry(attempts = 5): Promise<MongoMemoryServer> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await MongoMemoryServer.create();
    } catch (err) {
      if (attempt >= attempts) throw err;
    }
  }
}

export async function startTestDb(): Promise<void> {
  server = await createServerWithRetry();
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

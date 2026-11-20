import { loadEnv } from '../config/env';
import { connectMongo, disconnectMongo } from '../lib/mongo';

// Placeholder. Real fake data (synthetic doctors, patients, slots) is added
// together with the models in Phases 1-2. Never use real patient data.
async function main(): Promise<void> {
  const env = loadEnv();
  await connectMongo(env.MONGO_URI);
  console.log('seed: nothing to seed yet (no models exist in Phase 0)');
  await disconnectMongo();
}

main().catch((err) => {
  console.error('seed failed', err);
  process.exit(1);
});

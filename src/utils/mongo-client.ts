import { MongoClient, Collection, Document } from 'mongodb';

let cachedClient: MongoClient | null = null;
let cachedCollection: Collection<Document> | null = null;
let initialized = false;

const DEFAULT_COLLECTION_NAME = 'submissions';

export async function initMongo(): Promise<void> {
  if (initialized) return;
  initialized = true;

  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB_NAME;
  const collectionName = process.env.MONGODB_COLLECTION_NAME || DEFAULT_COLLECTION_NAME;

  if (!uri) {
    console.warn('  ⚠️  MONGODB_URI not set — Mongo persistence disabled');
    return;
  }

  if (!dbName) {
    console.warn('  ⚠️  MONGODB_DB_NAME not set while MONGODB_URI is set — Mongo persistence disabled');
    return;
  }

  try {
    const client = new MongoClient(uri);
    await client.connect();
    cachedClient = client;
    cachedCollection = client.db(dbName).collection(collectionName);
    console.log(`  🗄️  MongoDB connected (db=${dbName}, collection=${collectionName})`);
  } catch (error) {
    console.warn(`  ⚠️  Failed to connect to MongoDB: ${error} — Mongo persistence disabled`);
    cachedClient = null;
    cachedCollection = null;
  }
}

export function getCollection(): Collection<Document> | null {
  return cachedCollection;
}

export async function closeMongo(): Promise<void> {
  if (!cachedClient) return;
  try {
    await cachedClient.close();
  } catch (error) {
    console.warn(`  ⚠️  Error closing MongoDB client: ${error}`);
  } finally {
    cachedClient = null;
    cachedCollection = null;
    initialized = false;
  }
}

// Test-only helper. Resets module state so tests can re-init cleanly.
export function __resetMongoForTests(): void {
  cachedClient = null;
  cachedCollection = null;
  initialized = false;
}

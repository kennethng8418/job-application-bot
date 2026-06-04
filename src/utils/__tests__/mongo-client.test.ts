import { test } from 'node:test';
import * as assert from 'node:assert';
import { initMongo, getCollection, closeMongo, __resetMongoForTests } from '../mongo-client';

function withEnv(vars: Record<string, string | undefined>, fn: () => Promise<void> | void): () => Promise<void> {
  return async () => {
    const original: Record<string, string | undefined> = {};
    for (const key of Object.keys(vars)) {
      original[key] = process.env[key];
      if (vars[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = vars[key]!;
      }
    }
    __resetMongoForTests();
    try {
      await fn();
    } finally {
      for (const key of Object.keys(original)) {
        if (original[key] === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = original[key]!;
        }
      }
      __resetMongoForTests();
    }
  };
}

test('getCollection returns null before initMongo runs', () => {
  __resetMongoForTests();
  assert.strictEqual(getCollection(), null);
});

test('initMongo with missing MONGODB_URI leaves getCollection null and does not throw',
  withEnv({ MONGODB_URI: undefined, MONGODB_DB_NAME: undefined, MONGODB_COLLECTION_NAME: undefined }, async () => {
    await initMongo();
    assert.strictEqual(getCollection(), null);
  })
);

test('initMongo with URI but missing MONGODB_DB_NAME leaves getCollection null',
  withEnv({ MONGODB_URI: 'mongodb://localhost:27017', MONGODB_DB_NAME: undefined, MONGODB_COLLECTION_NAME: undefined }, async () => {
    await initMongo();
    assert.strictEqual(getCollection(), null);
  })
);

test('initMongo is idempotent — calling twice does not throw and leaves state consistent',
  withEnv({ MONGODB_URI: undefined, MONGODB_DB_NAME: undefined, MONGODB_COLLECTION_NAME: undefined }, async () => {
    await initMongo();
    await initMongo();
    assert.strictEqual(getCollection(), null);
  })
);

test('closeMongo is safe to call when no client was opened',
  withEnv({ MONGODB_URI: undefined, MONGODB_DB_NAME: undefined, MONGODB_COLLECTION_NAME: undefined }, async () => {
    await initMongo();
    await closeMongo();
    assert.strictEqual(getCollection(), null);
  })
);

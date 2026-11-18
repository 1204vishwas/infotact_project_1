import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/';
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'nexus';

let client = null;
let db = null;

/**
 * Optimized MongoDB connection pool configuration for high-speed telemetry ingestion.
 */
export async function connectToDatabase() {
  if (db && client) {
    return { client, db };
  }

  client = new MongoClient(MONGODB_URI, {
    // High-performance connection pool configuration
    maxPoolSize: 100,             // Max concurrent socket connections for high ingestion throughput
    minPoolSize: 10,              // Keep warm connections ready for sudden bursts
    maxIdleTimeMS: 30000,         // Close connections that stay idle
    waitQueueTimeoutMS: 5000,     // Timeout when pool is saturated
    serverSelectionTimeoutMS: 5000,
    // Write concern tuned for high-speed telemetry stream (acknowledged by primary)
    writeConcern: {
      w: 1,
      journal: false
    }
  });

  await client.connect();
  db = client.db(MONGODB_DB_NAME);
  console.log(`[MongoDB] Connected successfully to cluster at ${MONGODB_URI}`);
  console.log(`[MongoDB] Using target database: "${MONGODB_DB_NAME}"`);

  return { client, db };
}

export function isConnected() {
  return Boolean(client && db);
}

export function getDatabase() {
  if (!db) {
    throw new Error('Database not initialized. Call connectToDatabase() first.');
  }
  return db;
}

export function getClient() {
  if (!client) {
    throw new Error('MongoClient not initialized. Call connectToDatabase() first.');
  }
  return client;
}

export async function closeDatabase() {
  if (client) {
    await client.close();
    client = null;
    db = null;
    console.log('[MongoDB] Connection closed.');
  }
}

import { connectToDatabase, closeDatabase } from '../config/db.js';
import { ensureTelemetryCollection, TELEMETRY_COLLECTION_NAME } from '../models/telemetryCollection.js';

async function run() {
  try {
    console.log('--- Initializing Hardware Telemetry Time-Series Collection ---');
    const { db } = await connectToDatabase();

    // Verify existing databases & collections in the cluster
    const adminDb = db.admin();
    const dbsList = await adminDb.listDatabases();
    console.log('[Cluster Databases]:', dbsList.databases.map(d => `${d.name} (${(d.sizeOnDisk / 1024 / 1024).toFixed(2)} MB)`).join(', '));

    const collectionsBefore = await db.listCollections().toArray();
    console.log(`[Collections in "${db.databaseName}" before init]:`, collectionsBefore.map(c => c.name).join(', '));

    const collection = await ensureTelemetryCollection(db);

    const indexes = await collection.indexes();
    console.log(`[Indexes on "${TELEMETRY_COLLECTION_NAME}"]:`, JSON.stringify(indexes, null, 2));

    const collectionsAfter = await db.listCollections().toArray();
    console.log(`[Collections in "${db.databaseName}" after init]:`, collectionsAfter.map(c => c.name).join(', '));

    console.log(' Time-Series setup completed successfully!');
  } catch (err) {
    console.error(' Error initializing Time-Series collection:', err);
    process.exitCode = 1;
  } finally {
    await closeDatabase();
  }
}

run();

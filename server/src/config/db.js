import mongoose from 'mongoose';
import { config } from './env.js';

let timeseriesEnsured = false;

function isTimeSeriesCollection(info) {
  return Boolean(info && (info.type === 'timeseries' || info.options?.timeseries));
}

async function ensureTelemetryTimeSeriesCollection() {
  if (timeseriesEnsured) return;

  const db = mongoose.connection.db;
  const name = config.telemetryCollection;

  let info = (await db.listCollections({ name }).toArray())[0];
  if (info && !isTimeSeriesCollection(info)) {
    const count = await db.collection(name).countDocuments();
    if (count === 0) {
      console.warn(`[db] Dropping empty non-time-series "${name}" collection.`);
      await db.collection(name).drop();
    } else {
      const legacyName = `${name}_legacy_${Date.now()}`;
      console.warn(`[db] Renaming non-time-series "${name}" to "${legacyName}".`);
      await db.collection(name).rename(legacyName);
    }
    info = (await db.listCollections({ name }).toArray())[0];
  }

  if (!info) {
    try {
      await db.createCollection(name, {
        timeseries: {
          timeField: 'timestamp',
          metaField: 'metadata',
          granularity: 'seconds',
        },
        expireAfterSeconds: 60 * 60 * 24 * 30,
      });
    } catch (error) {
      if (error?.code !== 48) throw error;
    }
    info = (await db.listCollections({ name }).toArray())[0];
  }

  if (!isTimeSeriesCollection(info)) {
    throw new Error(`Collection "${name}" exists but is not a time-series collection`);
  }

  const collection = db.collection(name);
  await collection.createIndex({ 'metadata.deviceId': 1, timestamp: -1 });
  await collection.createIndex({ 'metadata.metric': 1, timestamp: -1 });

  timeseriesEnsured = true;
}

export async function connectDatabase() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(config.mongoUri, {
    dbName: config.mongoDb,
  });
  await ensureTelemetryTimeSeriesCollection();
  return mongoose.connection;
}

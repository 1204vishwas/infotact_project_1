/**
 * MongoDB Time-Series Collection Schema & Setup for Hardware Telemetry
 *
 * In MongoDB, Time-Series collections are created using db.createCollection() with the `timeseries` option.
 * MongoDB automatically stores measurements in an optimized columnar bucket format under `system.buckets.<collection>`.
 *
 * Hardware Telemetry Model:
 *  - timeField: "timestamp" (Date)
 *  - metaField: "metadata" (Object containing device & location descriptors)
 *  - measurements: "metrics" (Numeric sensor readings: temperature, voltage, rpm, load, vibration, etc.)
 */

export const TELEMETRY_COLLECTION_NAME = process.env.TELEMETRY_COLLECTION_NAME || 'hardware_telemetry';

export function getTimeSeriesOptions() {
  const options = {
    timeseries: {
      timeField: 'timestamp',
      metaField: 'metadata',
      granularity: 'seconds' // 'seconds' | 'minutes' | 'hours'
    }
  };

  const retention = process.env.TELEMETRY_RETENTION_SECONDS;
  if (retention) {
    const seconds = parseInt(retention, 10);
    if (!isNaN(seconds) && seconds > 0) {
      options.expireAfterSeconds = seconds;
    }
  }

  return options;
}

export const TIME_SERIES_OPTIONS = getTimeSeriesOptions();

/**
 * Ensures that the Time-Series collection and required secondary indexes exist.
 * Safe to call idempotently on application startup.
 *
 * @param {import('mongodb').Db} db
 */
export async function ensureTelemetryCollection(db) {
  const collectionName = TELEMETRY_COLLECTION_NAME;
  const collections = await db.listCollections({ name: collectionName }).toArray();

  if (collections.length === 0) {
    console.log(`[MongoDB] Creating Time-Series collection: "${collectionName}" with granularity "seconds"...`);
    await db.createCollection(collectionName, getTimeSeriesOptions());
    console.log(`[MongoDB] Time-Series collection "${collectionName}" created successfully.`);
  } else {
    console.log(`[MongoDB] Collection "${collectionName}" already exists.`);
  }

  const collection = db.collection(collectionName);

  // Create high-performance secondary indexes on the metaField and timestamp
  console.log(`[MongoDB] Ensuring secondary indexes on "${collectionName}"...`);
  
  await Promise.all([
    // Compound index for single-device history & latest-metric queries
    collection.createIndex(
      { 'metadata.deviceId': 1, timestamp: -1 },
      { name: 'idx_device_timestamp', background: true }
    ),
    // Compound index for facility-wide monitoring
    collection.createIndex(
      { 'metadata.facilityId': 1, timestamp: -1 },
      { name: 'idx_facility_timestamp', background: true }
    ),
    // Index for hardware classification filtering
    collection.createIndex(
      { 'metadata.deviceType': 1, timestamp: -1 },
      { name: 'idx_devicetype_timestamp', background: true }
    ),
    // Index for status and anomaly tracking
    collection.createIndex(
      { status: 1, timestamp: -1 },
      { name: 'idx_status_timestamp', background: true }
    )
  ]);

  console.log(`[MongoDB] Secondary indexes confirmed on "${collectionName}".`);
  return collection;
}

import mongoose from 'mongoose';
import { connectDatabase } from '../src/config/db.js';
import { Telemetry } from '../src/models/Telemetry.js';
import { config } from '../src/config/env.js';

const AUDIT_DEVICE = 'audit-turbine';
const AUDIT_METRIC = 'temperature';
const BATCH_SIZE = Number(process.env.AUDIT_BATCH_SIZE || 1000);
const BATCHES = Number(process.env.AUDIT_BATCHES || 5); // 5k points by default
const FOOTPRINT_BATCHES = Number(process.env.AUDIT_FOOTPRINT_BATCHES || 25); // 25k points for physical extent comparison
const TARGET_WRITES_PER_SEC = 5000;

const FOOTPRINT_TS_COLL = 'audit_timeseries_footprint';
const FOOTPRINT_STD_COLL = 'audit_standard_footprint';
const AUDIT_DEVICES = ['turbine-01', 'turbine-02', 'turbine-03', 'turbine-04', 'turbine-05'];

async function checkpointDatabase(db) {
  try {
    await db.admin().command({ fsync: 1 });
    return true;
  } catch {
    return false;
  }
}

async function readCollectionMetrics(db, collectionName) {
  const col = db.collection(collectionName);
  const [count, stats] = await Promise.all([
    col.countDocuments(),
    db.command({ collStats: collectionName }),
  ]);

  const bucketCount = stats.timeseries?.bucketCount ?? null;
  const size = stats.size ?? 0;
  const storageSize = stats.storageSize ?? 0;
  const freeStorageSize = stats.freeStorageSize ?? 0;
  const totalIndexSize = stats.totalIndexSize ?? 0;
  const totalSize = stats.totalSize ?? storageSize + totalIndexSize;

  return {
    count,
    bucketCount,
    measurementsPerBucket: bucketCount ? Number((count / bucketCount).toFixed(1)) : null,
    size,
    storageSize,
    freeStorageSize,
    totalIndexSize,
    totalSize,
    bytesPerMeasurement: count > 0 ? Number((totalSize / count).toFixed(2)) : null,
  };
}

function buildBatchDocs(batchIndex, batchSize, devices, baseTimeMs) {
  return Array.from({ length: batchSize }, (_, i) => {
    const idx = batchIndex * batchSize + i;
    return {
      timestamp: new Date(baseTimeMs + idx),
      value: 70 + (idx % 50) * 0.5,
      metadata: {
        deviceId: devices[i % devices.length],
        metric: AUDIT_METRIC,
        unit: 'C',
        source: 'audit',
        tags: ['week1-audit'],
      },
    };
  });
}

async function runFootprintComparison(db) {
  const tsCol = db.collection(FOOTPRINT_TS_COLL);
  const stdCol = db.collection(FOOTPRINT_STD_COLL);

  await tsCol.drop().catch(() => {});
  await stdCol.drop().catch(() => {});

  try {
    await db.createCollection(FOOTPRINT_TS_COLL, {
      timeseries: {
        timeField: 'timestamp',
        metaField: 'metadata',
        granularity: 'seconds',
      },
    });
    await db.createCollection(FOOTPRINT_STD_COLL);

    const indexSpecs = [
      { 'metadata.deviceId': 1, timestamp: -1 },
      { 'metadata.metric': 1, timestamp: -1 },
    ];
    await Promise.all(
      indexSpecs.flatMap((spec) => [tsCol.createIndex(spec), stdCol.createIndex(spec)])
    );

    const baseTimeMs = Date.now();
    let tsInserted = 0;
    const tsStart = performance.now();
    for (let b = 0; b < FOOTPRINT_BATCHES; b++) {
      const docs = buildBatchDocs(b, BATCH_SIZE, AUDIT_DEVICES, baseTimeMs);
      const res = await tsCol.insertMany(docs, { ordered: false });
      tsInserted += res.insertedCount;
    }
    const tsElapsedMs = Math.max(1, Math.round(performance.now() - tsStart));
    const tsWritesPerSec = Math.round((tsInserted / tsElapsedMs) * 1000);

    let stdInserted = 0;
    const stdStart = performance.now();
    for (let b = 0; b < FOOTPRINT_BATCHES; b++) {
      const docs = buildBatchDocs(b, BATCH_SIZE, AUDIT_DEVICES, baseTimeMs);
      const res = await stdCol.insertMany(docs, { ordered: false });
      stdInserted += res.insertedCount;
    }
    const stdElapsedMs = Math.max(1, Math.round(performance.now() - stdStart));
    const stdWritesPerSec = Math.round((stdInserted / stdElapsedMs) * 1000);

    const fsynced = await checkpointDatabase(db);
    const [timeSeries, standard] = await Promise.all([
      readCollectionMetrics(db, FOOTPRINT_TS_COLL),
      readCollectionMetrics(db, FOOTPRINT_STD_COLL),
    ]);

    const pctReduction = (tsBytes, stdBytes) =>
      stdBytes > 0 ? Number((((stdBytes - tsBytes) / stdBytes) * 100).toFixed(2)) : null;

    return {
      documentsPerCollection: tsInserted,
      batches: FOOTPRINT_BATCHES,
      batchSize: BATCH_SIZE,
      devicesSimulated: AUDIT_DEVICES.length,
      fsynced,
      timeSeries: {
        elapsedMs: tsElapsedMs,
        writesPerSec: tsWritesPerSec,
        meets5000WritesPerSec: tsWritesPerSec >= TARGET_WRITES_PER_SEC,
        ...timeSeries,
      },
      standard: {
        elapsedMs: stdElapsedMs,
        writesPerSec: stdWritesPerSec,
        ...standard,
      },
      savings: {
        logicalSizeReductionPct: pctReduction(timeSeries.size, standard.size),
        storageSizeReductionPct: pctReduction(timeSeries.storageSize, standard.storageSize),
        indexSizeReductionPct: pctReduction(timeSeries.totalIndexSize, standard.totalIndexSize),
        totalFootprintReductionPct: pctReduction(timeSeries.totalSize, standard.totalSize),
        totalCompressionFactor:
          timeSeries.totalSize > 0
            ? Number((standard.totalSize / timeSeries.totalSize).toFixed(2))
            : null,
      },
    };
  } finally {
    await tsCol.drop().catch(() => {});
    await stdCol.drop().catch(() => {});
  }
}

async function main() {
  await connectDatabase();
  const db = mongoose.connection.db;
  const beforeInfo = (await db.listCollections({ name: config.telemetryCollection }).toArray())[0];

  await Telemetry.deleteMany({ 'metadata.deviceId': AUDIT_DEVICE, 'metadata.metric': AUDIT_METRIC });
  await checkpointDatabase(db);
  const before = await readCollectionMetrics(db, config.telemetryCollection);

  let sample = [];
  let elapsedMs = 0;
  let inserted = 0;

  try {
    const start = performance.now();
    const baseTimeMs = Date.now();
    for (let b = 0; b < BATCHES; b++) {
      const docs = buildBatchDocs(b, BATCH_SIZE, [AUDIT_DEVICE], baseTimeMs);
      const res = await Telemetry.insertMany(docs, { ordered: false });
      inserted += res.length;
    }
    elapsedMs = Math.max(1, Math.round(performance.now() - start));

    await checkpointDatabase(db);
    const after = await readCollectionMetrics(db, config.telemetryCollection);
    sample = await Telemetry.find({ 'metadata.deviceId': AUDIT_DEVICE })
      .sort({ timestamp: -1 })
      .limit(1)
      .lean();

    await Telemetry.deleteMany({ 'metadata.deviceId': AUDIT_DEVICE, 'metadata.metric': AUDIT_METRIC });

    const writesPerSec = Math.round((inserted / elapsedMs) * 1000);
    const footprintComparison = await runFootprintComparison(db);

    console.log(
      JSON.stringify(
        {
          ok: true,
          mongo: {
            db: config.mongoDb,
            collection: config.telemetryCollection,
            timeSeries: beforeInfo?.options?.timeseries || null,
          },
          target: {
            requestedWritesPerSec: TARGET_WRITES_PER_SEC,
            inserted,
            batches: BATCHES,
            batchSize: BATCH_SIZE,
          },
          performance: {
            elapsedMs,
            writesPerSec,
            meets5000WritesPerSec: writesPerSec >= TARGET_WRITES_PER_SEC,
          },
          storage: {
            before,
            after,
            delta: {
              count: after.count - before.count,
              bucketCount:
                after.bucketCount !== null && before.bucketCount !== null
                  ? after.bucketCount - before.bucketCount
                  : null,
              size: after.size - before.size,
              storageSize: after.storageSize - before.storageSize,
              totalIndexSize: after.totalIndexSize - before.totalIndexSize,
              totalSize: after.totalSize - before.totalSize,
            },
          },
          footprintComparison,
          auditSample: sample[0] || null,
        },
        null,
        2
      )
    );
  } finally {
    await Telemetry.deleteMany({ 'metadata.deviceId': AUDIT_DEVICE, 'metadata.metric': AUDIT_METRIC }).catch(() => {});
    await mongoose.disconnect();
  }
}

main().catch(async (error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});

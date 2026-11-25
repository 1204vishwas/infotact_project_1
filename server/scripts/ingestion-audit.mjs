import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { connectDatabase } from '../src/config/db.js';
import { Telemetry } from '../src/models/Telemetry.js';
import { config } from '../src/config/env.js';

const AUDIT_DEVICE = 'audit-turbine';
const AUDIT_METRIC = 'temperature';
const BATCH_SIZE = 1000;
const BATCHES = 5;
const EXPECTED_WRITES = BATCH_SIZE * BATCHES;
const TARGET_WRITES_PER_SEC = 5000;
const DEFAULT_OUTPUT = fileURLToPath(new URL('../artifacts/ingestion-audit.json', import.meta.url));

function timeSeriesStats(stats) {
  const timeseries = stats?.timeseries || {};
  return {
    bucketCount: timeseries.bucketCount ?? null,
    avgBucketSize: timeseries.avgBucketSize ?? null,
  };
}

function storageSnapshot(stats) {
  return {
    size: stats?.size ?? 0,
    storageSize: stats?.storageSize ?? 0,
    totalIndexSize: stats?.totalIndexSize ?? 0,
    timeseries: timeSeriesStats(stats),
  };
}

async function main() {
  await connectDatabase();
  try {
    const db = mongoose.connection.db;
    const collectionInfo = (await db.listCollections({ name: config.telemetryCollection }).toArray())[0];
    const timeSeriesOptions = collectionInfo?.options?.timeseries || null;
    const beforeStats = await db.command({ collStats: config.telemetryCollection });
    const beforeCount = await Telemetry.countDocuments();
    await Telemetry.deleteMany({ 'metadata.deviceId': AUDIT_DEVICE, 'metadata.metric': AUDIT_METRIC });

    const start = Date.now();
    let inserted = 0;
    for (let b = 0; b < BATCHES; b += 1) {
      const now = Date.now();
      const docs = Array.from({ length: BATCH_SIZE }, (_, i) => {
        const idx = b * BATCH_SIZE + i;
        return {
          timestamp: new Date(now + idx),
          value: 70 + (idx % 50) * 0.5,
          metadata: {
            deviceId: AUDIT_DEVICE,
            metric: AUDIT_METRIC,
            unit: 'C',
            source: 'audit',
            tags: ['week1-audit'],
          },
        };
      });
      const result = await Telemetry.insertMany(docs, { ordered: false });
      inserted += result.length;
    }

    const elapsedMs = Math.max(Date.now() - start, 1);
    const writesPerSec = Math.round((inserted / elapsedMs) * 1000);
    const afterStats = await db.command({ collStats: config.telemetryCollection });
    const afterCount = await Telemetry.countDocuments();
    const sample = await Telemetry.find({ 'metadata.deviceId': AUDIT_DEVICE })
      .sort({ timestamp: -1 })
      .limit(1)
      .lean();
    await Telemetry.deleteMany({ 'metadata.deviceId': AUDIT_DEVICE, 'metadata.metric': AUDIT_METRIC });

    const meetsWriteTarget = writesPerSec >= TARGET_WRITES_PER_SEC;
    const insertedAllDocuments = inserted === EXPECTED_WRITES;
    const isTimeSeries = Boolean(timeSeriesOptions);
    const ok = meetsWriteTarget && insertedAllDocuments && isTimeSeries;
    const before = storageSnapshot(beforeStats);
    const after = storageSnapshot(afterStats);

    const report = {
      ok,
      runAt: new Date().toISOString(),
      mongo: {
        db: config.mongoDb,
        collection: config.telemetryCollection,
        timeSeries: timeSeriesOptions,
      },
      target: {
        requestedWritesPerSec: TARGET_WRITES_PER_SEC,
        expectedWrites: EXPECTED_WRITES,
        inserted,
        batches: BATCHES,
        batchSize: BATCH_SIZE,
      },
      performance: {
        elapsedMs,
        writesPerSec,
        meetsWriteTarget,
        insertedAllDocuments,
      },
      storage: {
        before: { ...before, documentCount: beforeCount },
        after: { ...after, documentCount: afterCount },
        delta: {
          documentCount: afterCount - beforeCount,
          size: after.size - before.size,
          storageSize: after.storageSize - before.storageSize,
          totalIndexSize: after.totalIndexSize - before.totalIndexSize,
          bucketCount: after.timeseries.bucketCount - before.timeseries.bucketCount,
          avgBucketSize: after.timeseries.avgBucketSize - before.timeseries.avgBucketSize,
        },
      },
      auditSample: sample[0] || null,
    };

    const outputPath = process.env.AUDIT_OUTPUT
      ? path.resolve(process.env.AUDIT_OUTPUT)
      : DEFAULT_OUTPUT;
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

    console.log(JSON.stringify({ ...report, artifact: outputPath }, null, 2));
    if (!ok) process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(async (error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  try { await mongoose.disconnect(); } catch {}
  process.exitCode = 1;
});

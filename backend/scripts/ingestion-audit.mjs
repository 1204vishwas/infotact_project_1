import mongoose from 'mongoose';
import { connectDatabase } from '../src/config/db.js';
import { Telemetry } from '../src/models/Telemetry.js';
import { config } from '../src/config/env.js';

const AUDIT_DEVICE = 'audit-turbine';
const AUDIT_METRIC = 'temperature';
const BATCH_SIZE = 1000;
const BATCHES = 5; // 5k points

async function main() {
  await connectDatabase();
  const db = mongoose.connection.db;
  const beforeInfo = (await db.listCollections({ name: config.telemetryCollection }).toArray())[0];
  const beforeStats = await db.command({ collStats: config.telemetryCollection });
  await Telemetry.deleteMany({ 'metadata.deviceId': AUDIT_DEVICE, 'metadata.metric': AUDIT_METRIC });

  const start = Date.now();
  let inserted = 0;
  for (let b = 0; b < BATCHES; b++) {
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
    const res = await Telemetry.insertMany(docs, { ordered: false });
    inserted += res.length;
  }
  const elapsedMs = Date.now() - start;
  const writesPerSec = Math.round((inserted / elapsedMs) * 1000);

  const afterStats = await db.command({ collStats: config.telemetryCollection });
  const sample = await Telemetry.find({ 'metadata.deviceId': AUDIT_DEVICE }).sort({ timestamp: -1 }).limit(1).lean();
  await Telemetry.deleteMany({ 'metadata.deviceId': AUDIT_DEVICE, 'metadata.metric': AUDIT_METRIC });

  console.log(JSON.stringify({
    ok: true,
    mongo: { db: config.mongoDb, collection: config.telemetryCollection, timeSeries: beforeInfo?.options?.timeseries || null },
    target: { requestedWritesPerSec: 5000, inserted, batches: BATCHES, batchSize: BATCH_SIZE },
    performance: { elapsedMs, writesPerSec, meets5000WritesPerSec: writesPerSec >= 5000 },
    storage: {
      before: { count: beforeStats.count, size: beforeStats.size, storageSize: beforeStats.storageSize, totalIndexSize: beforeStats.totalIndexSize },
      after: { count: afterStats.count, size: afterStats.size, storageSize: afterStats.storageSize, totalIndexSize: afterStats.totalIndexSize },
      delta: { count: (afterStats.count ?? 0) - (beforeStats.count ?? 0), size: afterStats.size - beforeStats.size, storageSize: afterStats.storageSize - beforeStats.storageSize, totalIndexSize: afterStats.totalIndexSize - beforeStats.totalIndexSize },
    },
    auditSample: sample[0] || null,
  }, null, 2));
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});

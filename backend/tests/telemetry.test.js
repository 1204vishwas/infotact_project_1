import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTelemetryDoc } from '../middleware/validateTelemetry.js';
import { connectToDatabase, closeDatabase } from '../config/db.js';
import { ensureTelemetryCollection, TELEMETRY_COLLECTION_NAME } from '../models/telemetryCollection.js';
import { telemetryService } from '../services/telemetryService.js';
import { telemetryBuffer, TelemetryBuffer } from '../services/telemetryBuffer.js';
import { createApp } from '../app.js';

let db;
let appServer;
let baseUrl;

test.before(async () => {
  const connection = await connectToDatabase();
  db = connection.db;
  await ensureTelemetryCollection(db);

  const app = createApp();
  await new Promise((resolve) => {
    appServer = app.listen(0, () => {
      const port = appServer.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

test.after(async () => {
  await telemetryBuffer.stop();
  if (appServer) {
    await new Promise((resolve) => appServer.close(resolve));
  }
  await closeDatabase();
});

test('Telemetry Validation & Document Normalization', async (t) => {
  await t.test('accepts valid telemetry payload and formats Date', () => {
    const raw = {
      timestamp: '2026-11-16T10:00:00.000Z',
      metadata: {
        deviceId: 'TEST-DEV-01',
        facilityId: 'PLANT-A'
      },
      metrics: {
        temperature_c: 62.5,
        voltage_v: 230.2
      }
    };

    const doc = normalizeTelemetryDoc(raw);
    assert.equal(doc.metadata.deviceId, 'TEST-DEV-01');
    assert.equal(doc.metadata.deviceType, 'sensor_node');
    assert.equal(doc.metadata.facilityId, 'PLANT-A');
    assert.ok(doc.timestamp instanceof Date);
    assert.equal(doc.timestamp.toISOString(), '2026-11-16T10:00:00.000Z');
    assert.equal(doc.status, 'nominal');
  });

  await t.test('automatically assigns critical status when thresholds are exceeded', () => {
    const raw = {
      metadata: { deviceId: 'TEST-DEV-02' },
      metrics: { temperature_c: 91.0 }
    };
    const doc = normalizeTelemetryDoc(raw);
    assert.equal(doc.status, 'critical');
  });

  await t.test('automatically assigns warning status when warning threshold exceeded', () => {
    const raw = {
      metadata: { deviceId: 'TEST-DEV-03' },
      metrics: { temperature_c: 77.0 }
    };
    const doc = normalizeTelemetryDoc(raw);
    assert.equal(doc.status, 'warning');
  });

  await t.test('throws on missing or whitespace deviceId', () => {
    assert.throws(() => {
      normalizeTelemetryDoc({
        metadata: {},
        metrics: { temp: 20 }
      });
    }, /Missing or empty "metadata.deviceId"/);

    assert.throws(() => {
      normalizeTelemetryDoc({
        metadata: { deviceId: '   ' },
        metrics: { temp: 20 }
      });
    }, /Missing or empty "metadata.deviceId"/);
  });

  await t.test('throws on missing metrics object', () => {
    assert.throws(() => {
      normalizeTelemetryDoc({
        metadata: { deviceId: 'DEV-01' }
      });
    }, /Missing or empty "metrics"/);
  });
});

test('MongoDB Time-Series Collection & Operations', async (t) => {
  await t.test('ensures collection exists and has time-series indexes', async () => {
    const coll = db.collection(TELEMETRY_COLLECTION_NAME);
    const indexes = await coll.indexes();
    const indexNames = indexes.map(idx => idx.name);

    assert.ok(indexNames.includes('idx_device_timestamp'));
    assert.ok(indexNames.includes('idx_facility_timestamp'));
    assert.ok(indexNames.includes('idx_devicetype_timestamp'));
  });

  await t.test('inserts single telemetry measurement', async () => {
    const doc = {
      timestamp: new Date(),
      metadata: {
        deviceId: 'TURBINE-TEST-99',
        deviceType: 'test_turbine',
        facilityId: 'LAB-01'
      },
      metrics: {
        temperature_c: 71.4,
        vibration_g: 0.12,
        voltage_v: 229.8
      },
      status: 'nominal'
    };

    const res = await telemetryService.ingestSingle(doc);
    assert.ok(res.insertedId);
    assert.ok(typeof res.durationMs === 'number');
  });

  await t.test('inserts batch of measurements using unordered insertMany', async () => {
    const batch = [];
    const now = Date.now();
    for (let i = 0; i < 50; i++) {
      batch.push({
        timestamp: new Date(now - i * 1000),
        metadata: {
          deviceId: 'TURBINE-TEST-99',
          deviceType: 'test_turbine',
          facilityId: 'LAB-01'
        },
        metrics: {
          temperature_c: 65 + (i * 0.2),
          vibration_g: 0.2
        },
        status: i > 40 ? 'warning' : 'nominal'
      });
    }

    const res = await telemetryService.ingestBatch(batch);
    assert.equal(res.insertedCount, 50);
    assert.ok(res.pointsPerSecond > 0);
  });

  await t.test('retrieves latest reading for device', async () => {
    const latest = await telemetryService.getLatestTelemetry('TURBINE-TEST-99');
    assert.ok(latest);
    assert.equal(latest.metadata.deviceId, 'TURBINE-TEST-99');
    assert.ok(latest.metrics.temperature_c > 0);
  });

  await t.test('executes downsampling aggregation pipeline', async () => {
    const buckets = await telemetryService.aggregateTelemetry({
      deviceId: 'TURBINE-TEST-99',
      unit: 'second',
      binSize: 10
    });

    assert.ok(Array.isArray(buckets));
    assert.ok(buckets.length > 0);
    assert.ok(buckets[0].sampleCount > 0);
    assert.ok(buckets[0].metrics.temperature.avg !== undefined);
  });

  await t.test('retrieves collection and bucket stats', async () => {
    const stats = await telemetryService.getStats();
    assert.equal(stats.collection, TELEMETRY_COLLECTION_NAME);
    assert.equal(stats.database, process.env.MONGODB_DB_NAME || 'nexus');
    assert.ok(stats.estimatedMeasurements > 0);
  });
});

test('In-Memory Micro-Batch TelemetryBuffer', async (t) => {
  const buffer = new TelemetryBuffer({
    maxBatchSize: 10,
    flushIntervalMs: 50
  });

  t.after(async () => {
    await buffer.stop();
  });

  await t.test('queues and flushes micro-batches', async () => {
    for (let i = 0; i < 15; i++) {
      buffer.enqueue({
        timestamp: new Date(),
        metadata: { deviceId: 'BUFFER-DEV-01' },
        metrics: { val: i },
        status: 'nominal'
      });
    }

    // Wait for auto-flush
    await new Promise(r => setTimeout(r, 120));

    const stats = buffer.getStats();
    assert.ok(stats.totalFlushed >= 10);
  });
});

test('Express Telemetry HTTP Endpoints', async (t) => {
  await t.test('GET /health returns 200 and UP', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'UP');
  });

  await t.test('POST /api/telemetry/single ingests single point', async () => {
    const res = await fetch(`${baseUrl}/api/telemetry/single`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        metadata: { deviceId: 'EXPRESS-TEST-01', facilityId: 'HQ' },
        metrics: { temperature_c: 45.5, voltage_v: 231 }
      })
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.insertedId);
  });

  await t.test('POST /api/telemetry/batch ingests array of points', async () => {
    const points = [
      { metadata: { deviceId: 'EXPRESS-TEST-02' }, metrics: { val: 1 } },
      { metadata: { deviceId: 'EXPRESS-TEST-02' }, metrics: { val: 2 } }
    ];

    const res = await fetch(`${baseUrl}/api/telemetry/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(points)
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.count, 2);
  });

  await t.test('POST /api/telemetry/buffer returns 202 Accepted', async () => {
    const res = await fetch(`${baseUrl}/api/telemetry/buffer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        metadata: { deviceId: 'BUFFER-TEST-01' },
        metrics: { val: 99 }
      })
    });

    assert.equal(res.status, 202);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.mode, 'buffered_single');
  });

  await t.test('GET /api/telemetry/latest/:deviceId returns data', async () => {
    const res = await fetch(`${baseUrl}/api/telemetry/latest/EXPRESS-TEST-01`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.deviceId, 'EXPRESS-TEST-01');
    assert.equal(body.data.metrics.temperature_c, 45.5);
  });

  await t.test('GET /api/telemetry/stats returns collection stats', async () => {
    const res = await fetch(`${baseUrl}/api/telemetry/stats`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.timeSeriesStats.collection, 'hardware_telemetry');
  });

  await t.test('POST /api/telemetry/single fails on missing deviceId', async () => {
    const res = await fetch(`${baseUrl}/api/telemetry/single`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        metadata: {},
        metrics: { temp: 20 }
      })
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
  });

  await t.test('GET /api/telemetry/aggregate rejects invalid unit parameter', async () => {
    const res = await fetch(`${baseUrl}/api/telemetry/aggregate?unit=invalid_unit`);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.match(body.error, /Invalid "unit" parameter/);
  });

  await t.test('handles malformed JSON body gracefully with 400 status', async () => {
    const res = await fetch(`${baseUrl}/api/telemetry/single`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"invalid": JSON'
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.match(body.error, /Malformed JSON payload/);
  });
});

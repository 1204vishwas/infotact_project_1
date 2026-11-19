import { getDatabase } from '../config/db.js';
import { TELEMETRY_COLLECTION_NAME } from '../models/telemetryCollection.js';

export class TelemetryService {
  get collection() {
    const db = getDatabase();
    return db.collection(TELEMETRY_COLLECTION_NAME);
  }

  /**
   * Ingest a single telemetry document.
   */
  async ingestSingle(doc) {
    const startTime = performance.now();
    const result = await this.collection.insertOne(doc);
    const durationMs = performance.now() - startTime;

    return {
      insertedId: result.insertedId,
      durationMs: parseFloat(durationMs.toFixed(3))
    };
  }

  /**
   * High-throughput bulk ingestion using unordered insertMany.
   * `ordered: false` allows parallelized execution and continuous processing even if a document fails.
   */
  async ingestBatch(docs) {
    if (!docs || docs.length === 0) {
      return { insertedCount: 0, durationMs: 0 };
    }

    const startTime = performance.now();
    const result = await this.collection.insertMany(docs, {
      ordered: false
    });
    const durationMs = performance.now() - startTime;
    const writeRate = Math.round((result.insertedCount / (durationMs / 1000)));

    return {
      insertedCount: result.insertedCount,
      durationMs: parseFloat(durationMs.toFixed(2)),
      pointsPerSecond: writeRate
    };
  }

  /**
   * Fetch the most recent reading for a given deviceId using the index.
   */
  async getLatestTelemetry(deviceId) {
    const query = { 'metadata.deviceId': deviceId };
    return await this.collection
      .find(query)
      .sort({ timestamp: -1 })
      .limit(1)
      .next();
  }

  /**
   * Time-Series Downsampling & Aggregation Pipeline
   * Groups telemetry readings into time buckets (e.g. 1 minute, 5 minutes, 1 hour)
   * and computes min, max, avg, and sample counts.
   */
  async aggregateTelemetry({ deviceId, unit = 'minute', binSize = 1, startDate, endDate }) {
    const matchStage = {};

    if (deviceId) {
      matchStage['metadata.deviceId'] = deviceId;
    }

    if (startDate || endDate) {
      matchStage.timestamp = {};
      if (startDate) matchStage.timestamp.$gte = new Date(startDate);
      if (endDate) matchStage.timestamp.$lte = new Date(endDate);
    }

    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: {
            bucket: {
              $dateTrunc: {
                date: '$timestamp',
                unit: unit, // 'second' | 'minute' | 'hour' | 'day'
                binSize: binSize
              }
            },
            deviceId: '$metadata.deviceId'
          },
          count: { $sum: 1 },
          avg_temp: { $avg: '$metrics.temperature_c' },
          max_temp: { $max: '$metrics.temperature_c' },
          min_temp: { $min: '$metrics.temperature_c' },
          avg_vibration: { $avg: '$metrics.vibration_g' },
          max_vibration: { $max: '$metrics.vibration_g' },
          avg_voltage: { $avg: '$metrics.voltage_v' },
          avg_cpu: { $avg: '$metrics.cpu_usage_pct' },
          max_cpu: { $max: '$metrics.cpu_usage_pct' },
          statusWarningCount: {
            $sum: { $cond: [{ $eq: ['$status', 'warning'] }, 1, 0] }
          },
          statusCriticalCount: {
            $sum: { $cond: [{ $eq: ['$status', 'critical'] }, 1, 0] }
          }
        }
      },
      {
        $project: {
          _id: 0,
          timestamp: '$_id.bucket',
          deviceId: '$_id.deviceId',
          sampleCount: '$count',
          metrics: {
            temperature: {
              avg: { $round: ['$avg_temp', 2] },
              max: { $round: ['$max_temp', 2] },
              min: { $round: ['$min_temp', 2] }
            },
            vibration: {
              avg: { $round: ['$avg_vibration', 3] },
              max: { $round: ['$max_vibration', 3] }
            },
            voltage: {
              avg: { $round: ['$avg_voltage', 2] }
            },
            cpu_usage: {
              avg: { $round: ['$avg_cpu', 2] },
              max: { $round: ['$max_cpu', 2] }
            }
          },
          alerts: {
            warnings: '$statusWarningCount',
            criticals: '$statusCriticalCount'
          }
        }
      },
      { $sort: { timestamp: 1 } }
    ];

    return await this.collection.aggregate(pipeline).toArray();
  }

  /**
   * Retrieve detected anomalies / critical states.
   */
  async getAnomalies({ limit = 50, deviceId } = {}) {
    const query = {
      $or: [
        { status: { $in: ['warning', 'critical'] } },
        { 'metrics.temperature_c': { $gt: 80 } },
        { 'metrics.vibration_g': { $gt: 1.0 } }
      ]
    };

    if (deviceId) {
      query['metadata.deviceId'] = deviceId;
    }

    return await this.collection
      .find(query)
      .sort({ timestamp: -1 })
      .limit(Math.min(limit, 500))
      .toArray();
  }

  /**
   * Return collection and time-series bucket storage statistics.
   */
  async getStats() {
    const db = getDatabase();
    const count = await this.collection.estimatedDocumentCount();

    // Check underlying bucket collection
    const bucketCollection = db.collection(`system.buckets.${TELEMETRY_COLLECTION_NAME}`);
    const bucketCount = await bucketCollection.estimatedDocumentCount().catch(() => 0);

    const collStats = await db.command({
      collStats: TELEMETRY_COLLECTION_NAME
    }).catch(err => ({ error: err.message }));

    return {
      collection: TELEMETRY_COLLECTION_NAME,
      database: db.databaseName,
      estimatedMeasurements: count,
      bucketCount,
      compressionRatio: bucketCount > 0 ? (count / bucketCount).toFixed(2) + ' measurements/bucket' : 'N/A',
      storageSize: collStats.storageSize || null,
      totalIndexSize: collStats.totalIndexSize || null,
      timeSeriesSettings: collStats.timeseries || null
    };
  }
}

export const telemetryService = new TelemetryService();

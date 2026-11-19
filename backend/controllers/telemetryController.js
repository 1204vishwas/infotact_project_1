import { telemetryService } from '../services/telemetryService.js';
import { telemetryBuffer } from '../services/telemetryBuffer.js';

const ALLOWED_UNITS = new Set([
  'year', 'quarter', 'month', 'week', 'day', 'hour', 'minute', 'second', 'millisecond'
]);

export const telemetryController = {
  /**
   * POST /api/telemetry/single
   * Synchronous single metric write
   */
  async ingestSingle(req, res) {
    try {
      if (!req.validatedDoc) {
        return res.status(400).json({
          success: false,
          error: 'Missing validated telemetry document'
        });
      }

      const result = await telemetryService.ingestSingle(req.validatedDoc);
      return res.status(201).json({
        success: true,
        message: 'Telemetry point ingested',
        insertedId: result.insertedId,
        durationMs: result.durationMs
      });
    } catch (err) {
      console.error('[Controller:ingestSingle] Error:', err);
      return res.status(500).json({
        success: false,
        error: 'Failed to ingest telemetry point',
        details: err.message
      });
    }
  },

  /**
   * POST /api/telemetry/batch
   * High-speed bulk write
   */
  async ingestBatch(req, res) {
    try {
      const docs = req.validatedDocs;
      if (!docs || docs.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Missing or empty batch of telemetry documents'
        });
      }

      const result = await telemetryService.ingestBatch(docs);

      return res.status(201).json({
        success: true,
        message: `Batch of ${result.insertedCount} points ingested successfully`,
        count: result.insertedCount,
        durationMs: result.durationMs,
        pointsPerSecond: result.pointsPerSecond
      });
    } catch (err) {
      console.error('[Controller:ingestBatch] Error:', err);
      return res.status(500).json({
        success: false,
        error: 'Failed to ingest telemetry batch',
        details: err.message
      });
    }
  },

  /**
   * POST /api/telemetry/buffer
   * High-throughput micro-batch buffer ingestion (sub-millisecond latency)
   */
  async ingestBuffer(req, res) {
    try {
      if (req.validatedDocs && req.validatedDocs.length > 0) {
        // Enqueue batch
        const status = telemetryBuffer.enqueueBatch(req.validatedDocs);
        return res.status(202).json({
          success: true,
          mode: 'buffered_batch',
          enqueued: req.validatedDocs.length,
          queueDepth: status.queueDepth
        });
      } else if (req.validatedDoc) {
        // Enqueue single
        const status = telemetryBuffer.enqueue(req.validatedDoc);
        return res.status(202).json({
          success: true,
          mode: 'buffered_single',
          enqueued: 1,
          queueDepth: status.queueDepth
        });
      }

      return res.status(400).json({
        success: false,
        error: 'No valid telemetry record provided for buffer'
      });
    } catch (err) {
      console.error('[Controller:ingestBuffer] Error:', err);
      return res.status(500).json({
        success: false,
        error: 'Failed to buffer telemetry',
        details: err.message
      });
    }
  },

  /**
   * GET /api/telemetry/latest/:deviceId
   */
  async getLatest(req, res) {
    try {
      const deviceId = req.params.deviceId ? String(req.params.deviceId).trim() : '';
      if (!deviceId) {
        return res.status(400).json({
          success: false,
          error: 'Parameter "deviceId" is required and cannot be empty'
        });
      }

      const reading = await telemetryService.getLatestTelemetry(deviceId);

      if (!reading) {
        return res.status(404).json({
          success: false,
          error: `No telemetry found for device "${deviceId}"`
        });
      }

      return res.json({
        success: true,
        deviceId,
        data: reading
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: 'Failed to query latest telemetry',
        details: err.message
      });
    }
  },

  /**
   * GET /api/telemetry/aggregate
   */
  async aggregate(req, res) {
    try {
      const { deviceId, unit = 'minute', binSize = 1, startDate, endDate } = req.query;

      const normalizedUnit = typeof unit === 'string' ? unit.trim().toLowerCase() : 'minute';
      if (!ALLOWED_UNITS.has(normalizedUnit)) {
        return res.status(400).json({
          success: false,
          error: `Invalid "unit" parameter: "${unit}". Allowed: ${Array.from(ALLOWED_UNITS).join(', ')}`
        });
      }

      const parsedBinSize = parseInt(binSize, 10);
      if (isNaN(parsedBinSize) || parsedBinSize < 1) {
        return res.status(400).json({
          success: false,
          error: 'Parameter "binSize" must be a positive integer'
        });
      }

      if (startDate && isNaN(new Date(startDate).getTime())) {
        return res.status(400).json({
          success: false,
          error: `Invalid "startDate" ISO format: "${startDate}"`
        });
      }

      if (endDate && isNaN(new Date(endDate).getTime())) {
        return res.status(400).json({
          success: false,
          error: `Invalid "endDate" ISO format: "${endDate}"`
        });
      }

      const data = await telemetryService.aggregateTelemetry({
        deviceId: deviceId ? String(deviceId).trim() : undefined,
        unit: normalizedUnit,
        binSize: parsedBinSize,
        startDate,
        endDate
      });

      return res.json({
        success: true,
        count: data.length,
        timeUnit: normalizedUnit,
        binSize: parsedBinSize,
        data
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: 'Failed to execute aggregation query',
        details: err.message
      });
    }
  },

  /**
   * GET /api/telemetry/anomalies
   */
  async getAnomalies(req, res) {
    try {
      const { limit = 50, deviceId } = req.query;
      const parsedLimit = parseInt(limit, 10);
      const safeLimit = isNaN(parsedLimit) || parsedLimit < 1 ? 50 : Math.min(parsedLimit, 500);

      const anomalies = await telemetryService.getAnomalies({
        limit: safeLimit,
        deviceId: deviceId ? String(deviceId).trim() : undefined
      });

      return res.json({
        success: true,
        count: anomalies.length,
        anomalies
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: 'Failed to query anomalies',
        details: err.message
      });
    }
  },

  /**
   * GET /api/telemetry/stats
   */
  async getStats(req, res) {
    try {
      const stats = await telemetryService.getStats();
      const bufferStats = telemetryBuffer.getStats();

      return res.json({
        success: true,
        timeSeriesStats: stats,
        bufferStats
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: 'Failed to retrieve stats',
        details: err.message
      });
    }
  }
};

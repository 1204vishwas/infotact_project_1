import { config } from '../config/env.js';
import { Telemetry } from '../models/Telemetry.js';
import { eventBus } from '../services/eventBus.js';
import { ruleEngine } from '../services/ruleEngine.js';

function normalizePoint(point) {
  const timestamp = point.timestamp ? new Date(point.timestamp) : new Date();
  const deviceId = point.deviceId ?? point?.metadata?.deviceId;
  const metric = point.metric ?? point?.metadata?.metric;
  const value = Number(point.value);

  if (!deviceId || !metric || Number.isNaN(value) || Number.isNaN(timestamp.getTime())) {
    return null;
  }

  return {
    timestamp,
    value,
    metadata: {
      deviceId: String(deviceId),
      metric: String(metric),
      unit: point.unit ?? point?.metadata?.unit ?? '',
      source: point.source ?? point?.metadata?.source ?? 'simulator',
      tags: Array.isArray(point.tags) ? point.tags : point?.metadata?.tags ?? [],
    },
  };
}

function toRealtimePoint(doc) {
  return {
    timestamp: doc.timestamp instanceof Date ? doc.timestamp.toISOString() : doc.timestamp,
    deviceId: doc.metadata.deviceId,
    metric: doc.metadata.metric,
    value: doc.value,
    unit: doc.metadata.unit,
    source: doc.metadata.source,
  };
}

export async function ingestTelemetry(req, res) {
  try {
    const body = req.body;
    const points = Array.isArray(body) ? body : [body];

    if (points.length === 0) {
      return res.status(400).json({ error: 'Telemetry payload is empty' });
    }
    if (points.length > config.ingestBatchLimit) {
      return res.status(413).json({ error: `Batch exceeds limit of ${config.ingestBatchLimit}` });
    }

    const docs = points.map(normalizePoint).filter(Boolean);
    if (docs.length === 0) {
      return res.status(400).json({ error: 'No valid telemetry points found in payload' });
    }

    await Telemetry.insertMany(docs, { ordered: false });

    // Feed every active compiled RxJS pipeline before responding so all rules
    // and WebSocket clients see the same ingestion instantly.
    const evaluation = ruleEngine.pushBatch(docs);

    eventBus.emit('telemetry', {
      points: docs.map(toRealtimePoint),
      accepted: docs.length,
      rejected: points.length - docs.length,
      evaluated: evaluation.evaluations,
      activeRules: evaluation.rules,
      receivedAt: new Date().toISOString(),
    });

    return res.status(202).json({
      accepted: docs.length,
      rejected: points.length - docs.length,
      evaluated: evaluation.evaluations,
      pointsEvaluated: evaluation.points,
      activeRules: evaluation.rules,
      ruleActive: evaluation.rules > 0,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to ingest telemetry', detail: error.message });
  }
}

export async function getRecentTelemetry(req, res) {
  try {
    const { deviceId, metric, limit = 100 } = req.query;
    const query = {};

    if (deviceId) query['metadata.deviceId'] = String(deviceId);
    if (metric) query['metadata.metric'] = String(metric);

    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 1000);
    const items = await Telemetry.find(query).sort({ timestamp: -1 }).limit(safeLimit).lean();

    return res.json({ items, count: items.length });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch telemetry', detail: error.message });
  }
}

export async function getTelemetryStats(req, res) {
  try {
    const { deviceId, metric } = req.query;
    const match = {};

    if (deviceId) match['metadata.deviceId'] = String(deviceId);
    if (metric) match['metadata.metric'] = String(metric);

    const [stats] = await Telemetry.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          min: { $min: '$value' },
          max: { $max: '$value' },
          avg: { $avg: '$value' },
          latest: { $max: '$timestamp' },
        },
      },
    ]);

    return res.json(stats || { count: 0, min: null, max: null, avg: null, latest: null });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to compute telemetry stats', detail: error.message });
  }
}

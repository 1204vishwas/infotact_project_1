import { Alert } from '../models/Alert.js';

export async function listAlerts(req, res) {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 500);
    const query = { ownerId: String(req.user.id) };

    if (req.query.nodeId) query.nodeId = String(req.query.nodeId);
    if (req.query.kind) query.kind = String(req.query.kind);
    if (req.query.runtimeId) query.runtimeId = String(req.query.runtimeId);
    if (req.query.graphId) query.graphId = String(req.query.graphId);
    if (req.query.since) {
      const since = new Date(String(req.query.since));
      if (!Number.isNaN(since.getTime())) {
        query.triggeredAt = { $gte: since };
      }
    }

    const items = await Alert.find(query).sort({ triggeredAt: -1 }).limit(limit).lean();
    return res.json({ items, count: items.length });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch alerts', detail: error.message });
  }
}

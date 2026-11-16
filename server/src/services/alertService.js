import { Alert } from '../models/Alert.js';
import { eventBus } from './eventBus.js';
import { ruleEngine } from './ruleEngine.js';

function toAlertDocument(action) {
  const triggeredAt = action?.triggeredAt ? new Date(action.triggeredAt) : new Date();
  return {
    nodeId: String(action?.nodeId || 'unknown'),
    runtimeId: action?.runtimeId != null ? String(action.runtimeId) : null,
    graphId: action?.graphId != null ? String(action.graphId) : null,
    ruleName: String(action?.ruleName || ''),
    ownerId: action?.ownerId != null ? String(action.ownerId) : null,
    ownerEmail: action?.ownerEmail || null,
    kind: String(action?.kind || 'log'),
    label: String(action?.label || ''),
    target: action?.target != null ? String(action.target) : null,
    channel: action?.channel != null ? String(action.channel) : null,
    message: String(action?.message || ''),
    payload: action?.payload ?? null,
    triggeredAt: Number.isNaN(triggeredAt.getTime()) ? new Date() : triggeredAt,
  };
}

/**
 * Persists every action triggered by the active rule and publishes it on the
 * event bus so the WebSocket hub can broadcast it to connected dashboards.
 */
export function initAlertService() {
  const handleAlert = async (action) => {
    let record;
    try {
      const doc = await Alert.create(toAlertDocument(action));
      record = { ...doc.toObject(), persisted: true };
    } catch (error) {
      console.error('[alerts] Failed to persist alert:', error.message);
      record = { ...action, persisted: false };
    }

    eventBus.emit('alert', record);
  };

  ruleEngine.on('alert', handleAlert);
  return () => ruleEngine.off('alert', handleAlert);
}

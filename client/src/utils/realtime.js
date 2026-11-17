/**
 * Small pure helpers shared by the realtime hook and the canvas. Keeping them
 * out of the React components makes them testable with `node --test`.
 */

export function resolveWsUrl(env = import.meta.env ?? {}, location = globalThis.location) {
  const explicit = String(env.VITE_WS_URL || '').trim();
  if (explicit) return explicit.replace(/\/$/, '');

  const apiBase = String(env.VITE_API_BASE_URL || '').trim().replace(/\/$/, '');
  if (apiBase) return `${apiBase.replace(/^http/, 'ws')}/ws`;

  const protocol = location?.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = location?.host || 'localhost';
  return `${protocol}//${host}/ws`;
}

export function withToken(url, token) {
  if (!token) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}token=${encodeURIComponent(token)}`;
}

function alertKey(alert) {
  if (!alert) return '';
  if (alert._id) return `id:${alert._id}`;
  if (alert.id) return `id:${alert.id}`;
  return `${alert.nodeId || ''}|${alert.triggeredAt || ''}|${alert.message || ''}`;
}

function alertTime(alert) {
  const value = new Date(alert?.triggeredAt || alert?.createdAt || 0).getTime();
  return Number.isNaN(value) ? 0 : value;
}

/**
 * Merges live WebSocket alerts with persisted history, removing the overlap
 * that occurs when an alert arrives by both routes, newest first.
 */
export function mergeAlerts(live = [], history = [], max = 50) {
  const seen = new Set();
  const merged = [];

  for (const alert of [...live, ...history]) {
    const key = alertKey(alert);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(alert);
  }

  merged.sort((a, b) => alertTime(b) - alertTime(a));
  return merged.slice(0, max);
}

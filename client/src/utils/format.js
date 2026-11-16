export function toNumberOr(value, fallback) {
  if (value === '' || value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function formatTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString();
}

export function formatMetricValue(value, unit = '') {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '—';
  return `${parsed.toFixed(2)}${unit ? ` ${unit}` : ''}`;
}

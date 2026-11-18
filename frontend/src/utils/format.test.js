import test from 'node:test';
import assert from 'node:assert/strict';
import { formatMetricValue, formatTime, toNumberOr } from './format.js';

test('toNumberOr keeps finite numbers and falls back otherwise', () => {
  assert.equal(toNumberOr('42.5', 0), 42.5);
  assert.equal(toNumberOr('', 80), 80);
  assert.equal(toNumberOr(null, 5), 5);
  assert.equal(toNumberOr('not-a-number', 7), 7);
});

test('formatTime renders a placeholder for missing or invalid values', () => {
  assert.equal(formatTime(null), '—');
  assert.equal(formatTime('not-a-date'), '—');
  assert.equal(typeof formatTime('2026-01-01T12:00:00Z'), 'string');
});

test('formatMetricValue never renders NaN', () => {
  assert.equal(formatMetricValue('82.456', 'C'), '82.46 C');
  assert.equal(formatMetricValue('82', ''), '82.00');
  assert.equal(formatMetricValue('nope', 'C'), '—');
});

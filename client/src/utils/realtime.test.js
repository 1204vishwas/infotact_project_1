import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeAlerts, resolveWsUrl, withToken } from './realtime.js';

test('prefers an explicit WebSocket URL', () => {
  assert.equal(
    resolveWsUrl({ VITE_WS_URL: 'wss://api.example.com/ws/', VITE_API_BASE_URL: 'https://ignored' }, {}),
    'wss://api.example.com/ws'
  );
});

test('derives the WebSocket URL from the API base', () => {
  assert.equal(
    resolveWsUrl({ VITE_API_BASE_URL: 'https://api.example.com/' }, {}),
    'wss://api.example.com/ws'
  );
  assert.equal(resolveWsUrl({ VITE_API_BASE_URL: 'http://localhost:5000' }, {}), 'ws://localhost:5000/ws');
});

test('falls back to the current origin and protocol', () => {
  assert.equal(resolveWsUrl({}, { protocol: 'https:', host: 'nexus.example.com' }), 'wss://nexus.example.com/ws');
  assert.equal(resolveWsUrl({}, { protocol: 'http:', host: 'localhost:5173' }), 'ws://localhost:5173/ws');
});

test('appends the token without dropping existing query parameters', () => {
  assert.equal(withToken('ws://localhost/ws', 'abc'), 'ws://localhost/ws?token=abc');
  assert.equal(withToken('ws://localhost/ws?x=1', 'a b'), 'ws://localhost/ws?x=1&token=a%20b');
  assert.equal(withToken('ws://localhost/ws', ''), 'ws://localhost/ws');
});

test('merges alerts, removes duplicates, and keeps newest first', () => {
  const live = [
    { _id: '3', triggeredAt: '2026-01-01T00:00:03Z', message: 'three' },
    { _id: '2', triggeredAt: '2026-01-01T00:00:02Z', message: 'two' },
  ];
  const history = [
    { _id: '2', triggeredAt: '2026-01-01T00:00:02Z', message: 'two' },
    { _id: '1', triggeredAt: '2026-01-01T00:00:01Z', message: 'one' },
  ];

  const merged = mergeAlerts(live, history);
  assert.deepEqual(merged.map((alert) => alert._id), ['3', '2', '1']);
  assert.equal(mergeAlerts(live, history, 2).length, 2);
});

test('deduplicates alerts without ids by node/time/message', () => {
  const alert = { nodeId: 'action-1', triggeredAt: '2026-01-01T00:00:01Z', message: 'fired' };
  const merged = mergeAlerts([alert], [{ ...alert }]);
  assert.equal(merged.length, 1);
});

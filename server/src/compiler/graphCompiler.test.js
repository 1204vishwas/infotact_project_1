import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateGraph, validateGraph } from './graphCompiler.js';

function buildGraph({ threshold = 80, windowSize = 1 } = {}) {
  return {
    version: 2,
    nodes: [
      {
        id: 'source-1',
        type: 'dataSource',
        position: { x: 0, y: 0 },
        data: { label: 'Turbine Sensor', kind: 'sensor', deviceId: 'turbine-01', metric: 'temperature', unit: 'C' },
      },
      {
        id: 'math-1',
        type: 'mathOperation',
        position: { x: 200, y: 0 },
        data: { label: 'Moving Average', kind: 'movingAverage', windowSize },
      },
      {
        id: 'math-2',
        type: 'mathOperation',
        position: { x: 400, y: 0 },
        data: { label: 'Threshold', kind: 'threshold', operator: '>', threshold, field: 'value' },
      },
      {
        id: 'action-1',
        type: 'actionTrigger',
        position: { x: 600, y: 0 },
        data: { label: 'SMS Alert', kind: 'sms', channel: 'sms', target: '+10000000000', message: 'Too hot' },
      },
    ],
    edges: [
      { id: 'e1', source: 'source-1', target: 'math-1' },
      { id: 'e2', source: 'math-1', target: 'math-2' },
      { id: 'e3', source: 'math-2', target: 'action-1' },
    ],
  };
}

test('accepts a valid serialized React Flow graph', () => {
  const result = validateGraph(buildGraph());
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.summary.nodeCount, 4);
  assert.equal(result.summary.edgeCount, 3);
});

test('executes moving average, threshold, and action nodes', () => {
  const result = simulateGraph(buildGraph({ threshold: 80, windowSize: 2 }), [
    { deviceId: 'turbine-01', metric: 'temperature', value: 70 },
    { deviceId: 'turbine-01', metric: 'temperature', value: 85 },
    { deviceId: 'turbine-01', metric: 'temperature', value: 95 },
  ]);

  assert.equal(result.ok, true);
  assert.ok(result.actions.length >= 1);
  assert.equal(result.actions[0].nodeId, 'action-1');
  assert.equal(result.actions[0].kind, 'sms');
  assert.ok(result.trace.length > 0);
});

test('rejects a cyclic graph', () => {
  const graph = buildGraph();
  graph.edges.push({ id: 'cycle', source: 'math-2', target: 'math-1' });

  const result = validateGraph(graph);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /cycle/i);
});

test('rejects unsupported node types', () => {
  const result = validateGraph({
    nodes: [{ id: 'x', type: 'unknownNode', position: { x: 0, y: 0 }, data: {} }],
    edges: [],
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /Unsupported node type/);
});

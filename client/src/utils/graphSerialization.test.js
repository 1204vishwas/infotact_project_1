import test from 'node:test';
import assert from 'node:assert/strict';
import { serializeGraph } from './graphSerialization.js';

/**
 * A branching graph: one source fans out to two math branches which fan back
 * into a single action. This is the shape the mid-review requires proof for.
 */
function complexGraph() {
  return {
    nodes: [
      {
        id: 'source-temperature',
        type: 'dataSource',
        position: { x: 0, y: 120 },
        data: { label: 'Turbine Sensor', kind: 'sensor', deviceId: 'turbine-01', metric: 'temperature', unit: 'C' },
        selected: true,
        dragging: false,
        width: 180,
        positionAbsolute: { x: 0, y: 120 },
      },
      {
        id: 'math-average',
        type: 'mathOperation',
        position: { x: 220, y: 40 },
        data: { label: 'Moving Average', kind: 'movingAverage', windowSize: 3 },
        selected: false,
        width: 180,
      },
      {
        id: 'math-threshold',
        type: 'mathOperation',
        position: { x: 440, y: 40 },
        data: { label: 'Threshold', kind: 'threshold', operator: '>', threshold: 80, field: 'value' },
        selected: false,
        width: 180,
      },
      {
        id: 'math-scale',
        type: 'mathOperation',
        position: { x: 220, y: 240 },
        data: { label: 'Scale', kind: 'scale', factor: 2, offset: 1 },
        selected: false,
        width: 180,
      },
      {
        id: 'action-alert',
        type: 'actionTrigger',
        position: { x: 660, y: 120 },
        data: { label: 'SMS Alert', kind: 'sms', target: '+10000000000', message: 'Too hot' },
        selected: false,
        width: 180,
      },
    ],
    edges: [
      { id: 'e1', source: 'source-temperature', target: 'math-average', sourceHandle: 'out', type: 'smoothstep', selected: true },
      { id: 'e2', source: 'math-average', target: 'math-threshold', type: 'smoothstep' },
      { id: 'e3', source: 'math-threshold', target: 'action-alert', targetHandle: 'in', type: 'smoothstep' },
      { id: 'e4', source: 'source-temperature', target: 'math-scale', type: 'smoothstep' },
      { id: 'e5', source: 'math-scale', target: 'action-alert', targetHandle: 'in', type: 'smoothstep' },
    ],
  };
}

test('serializes a branching React Flow graph into the backend contract', () => {
  const graph = complexGraph();
  const serialized = serializeGraph(graph, new Date('2026-01-02T03:04:05.000Z'));

  assert.equal(serialized.version, 2);
  assert.equal(serialized.exportedAt, '2026-01-02T03:04:05.000Z');
  assert.equal(serialized.nodes.length, 5);
  assert.equal(serialized.edges.length, 5);
  assert.deepEqual(Object.keys(serialized.nodes[0]).sort(), ['data', 'id', 'position', 'type']);
  assert.deepEqual(Object.keys(serialized.edges[0]).sort(), [
    'id', 'source', 'sourceHandle', 'target', 'targetHandle', 'type',
  ]);
  assert.equal(serialized.edges[0].sourceHandle, 'out');
  assert.equal(serialized.edges[2].targetHandle, 'in');
  assert.equal(serialized.edges[1].sourceHandle, null);
  assert.equal(serialized.edges[1].targetHandle, null);
  assert.equal(serialized.edges[1].type, 'smoothstep');
});

test('serialized graph survives a JSON round trip unchanged', () => {
  const serialized = serializeGraph(complexGraph(), new Date('2026-01-02T03:04:05.000Z'));
  const roundTripped = JSON.parse(JSON.stringify(serialized));

  assert.deepEqual(roundTripped, serialized);
  assert.deepEqual(
    roundTripped.nodes.map((node) => node.id),
    ['source-temperature', 'math-average', 'math-threshold', 'math-scale', 'action-alert'],
  );
});

test('defaults missing edge handles and type for hand-written graphs', () => {
  const serialized = serializeGraph({
    nodes: [],
    edges: [{ id: 'e1', source: 'a', target: 'b' }],
  });

  assert.deepEqual(serialized.edges[0], {
    id: 'e1',
    source: 'a',
    target: 'b',
    sourceHandle: null,
    targetHandle: null,
    type: 'default',
  });
});

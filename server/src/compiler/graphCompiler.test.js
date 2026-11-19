import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseReactFlow,
  normalizeGraph,
  validateGraph,
  compileGraph,
  createRuntime,
  simulateGraph,
  LogicCompiler,
} from './graphCompiler.js';

function buildStandardGraph({ threshold = 80, windowSize = 2 } = {}) {
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
        id: 'math-ma',
        type: 'mathOperation',
        position: { x: 200, y: 0 },
        data: { label: 'Moving Average', kind: 'movingAverage', windowSize },
      },
      {
        id: 'math-th',
        type: 'mathOperation',
        position: { x: 400, y: 0 },
        data: { label: 'Threshold', kind: 'threshold', operator: '>', threshold, field: 'value' },
      },
      {
        id: 'action-1',
        type: 'actionTrigger',
        position: { x: 600, y: 0 },
        data: {
          label: 'SMS Alert',
          kind: 'sms',
          channel: 'sms',
          target: '+15551234567',
          message: 'Warning: {deviceId} exceeded threshold with value {value} {unit}',
        },
      },
    ],
    edges: [
      { id: 'e1', source: 'source-1', target: 'math-ma' },
      { id: 'e2', source: 'math-ma', target: 'math-th' },
      { id: 'e3', source: 'math-th', target: 'action-1' },
    ],
  };
}

// -------------------------------------------------------------
// 1. Parsing & Normalization Tests
// -------------------------------------------------------------

test('parseReactFlow: parses raw object graph', () => {
  const raw = buildStandardGraph();
  const normalized = parseReactFlow(raw);
  assert.equal(normalized.nodes.length, 4);
  assert.equal(normalized.edges.length, 3);
  assert.equal(normalized.nodes[0].id, 'source-1');
});

test('parseReactFlow: parses serialized JSON string', () => {
  const jsonStr = JSON.stringify(buildStandardGraph());
  const normalized = parseReactFlow(jsonStr);
  assert.equal(normalized.nodes.length, 4);
  assert.equal(normalized.edges.length, 3);
});

test('parseReactFlow: parses MongoDB SavedGraph wrapper format', () => {
  const doc = {
    _id: '6738df92a54361e05a10982c',
    name: 'Overheat Monitor',
    description: 'Saved industrial pipeline',
    graph: buildStandardGraph(),
  };
  const normalized = parseReactFlow(doc);
  assert.equal(normalized.name, 'Overheat Monitor');
  assert.equal(normalized.nodes.length, 4);
  assert.equal(normalized.edges.length, 3);
});

test('parseReactFlow: rejects invalid JSON string and null inputs', () => {
  assert.throws(() => parseReactFlow(null), /cannot be null/i);
  assert.throws(() => parseReactFlow('{ invalid json: true }'), /Failed to parse React Flow JSON/i);
});

test('normalizeGraph: provides safe defaults for missing positions and handles', () => {
  const raw = {
    nodes: [{ id: 'n1', type: 'source' }],
    edges: [{ source: 'n1', target: 'n2' }],
  };
  const normalized = normalizeGraph(raw);
  assert.deepEqual(normalized.nodes[0].position, { x: 0, y: 0 });
  assert.equal(normalized.edges[0].sourceHandle, null);
  assert.equal(normalized.edges[0].targetHandle, null);
});

// -------------------------------------------------------------
// 2. Validation & Cycle Detection Tests
// -------------------------------------------------------------

test('validateGraph: accepts valid React Flow pipeline', () => {
  const result = validateGraph(buildStandardGraph());
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.summary.nodeCount, 4);
  assert.equal(result.summary.edgeCount, 3);
  assert.deepEqual(result.summary.topoOrder, ['source-1', 'math-ma', 'math-th', 'action-1']);
});

test('validateGraph: rejects duplicate node IDs', () => {
  const graph = buildStandardGraph();
  graph.nodes.push({ id: 'source-1', type: 'dataSource', position: { x: 0, y: 0 }, data: {} });
  const result = validateGraph(graph);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /Duplicate node id/);
});

test('validateGraph: rejects edges with missing source or target', () => {
  const graph = buildStandardGraph();
  graph.edges.push({ id: 'bad-edge', source: 'missing-node', target: 'action-1' });
  const result = validateGraph(graph);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /missing source node/);
});

test('validateGraph: rejects self-loops on nodes', () => {
  const graph = buildStandardGraph();
  graph.edges.push({ id: 'loop', source: 'math-ma', target: 'math-ma' });
  const result = validateGraph(graph);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /self-loop/);
});

test('validateGraph: rejects action nodes having outgoing edges', () => {
  const graph = buildStandardGraph();
  graph.edges.push({ id: 'bad-action-out', source: 'action-1', target: 'math-th' });
  const result = validateGraph(graph);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /cannot be a source of edge/);
});

test('validateGraph: detects and rejects cyclic graphs', () => {
  const graph = buildStandardGraph();
  graph.edges.push({ id: 'cycle', source: 'math-th', target: 'math-ma' });
  const result = validateGraph(graph);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /cycle involving nodes/);
});

test('validateGraph: flags isolated nodes and dead-end math operations as warnings', () => {
  const graph = buildStandardGraph();
  graph.nodes.push({ id: 'isolated-node', type: 'mathOperation', position: { x: 0, y: 0 }, data: {} });
  const result = validateGraph(graph);
  assert.equal(result.ok, true);
  assert.ok(result.warnings.some((w) => w.includes('isolated-node')));
  assert.ok(result.summary.isolatedNodes.includes('isolated-node'));
});

// -------------------------------------------------------------
// 3. RxJS Operator Execution Tests
// -------------------------------------------------------------

test('RxJS Engine: calculates accurate moving average sliding window', () => {
  const graph = {
    nodes: [
      { id: 's1', type: 'dataSource', position: { x: 0, y: 0 }, data: { deviceId: 'dev-1', metric: 'temp' } },
      { id: 'ma', type: 'mathOperation', position: { x: 100, y: 0 }, data: { kind: 'movingAverage', windowSize: 3 } },
      { id: 'act', type: 'actionTrigger', position: { x: 200, y: 0 }, data: { kind: 'log' } },
    ],
    edges: [
      { id: 'e1', source: 's1', target: 'ma' },
      { id: 'e2', source: 'ma', target: 'act' },
    ],
  };

  const sim = simulateGraph(graph, [
    { deviceId: 'dev-1', metric: 'temp', value: 10 },
    { deviceId: 'dev-1', metric: 'temp', value: 20 },
    { deviceId: 'dev-1', metric: 'temp', value: 30 },
    { deviceId: 'dev-1', metric: 'temp', value: 40 },
  ]);

  assert.equal(sim.ok, true);
  assert.equal(sim.actions.length, 4);
  // Window 1: [10] -> 10
  assert.equal(sim.actions[0].payload.value, 10);
  // Window 2: [10, 20] -> 15
  assert.equal(sim.actions[1].payload.value, 15);
  // Window 3: [10, 20, 30] -> 20
  assert.equal(sim.actions[2].payload.value, 20);
  // Window 4 (size 3): [20, 30, 40] -> 30
  assert.equal(sim.actions[3].payload.value, 30);
});

test('RxJS Engine: applies scale factor and offset transformation', () => {
  // Convert Celsius to Fahrenheit: F = C * 1.8 + 32
  const graph = {
    nodes: [
      { id: 's1', type: 'dataSource', position: { x: 0, y: 0 }, data: { deviceId: 'sensor-temp', metric: 'temp' } },
      { id: 'scale-1', type: 'mathOperation', position: { x: 100, y: 0 }, data: { kind: 'scale', factor: 1.8, offset: 32 } },
      { id: 'act', type: 'actionTrigger', position: { x: 200, y: 0 }, data: { kind: 'log' } },
    ],
    edges: [
      { id: 'e1', source: 's1', target: 'scale-1' },
      { id: 'e2', source: 'scale-1', target: 'act' },
    ],
  };

  const sim = simulateGraph(graph, [
    { deviceId: 'sensor-temp', metric: 'temp', value: 0 },
    { deviceId: 'sensor-temp', metric: 'temp', value: 100 },
  ]);

  assert.equal(sim.ok, true);
  assert.equal(sim.actions.length, 2);
  assert.equal(sim.actions[0].payload.value, 32);
  assert.equal(sim.actions[1].payload.value, 212);
  assert.equal(sim.actions[1].payload.meta.scale.originalValue, 100);
});

test('RxJS Engine: delta operator tracks change from previous reading', () => {
  const graph = {
    nodes: [
      { id: 's1', type: 'dataSource', position: { x: 0, y: 0 }, data: { deviceId: 'press-01', metric: 'pressure' } },
      { id: 'd1', type: 'mathOperation', position: { x: 100, y: 0 }, data: { kind: 'delta' } },
      { id: 'act', type: 'actionTrigger', position: { x: 200, y: 0 }, data: { kind: 'log' } },
    ],
    edges: [
      { id: 'e1', source: 's1', target: 'd1' },
      { id: 'e2', source: 'd1', target: 'act' },
    ],
  };

  const sim = simulateGraph(graph, [
    { deviceId: 'press-01', metric: 'pressure', value: 100 },
    { deviceId: 'press-01', metric: 'pressure', value: 125 },
    { deviceId: 'press-01', metric: 'pressure', value: 110 },
  ]);

  assert.equal(sim.ok, true);
  assert.equal(sim.actions.length, 3);
  assert.equal(sim.actions[0].payload.delta, 0);
  assert.equal(sim.actions[1].payload.delta, 25);
  assert.equal(sim.actions[2].payload.delta, -15);
});

test('RxJS Engine: threshold comparison operators including between and outside', () => {
  const graph = {
    nodes: [
      { id: 's1', type: 'dataSource', position: { x: 0, y: 0 }, data: { deviceId: 'dev-1', metric: 'temp' } },
      {
        id: 'th-between',
        type: 'mathOperation',
        position: { x: 100, y: 0 },
        data: { kind: 'threshold', operator: 'between', threshold: 50, secondaryThreshold: 100 },
      },
      { id: 'act', type: 'actionTrigger', position: { x: 200, y: 0 }, data: { kind: 'log' } },
    ],
    edges: [
      { id: 'e1', source: 's1', target: 'th-between' },
      { id: 'e2', source: 'th-between', target: 'act' },
    ],
  };

  const sim = simulateGraph(graph, [
    { deviceId: 'dev-1', metric: 'temp', value: 30 }, // below min
    { deviceId: 'dev-1', metric: 'temp', value: 75 }, // inside range
    { deviceId: 'dev-1', metric: 'temp', value: 120 }, // above max
  ]);

  assert.equal(sim.actions.length, 1);
  assert.equal(sim.actions[0].payload.value, 75);
});

// -------------------------------------------------------------
// 4. Multi-Node Pipeline & Complex Topology Tests
// -------------------------------------------------------------

test('RxJS Engine: end-to-end multi-node pipeline with message interpolation', () => {
  const graph = buildStandardGraph({ threshold: 85, windowSize: 2 });
  const compiled = compileGraph(graph);
  assert.equal(compiled.ok, true);

  const runtime = compiled.runtimeFactory();
  const firedAlerts = [];
  const traces = [];

  runtime.actions$.subscribe((a) => firedAlerts.push(a));
  runtime.traces$.subscribe((t) => traces.push(t));

  // Push 3 points
  runtime.push({ deviceId: 'turbine-01', metric: 'temperature', value: 80, unit: 'C' });
  runtime.push({ deviceId: 'turbine-01', metric: 'temperature', value: 90, unit: 'C' }); // MA = (80+90)/2 = 85 (not > 85)
  runtime.push({ deviceId: 'turbine-01', metric: 'temperature', value: 100, unit: 'C' }); // MA = (90+100)/2 = 95 (> 85 -> triggers)

  assert.equal(firedAlerts.length, 1);
  const alert = firedAlerts[0];
  assert.equal(alert.nodeId, 'action-1');
  assert.equal(alert.kind, 'sms');
  assert.equal(alert.target, '+15551234567');
  // Templated message: {deviceId} -> turbine-01, {value} -> 95.00
  assert.match(alert.message, /turbine-01/);
  assert.match(alert.message, /95\.00/);
  assert.ok(traces.length >= 8);

  runtime.destroy();
  assert.equal(runtime.isDestroyed, true);
});

test('RxJS Engine: fan-out (one source feeds two distinct branches)', () => {
  const graph = {
    nodes: [
      { id: 's1', type: 'dataSource', position: { x: 0, y: 0 }, data: { deviceId: 'boiler-1', metric: 'temp' } },
      { id: 'high-th', type: 'mathOperation', position: { x: 100, y: -50 }, data: { kind: 'threshold', operator: '>', threshold: 100 } },
      { id: 'low-th', type: 'mathOperation', position: { x: 100, y: 50 }, data: { kind: 'threshold', operator: '<', threshold: 20 } },
      { id: 'act-high', type: 'actionTrigger', position: { x: 200, y: -50 }, data: { kind: 'webhook', label: 'Overheat' } },
      { id: 'act-low', type: 'actionTrigger', position: { x: 200, y: 50 }, data: { kind: 'email', label: 'Freeze Warning' } },
    ],
    edges: [
      { id: 'e1', source: 's1', target: 'high-th' },
      { id: 'e2', source: 's1', target: 'low-th' },
      { id: 'e3', source: 'high-th', target: 'act-high' },
      { id: 'e4', source: 'low-th', target: 'act-low' },
    ],
  };

  const sim = simulateGraph(graph, [
    { deviceId: 'boiler-1', metric: 'temp', value: 115 }, // triggers high
    { deviceId: 'boiler-1', metric: 'temp', value: 65 },  // normal
    { deviceId: 'boiler-1', metric: 'temp', value: 10 },  // triggers low
  ]);

  assert.equal(sim.actions.length, 2);
  assert.equal(sim.actions[0].nodeId, 'act-high');
  assert.equal(sim.actions[1].nodeId, 'act-low');
});

test('RxJS Engine: fan-in / stream merge (two sources merge into one threshold)', () => {
  const graph = {
    nodes: [
      { id: 's1', type: 'dataSource', position: { x: 0, y: 0 }, data: { deviceId: 'tank-A', metric: 'level' } },
      { id: 's2', type: 'dataSource', position: { x: 0, y: 100 }, data: { deviceId: 'tank-B', metric: 'level' } },
      { id: 'th', type: 'mathOperation', position: { x: 100, y: 50 }, data: { kind: 'threshold', operator: '>', threshold: 90 } },
      { id: 'act', type: 'actionTrigger', position: { x: 200, y: 50 }, data: { kind: 'log' } },
    ],
    edges: [
      { id: 'e1', source: 's1', target: 'th' },
      { id: 'e2', source: 's2', target: 'th' },
      { id: 'e3', source: 'th', target: 'act' },
    ],
  };

  const sim = simulateGraph(graph, [
    { deviceId: 'tank-A', metric: 'level', value: 95 }, // matches s1, triggers
    { deviceId: 'tank-B', metric: 'level', value: 50 }, // matches s2, filtered
    { deviceId: 'tank-B', metric: 'level', value: 92 }, // matches s2, triggers
  ]);

  assert.equal(sim.actions.length, 2);
  assert.equal(sim.actions[0].payload.deviceId, 'tank-A');
  assert.equal(sim.actions[1].payload.deviceId, 'tank-B');
});

// -------------------------------------------------------------
// 5. Node Stream Inspection, Ingress Injection & Custom Registry
// -------------------------------------------------------------

test('RxJS Engine: getNodeStream permits individual node stream observation', () => {
  const graph = buildStandardGraph({ threshold: 50 });
  const compiled = compileGraph(graph);
  const runtime = compiled.runtimeFactory();

  const maValues = [];
  const maStream$ = runtime.getNodeStream('math-ma');
  assert.ok(maStream$);

  maStream$.subscribe((evt) => maValues.push(evt.value));

  runtime.push({ deviceId: 'turbine-01', metric: 'temperature', value: 60 });
  runtime.push({ deviceId: 'turbine-01', metric: 'temperature', value: 80 });

  assert.deepEqual(maValues, [60, 70]);
  runtime.destroy();
});

test('RxJS Engine: pushToNode injects directly into intermediate nodes', () => {
  const graph = buildStandardGraph({ threshold: 50 });
  const compiled = compileGraph(graph);
  const runtime = compiled.runtimeFactory();

  const alerts = [];
  runtime.actions$.subscribe((a) => alerts.push(a));

  // Push directly to math-th, bypassing source-1 and movingAverage
  runtime.pushToNode('math-th', { deviceId: 'test-direct', value: 99 });

  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].payload.deviceId, 'test-direct');
  assert.equal(alerts[0].payload.value, 99);

  runtime.destroy();
});

test('LogicCompiler: supports registering custom math operations dynamically', () => {
  // Register custom absolute value difference operation
  LogicCompiler.registerMathOperation('absDelta', (evt, config) => {
    const val = Number(evt.value);
    const target = Number(config?.target || 50);
    return { ...evt, value: Math.abs(val - target), meta: { ...(evt.meta || {}), customAbsDelta: true } };
  });

  const graph = {
    nodes: [
      { id: 's1', type: 'dataSource', position: { x: 0, y: 0 }, data: { deviceId: 'd1', metric: 'm1' } },
      { id: 'm1', type: 'mathOperation', position: { x: 100, y: 0 }, data: { kind: 'absDelta', target: 50 } },
      { id: 'act', type: 'actionTrigger', position: { x: 200, y: 0 }, data: { kind: 'log' } },
    ],
    edges: [
      { id: 'e1', source: 's1', target: 'm1' },
      { id: 'e2', source: 'm1', target: 'act' },
    ],
  };

  const sim = simulateGraph(graph, [
    { deviceId: 'd1', metric: 'm1', value: 40 },
    { deviceId: 'd1', metric: 'm1', value: 75 },
  ]);

  assert.equal(sim.actions.length, 2);
  assert.equal(sim.actions[0].payload.value, 10); // |40 - 50| = 10
  assert.equal(sim.actions[1].payload.value, 25); // |75 - 50| = 25
  assert.equal(sim.actions[0].payload.meta.customAbsDelta, true);

  LogicCompiler.unregisterMathOperation('absDelta');
});

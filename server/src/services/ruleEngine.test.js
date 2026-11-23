import test from 'node:test';
import assert from 'node:assert/strict';
import { ruleEngine } from './ruleEngine.js';

function buildGraph({ id, deviceId, threshold }) {
  return {
    version: 2,
    nodes: [
      {
        id: `${id}-source`,
        type: 'dataSource',
        position: { x: 0, y: 0 },
        data: { label: 'Sensor', deviceId, metric: 'temperature' },
      },
      {
        id: `${id}-threshold`,
        type: 'mathOperation',
        position: { x: 200, y: 0 },
        data: { kind: 'threshold', operator: '>', threshold, field: 'value' },
      },
      {
        id: `${id}-action`,
        type: 'actionTrigger',
        position: { x: 400, y: 0 },
        data: { label: `${id} alert`, kind: 'log', message: `${id} fired` },
      },
    ],
    edges: [
      { id: `${id}-e1`, source: `${id}-source`, target: `${id}-threshold` },
      { id: `${id}-e2`, source: `${id}-threshold`, target: `${id}-action` },
    ],
  };
}

function point(deviceId, value) {
  return { deviceId, metric: 'temperature', value, unit: 'C' };
}

test('runs multiple active rules and fans telemetry out to each', () => {
  const alerts = [];
  const onAlert = (alert) => alerts.push(alert);
  ruleEngine.on('alert', onAlert);

  try {
    const first = ruleEngine.activate(buildGraph({ id: 'a', deviceId: 'device-a', threshold: 80 }), {
      graphId: 'graph-a',
      name: 'Rule A',
      ownerId: 'user-1',
      ownerEmail: 'manager@example.com',
    });
    const second = ruleEngine.activate(buildGraph({ id: 'b', deviceId: 'device-b', threshold: 50 }), {
      graphId: 'graph-b',
      name: 'Rule B',
      ownerId: 'user-1',
      ownerEmail: 'manager@example.com',
    });

    assert.equal(first.activated, true);
    assert.equal(second.activated, true);
    assert.equal(ruleEngine.count(), 2);
    assert.deepEqual(
      ruleEngine.getStatus().rules.map((rule) => rule.graphId).sort(),
      ['graph-a', 'graph-b']
    );

    const evaluation = ruleEngine.pushBatch([
      point('device-a', 95),
      point('device-b', 20),
    ]);

    assert.equal(evaluation.rules, 2);
    assert.equal(evaluation.points, 2);
    assert.equal(evaluation.evaluations, 4);
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].runtimeId, 'graph:graph-a');
    assert.equal(alerts[0].graphId, 'graph-a');
    assert.equal(alerts[0].ruleName, 'Rule A');
    assert.equal(alerts[0].ownerId, 'user-1');

    ruleEngine.push(point('device-b', 60));
    assert.equal(alerts.length, 2);
    assert.equal(alerts[1].runtimeId, 'graph:graph-b');

    assert.equal(ruleEngine.stop('graph:graph-a'), true);
    assert.equal(ruleEngine.count(), 1);

    ruleEngine.push(point('device-a', 99));
    assert.equal(alerts.length, 2, 'stopped rule must not fire');

    ruleEngine.push(point('device-b', 70));
    assert.equal(alerts.length, 3, 'remaining rule still fires');
  } finally {
    ruleEngine.off('alert', onAlert);
    ruleEngine.stopAll({ emit: false });
  }
});

test('re-activating a saved graph replaces its runtime instead of duplicating it', () => {
  try {
    ruleEngine.activate(buildGraph({ id: 'a', deviceId: 'device-a', threshold: 80 }), {
      graphId: 'graph-a',
      name: 'First',
    });
    const runtimeId = ruleEngine.getStatus().rules[0].runtimeId;

    ruleEngine.activate(buildGraph({ id: 'a', deviceId: 'device-a', threshold: 90 }), {
      graphId: 'graph-a',
      name: 'Updated',
    });

    const rules = ruleEngine.getStatus().rules;
    assert.equal(rules.length, 1);
    assert.equal(rules[0].runtimeId, runtimeId);
    assert.equal(rules[0].name, 'Updated');
  } finally {
    ruleEngine.stopAll({ emit: false });
  }
});

test('stopAll clears every runtime', () => {
  ruleEngine.activate(buildGraph({ id: 'a', deviceId: 'device-a', threshold: 80 }), { graphId: 'graph-a' });
  ruleEngine.activate(buildGraph({ id: 'b', deviceId: 'device-b', threshold: 80 }), { graphId: 'graph-b' });

  assert.equal(ruleEngine.stopAll({ emit: false }), 2);
  assert.equal(ruleEngine.isActive(), false);
  assert.equal(ruleEngine.getStatus().count, 0);
});

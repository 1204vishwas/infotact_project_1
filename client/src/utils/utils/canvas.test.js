import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateNodeId,
  createCanvasNode,
  serializeGraph,
  calculateDropPosition,
  NODE_LIBRARY,
} from './canvas.js';

test('NODE_LIBRARY includes required categories and items', () => {
  const categories = NODE_LIBRARY.map((c) => c.category);
  assert.ok(categories.includes('Data Sources'));
  assert.ok(categories.includes('Math Operations'));
  assert.ok(categories.includes('Action Triggers'));

  const allItems = NODE_LIBRARY.flatMap((c) => c.items);
  assert.ok(allItems.some((i) => i.type === 'dataSource'));
  assert.ok(allItems.some((i) => i.type === 'mathOperation'));
  assert.ok(allItems.some((i) => i.type === 'actionTrigger'));
});

test('generateNodeId produces unique prefixed IDs without collisions', () => {
  const existing = [{ id: 'source-11' }, { id: 'source-12' }];
  const id1 = generateNodeId('dataSource', existing);
  assert.ok(id1.startsWith('source-'));
  assert.ok(!existing.some((n) => n.id === id1));

  const mathId = generateNodeId('mathOperation', []);
  assert.ok(mathId.startsWith('math-'));

  const actionId = generateNodeId('actionTrigger', []);
  assert.ok(actionId.startsWith('action-'));
});

test('createCanvasNode constructs valid React Flow node data structure', () => {
  const position = { x: 320, y: 240 };
  const defaults = { label: 'Temp Sensor', deviceId: 't-100', metric: 'temperature' };
  const node = createCanvasNode('dataSource', defaults, position, []);

  assert.equal(node.type, 'dataSource');
  assert.deepEqual(node.position, position);
  assert.equal(node.data.label, 'Temp Sensor');
  assert.equal(node.data.deviceId, 't-100');
  assert.ok(node.id.startsWith('source-'));
});

test('serializeGraph creates compliant version 2 export schema', () => {
  const nodes = [
    { id: 'source-1', type: 'dataSource', position: { x: 100.4, y: 150.8 }, data: { label: 'Src' } },
    { id: 'action-1', type: 'actionTrigger', position: { x: 400, y: 150 }, data: { label: 'Act' } },
  ];
  const edges = [
    { id: 'e1', source: 'source-1', target: 'action-1' },
  ];

  const serialized = serializeGraph(nodes, edges, { name: 'Test Pipeline' });

  assert.equal(serialized.version, 2);
  assert.equal(serialized.name, 'Test Pipeline');
  assert.equal(serialized.nodes.length, 2);
  assert.equal(serialized.edges.length, 1);
  assert.equal(serialized.nodes[0].position.x, 100);
  assert.equal(serialized.nodes[0].position.y, 151);
  assert.equal(serialized.edges[0].type, 'smoothstep');
});

test('calculateDropPosition delegates to screenToFlowPosition or project', () => {
  // Scenario 1: screenToFlowPosition available
  const mockFlow1 = {
    screenToFlowPosition: ({ x, y }) => ({ x: x - 50, y: y - 50 }),
  };
  const pos1 = calculateDropPosition({ clientX: 200, clientY: 300 }, null, mockFlow1);
  assert.deepEqual(pos1, { x: 150, y: 250 });

  // Scenario 2: fallback to project with bounds
  const mockFlow2 = {
    project: ({ x, y }) => ({ x: x * 2, y: y * 2 }),
  };
  const bounds = { left: 100, top: 50 };
  const pos2 = calculateDropPosition({ clientX: 250, clientY: 150 }, bounds, mockFlow2);
  assert.deepEqual(pos2, { x: 300, y: 200 });
});

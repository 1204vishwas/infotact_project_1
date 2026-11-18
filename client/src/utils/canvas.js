/**
 * Utility functions for React Flow canvas drag-and-drop operations,
 * node generation, coordinate projection, and graph serialization.
 */

export const NODE_LIBRARY = [
  {
    category: 'Data Sources',
    items: [
      {
        label: 'Sensor Source',
        type: 'dataSource',
        defaults: { label: 'Turbine Sensor', kind: 'sensor', deviceId: 'turbine-01', metric: 'temperature', unit: 'C' },
      },
      {
        label: 'Simulator',
        type: 'dataSource',
        defaults: { label: 'Telemetry Simulator', kind: 'simulator', deviceId: 'sim-01', metric: 'temperature', unit: 'C' },
      },
      {
        label: 'IoT Gateway',
        type: 'dataSource',
        defaults: { label: 'Factory Gateway', kind: 'gateway', deviceId: 'gw-floor-1', metric: 'vibration', unit: 'mm/s' },
      },
    ],
  },
  {
    category: 'Math Operations',
    items: [
      {
        label: 'Moving Average',
        type: 'mathOperation',
        defaults: { label: 'Moving Average', kind: 'movingAverage', windowSize: 5 },
      },
      {
        label: 'Threshold Check',
        type: 'mathOperation',
        defaults: { label: 'Threshold Check', kind: 'threshold', operator: '>', threshold: 80, field: 'value' },
      },
      {
        label: 'Scale / Offset',
        type: 'mathOperation',
        defaults: { label: 'Scale / Offset', kind: 'scale', factor: 1, offset: 0 },
      },
      {
        label: 'Delta',
        type: 'mathOperation',
        defaults: { label: 'Delta', kind: 'delta' },
      },
      {
        label: 'Passthrough',
        type: 'mathOperation',
        defaults: { label: 'Passthrough Filter', kind: 'passthrough' },
      },
    ],
  },
  {
    category: 'Action Triggers',
    items: [
      {
        label: 'SMS Alert',
        type: 'actionTrigger',
        defaults: { label: 'SMS Alert', kind: 'sms', channel: 'sms', target: '+10000000000', message: 'Threshold exceeded' },
      },
      {
        label: 'Webhook',
        type: 'actionTrigger',
        defaults: { label: 'Webhook Alert', kind: 'webhook', channel: 'webhook', target: 'https://example.com/hook', url: 'https://example.com/hook', message: 'Rule triggered' },
      },
      {
        label: 'Log Trigger',
        type: 'actionTrigger',
        defaults: { label: 'Log Alert', kind: 'log', channel: 'log', target: 'server-log', message: 'Rule triggered' },
      },
    ],
  },
];

let globalIdCounter = 10;

export function generateNodeId(type, existingNodes = []) {
  const prefix =
    type === 'dataSource' || type === 'source'
      ? 'source'
      : type === 'mathOperation' || type === 'filter'
        ? 'math'
        : 'action';

  let id;
  do {
    globalIdCounter += 1;
    id = `${prefix}-${globalIdCounter}`;
  } while (existingNodes.some((n) => n.id === id));

  return id;
}

export function createCanvasNode(type, defaults = {}, position = { x: 100, y: 100 }, existingNodes = []) {
  const id = generateNodeId(type, existingNodes);
  return {
    id,
    type,
    position,
    data: { ...defaults },
  };
}

export function serializeGraph(nodes = [], edges = [], metadata = {}) {
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    ...metadata,
    nodes: nodes.map(({ id, type, position, data }) => ({
      id,
      type,
      position: { x: Math.round(position.x), y: Math.round(position.y) },
      data: { ...data },
    })),
    edges: edges.map(({ id, source, target, sourceHandle, targetHandle, type }) => ({
      id,
      source,
      target,
      sourceHandle: sourceHandle ?? null,
      targetHandle: targetHandle ?? null,
      type: type ?? 'smoothstep',
    })),
  };
}

export function calculateDropPosition(event, reactFlowBounds, reactFlowInstance) {
  if (reactFlowInstance?.screenToFlowPosition) {
    return reactFlowInstance.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });
  }

  if (reactFlowInstance?.project && reactFlowBounds) {
    return reactFlowInstance.project({
      x: event.clientX - reactFlowBounds.left,
      y: event.clientY - reactFlowBounds.top,
    });
  }

  return { x: 200, y: 150 };
}

/**
 * Utility functions for React Flow canvas drag-and-drop operations,
 * node generation, coordinate projection, and graph serialization.
 */

export const NODE_LIBRARY = [
  {
    category: 'Data Sources',
    icon: '📡',
    description: 'Ingress root nodes for sensors, simulators, and gateways',
    items: [
      {
        label: 'Sensor Source',
        type: 'dataSource',
        icon: '📡',
        desc: 'Physical edge IoT sensor telemetry',
        tag: 'sensor',
        defaults: { label: 'Turbine Sensor', kind: 'sensor', deviceId: 'turbine-01', metric: 'temperature', unit: 'C' },
      },
      {
        label: 'Simulator',
        type: 'dataSource',
        icon: '⚡',
        desc: 'Continuous synthetic data generator',
        tag: 'simulator',
        defaults: { label: 'Telemetry Simulator', kind: 'simulator', deviceId: 'sim-01', metric: 'temperature', unit: 'C' },
      },
      {
        label: 'IoT Gateway',
        type: 'dataSource',
        icon: '🌐',
        desc: 'Multiplexed edge hub & gateway',
        tag: 'gateway',
        defaults: { label: 'Factory Gateway', kind: 'gateway', deviceId: 'gw-floor-1', metric: 'vibration', unit: 'mm/s' },
      },
    ],
  },
  {
    category: 'Math Operations',
    icon: '🧮',
    description: 'Reactive stream transforms, filters, and window algorithms',
    items: [
      {
        label: 'Moving Average',
        type: 'mathOperation',
        icon: '📈',
        desc: 'Sliding window rolling average',
        tag: 'window',
        defaults: { label: 'Moving Average', kind: 'movingAverage', windowSize: 5 },
      },
      {
        label: 'Threshold Check',
        type: 'mathOperation',
        icon: '⚖️',
        desc: 'Evaluates >, >=, <, <=, between conditions',
        tag: 'filter',
        defaults: { label: 'Threshold Check', kind: 'threshold', operator: '>', threshold: 80, field: 'value' },
      },
      {
        label: 'Scale / Offset',
        type: 'mathOperation',
        icon: '✖️',
        desc: 'Linear transformation (x * factor + offset)',
        tag: 'scale',
        defaults: { label: 'Scale / Offset', kind: 'scale', factor: 1, offset: 0 },
      },
      {
        label: 'Delta',
        type: 'mathOperation',
        icon: 'Δ',
        desc: 'Differential step change detection',
        tag: 'differential',
        defaults: { label: 'Delta', kind: 'delta' },
      },
      {
        label: 'Rate of Change',
        type: 'mathOperation',
        icon: '⏱️',
        desc: 'Calculates rate of change per second (dv/dt)',
        tag: 'rate',
        defaults: { label: 'Rate of Change', kind: 'rateOfChange' },
      },
      {
        label: 'Min / Max Accumulator',
        type: 'mathOperation',
        icon: '📊',
        desc: 'Tracks running minimum or maximum peak',
        tag: 'extremum',
        defaults: { label: 'Max Peak Accumulator', kind: 'max' },
      },
      {
        label: 'Passthrough',
        type: 'mathOperation',
        icon: '⏩',
        desc: 'Passes stream events without modifications',
        tag: 'bypass',
        defaults: { label: 'Passthrough Filter', kind: 'passthrough' },
      },
    ],
  },
  {
    category: 'Action Triggers',
    icon: '⚡',
    description: 'Terminal sink nodes dispatching alerts across channels',
    items: [
      {
        label: 'SMS Alert',
        type: 'actionTrigger',
        icon: '📱',
        desc: 'Twilio SMS dispatch to on-call phone',
        tag: 'sms',
        defaults: { label: 'SMS Alert', kind: 'sms', channel: 'sms', target: '+10000000000', message: 'Threshold exceeded: {deviceId} {metric}={value}' },
      },
      {
        label: 'Webhook',
        type: 'actionTrigger',
        icon: '🌐',
        desc: 'HTTP POST payload to external API endpoint',
        tag: 'webhook',
        defaults: { label: 'Webhook Alert', kind: 'webhook', channel: 'webhook', target: 'https://example.com/hook', url: 'https://example.com/hook', message: 'Rule triggered for {deviceId}' },
      },
      {
        label: 'Email Alert',
        type: 'actionTrigger',
        icon: '✉️',
        desc: 'SMTP / SES email notification dispatch',
        tag: 'email',
        defaults: { label: 'Email Alert', kind: 'email', channel: 'email', target: 'ops@nexusflow.io', message: 'Critical alert: {metric} on {deviceId} reached {value}' },
      },
      {
        label: 'Log Trigger',
        type: 'actionTrigger',
        icon: '📜',
        desc: 'Appends event to audit log and system stdout',
        tag: 'log',
        defaults: { label: 'Log Alert', kind: 'log', channel: 'log', target: 'server-log', message: 'Rule triggered for {deviceId}' },
      },
      {
        label: 'Console Alert',
        type: 'actionTrigger',
        icon: '🔔',
        desc: 'WebSocket broadcast directly to Operator UI',
        tag: 'alert',
        defaults: { label: 'Live Console Alert', kind: 'alert', channel: 'alert', target: 'operator-console', message: 'Live anomaly: {deviceId} {metric}={value}' },
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

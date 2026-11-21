import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  addEdge,
  Background,
  Controls,
  MiniMap,
  Panel,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { DataSourceNode } from '../nodes/DataSourceNode';
import { MathOperationNode } from '../nodes/MathOperationNode';
import { ActionTriggerNode } from '../nodes/ActionTriggerNode';
import { useRealtime } from '../hooks/useRealtime';
import { useAuth } from '../hooks/useAuth';
import {
  NODE_LIBRARY,
  createCanvasNode,
  serializeGraph,
  calculateDropPosition,
} from '../utils/canvas';

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

const PRESET_TEMPLATES = {
  default: {
    name: 'Turbine Overheat Pipeline',
    nodes: [
      {
        id: 'source-1',
        type: 'dataSource',
        position: { x: 80, y: 180 },
        data: { label: 'Turbine Sensor', kind: 'sensor', deviceId: 'turbine-01', metric: 'temperature', unit: 'C' },
      },
      {
        id: 'math-1',
        type: 'mathOperation',
        position: { x: 360, y: 120 },
        data: { label: 'Moving Average', kind: 'movingAverage', windowSize: 5 },
      },
      {
        id: 'math-2',
        type: 'mathOperation',
        position: { x: 360, y: 280 },
        data: { label: 'Threshold Check', kind: 'threshold', operator: '>', threshold: 80, field: 'value' },
      },
      {
        id: 'action-1',
        type: 'actionTrigger',
        position: { x: 660, y: 200 },
        data: { label: 'SMS Alert', kind: 'sms', channel: 'sms', target: '+10000000000', message: 'Turbine temperature above threshold' },
      },
    ],
    edges: [
      { id: 'e-source-ma', source: 'source-1', target: 'math-1', type: 'smoothstep' },
      { id: 'e-ma-th', source: 'math-1', target: 'math-2', type: 'smoothstep' },
      { id: 'e-th-action', source: 'math-2', target: 'action-1', type: 'smoothstep' },
    ],
  },
  anomaly: {
    name: 'Vibration Anomaly Spike',
    nodes: [
      {
        id: 'source-1',
        type: 'dataSource',
        position: { x: 80, y: 180 },
        data: { label: 'Floor 1 Gateway', kind: 'gateway', deviceId: 'gw-floor-1', metric: 'vibration', unit: 'mm/s' },
      },
      {
        id: 'math-1',
        type: 'mathOperation',
        position: { x: 360, y: 180 },
        data: { label: 'Delta Spike Detection', kind: 'delta' },
      },
      {
        id: 'action-1',
        type: 'actionTrigger',
        position: { x: 660, y: 180 },
        data: { label: 'Webhook Alert', kind: 'webhook', channel: 'webhook', target: 'https://example.com/alerts/vibration', message: 'Vibration anomaly detected' },
      },
    ],
    edges: [
      { id: 'e-vibe-delta', source: 'source-1', target: 'math-1', type: 'smoothstep' },
      { id: 'e-delta-hook', source: 'math-1', target: 'action-1', type: 'smoothstep' },
    ],
  },
};

const initialNodes = PRESET_TEMPLATES.default.nodes;
const initialEdges = PRESET_TEMPLATES.default.edges;

function toNumberOr(value, fallback) {
  if (value === '' || value === null || value === undefined) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString();
}

function AlertsPanel({ alerts, isActive }) {
  if (alerts.length === 0) {
    return (
      <div className="panel-empty">
        {isActive
          ? 'Rule is active. Waiting for matching telemetry to trigger an alert.'
          : 'Rule is idle. Activate a graph, then push test telemetry.'}
      </div>
    );
  }

  return (
    <div className="alert-list">
      {alerts.map((alert, index) => {
        const value = Number(alert.payload?.value);
        return (
          <div className="alert-item" key={alert._id || alert.id || `${alert.nodeId}-${index}`}>
            <div className="alert-top">
              <span className={`alert-kind ${alert.kind || 'log'}`}>{alert.kind || 'alert'}</span>
              <span className="alert-time">{formatTime(alert.triggeredAt || alert.createdAt)}</span>
            </div>
            <div className="alert-message">{alert.message || 'Alert triggered'}</div>
            <div className="alert-meta">
              {alert.ruleName ? `${alert.ruleName} · ` : ''}{alert.label || alert.nodeId} → {alert.target || 'n/a'}
            </div>
            {Number.isFinite(value) ? (
              <div className="alert-meta">
                value: {value.toFixed(2)} {alert.payload?.unit || ''}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function TelemetryPanel({ points }) {
  if (points.length === 0) {
    return (
      <div className="panel-empty">
        No live telemetry yet. Activate a rule, then push test telemetry or run the simulator.
      </div>
    );
  }

  return (
    <div className="telemetry-list">
      {points.slice(0, 80).map((point, index) => (
        <div className="telemetry-row" key={`${point.timestamp}-${point.deviceId}-${point.metric}-${index}`}>
          <span className="telemetry-time">{formatTime(point.timestamp)}</span>
          <span className="telemetry-device">{point.deviceId}</span>
          <span className="telemetry-metric">{point.metric}</span>
          <span className="telemetry-value">{Number(point.value).toFixed(2)} {point.unit || ''}</span>
        </div>
      ))}
    </div>
  );
}

function NodeConfigPanel({ node, onChange }) {
  if (!node) {
    return <div className="config-empty">Select a node to configure its properties.</div>;
  }
  const { type, data } = node;
  const update = (patch) => onChange(node.id, { ...data, ...patch });

  return (
    <div className="config-form">
      <div className="config-row">
        <label>Node ID</label>
        <input value={node.id} disabled />
      </div>
      <div className="config-row">
        <label>Label</label>
        <input value={data.label || ''} onChange={(e) => update({ label: e.target.value })} />
      </div>

      {type === 'dataSource' && (
        <>
          <div className="config-row">
            <label>Source Kind</label>
            <select value={data.kind || 'sensor'} onChange={(e) => update({ kind: e.target.value })}>
              <option value="sensor">Sensor</option>
              <option value="simulator">Simulator</option>
              <option value="gateway">Gateway</option>
            </select>
          </div>
          <div className="config-row">
            <label>Device ID</label>
            <input value={data.deviceId || ''} onChange={(e) => update({ deviceId: e.target.value })} />
          </div>
          <div className="config-row">
            <label>Metric</label>
            <input value={data.metric || ''} onChange={(e) => update({ metric: e.target.value })} />
          </div>
          <div className="config-row">
            <label>Unit</label>
            <input value={data.unit || ''} onChange={(e) => update({ unit: e.target.value })} />
          </div>
        </>
      )}

      {type === 'mathOperation' && (
        <>
          <div className="config-row">
            <label>Operation Kind</label>
            <select value={data.kind || 'threshold'} onChange={(e) => update({ kind: e.target.value })}>
              <option value="movingAverage">Moving Average</option>
              <option value="threshold">Threshold / Comparison</option>
              <option value="scale">Scale / Offset</option>
              <option value="delta">Delta (Step Change)</option>
              <option value="rateOfChange">Rate of Change (dv/dt)</option>
              <option value="min">Minimum Accumulator</option>
              <option value="max">Maximum Accumulator</option>
              <option value="passthrough">Passthrough</option>
            </select>
          </div>
          {(data.kind === 'movingAverage') && (
            <div className="config-row">
              <label>Window Size</label>
              <input type="number" min="1" value={data.windowSize ?? 5} onChange={(e) => update({ windowSize: toNumberOr(e.target.value, 5) })} />
            </div>
          )}
          {(data.kind === 'threshold' || !data.kind) && (
            <>
              <div className="config-row">
                <label>Field</label>
                <input value={data.field || 'value'} onChange={(e) => update({ field: e.target.value })} />
              </div>
              <div className="config-row two-col">
                <div>
                  <label>Operator</label>
                  <select value={data.operator || '>'} onChange={(e) => update({ operator: e.target.value })}>
                    <option value=">">&gt;</option>
                    <option value=">=">&gt;=</option>
                    <option value="<">&lt;</option>
                    <option value="<=">&lt;=</option>
                    <option value="==">==</option>
                    <option value="!=">!=</option>
                    <option value="between">between</option>
                    <option value="outside">outside</option>
                  </select>
                </div>
                <div>
                  <label>Threshold</label>
                  <input type="number" value={data.threshold ?? 80} onChange={(e) => update({ threshold: toNumberOr(e.target.value, 80) })} />
                </div>
              </div>
              {(data.operator === 'between' || data.operator === 'outside') && (
                <div className="config-row">
                  <label>Secondary Threshold (Upper Bound)</label>
                  <input
                    type="number"
                    value={data.secondaryThreshold ?? 100}
                    onChange={(e) => update({ secondaryThreshold: toNumberOr(e.target.value, 100) })}
                  />
                </div>
              )}
            </>
          )}
          {data.kind === 'scale' && (
            <div className="config-row two-col">
              <div>
                <label>Factor</label>
                <input type="number" value={data.factor ?? 1} onChange={(e) => update({ factor: toNumberOr(e.target.value, 1) })} />
              </div>
              <div>
                <label>Offset</label>
                <input type="number" value={data.offset ?? 0} onChange={(e) => update({ offset: toNumberOr(e.target.value, 0) })} />
              </div>
            </div>
          )}
          {data.kind === 'delta' && <div className="config-note">Emits change from previous value (adds <code>delta</code>).</div>}
          {data.kind === 'rateOfChange' && <div className="config-note">Calculates first derivative per second (adds <code>rateOfChange</code>).</div>}
          {(data.kind === 'min' || data.kind === 'max') && <div className="config-note">Tracks historic running {data.kind === 'min' ? 'minimum' : 'maximum'} value.</div>}
          {data.kind === 'passthrough' && <div className="config-note">Passes events through unchanged.</div>}
        </>
      )}

      {type === 'actionTrigger' && (
        <>
          <div className="config-row two-col">
            <div>
              <label>Action Kind</label>
              <select value={data.kind || data.channel || 'sms'} onChange={(e) => {
                const kind = e.target.value;
                const patch = { kind, channel: kind };
                if (kind === 'webhook') { patch.target = data.url || data.target || 'https://example.com/hook'; patch.url = patch.target; }
                if (kind === 'email') { patch.target = data.email || data.target || 'ops@nexusflow.io'; }
                if (kind === 'sms') { patch.target = data.phone || data.target || '+10000000000'; }
                if (kind === 'log') { patch.target = 'server-log'; }
                if (kind === 'alert') { patch.target = 'operator-console'; }
                update(patch);
              }}>
                <option value="sms">SMS</option>
                <option value="webhook">Webhook</option>
                <option value="email">Email</option>
                <option value="log">Log</option>
                <option value="alert">Console Alert</option>
              </select>
            </div>
            <div>
              <label>Severity</label>
              <select value={data.severity || 'critical'} onChange={(e) => update({ severity: e.target.value })}>
                <option value="critical">Critical</option>
                <option value="warning">Warning</option>
                <option value="info">Info</option>
              </select>
            </div>
          </div>
          <div className="config-row">
            <label>{(data.kind === 'webhook') ? 'Webhook URL' : (data.kind === 'email') ? 'Email Address' : (data.kind === 'log') ? 'Log Target' : (data.kind === 'alert') ? 'Broadcast Hub' : 'Phone / Target'}</label>
            <input
              value={data.target || ''}
              onChange={(e) => {
                const v = e.target.value;
                const patch = { target: v };
                if ((data.kind || 'sms') === 'webhook') patch.url = v;
                if ((data.kind || 'sms') === 'sms') patch.phone = v;
                if ((data.kind || 'sms') === 'email') patch.email = v;
                update(patch);
              }}
            />
          </div>
          <div className="config-row">
            <label>Message Template</label>
            <textarea rows={3} value={data.message || ''} onChange={(e) => update({ message: e.target.value })} />
            <div className="config-note">Tokens: <code>{'{deviceId}'}</code>, <code>{'{metric}'}</code>, <code>{'{value}'}</code>, <code>{'{threshold}'}</code></div>
          </div>
        </>
      )}
    </div>
  );
}

function CanvasFlowInner() {
  const reactFlowWrapper = useRef(null);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [serialized, setSerialized] = useState('');
  const [compileResult, setCompileResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [savedGraphs, setSavedGraphs] = useState([]);
  const [graphName, setGraphName] = useState('My Pipeline');
  const [loadedGraphId, setLoadedGraphId] = useState(null);
  const [savedBusy, setSavedBusy] = useState(false);
  const [outputTab, setOutputTab] = useState('output');
  const [serverRuleStatus, setServerRuleStatus] = useState(null);
  const [mobileView, setMobileView] = useState('canvas'); // 'library' | 'canvas' | 'sidebar'
  const [librarySearch, setLibrarySearch] = useState('');

  const filteredLibrary = useMemo(() => {
    const q = librarySearch.trim().toLowerCase();
    if (!q) return NODE_LIBRARY;
    return NODE_LIBRARY.map((group) => {
      const items = group.items.filter(
        (item) =>
          item.label.toLowerCase().includes(q) ||
          (item.desc && item.desc.toLowerCase().includes(q)) ||
          (item.tag && item.tag.toLowerCase().includes(q)) ||
          (item.defaults?.kind && item.defaults.kind.toLowerCase().includes(q))
      );
      return { ...group, items };
    }).filter((group) => group.items.length > 0);
  }, [librarySearch]);

  const { user, token, logout, authFetch } = useAuth();

  const {
    status: liveStatus,
    alerts,
    telemetry,
    ruleStatus,
    lastError,
    clearAlerts,
    wsUrl,
  } = useRealtime(token);

  const activeRules = Array.isArray(serverRuleStatus?.rules) ? serverRuleStatus.rules : [];
  const isActive = activeRules.length > 0 || Boolean(serverRuleStatus?.active);
  const liveLabel = liveStatus === 'live'
    ? 'Live'
    : liveStatus === 'reconnecting'
      ? 'Reconnecting'
      : liveStatus === 'connecting'
        ? 'Connecting'
        : 'Offline';

  const nodeTypes = useMemo(
    () => ({
      dataSource: DataSourceNode,
      mathOperation: MathOperationNode,
      actionTrigger: ActionTriggerNode,
      source: DataSourceNode,
      filter: MathOperationNode,
      action: ActionTriggerNode,
    }),
    []
  );

  const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedNodeId) || null, [nodes, selectedNodeId]);

  const fetchSavedGraphs = useCallback(async () => {
    try {
      const res = await authFetch('/api/graphs/saved');
      const json = await res.json().catch(() => ({}));
      if (res.ok) setSavedGraphs(Array.isArray(json.items) ? json.items : []);
    } catch {
      // Keep canvas operational when offline
    }
  }, [authFetch]);

  const refreshActive = useCallback(async () => {
    try {
      const res = await authFetch('/api/graphs/active');
      const json = await res.json().catch(() => ({}));
      if (res.ok) setServerRuleStatus(json);
    } catch {
      // Handled via WebSocket status
    }
  }, [authFetch]);

  useEffect(() => {
    fetchSavedGraphs();
    refreshActive();
  }, [fetchSavedGraphs, refreshActive]);

  useEffect(() => {
    if (ruleStatus) setServerRuleStatus(ruleStatus);
  }, [ruleStatus]);

  const request = async (path, options = {}) => {
    const res = await authFetch(path, options);
    const json = await res.json().catch(() => ({}));
    return { res, json };
  };

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge({ ...params, type: 'smoothstep' }, eds)),
    [setEdges]
  );

  const onNodeClick = useCallback((_evt, node) => setSelectedNodeId(node.id), []);
  const onPaneClick = useCallback(() => setSelectedNodeId(null), []);

  const addNode = useCallback(
    (type, defaults, positionOverride = null) => {
      const position =
        positionOverride || {
          x: 120 + Math.random() * 320,
          y: 80 + Math.random() * 220,
        };
      const newNode = createCanvasNode(type, defaults, position, nodes);
      setNodes((nds) => nds.concat(newNode));
      setSelectedNodeId(newNode.id);
      return newNode;
    },
    [nodes, setNodes]
  );

  const onDragStart = (event, nodeType, defaults) => {
    event.dataTransfer.setData('application/reactflow/type', nodeType);
    event.dataTransfer.setData('application/reactflow/defaults', JSON.stringify(defaults));
    event.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow/type');
      if (!type) return;

      let defaults = {};
      try {
        const raw = event.dataTransfer.getData('application/reactflow/defaults');
        if (raw) defaults = JSON.parse(raw);
      } catch {
        defaults = {};
      }

      const bounds = reactFlowWrapper.current?.getBoundingClientRect();
      const position = calculateDropPosition(event, bounds, reactFlowInstance);
      addNode(type, defaults, position);
    },
    [addNode, reactFlowInstance]
  );

  const updateNodeData = useCallback(
    (id, data) => {
      setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data } : n)));
    },
    [setNodes]
  );

  const deleteSelected = () => {
    if (!selectedNodeId) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId));
    setEdges((eds) => eds.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId));
    setSelectedNodeId(null);
  };

  const onNodesDelete = useCallback(
    (deletedNodes) => {
      if (deletedNodes.some((n) => n.id === selectedNodeId)) {
        setSelectedNodeId(null);
      }
    },
    [selectedNodeId]
  );

  const loadTemplate = (templateKey) => {
    const template = PRESET_TEMPLATES[templateKey];
    if (!template) return;
    setNodes(template.nodes);
    setEdges(template.edges);
    setGraphName(template.name);
    setSelectedNodeId(null);
    setLoadedGraphId(null);
    setCompileResult(null);
    setOutputTab('output');
  };

  const newGraph = () => {
    if (!window.confirm('Clear the canvas and start a new graph?')) return;
    setNodes([]);
    setEdges([]);
    setSelectedNodeId(null);
    setLoadedGraphId(null);
    setGraphName('My Pipeline');
    setCompileResult(null);
    setOutputTab('output');
  };

  const buildGraph = () => serializeGraph(nodes, edges);

  const serializeGraphAction = () => {
    setSerialized(JSON.stringify(buildGraph(), null, 2));
    setOutputTab('output');
  };

  const clearSerialized = () => setSerialized('');
  const clearCompileResult = () => setCompileResult(null);

  const callCompiler = async (path, body) => {
    setBusy(true);
    setCompileResult(null);
    setOutputTab('output');
    try {
      const { res, json } = await request(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setCompileResult({ ok: res.ok, status: res.status, path, result: json });
    } catch (error) {
      setCompileResult({ ok: false, status: 0, path, result: { error: 'Request failed', detail: error.message, apiBase: API_BASE } });
    } finally {
      setBusy(false);
    }
  };

  const validateGraph = () => callCompiler('/api/graphs/validate', { graph: buildGraph() });
  const compileGraph = () => callCompiler('/api/graphs/compile', { graph: buildGraph() });
  const simulateGraph = () =>
    callCompiler('/api/graphs/simulate', {
      graph: buildGraph(),
      events: [
        { deviceId: 'turbine-01', metric: 'temperature', value: 78, unit: 'C' },
        { deviceId: 'turbine-01', metric: 'temperature', value: 82, unit: 'C' },
        { deviceId: 'turbine-01', metric: 'temperature', value: 85, unit: 'C' },
      ],
    });

  const activateGraph = async () => {
    const graph = buildGraph();
    if (graph.nodes.length === 0) {
      setCompileResult({ ok: false, status: 0, path: '/api/graphs/compile', result: { error: 'Add at least one node before activating' } });
      setOutputTab('output');
      return;
    }

    setBusy(true);
    setCompileResult(null);
    setOutputTab('output');
    try {
      const { res, json } = await request('/api/graphs/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          graph,
          activate: true,
          graphId: loadedGraphId || undefined,
          name: graphName.trim() || 'Ad-hoc rule',
        }),
      });
      setCompileResult({ ok: res.ok, status: res.status, path: '/api/graphs/compile (activate)', result: json });
      await refreshActive();
    } catch (error) {
      setCompileResult({ ok: false, status: 0, path: '/api/graphs/compile (activate)', result: { error: 'Request failed', detail: error.message, apiBase: API_BASE } });
    } finally {
      setBusy(false);
    }
  };

  const deactivateGraph = async (runtimeId = null) => {
    setBusy(true);
    setOutputTab('output');
    try {
      const { res, json } = await request('/api/graphs/deactivate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(runtimeId ? { runtimeId } : { all: true }),
      });
      setCompileResult({ ok: res.ok, status: res.status, path: '/api/graphs/deactivate', result: json });
      await refreshActive();
    } catch (error) {
      setCompileResult({ ok: false, status: 0, path: '/api/graphs/deactivate', result: { error: 'Request failed', detail: error.message, apiBase: API_BASE } });
    } finally {
      setBusy(false);
    }
  };

  const activateSavedGraph = async (id) => {
    setSavedBusy(true);
    setOutputTab('output');
    try {
      const { res, json } = await request(`/api/graphs/saved/${id}/activate`, { method: 'POST' });
      setCompileResult({ ok: res.ok, status: res.status, path: `/api/graphs/saved/${id}/activate`, result: json });
      await refreshActive();
    } catch (error) {
      setCompileResult({ ok: false, status: 0, path: `/api/graphs/saved/${id}/activate`, result: { error: 'Request failed', detail: error.message, apiBase: API_BASE } });
    } finally {
      setSavedBusy(false);
    }
  };

  const sendTestTelemetry = async () => {
    const source = nodes.find((n) => n.type === 'dataSource');
    const deviceId = String(source?.data?.deviceId || 'turbine-01');
    const metric = String(source?.data?.metric || 'temperature');
    const unit = String(source?.data?.unit || 'C');
    const values = [72, 78, 82, 85, 90, 95, 99];
    const now = Date.now();
    const points = values.map((value, index) => ({
      deviceId,
      metric,
      value,
      unit,
      timestamp: new Date(now - (values.length - index) * 1000).toISOString(),
      source: 'canvas-test',
    }));

    setBusy(true);
    setOutputTab('telemetry');
    try {
      const { res, json } = await request('/api/telemetry/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(points),
      });
      setCompileResult({ ok: res.ok, status: res.status, path: '/api/telemetry/ingest', result: json });
    } catch (error) {
      setCompileResult({ ok: false, status: 0, path: '/api/telemetry/ingest', result: { error: 'Request failed', detail: error.message, apiBase: API_BASE } });
    } finally {
      setBusy(false);
    }
  };

  const saveGraph = async () => {
    const name = graphName.trim();
    if (!name) {
      setCompileResult({ ok: false, status: 0, path: '/api/graphs/saved', result: { error: 'Enter a graph name first' } });
      setOutputTab('output');
      return;
    }

    setSavedBusy(true);
    const path = loadedGraphId ? `/api/graphs/saved/${loadedGraphId}` : '/api/graphs/saved';
    try {
      const { res, json } = await request(path, {
        method: loadedGraphId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, graph: buildGraph() }),
      });
      setCompileResult({ ok: res.ok, status: res.status, path, result: json });
      setOutputTab('output');
      if (res.ok && json.item?._id) setLoadedGraphId(String(json.item._id));
      await fetchSavedGraphs();
    } catch (error) {
      setCompileResult({ ok: false, status: 0, path, result: { error: 'Request failed', detail: error.message, apiBase: API_BASE } });
    } finally {
      setSavedBusy(false);
    }
  };

  const loadGraph = async (id) => {
    setSavedBusy(true);
    try {
      const { res, json } = await request(`/api/graphs/saved/${id}`);
      const item = json.item;
      if (!res.ok || !item?.graph) {
        setCompileResult({ ok: false, status: res.status, path: `/api/graphs/saved/${id}`, result: json });
        setOutputTab('output');
        return;
      }

      const nextNodes = (Array.isArray(item.graph.nodes) ? item.graph.nodes : []).map((node, index) => ({
        id: String(node.id || `node-${index}`),
        type: node.type,
        position: node.position || { x: 0, y: 0 },
        data: node.data || {},
      }));
      const nextEdges = (Array.isArray(item.graph.edges) ? item.graph.edges : []).map((edge, index) => ({
        id: String(edge.id || `edge-${index}`),
        source: String(edge.source),
        target: String(edge.target),
        sourceHandle: edge.sourceHandle ?? null,
        targetHandle: edge.targetHandle ?? null,
        type: edge.type || 'smoothstep',
      }));

      setNodes(nextNodes);
      setEdges(nextEdges);
      setSelectedNodeId(null);
      setLoadedGraphId(String(item._id));
      if (item.name) setGraphName(item.name);
      setCompileResult({
        ok: true,
        status: res.status,
        path: `/api/graphs/saved/${id}`,
        result: { loaded: item.name, nodeCount: nextNodes.length, edgeCount: nextEdges.length },
      });
      setOutputTab('output');
    } catch (error) {
      setCompileResult({ ok: false, status: 0, path: `/api/graphs/saved/${id}`, result: { error: 'Request failed', detail: error.message, apiBase: API_BASE } });
    } finally {
      setSavedBusy(false);
    }
  };

  const deleteGraph = async (id) => {
    if (!window.confirm('Delete this saved graph?')) return;
    setSavedBusy(true);
    try {
      const { res, json } = await request(`/api/graphs/saved/${id}`, { method: 'DELETE' });
      setCompileResult({ ok: res.ok, status: res.status, path: `/api/graphs/saved/${id}`, result: json });
      setOutputTab('output');
      if (res.ok && loadedGraphId === id) setLoadedGraphId(null);
      await fetchSavedGraphs();
      await refreshActive();
    } catch (error) {
      setCompileResult({ ok: false, status: 0, path: `/api/graphs/saved/${id}`, result: { error: 'Request failed', detail: error.message, apiBase: API_BASE } });
    } finally {
      setSavedBusy(false);
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-title">
          <h1>NexusFlow</h1>
          <p>Visual IoT Telemetry &amp; Rule Engine</p>
        </div>
        <div className="topbar-status">
          <span className={`live-pill ${liveStatus}`}>
            <span className="live-dot" />
            {liveLabel}
          </span>
          <span className={`rule-pill ${isActive ? 'active' : ''}`}>
            {isActive
              ? `${activeRules.length} rule${activeRules.length === 1 ? '' : 's'} active`
              : 'No active rules'}
          </span>
          {lastError ? <span className="live-error">{lastError}</span> : null}
          <span className="user-chip" title={`${user?.name || user?.email} (${user?.provider || 'session'})`}>
            {user?.provider === 'google' && <span className="provider-badge google">G</span>}
            {user?.provider === 'facebook' && <span className="provider-badge facebook">f</span>}
            {user?.provider === 'demo' && <span className="provider-badge demo">Demo</span>}
            {user?.provider === 'guest' && <span className="provider-badge guest">Guest</span>}
            {(!user?.provider || user?.provider === 'email' || user?.provider === 'password') && (
              <span className="provider-badge email">✉</span>
            )}
            <span className="user-name-text">{user?.name || user?.email}</span>
            {user?.isOffline && <span className="offline-tag">Local</span>}
          </span>
          <button className="link-button" onClick={logout}>Sign out</button>
        </div>
        <div className="toolbar">
          <div className="toolbar-group">
            <button onClick={() => loadTemplate('default')} title="Load default turbine pipeline">Turbine Template</button>
            <button onClick={() => loadTemplate('anomaly')} title="Load vibration anomaly pipeline">Anomaly Template</button>
          </div>
          <button onClick={validateGraph} disabled={busy}>Validate</button>
          <button onClick={compileGraph} disabled={busy}>Compile</button>
          <button onClick={simulateGraph} disabled={busy}>Simulate</button>
          <button className="primary" onClick={activateGraph} disabled={busy}>
            {isActive ? 'Activate / Update' : 'Activate Live'}
          </button>
          {isActive && (
            <button className="danger" onClick={() => deactivateGraph(null)} disabled={busy}>Stop All</button>
          )}
          <button onClick={sendTestTelemetry} disabled={busy}>Push Test Telemetry</button>
          <button onClick={serializeGraphAction}>Serialize</button>
        </div>
      </header>

      {/* Mobile Workspace View Switcher (< 960px) */}
      <nav className="mobile-view-nav" aria-label="Mobile workspace view switcher">
        <button
          type="button"
          className={`mobile-tab-btn ${mobileView === 'library' ? 'active' : ''}`}
          onClick={() => setMobileView('library')}
        >
          <span className="mobile-tab-icon">📚</span>
          <span>Node Library</span>
        </button>
        <button
          type="button"
          className={`mobile-tab-btn ${mobileView === 'canvas' ? 'active' : ''}`}
          onClick={() => setMobileView('canvas')}
        >
          <span className="mobile-tab-icon">⚡</span>
          <span>Rule Canvas</span>
        </button>
        <button
          type="button"
          className={`mobile-tab-btn ${mobileView === 'sidebar' ? 'active' : ''}`}
          onClick={() => setMobileView('sidebar')}
        >
          <span className="mobile-tab-icon">📊</span>
          <span>Output &amp; Alerts</span>
        </button>
      </nav>

      <main className={`workspace workspace-week2 mobile-view-${mobileView}`}>
        <aside className="palette">
          <div className="palette-header">
            <h2>Node Library</h2>
            <span className="palette-badge-total">
              {NODE_LIBRARY.reduce((acc, g) => acc + g.items.length, 0)} Nodes
            </span>
          </div>
          <div className="palette-instruction">
            Drag nodes onto canvas or click <strong>+</strong> to add.
          </div>
          <div className="palette-search-wrap">
            <span className="palette-search-icon" aria-hidden="true">🔍</span>
            <input
              type="text"
              className="palette-search-input"
              placeholder="Filter library nodes..."
              value={librarySearch}
              onChange={(e) => setLibrarySearch(e.target.value)}
              aria-label="Filter library nodes"
            />
            {librarySearch && (
              <button
                type="button"
                className="palette-search-clear"
                onClick={() => setLibrarySearch('')}
                title="Clear filter"
              >
                ×
              </button>
            )}
          </div>
          {filteredLibrary.map((group) => (
            <div key={group.category} className={`palette-group group-${group.category.toLowerCase().replace(/\s+/g, '-')}`}>
              <div className="palette-group-title">
                <span className="palette-cat-icon">{group.icon || '📁'}</span>
                <span className="palette-cat-text">{group.category}</span>
                <span className="palette-cat-count">{group.items.length}</span>
              </div>
              <div className="palette-items">
                {group.items.map((item) => (
                  <div
                    key={item.label}
                    className={`palette-item-draggable type-${item.type}`}
                    draggable
                    onDragStart={(e) => onDragStart(e, item.type, item.defaults)}
                    title={`Drag ${item.label} onto canvas`}
                  >
                    <span className="drag-handle" title="Drag onto canvas">⋮⋮</span>
                    <span className="palette-item-icon">{item.icon || '📦'}</span>
                    <div className="palette-item-info">
                      <div className="item-label">{item.label}</div>
                      {item.desc && <div className="palette-item-desc">{item.desc}</div>}
                    </div>
                    {item.tag && <span className="palette-item-tag">{item.tag}</span>}
                    <button
                      type="button"
                      className="palette-add-btn"
                      onClick={() => addNode(item.type, item.defaults)}
                      title={`Add ${item.label} to canvas`}
                    >
                      +
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {filteredLibrary.length === 0 && (
            <div className="palette-empty-search">
              No nodes matching &ldquo;{librarySearch}&rdquo;
            </div>
          )}

          <div className="palette-group saved-graphs">
            <div className="palette-group-title">Saved Graphs</div>
            <div className="save-row">
              <input
                value={graphName}
                onChange={(e) => setGraphName(e.target.value)}
                placeholder="Graph name"
                aria-label="Graph name"
              />
              <button onClick={saveGraph} disabled={savedBusy}>{loadedGraphId ? 'Update' : 'Save'}</button>
            </div>
            <button className="saved-refresh" onClick={newGraph} disabled={savedBusy}>New graph</button>
            <div className="saved-list">
              {savedGraphs.length === 0
                ? <div className="palette-help">No saved graphs yet.</div>
                : savedGraphs.map((item) => {
                  const ruleRunning = activeRules.some((rule) => rule.graphId === String(item._id));
                  return (
                    <div className="saved-item" key={item._id}>
                      <button className="saved-load" onClick={() => loadGraph(item._id)} title={`Load ${item.name}`}>
                        {item.name}
                      </button>
                      <button
                        className={`saved-activate ${ruleRunning ? 'active' : ''}`}
                        onClick={() => activateSavedGraph(item._id)}
                        disabled={savedBusy}
                        title={ruleRunning ? `Re-activate ${item.name}` : `Activate ${item.name}`}
                      >
                        ▶
                      </button>
                      <button className="saved-delete" onClick={() => deleteGraph(item._id)} title="Delete saved graph">×</button>
                    </div>
                  );
                })}
            </div>
            <button className="saved-refresh" onClick={fetchSavedGraphs} disabled={savedBusy}>Refresh list</button>
          </div>

          <div className="palette-help">
            <div><strong>Flow:</strong> Data Source → Math Operation(s) → Action Trigger</div>
            <div><strong>Drag &amp; Drop:</strong> Drag nodes anywhere onto the canvas.</div>
            <div><strong>Live rule:</strong> Activate Live, then Push Test Telemetry.</div>
            <div><strong>Multi-rule:</strong> ▶ on a saved graph keeps it running alongside others.</div>
            <div><strong>WS:</strong> <code>{wsUrl}</code></div>
            <div><strong>API:</strong> <code>{API_BASE || 'same origin (/api proxy)'}</code></div>
          </div>
        </aside>

        <section className="canvas-wrap" ref={reactFlowWrapper}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={setReactFlowInstance}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodesDelete={onNodesDelete}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            deleteKeyCode={['Backspace', 'Delete']}
            fitView
          >
            <Background gap={18} size={1} />
            <MiniMap
              nodeColor={(node) => {
                if (node.type === 'dataSource' || node.type === 'source') return '#3b82f6';
                if (node.type === 'mathOperation' || node.type === 'filter') return '#8b5cf6';
                if (node.type === 'actionTrigger' || node.type === 'action') return '#10b981';
                return '#475569';
              }}
              nodeStrokeWidth={2}
              pannable
              zoomable
            />
            <Controls />
            <Panel position="top-left" className="hint-panel">
              Drag nodes from the palette or handles to connect. Press <strong>Delete/Backspace</strong> to remove. Activate to run rules in real-time.
            </Panel>
            <Panel position="top-right" className={`live-alert-panel ${alerts.length ? 'active' : ''}`}>
              <div className="live-alert-title">Live Alerts <span>{alerts.length}</span></div>
              {alerts[0] ? (
                <>
                  <div className="live-alert-message">{alerts[0].message}</div>
                  <div className="live-alert-meta">
                    {alerts[0].ruleName ? `${alerts[0].ruleName} · ` : ''}
                    {alerts[0].label || alerts[0].nodeId} · {formatTime(alerts[0].triggeredAt || alerts[0].createdAt)}
                  </div>
                </>
              ) : (
                <div className="live-alert-empty">No alerts received yet.</div>
              )}
            </Panel>
          </ReactFlow>
        </section>

        <aside className="sidebar sidebar-week2">
          <div className="sidebar-section">
            <div className="sidebar-header">
              <h2>Active Rules{activeRules.length ? ` (${activeRules.length})` : ''}</h2>
              {activeRules.length > 0 && (
                <button className="danger" onClick={() => deactivateGraph(null)} disabled={busy}>Stop all</button>
              )}
            </div>
            {activeRules.length === 0 ? (
              <div className="config-empty">
                No rules running. Activate the canvas or press ▶ on a saved graph.
              </div>
            ) : (
              <div className="active-rule-list">
                {activeRules.map((rule) => (
                  <div className="active-rule-item" key={rule.runtimeId}>
                    <div className="active-rule-top">
                      <span className="active-rule-name">{rule.name || rule.runtimeId}</span>
                      <button
                        className="saved-delete"
                        onClick={() => deactivateGraph(rule.runtimeId)}
                        disabled={busy}
                        title={`Stop ${rule.name || rule.runtimeId}`}
                      >
                        ×
                      </button>
                    </div>
                    <div className="active-rule-meta">
                      {rule.graphId ? 'saved graph' : 'canvas'} · {rule.nodeCount} nodes · {rule.activeGraph?.actionNodeIds?.length || 0} action(s)
                    </div>
                    <div className="active-rule-meta">
                      started {formatTime(rule.activatedAt)}{rule.ownerEmail ? ` · ${rule.ownerEmail}` : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="sidebar-section">
            <div className="sidebar-header">
              <h2>Node Configuration</h2>
              {selectedNodeId && <button className="danger" onClick={deleteSelected}>Delete</button>}
            </div>
            <NodeConfigPanel node={selectedNode} onChange={updateNodeData} />
          </div>

          <div className="sidebar-section grow">
            <div className="sidebar-header">
              <div className="tab-row">
                <button className={`tab ${outputTab === 'output' ? 'active' : ''}`} onClick={() => setOutputTab('output')}>Output</button>
                <button className={`tab ${outputTab === 'alerts' ? 'active' : ''}`} onClick={() => setOutputTab('alerts')}>
                  Alerts{alerts.length ? ` (${alerts.length})` : ''}
                </button>
                <button className={`tab ${outputTab === 'telemetry' ? 'active' : ''}`} onClick={() => setOutputTab('telemetry')}>Live Data</button>
              </div>
              <div className="header-actions">
                {outputTab === 'alerts' && alerts.length > 0 && <button onClick={clearAlerts}>Clear</button>}
                {outputTab === 'output' && compileResult && <button onClick={clearCompileResult}>Clear Result</button>}
                {outputTab === 'output' && serialized && !compileResult && <button onClick={clearSerialized}>Clear</button>}
              </div>
            </div>
            <div className="tab-body">
              {outputTab === 'output' && (
                <pre className="json-preview">{
                  compileResult
                    ? JSON.stringify(compileResult, null, 2)
                    : (serialized || 'Use "Serialize Graph", "Validate", "Compile", or "Activate Live" to view output.')
                }</pre>
              )}
              {outputTab === 'alerts' && <AlertsPanel alerts={alerts} isActive={isActive} />}
              {outputTab === 'telemetry' && <TelemetryPanel points={telemetry} />}
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}

export default function CanvasPage() {
  return (
    <ReactFlowProvider>
      <CanvasFlowInner />
    </ReactFlowProvider>
  );
}

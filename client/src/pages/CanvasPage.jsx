import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  addEdge,
  Background,
  Controls,
  MiniMap,
  Panel,
  useEdgesState,
  useNodesState,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { DataSourceNode } from '../nodes/DataSourceNode';
import { MathOperationNode } from '../nodes/MathOperationNode';
import { ActionTriggerNode } from '../nodes/ActionTriggerNode';
import { useRealtime } from '../hooks/useRealtime';
import { useAuth } from '../hooks/useAuth';
import { formatMetricValue, formatTime, toNumberOr } from '../utils/format.js';
import { mergeAlerts } from '../utils/realtime.js';
import { serializeGraph } from '../utils/graphSerialization.js';

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

const NODE_LIBRARY = [
  {
    category: 'Data Sources',
    items: [
      { label: 'Sensor Source', type: 'dataSource', defaults: { label: 'Turbine Sensor', kind: 'sensor', deviceId: 'turbine-01', metric: 'temperature', unit: 'C' } },
      { label: 'Simulator', type: 'dataSource', defaults: { label: 'Telemetry Simulator', kind: 'simulator', deviceId: 'sim-01', metric: 'temperature', unit: 'C' } },
    ],
  },
  {
    category: 'Math Operations',
    items: [
      { label: 'Moving Average', type: 'mathOperation', defaults: { label: 'Moving Average', kind: 'movingAverage', windowSize: 5 } },
      { label: 'Threshold', type: 'mathOperation', defaults: { label: 'Threshold Check', kind: 'threshold', operator: '>', threshold: 80, field: 'value' } },
      { label: 'Scale / Offset', type: 'mathOperation', defaults: { label: 'Scale / Offset', kind: 'scale', factor: 1, offset: 0 } },
      { label: 'Delta', type: 'mathOperation', defaults: { label: 'Delta', kind: 'delta' } },
    ],
  },
  {
    category: 'Action Triggers',
    items: [
      { label: 'SMS Alert', type: 'actionTrigger', defaults: { label: 'SMS Alert', kind: 'sms', channel: 'sms', target: '+10000000000', message: 'Threshold exceeded' } },
      { label: 'Webhook', type: 'actionTrigger', defaults: { label: 'Webhook', kind: 'webhook', channel: 'webhook', target: 'https://example.com/hook', url: 'https://example.com/hook', message: 'Rule triggered' } },
      { label: 'Log Alert', type: 'actionTrigger', defaults: { label: 'Log Alert', kind: 'log', channel: 'log', target: 'server-log', message: 'Rule triggered' } },
    ],
  },
];

const initialNodes = [
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
];

const initialEdges = [
  { id: 'e-source-ma', source: 'source-1', target: 'math-1' },
  { id: 'e-ma-th', source: 'math-1', target: 'math-2' },
  { id: 'e-th-action', source: 'math-2', target: 'action-1' },
];

let idCounter = 10;
function nextId(prefix) {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
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
          <span className="telemetry-value">{formatMetricValue(point.value, point.unit)}</span>
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
              <option value="delta">Delta</option>
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
                  </select>
                </div>
                <div>
                  <label>Threshold</label>
                  <input type="number" value={data.threshold ?? 80} onChange={(e) => update({ threshold: toNumberOr(e.target.value, 80) })} />
                </div>
              </div>
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
          {data.kind === 'passthrough' && <div className="config-note">Passes events through unchanged.</div>}
        </>
      )}

      {type === 'actionTrigger' && (
        <>
          <div className="config-row">
            <label>Action Kind</label>
            <select value={data.kind || data.channel || 'sms'} onChange={(e) => {
              const kind = e.target.value;
              const patch = { kind, channel: kind };
              if (kind === 'webhook') { patch.target = data.url || data.target || 'https://example.com/hook'; patch.url = patch.target; }
              if (kind === 'sms') { patch.target = data.phone || data.target || '+10000000000'; }
              update(patch);
            }}>
              <option value="sms">SMS</option>
              <option value="webhook">Webhook</option>
              <option value="email">Email</option>
              <option value="log">Log</option>
            </select>
          </div>
          <div className="config-row">
            <label>{(data.kind === 'webhook') ? 'Webhook URL' : (data.kind === 'email') ? 'Email' : (data.kind === 'log') ? 'Log Target' : 'Phone / Target'}</label>
            <input
              value={data.target || ''}
              onChange={(e) => {
                const v = e.target.value;
                const patch = { target: v };
                if ((data.kind || 'sms') === 'webhook') patch.url = v;
                if ((data.kind || 'sms') === 'sms') patch.phone = v;
                update(patch);
              }}
            />
          </div>
          <div className="config-row">
            <label>Message</label>
            <textarea rows={3} value={data.message || ''} onChange={(e) => update({ message: e.target.value })} />
          </div>
        </>
      )}
    </div>
  );
}

export default function CanvasPage() {
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
  const [historyAlerts, setHistoryAlerts] = useState([]);
  const [flowInstance, setFlowInstance] = useState(null);
  const canvasRef = useRef(null);

  const { user, token, logout, authFetch } = useAuth();

  const {
    status: liveStatus,
    alerts: liveAlerts,
    telemetry,
    ruleStatus,
    lastError,
    clearAlerts,
    wsUrl,
  } = useRealtime(token);

  // Live frames and persisted history overlap; mergeAlerts removes duplicates.
  const alerts = useMemo(
    () => mergeAlerts(liveAlerts, historyAlerts),
    [liveAlerts, historyAlerts]
  );

  const clearAllAlerts = useCallback(() => {
    clearAlerts();
    setHistoryAlerts([]);
  }, [clearAlerts]);

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
      // legacy aliases
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
      // Keep the canvas usable when the API is offline.
    }
  }, [authFetch]);

  const refreshActive = useCallback(async () => {
    try {
      const res = await authFetch('/api/graphs/active');
      const json = await res.json().catch(() => ({}));
      if (res.ok) setServerRuleStatus(json);
    } catch {
      // The WebSocket status will update once connected.
    }
  }, [authFetch]);

  useEffect(() => {
    fetchSavedGraphs();
    refreshActive();
  }, [fetchSavedGraphs, refreshActive]);

  useEffect(() => {
    if (ruleStatus) setServerRuleStatus(ruleStatus);
  }, [ruleStatus]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch('/api/alerts?limit=50');
        const json = await res.json().catch(() => ({}));
        if (!cancelled && res.ok && Array.isArray(json.items)) setHistoryAlerts(json.items);
      } catch {
        // History is a convenience; live alerts keep working without it.
      }
    })();
    return () => { cancelled = true; };
  }, [authFetch]);

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

  const addNodeAt = (type, defaults, position) => {
    const prefix = type === 'dataSource' ? 'source' : type === 'mathOperation' ? 'math' : 'action';
    let id;
    do {
      id = nextId(prefix);
    } while (nodes.some((node) => node.id === id));

    setNodes((nds) => nds.concat({ id, type, position, data: { ...defaults } }));
    setSelectedNodeId(id);
  };

  const addNode = (type, defaults) => {
    const position = { x: 120 + Math.random() * 420, y: 80 + Math.random() * 260 };
    addNodeAt(type, defaults, position);
  };

  const onPaletteDragStart = (event, item) => {
    event.dataTransfer.setData('application/reactflow', JSON.stringify(item));
    event.dataTransfer.effectAllowed = 'move';
  };

  const onCanvasDragOver = (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  const onCanvasDrop = (event) => {
    event.preventDefault();
    const raw = event.dataTransfer.getData('application/reactflow');
    if (!raw) return;

    let item;
    try {
      item = JSON.parse(raw);
    } catch {
      return;
    }
    if (!item?.type) return;

    const bounds = canvasRef.current?.getBoundingClientRect();
    const position = flowInstance?.project && bounds
      ? flowInstance.project({
          x: event.clientX - bounds.left,
          y: event.clientY - bounds.top,
        })
      : { x: event.clientX, y: event.clientY };

    addNodeAt(item.type, item.defaults || {}, position);
  };

  const updateNodeData = useCallback((id, data) => {
    setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data } : n)));
  }, [setNodes]);

  const deleteSelected = () => {
    if (!selectedNodeId) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId));
    setEdges((eds) => eds.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId));
    setSelectedNodeId(null);
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

  const buildGraph = () => serializeGraph({ nodes, edges });

  const serializeGraph = () => {
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
  const simulateGraph = () => callCompiler('/api/graphs/simulate', {
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
        type: edge.type || 'default',
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
          <span className="user-chip" title={user?.email || ''}>{user?.name || user?.email}</span>
          <button className="link-button" onClick={logout}>Sign out</button>
        </div>
        <div className="toolbar">
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
          <button onClick={serializeGraph}>Serialize</button>
        </div>
      </header>

      <main className="workspace workspace-week2">
        <aside className="palette">
          <div className="palette-header"><h2>Node Library</h2></div>
          {NODE_LIBRARY.map((group) => (
            <div key={group.category} className="palette-group">
              <div className="palette-group-title">{group.category}</div>
              <div className="palette-items">
                {group.items.map((item) => (
                  <button
                    key={item.label}
                    className="palette-item"
                    draggable
                    onDragStart={(event) => onPaletteDragStart(event, item)}
                    onClick={() => addNode(item.type, item.defaults)}
                    title="Drag onto the canvas, or click to add"
                  >
                    + {item.label}
                  </button>
                ))}
              </div>
            </div>
          ))}

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
            <div><strong>Live rule:</strong> Activate Live, then Push Test Telemetry.</div>
            <div><strong>Multi-rule:</strong> ▶ on a saved graph keeps it running alongside others.</div>
            <div><strong>WS:</strong> <code>{wsUrl}</code></div>
            <div><strong>API:</strong> <code>{API_BASE || 'same origin (/api proxy)'}</code></div>
          </div>
        </aside>

        <section
          className="canvas-wrap"
          ref={canvasRef}
          onDragOver={onCanvasDragOver}
          onDrop={onCanvasDrop}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onInit={setFlowInstance}
            nodeTypes={nodeTypes}
            fitView
          >
            <Background gap={18} size={1} />
            <MiniMap pannable zoomable />
            <Controls />
            <Panel position="top-left" className="hint-panel">
              Drag from handles to connect. Select a node to edit config. Activate the canvas or a saved graph to run rules; multiple rules run side by side.
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
                <div className="live-alert-empty">
                  {isActive ? 'Waiting for a rule match…' : 'Activate a rule to receive alerts'}
                </div>
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
                {outputTab === 'alerts' && alerts.length > 0 && <button onClick={clearAllAlerts}>Clear</button>}
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

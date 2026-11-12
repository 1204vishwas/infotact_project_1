import { useCallback, useMemo, useState } from 'react';
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
import { SourceNode } from '../nodes/SourceNode';
import { FilterNode } from '../nodes/FilterNode';
import { ActionNode } from '../nodes/ActionNode';

const initialNodes = [
  {
    id: 'source-1',
    type: 'source',
    position: { x: 80, y: 180 },
    data: { label: 'Turbine Sensor', deviceId: 'turbine-01', metric: 'temperature', unit: 'C' },
  },
  {
    id: 'filter-1',
    type: 'filter',
    position: { x: 380, y: 180 },
    data: { label: 'Moving Average Filter', windowSize: 5, threshold: 80, operator: '>' },
  },
  {
    id: 'action-1',
    type: 'action',
    position: { x: 700, y: 180 },
    data: { label: 'SMS Alert', channel: 'sms', target: '+10000000000' },
  },
];

const initialEdges = [
  { id: 'e-source-filter', source: 'source-1', target: 'filter-1', animated: false },
  { id: 'e-filter-action', source: 'filter-1', target: 'action-1', animated: false },
];

let idCounter = 2;

function nextId(prefix) {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

export default function CanvasPage() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [serialized, setSerialized] = useState('');

  const nodeTypes = useMemo(
    () => ({
      source: SourceNode,
      filter: FilterNode,
      action: ActionNode,
    }),
    []
  );

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge({ ...params, animated: false }, eds)),
    [setEdges]
  );

  const addNode = (type) => {
    const position = { x: 120 + Math.random() * 500, y: 80 + Math.random() * 280 };
    if (type === 'source') {
      setNodes((nds) =>
        nds.concat({
          id: nextId('source'),
          type: 'source',
          position,
          data: { label: 'Sensor Source', deviceId: 'device-new', metric: 'temperature', unit: 'C' },
        })
      );
    } else if (type === 'filter') {
      setNodes((nds) =>
        nds.concat({
          id: nextId('filter'),
          type: 'filter',
          position,
          data: { label: 'Threshold Filter', windowSize: 5, threshold: 80, operator: '>' },
        })
      );
    } else {
      setNodes((nds) =>
        nds.concat({
          id: nextId('action'),
          type: 'action',
          position,
          data: { label: 'Alert Action', channel: 'sms', target: '+10000000000' },
        })
      );
    }
  };

  const serializeGraph = () => {
    const graph = {
      version: 1,
      exportedAt: new Date().toISOString(),
      nodes: nodes.map(({ id, type, position, data }) => ({ id, type, position, data })),
      edges: edges.map(({ id, source, target, sourceHandle, targetHandle, type }) => ({
        id,
        source,
        target,
        sourceHandle: sourceHandle ?? null,
        targetHandle: targetHandle ?? null,
        type: type ?? 'default',
      })),
    };
    setSerialized(JSON.stringify(graph, null, 2));
  };

  const clearSerialized = () => setSerialized('');

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <h1>NexusFlow</h1>
          <p>Week 1 — Visual Graph Builder & Telemetry Setup</p>
        </div>
        <div className="toolbar">
          <button onClick={() => addNode('source')}>+ Sensor</button>
          <button onClick={() => addNode('filter')}>+ Filter</button>
          <button onClick={() => addNode('action')}>+ Action</button>
          <button className="primary" onClick={serializeGraph}>Serialize Graph</button>
        </div>
      </header>

      <main className="workspace">
        <section className="canvas-wrap">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            fitView
          >
            <Background gap={18} size={1} />
            <MiniMap pannable zoomable />
            <Controls />
            <Panel position="top-left" className="hint-panel">
              Drag nodes, connect handles, then serialize the graph to JSON.
            </Panel>
          </ReactFlow>
        </section>

        <aside className="sidebar">
          <div className="sidebar-header">
            <h2>Serialized Graph JSON</h2>
            {serialized && <button onClick={clearSerialized}>Clear</button>}
          </div>
          <pre className="json-preview">{serialized || 'Click "Serialize Graph" to export nodes and edges.'}</pre>
        </aside>
      </main>
    </div>
  );
}

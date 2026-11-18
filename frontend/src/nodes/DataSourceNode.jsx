import { Handle, Position } from 'reactflow';

export function DataSourceNode({ data, selected }) {
  const kindLabel = data.kind === 'simulator' ? 'Simulator' : data.kind === 'gateway' ? 'Gateway' : 'Sensor';
  return (
    <div className={`node-card source ${selected ? 'selected' : ''}`}>
      <div className="node-badge">Data Source</div>
      <div className="node-title">{data.label || 'Data Source'}</div>
      <div className="node-meta">Kind: {kindLabel}</div>
      <div className="node-meta">Device: {data.deviceId || 'n/a'}</div>
      <div className="node-meta">Metric: {data.metric || 'n/a'}{data.unit ? ` (${data.unit})` : ''}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

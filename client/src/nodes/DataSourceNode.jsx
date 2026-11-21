import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';

function getKindConfig(kind) {
  switch (kind) {
    case 'simulator':
      return { label: 'Simulator', icon: '⚡', color: '#38bdf8', badgeClass: 'badge-simulator', desc: 'Synthetic generator' };
    case 'gateway':
      return { label: 'IoT Gateway', icon: '🌐', color: '#60a5fa', badgeClass: 'badge-gateway', desc: 'Edge aggregator' };
    case 'sensor':
    default:
      return { label: 'Sensor Device', icon: '📡', color: '#0ea5e9', badgeClass: 'badge-sensor', desc: 'Telemetry stream' };
  }
}

export const DataSourceNode = memo(function DataSourceNode({ id, data = {}, selected }) {
  const { label, kind = 'sensor', deviceId, metric, unit, status = 'streaming' } = data;
  const kindConfig = getKindConfig(kind);

  return (
    <div className={`node-card source custom-node data-source-node ${selected ? 'selected' : ''}`}>
      {/* Node Header */}
      <div className="custom-node-header">
        <div className="custom-node-type-wrap">
          <span className="custom-node-icon" aria-hidden="true">{kindConfig.icon}</span>
          <span className="node-badge">{kindConfig.label}</span>
        </div>
        <div className="custom-node-status" title={`Status: ${status}`}>
          <span className="status-dot live-pulse" />
          <span className="status-label">{status.toUpperCase()}</span>
        </div>
      </div>

      {/* Node Title & ID */}
      <div className="custom-node-title-row">
        <div className="node-title" title={label || 'Data Source'}>{label || 'Data Source'}</div>
        {id && <span className="custom-node-id">#{id}</span>}
      </div>

      {/* Main Metric Banner */}
      <div className="custom-node-metric-banner">
        <div className="metric-primary">
          <span className="metric-name">{metric || 'telemetry'}</span>
          {unit && <span className="metric-unit">[{unit}]</span>}
        </div>
        <span className="metric-desc">{kindConfig.desc}</span>
      </div>

      {/* Metadata Fields */}
      <div className="custom-node-meta-grid">
        <div className="node-meta meta-pill" title={`Device ID: ${deviceId || '*'}`}>
          <span className="meta-key">Device</span>
          <span className="meta-val">{deviceId || '* (any)'}</span>
        </div>
        <div className="node-meta meta-pill" title={`Kind: ${kindConfig.label}`}>
          <span className="meta-key">Type</span>
          <span className="meta-val">{kindConfig.label}</span>
        </div>
      </div>

      {/* Output Port Footer */}
      <div className="custom-node-port-footer port-right">
        <span className="port-tag">Telemetry Out ➔</span>
        <Handle
          type="source"
          position={Position.Right}
          className="custom-handle source-handle"
          title="Telemetry stream output"
        />
      </div>
    </div>
  );
});

export default DataSourceNode;

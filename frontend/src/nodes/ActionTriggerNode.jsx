import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';

function getActionConfig(kind = 'sms') {
  const norm = String(kind).toLowerCase();
  switch (norm) {
    case 'webhook':
      return {
        label: 'Webhook Alert',
        icon: '🌐',
        channelName: 'HTTP POST',
        badgeClass: 'badge-webhook',
        targetLabel: 'Endpoint URL',
        defaultTarget: 'https://api.domain.com/hook',
      };
    case 'email':
      return {
        label: 'Email Alert',
        icon: '✉️',
        channelName: 'SMTP / SES',
        badgeClass: 'badge-email',
        targetLabel: 'Recipient Email',
        defaultTarget: 'ops@nexusflow.io',
      };
    case 'log':
      return {
        label: 'Log Trigger',
        icon: '📜',
        channelName: 'System Logger',
        badgeClass: 'badge-log',
        targetLabel: 'Log Stream',
        defaultTarget: 'stdout / audit.log',
      };
    case 'alert':
      return {
        label: 'Console Alert',
        icon: '🔔',
        channelName: 'WebSocket Push',
        badgeClass: 'badge-alert',
        targetLabel: 'Broadcast Hub',
        defaultTarget: 'live-console',
      };
    case 'sms':
    default:
      return {
        label: 'SMS Alert',
        icon: '📱',
        channelName: 'Twilio SMS',
        badgeClass: 'badge-sms',
        targetLabel: 'Phone Number',
        defaultTarget: '+1 (555) 019-2834',
      };
  }
}

function renderMessagePreview(message) {
  if (!message) return <span className="message-empty">No message configured</span>;
  const str = String(message);
  // Split on template variables like {value}, {deviceId}, {threshold}, {metric}
  const parts = str.split(/(\{[^}]+\})/g);

  return (
    <div className="action-template-box" title={str}>
      <span className="template-quote">“</span>
      {parts.map((part, idx) => {
        if (/^\{[^}]+\}$/.test(part)) {
          const varName = part.slice(1, -1);
          return (
            <span key={idx} className="template-token" title={`Template Variable: ${varName}`}>
              {varName}
            </span>
          );
        }
        return <span key={idx}>{part}</span>;
      })}
      <span className="template-quote">”</span>
    </div>
  );
}

export const ActionTriggerNode = memo(function ActionTriggerNode({ id, data = {}, selected }) {
  const kind = data.kind || data.channel || 'sms';
  const target = data.target || data.url || data.phone || data.email || '';
  const severity = (data.severity || 'critical').toLowerCase();
  const config = getActionConfig(kind);

  return (
    <div className={`node-card action custom-node action-trigger-node ${selected ? 'selected' : ''}`}>
      {/* Target (Input) Handle */}
      <Handle
        type="target"
        position={Position.Left}
        className="custom-handle target-handle"
        title="Trigger input from upstream rule"
      />

      {/* Node Header */}
      <div className="custom-node-header">
        <div className="custom-node-type-wrap">
          <span className="custom-node-icon" aria-hidden="true">{config.icon}</span>
          <span className="node-badge">Action Trigger</span>
        </div>
        <span className={`severity-tag severity-${severity}`} title={`Severity: ${severity}`}>
          <span className="severity-dot" />
          {severity.toUpperCase()}
        </span>
      </div>

      {/* Node Title & ID */}
      <div className="custom-node-title-row">
        <div className="node-title" title={data.label || 'Action Trigger'}>
          {data.label || 'Action Trigger'}
        </div>
        {id && <span className="custom-node-id">#{id}</span>}
      </div>

      {/* Destination / Target Banner */}
      <div className="action-destination-card" title={`${config.targetLabel}: ${target || 'n/a'}`}>
        <div className="destination-top">
          <span className="destination-channel">{config.channelName}</span>
          <span className="destination-kind">{kind.toUpperCase()}</span>
        </div>
        <div className="destination-target">
          <span className="target-icon">↳</span>
          <span className="target-text">{target || config.defaultTarget}</span>
        </div>
      </div>

      {/* Message Template Preview */}
      <div className="action-message-wrap">
        <div className="message-label">Payload Template</div>
        {renderMessagePreview(data.message)}
      </div>

      {/* Legacy Node Meta line (maintains 100% backward compatibility) */}
      <div className="node-meta legacy-meta-sr">
        Type: {kind} · Target: {target || 'n/a'}
      </div>

      {/* Terminal Sink Banner */}
      <div className="custom-node-port-footer port-sink">
        <span className="sink-indicator">⏚ Terminal Sink (No Outflow)</span>
      </div>
    </div>
  );
});

export default ActionTriggerNode;

import { Handle, Position } from 'reactflow';

export function ActionTriggerNode({ data, selected }) {
  const kind = data.kind || data.channel || 'sms';
  return (
    <div className={`node-card action ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <div className="node-badge">Action Trigger</div>
      <div className="node-title">{data.label || 'Action Trigger'}</div>
      <div className="node-meta">Type: {kind}</div>
      <div className="node-meta">Target: {data.target || data.url || data.phone || 'n/a'}</div>
      {data.message ? <div className="node-meta">Message: {String(data.message).slice(0, 28)}{String(data.message).length > 28 ? '…' : ''}</div> : null}
    </div>
  );
}

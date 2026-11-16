import { Handle, Position } from 'reactflow';

function describe(data) {
  const kind = data.kind || 'threshold';
  if (kind === 'movingAverage') return `Moving avg · window ${data.windowSize ?? 5}`;
  if (kind === 'threshold') return `Threshold · value ${data.operator || '>'} ${data.threshold ?? 80}`;
  if (kind === 'scale') return `Scale · x${data.factor ?? 1} + ${data.offset ?? 0}`;
  if (kind === 'delta') return 'Delta · change from previous';
  if (kind === 'passthrough') return 'Passthrough';
  return `Math · ${kind}`;
}

export function MathOperationNode({ data, selected }) {
  return (
    <div className={`node-card filter ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <div className="node-badge">Math Operation</div>
      <div className="node-title">{data.label || 'Math Operation'}</div>
      <div className="node-meta">{describe(data)}</div>
      {data.field ? <div className="node-meta">Field: {data.field}</div> : null}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

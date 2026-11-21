import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';

function getMathConfig(kind = 'threshold') {
  switch (kind) {
    case 'movingAverage':
      return {
        label: 'Moving Average',
        icon: '📈',
        badge: 'Window Filter',
        categoryClass: 'badge-ma',
        typeTag: 'Smoothing',
      };
    case 'threshold':
    case 'comparison':
      return {
        label: 'Threshold',
        icon: '⚖️',
        badge: 'Comparison',
        categoryClass: 'badge-threshold',
        typeTag: 'Evaluator',
      };
    case 'scale':
      return {
        label: 'Scale / Offset',
        icon: '✖️',
        badge: 'Linear Transform',
        categoryClass: 'badge-scale',
        typeTag: 'Multiplier',
      };
    case 'delta':
      return {
        label: 'Delta Spike',
        icon: 'Δ',
        badge: 'Differential',
        categoryClass: 'badge-delta',
        typeTag: 'Derivative',
      };
    case 'rateOfChange':
      return {
        label: 'Rate of Change',
        icon: '⏱️',
        badge: 'Gradient',
        categoryClass: 'badge-rate',
        typeTag: 'Slope (Δv/Δt)',
      };
    case 'min':
      return {
        label: 'Minimum Accumulator',
        icon: '📉',
        badge: 'Extremum',
        categoryClass: 'badge-min',
        typeTag: 'Lower Bound',
      };
    case 'max':
      return {
        label: 'Maximum Accumulator',
        icon: '📊',
        badge: 'Extremum',
        categoryClass: 'badge-max',
        typeTag: 'Upper Bound',
      };
    case 'passthrough':
      return {
        label: 'Passthrough',
        icon: '⏩',
        badge: 'Bypass',
        categoryClass: 'badge-passthrough',
        typeTag: 'Identity',
      };
    default:
      return {
        label: kind,
        icon: '🧮',
        badge: 'Math Operation',
        categoryClass: 'badge-default',
        typeTag: 'Transform',
      };
  }
}

function renderFormula(data) {
  const kind = data.kind || 'threshold';
  if (kind === 'movingAverage') {
    const window = data.windowSize ?? 5;
    return (
      <div className="math-formula-box">
        <div className="formula-expr">
          <span className="formula-fn">SMA</span>
          <span className="formula-paren">(</span>
          <span className="formula-var">{data.field || 'value'}</span>
          <span className="formula-comma">, </span>
          <span className="formula-param">w={window}</span>
          <span className="formula-paren">)</span>
        </div>
        <div className="formula-sub">Sliding window across last {window} points</div>
      </div>
    );
  }

  if (kind === 'threshold' || kind === 'comparison') {
    const field = data.field || 'value';
    const op = data.operator || '>';
    const th = data.threshold ?? 80;
    const isRange = op === 'between' || op === 'outside';
    const sec = data.secondaryThreshold ?? th;
    return (
      <div className="math-formula-box">
        <div className="formula-expr condition">
          <span className="formula-var">{field}</span>
          <span className="formula-op">{op}</span>
          {isRange ? (
            <span className="formula-val">[{Math.min(th, sec)}, {Math.max(th, sec)}]</span>
          ) : (
            <span className="formula-val">{th}</span>
          )}
        </div>
        <div className="formula-sub">Passes events matching condition</div>
      </div>
    );
  }

  if (kind === 'scale') {
    const factor = data.factor ?? 1;
    const offset = data.offset ?? 0;
    return (
      <div className="math-formula-box">
        <div className="formula-expr">
          <span className="formula-val">y</span>
          <span className="formula-op">=</span>
          <span className="formula-paren">(</span>
          <span className="formula-var">x</span>
          <span className="formula-op">×</span>
          <span className="formula-val">{factor}</span>
          <span className="formula-paren">)</span>
          <span className="formula-op">+</span>
          <span className="formula-val">{offset}</span>
        </div>
        <div className="formula-sub">Factor x{factor} · Offset +{offset}</div>
      </div>
    );
  }

  if (kind === 'delta') {
    return (
      <div className="math-formula-box">
        <div className="formula-expr">
          <span className="formula-fn">Δ</span>
          <span className="formula-op">=</span>
          <span className="formula-var">val(t)</span>
          <span className="formula-op">-</span>
          <span className="formula-var">val(t-1)</span>
        </div>
        <div className="formula-sub">Calculates step change from prior reading</div>
      </div>
    );
  }

  if (kind === 'rateOfChange') {
    return (
      <div className="math-formula-box">
        <div className="formula-expr">
          <span className="formula-fn">d/dt</span>
          <span className="formula-op">=</span>
          <span className="formula-paren">(</span>
          <span className="formula-var">Δv</span>
          <span className="formula-op">/</span>
          <span className="formula-var">Δt</span>
          <span className="formula-paren">)</span>
        </div>
        <div className="formula-sub">First derivative (units per second)</div>
      </div>
    );
  }

  if (kind === 'min' || kind === 'max') {
    return (
      <div className="math-formula-box">
        <div className="formula-expr">
          <span className="formula-fn">{kind.toUpperCase()}</span>
          <span className="formula-paren">(</span>
          <span className="formula-var">series</span>
          <span className="formula-paren">)</span>
        </div>
        <div className="formula-sub">Tracks historic {kind === 'min' ? 'lowest' : 'peak'} value</div>
      </div>
    );
  }

  return (
    <div className="math-formula-box">
      <div className="formula-expr">
        <span className="formula-val">y = x</span>
      </div>
      <div className="formula-sub">Passes stream unmodified</div>
    </div>
  );
}

function describeLegacy(data) {
  const kind = data.kind || 'threshold';
  if (kind === 'movingAverage') return `Moving avg · window ${data.windowSize ?? 5}`;
  if (kind === 'threshold') return `Threshold · value ${data.operator || '>'} ${data.threshold ?? 80}`;
  if (kind === 'scale') return `Scale · x${data.factor ?? 1} + ${data.offset ?? 0}`;
  if (kind === 'delta') return 'Delta · change from previous';
  if (kind === 'rateOfChange') return 'Rate of Change · units/sec';
  if (kind === 'min' || kind === 'max') return `${kind.toUpperCase()} accumulator`;
  if (kind === 'passthrough') return 'Passthrough';
  return `Math · ${kind}`;
}

export const MathOperationNode = memo(function MathOperationNode({ id, data = {}, selected }) {
  const { label, kind = 'threshold', field } = data;
  const config = getMathConfig(kind);

  return (
    <div className={`node-card filter custom-node math-operation-node ${selected ? 'selected' : ''}`}>
      {/* Target (Input) Handle */}
      <Handle
        type="target"
        position={Position.Left}
        className="custom-handle target-handle"
        title="Input stream to transform"
      />

      {/* Node Header */}
      <div className="custom-node-header">
        <div className="custom-node-type-wrap">
          <span className="custom-node-icon" aria-hidden="true">{config.icon}</span>
          <span className="node-badge">Math Operation</span>
        </div>
        <span className="math-type-tag">{config.typeTag}</span>
      </div>

      {/* Node Title & ID */}
      <div className="custom-node-title-row">
        <div className="node-title" title={label || 'Math Operation'}>{label || 'Math Operation'}</div>
        {id && <span className="custom-node-id">#{id}</span>}
      </div>

      {/* Formula & Calculation Box */}
      {renderFormula(data)}

      {/* Legacy Node Meta line (maintains 100% backward compatibility) */}
      <div className="node-meta legacy-meta-sr">{describeLegacy(data)}</div>

      {/* Metadata Pill Row */}
      <div className="custom-node-meta-grid">
        <div className="node-meta meta-pill" title={`Operation: ${config.label}`}>
          <span className="meta-key">Op</span>
          <span className="meta-val">{config.label}</span>
        </div>
        <div className="node-meta meta-pill" title={`Target Field: ${field || 'value'}`}>
          <span className="meta-key">Field</span>
          <span className="meta-val">{field || 'value'}</span>
        </div>
      </div>

      {/* Dual Port Footer */}
      <div className="custom-node-port-footer dual-port">
        <span className="port-tag port-in">➔ In</span>
        <span className="port-tag port-out">Out ➔</span>
      </div>

      {/* Source (Output) Handle */}
      <Handle
        type="source"
        position={Position.Right}
        className="custom-handle source-handle"
        title="Transformed stream output"
      />
    </div>
  );
});

export default MathOperationNode;

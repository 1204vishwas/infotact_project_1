import { useEffect, useState } from 'react';

const TELEMETRY_READINGS = [76.8, 78.2, 79.6, 81.4, 82.9, 79.1];

/**
 * Visualizes a sample three-node NexusFlow telemetry pipeline on the sign-up showcase panel.
 */
export function PipelinePreview() {
  const [tickIndex, setTickIndex] = useState(3);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setTickIndex((prev) => (prev + 1) % TELEMETRY_READINGS.length);
    }, 2200);

    return () => window.clearInterval(intervalId);
  }, []);

  const currentTemp = TELEMETRY_READINGS[tickIndex];
  const isAnomaly = currentTemp > 80;

  return (
    <div className="pipeline-card" aria-label="Sample visual rule pipeline preview">
      <div className="pipeline-card-header">
        <span className="pipeline-pill">
          <span className="status-dot" aria-hidden="true" />
          Live Stream Preview
        </span>
        <span className="pipeline-rule-badge">IF temp &gt; 80°C → SMS</span>
      </div>

      <div className="pipeline-nodes">
        <div className="flow-node flow-node-source">
          <div className="flow-node-top">
            <span className="node-kind">Data Source</span>
            <span className={`node-metric ${isAnomaly ? 'is-alert' : ''}`}>
              {currentTemp.toFixed(1)}°C
            </span>
          </div>
          <div className="flow-node-title">Turbine Sensor #T-04</div>
          <div className="flow-node-sub">MongoDB Time-Series · 5k/sec</div>
        </div>

        <div className="flow-wire" aria-hidden="true">
          <span className="wire-track" />
          <span className="wire-pulse" />
        </div>

        <div className="flow-node flow-node-transform">
          <div className="flow-node-top">
            <span className="node-kind">Math / Filter</span>
            <span className="node-badge">RxJS</span>
          </div>
          <div className="flow-node-title">Moving Average Filter</div>
          <div className="flow-node-sub">5s sliding window · threshold &gt; 80°C</div>
        </div>

        <div className="flow-wire" aria-hidden="true">
          <span className={`wire-track ${isAnomaly ? 'wire-track-alert' : ''}`} />
          <span className={`wire-pulse ${isAnomaly ? 'wire-pulse-alert' : ''}`} />
        </div>

        <div className={`flow-node flow-node-action ${isAnomaly ? 'is-triggered' : ''}`}>
          <div className="flow-node-top">
            <span className="node-kind">Action Trigger</span>
            <span className={`node-state ${isAnomaly ? 'is-alert' : ''}`}>
              {isAnomaly ? 'Triggered' : 'Armed'}
            </span>
          </div>
          <div className="flow-node-title">SMS &amp; Webhook Alert</div>
          <div className="flow-node-sub">Notifies Floor Manager via WebSocket</div>
        </div>
      </div>
    </div>
  );
}

const API_URL = (process.env.API_URL || 'http://localhost:5000').replace(/\/$/, '');
const DEVICE_ID = process.env.DEVICE_ID || 'turbine-01';
const METRIC = process.env.METRIC || 'temperature';
const UNIT = process.env.UNIT || 'C';
const INTERVAL_MS = Math.max(250, Number(process.env.SIM_INTERVAL_MS) || 1000);
const BATCH_SIZE = Math.max(1, Number(process.env.SIM_BATCH_SIZE) || 5);

let tick = 0;

async function sendBatch() {
  const now = Date.now();
  const points = Array.from({ length: BATCH_SIZE }, (_, i) => {
    const phase = (tick * BATCH_SIZE + i) % 40;
    const value = 72 + phase * 0.6 + (Math.random() - 0.5) * 2;
    return {
      deviceId: DEVICE_ID,
      metric: METRIC,
      value: Number(value.toFixed(2)),
      unit: UNIT,
      timestamp: new Date(now + i).toISOString(),
      source: 'simulator-script',
    };
  });
  tick += 1;

  try {
    const res = await fetch(`${API_URL}/api/telemetry/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(points),
    });
    const json = await res.json().catch(() => ({}));
    console.log(`[sim] ${new Date().toISOString()} status=${res.status} ${JSON.stringify(json)}`);
  } catch (error) {
    console.error(`[sim] ingest failed: ${error.message}`);
  }
}

console.log(`[sim] posting ${BATCH_SIZE} points every ${INTERVAL_MS}ms to ${API_URL} (Ctrl+C to stop)`);
const timer = setInterval(sendBatch, INTERVAL_MS);
sendBatch();

process.on('SIGINT', () => {
  clearInterval(timer);
  console.log('\n[sim] stopped');
  process.exit(0);
});

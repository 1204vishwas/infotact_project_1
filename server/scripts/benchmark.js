/**
 * High-Speed Telemetry Ingestion Benchmark
 *
 * Generates batches of realistic hardware telemetry data and tests
 * ingestion throughput against the Express server and MongoDB Time-Series collection.
 */

const BASE_URL = process.env.BENCHMARK_URL || 'http://localhost:5000';

const DEVICES = [
  { deviceId: 'TURBINE-01', deviceType: 'gas_turbine', facilityId: 'PLANT-NORTH', rack: 'BAY-A', slot: 1 },
  { deviceId: 'TURBINE-02', deviceType: 'gas_turbine', facilityId: 'PLANT-NORTH', rack: 'BAY-A', slot: 2 },
  { deviceId: 'ROBOT-ARM-01', deviceType: 'kuka_arm', facilityId: 'ASSEMBLY-WEST', rack: 'CELL-1', slot: 4 },
  { deviceId: 'ROBOT-ARM-02', deviceType: 'kuka_arm', facilityId: 'ASSEMBLY-WEST', rack: 'CELL-2', slot: 4 },
  { deviceId: 'PUMP-CRYO-09', deviceType: 'cryo_pump', facilityId: 'COOLING-BASE', rack: 'CHILLER-3', slot: 1 },
  { deviceId: 'INVERTER-HV-12', deviceType: 'power_inverter', facilityId: 'SUBSTATION-02', rack: 'INV-4', slot: 8 }
];

function generatePoint(device, offsetSeconds = 0) {
  const isAnomaly = Math.random() < 0.03; // 3% anomaly rate
  const tempBase = device.deviceType === 'gas_turbine' ? 78 : 45;
  const temp = parseFloat((tempBase + (Math.random() * 8) + (isAnomaly ? 25 : 0)).toFixed(2));
  const vibration = parseFloat(((Math.random() * 0.4) + (isAnomaly ? 1.5 : 0.05)).toFixed(3));
  const voltage = parseFloat((230 + (Math.random() * 4 - 2)).toFixed(2));
  const current = parseFloat((15 + (Math.random() * 5)).toFixed(2));
  const power = parseFloat((voltage * current).toFixed(1));

  return {
    timestamp: new Date(Date.now() - (offsetSeconds * 1000)).toISOString(),
    metadata: {
      deviceId: device.deviceId,
      deviceType: device.deviceType,
      facilityId: device.facilityId,
      rack: device.rack,
      slot: device.slot,
      firmwareVersion: 'v2.8.4'
    },
    metrics: {
      temperature_c: temp,
      vibration_g: vibration,
      voltage_v: voltage,
      current_a: current,
      power_watts: power,
      rpm: device.deviceType === 'gas_turbine' ? Math.floor(3500 + Math.random() * 200) : 0,
      cpu_usage_pct: parseFloat((20 + Math.random() * 60).toFixed(1)),
      memory_usage_pct: parseFloat((40 + Math.random() * 30).toFixed(1))
    },
    status: isAnomaly ? 'critical' : (temp > 75 ? 'warning' : 'nominal')
  };
}

async function runBenchmark() {
  console.log('⚡ Starting High-Speed Ingestion Benchmark against:', BASE_URL);

  // Check health
  try {
    const healthRes = await fetch(`${BASE_URL}/health`);
    if (!healthRes.ok) throw new Error(`Healthcheck failed with status ${healthRes.status}`);
    console.log(' Server is online and ready.');
  } catch (err) {
    console.error(`❌ Could not connect to server at ${BASE_URL}:`, err.message);
    console.error('Make sure the server is running with: npm run server');
    process.exit(1);
  }

  const BATCH_SIZE = 1000;
  const TOTAL_BATCHES = 5;
  const TOTAL_POINTS = BATCH_SIZE * TOTAL_BATCHES;

  console.log(`\n Generating and ingesting ${TOTAL_POINTS.toLocaleString()} measurements in ${TOTAL_BATCHES} batches...`);

  let totalDurationMs = 0;
  let totalInserted = 0;

  for (let b = 1; b <= TOTAL_BATCHES; b++) {
    const batch = [];
    for (let i = 0; i < BATCH_SIZE; i++) {
      const dev = DEVICES[Math.floor(Math.random() * DEVICES.length)];
      batch.push(generatePoint(dev, (TOTAL_BATCHES - b) * BATCH_SIZE + (BATCH_SIZE - i)));
    }

    const start = performance.now();
    const res = await fetch(`${BASE_URL}/api/telemetry/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch)
    });
    const duration = performance.now() - start;
    totalDurationMs += duration;

    const data = await res.json();
    if (res.ok && data.success) {
      totalInserted += data.count;
      console.log(`  [Batch ${b}/${TOTAL_BATCHES}]: Ingested ${data.count} points in ${duration.toFixed(1)}ms (${data.pointsPerSecond.toLocaleString()} points/sec)`);
    } else {
      console.error(`  [Batch ${b}/${TOTAL_BATCHES}] Failed:`, data);
    }
  }

  const overallRate = Math.round((totalInserted / (totalDurationMs / 1000)));
  console.log('\n--- Benchmark Results ---');
  console.log(`✅ Total Points Ingested: ${totalInserted.toLocaleString()} measurements`);
  console.log(`⏱️ Total Time: ${(totalDurationMs / 1000).toFixed(2)} seconds`);
  console.log(`🚀 Effective Ingestion Rate: ${overallRate.toLocaleString()} measurements / sec`);

  // Query latest stats
  console.log('\n📊 Fetching Time-Series Collection Storage & Bucket Stats...');
  const statsRes = await fetch(`${BASE_URL}/api/telemetry/stats`);
  const stats = await statsRes.json();
  console.log(JSON.stringify(stats, null, 2));

  // Query aggregation
  console.log('\n🔍 Testing Time-Series 1-Minute Downsampling Aggregation Query...');
  const aggRes = await fetch(`${BASE_URL}/api/telemetry/aggregate?deviceId=TURBINE-01&unit=minute&binSize=1`);
  const aggData = await aggRes.json();
  console.log(`Retrieved ${aggData.count} downsampled buckets for TURBINE-01:`);
  if (aggData.data && aggData.data.length > 0) {
    console.log(JSON.stringify(aggData.data.slice(0, 3), null, 2));
  }

  console.log('\n Benchmark successfully completed!');
}

export { runBenchmark };

const isMainModule = Boolean(
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))
);

if (isMainModule) {
  runBenchmark().catch(console.error);
}

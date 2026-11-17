import { createApp } from './app.js';
import { connectToDatabase, closeDatabase } from './config/db.js';
import { ensureTelemetryCollection } from './models/telemetryCollection.js';
import { telemetryBuffer } from './services/telemetryBuffer.js';

const PORT = parseInt(process.env.PORT || '5000', 10);

async function startServer() {
  try {
    console.log('🚀 Starting NexusFlow Telemetry Ingestion Engine...');

    // Connect to local MongoDB cluster
    const { db } = await connectToDatabase();

    // Ensure Time-Series collection and indexes exist
    await ensureTelemetryCollection(db);

    const app = createApp();

    const server = app.listen(PORT, () => {
      console.log(`✅ Ingestion Server listening on http://localhost:${PORT}`);
      console.log(`📡 Ingestion endpoints ready:`);
      console.log(`   - Single:   POST http://localhost:${PORT}/api/telemetry/single`);
      console.log(`   - Batch:    POST http://localhost:${PORT}/api/telemetry/batch`);
      console.log(`   - Buffered: POST http://localhost:${PORT}/api/telemetry/buffer`);
      console.log(`   - Latest:   GET  http://localhost:${PORT}/api/telemetry/latest/:deviceId`);
      console.log(`   - Downsample: GET http://localhost:${PORT}/api/telemetry/aggregate`);
      console.log(`   - Stats:    GET  http://localhost:${PORT}/api/telemetry/stats`);
    });

    // Graceful shutdown
    const shutdown = async (signal) => {
      console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
      server.close(async () => {
        try {
          await telemetryBuffer.stop();
          await closeDatabase();
          console.log('👋 All connections closed. Process terminating.');
          process.exit(0);
        } catch (err) {
          console.error('Error during shutdown:', err);
          process.exit(1);
        }
      });
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    return { app, server };
  } catch (err) {
    console.error('❌ Failed to start Ingestion Server:', err);
    process.exit(1);
  }
}

// Auto-run if executed directly as main script
const isMainModule = Boolean(
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))
);

if (isMainModule) {
  startServer();
}

export { startServer };

import express from 'express';
import cors from 'cors';
import compression from 'compression';
import telemetryRoutes from './routes/telemetryRoutes.js';

export function createApp() {
  const app = express();

  // Performance middleware
  app.use(compression());
  app.use(cors());

  // High payload size limit for massive batch telemetry ingestion (up to 25MB)
  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));

  // Root healthcheck & documentation endpoints
  app.get('/', (req, res) => {
    res.json({
      service: 'NexusFlow Hardware Telemetry Ingestion Engine',
      version: '1.0.0',
      cluster: process.env.MONGODB_DB_NAME || 'nexus',
      endpoints: {
        ingestion: {
          single: 'POST /api/telemetry/single',
          batch: 'POST /api/telemetry/batch',
          buffered: 'POST /api/telemetry/buffer'
        },
        analytics: {
          latest: 'GET /api/telemetry/latest/:deviceId',
          aggregate: 'GET /api/telemetry/aggregate?deviceId=...&unit=minute&binSize=1',
          anomalies: 'GET /api/telemetry/anomalies?limit=50',
          stats: 'GET /api/telemetry/stats'
        },
        health: 'GET /health'
      }
    });
  });

  app.get('/health', (req, res) => {
    res.json({
      status: 'UP',
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  });

  // Mount telemetry router
  app.use('/api/telemetry', telemetryRoutes);

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      error: `Endpoint not found: ${req.method} ${req.originalUrl}`
    });
  });

  // Global error handler (handles malformed JSON body and unexpected exceptions)
  app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
      return res.status(400).json({
        success: false,
        error: 'Malformed JSON payload in request body',
        details: err.message
      });
    }

    console.error('[App:Error]', err);
    res.status(err.status || 500).json({
      success: false,
      error: err.message || 'Internal Server Error'
    });
  });

  return app;
}

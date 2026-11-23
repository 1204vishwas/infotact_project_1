import http from 'node:http';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import mongoose from 'mongoose';
import { config } from './config/env.js';
import { connectDatabase } from './config/db.js';
import { telemetryRouter } from './routes/telemetry.js';
import { graphRouter } from './routes/graphs.js';
import { alertRouter } from './routes/alerts.js';
import { authRouter } from './routes/auth.js';
import { createTelemetryHub } from './ws/telemetryHub.js';
import { eventBus } from './services/eventBus.js';
import { ruleEngine } from './services/ruleEngine.js';
import { initAlertService } from './services/alertService.js';
import { verifyToken } from './services/authService.js';

const app = express();

app.use(cors({ origin: config.clientOrigin }));
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));

if (!process.env.JWT_SECRET) {
  console.warn('[auth] JWT_SECRET is not set; using the development fallback. Set it in server/.env.');
}

app.get('/api/health', (_req, res) => {
  const status = ruleEngine.getStatus();
  res.json({
    status: 'ok',
    service: 'nexusflow-server',
    timestamp: new Date().toISOString(),
    ruleActive: status.active,
    activeRules: status.count,
  });
});

app.use('/api/auth', authRouter);
app.use('/api/telemetry', telemetryRouter);
app.use('/api/graphs', graphRouter);
app.use('/api/alerts', alertRouter);

app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

app.use((err, _req, res, _next) => {
  res.status(500).json({ error: 'Unhandled server error', detail: err.message });
});

const server = http.createServer(app);
const hub = createTelemetryHub(server, {
  // The hub knows which user is connected, so each socket receives only its
  // own rule status instead of a global list of every user's rules.
  getStatus: (userId) => ruleEngine.getStatus(userId ?? null),
  verifyToken,
});

initAlertService();

eventBus.on('telemetry', (payload) => hub.broadcast('telemetry', payload));
eventBus.on('alert', (alert) => hub.broadcast('alert', alert, { ownerId: alert.ownerId }));

function publishRuleStatus(ownerId = null) {
  const status = ruleEngine.getStatus(ownerId);
  if (ownerId != null) {
    hub.broadcast('rule.status', status, { ownerId });
  } else {
    hub.broadcast('rule.status', status);
  }
}

ruleEngine.on('activated', (_status, meta = {}) => publishRuleStatus(meta.ownerId ?? null));
ruleEngine.on('deactivated', (_status, meta = {}) => publishRuleStatus(meta.ownerId ?? null));
ruleEngine.on('runtime.error', ({ runtimeId, error } = {}) => {
  console.error(`[rule-engine] runtime error (${runtimeId || 'unknown'}):`, error?.message || error);
});

async function start() {
  try {
    await connectDatabase();
    server.listen(config.port, () => {
      console.log(`NexusFlow server listening on http://localhost:${config.port}`);
      console.log(`NexusFlow WebSocket available on ws://localhost:${config.port}/ws`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

async function shutdown(signal) {
  console.log(`\n[server] ${signal} received, shutting down...`);
  ruleEngine.stopAll({ emit: false });
  await hub.close();
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start();

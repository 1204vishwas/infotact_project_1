import { Router } from 'express';
import { getRecentTelemetry, getTelemetryStats, ingestTelemetry } from '../controllers/telemetryController.js';

export const telemetryRouter = Router();

telemetryRouter.post('/ingest', ingestTelemetry);
telemetryRouter.get('/recent', getRecentTelemetry);
telemetryRouter.get('/stats', getTelemetryStats);

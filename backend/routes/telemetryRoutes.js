import { Router } from 'express';
import { telemetryController } from '../controllers/telemetryController.js';
import {
  validateSingleTelemetry,
  validateBatchTelemetry,
  normalizeTelemetryDoc
} from '../middleware/validateTelemetry.js';

const router = Router();

// Flexible middleware for buffer endpoint supporting single object or batch array
function validateBufferPayload(req, res, next) {
  try {
    if (Array.isArray(req.body) || (req.body && Array.isArray(req.body.readings))) {
      return validateBatchTelemetry(req, res, next);
    } else {
      req.validatedDoc = normalizeTelemetryDoc(req.body);
      return next();
    }
  } catch (err) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed for buffer payload',
      details: err.message
    });
  }
}

// Ingestion endpoints
router.post('/', validateSingleTelemetry, telemetryController.ingestSingle);
router.post('/single', validateSingleTelemetry, telemetryController.ingestSingle);
router.post('/batch', validateBatchTelemetry, telemetryController.ingestBatch);
router.post('/buffer', validateBufferPayload, telemetryController.ingestBuffer);

// Query & Analytics endpoints
router.get('/latest/:deviceId', telemetryController.getLatest);
router.get('/aggregate', telemetryController.aggregate);
router.get('/anomalies', telemetryController.getAnomalies);
router.get('/stats', telemetryController.getStats);

export default router;

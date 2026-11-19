/**
 * High-Speed Telemetry Validation Middleware
 *
 * Designed for low CPU overhead and high throughput.
 * Normalizes timestamps to Date instances and validates essential metadata & metrics.
 */

export function normalizeTelemetryDoc(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Payload must be a JSON object');
  }

  const { metadata, metrics, timestamp, status } = raw;

  if (!metadata || typeof metadata !== 'object') {
    throw new Error('Missing or invalid "metadata" object');
  }

  if (!metadata.deviceId || typeof metadata.deviceId !== 'string' || !metadata.deviceId.trim()) {
    throw new Error('Missing or empty "metadata.deviceId" string');
  }

  if (!metrics || typeof metrics !== 'object' || Object.keys(metrics).length === 0) {
    throw new Error('Missing or empty "metrics" object');
  }

  // Parse or default timestamp to valid Date
  let dateObj;
  if (timestamp !== undefined && timestamp !== null) {
    dateObj = new Date(timestamp);
    if (isNaN(dateObj.getTime())) {
      throw new Error(`Invalid timestamp: ${timestamp}`);
    }
  } else {
    dateObj = new Date();
  }

  // Determine operational status if not explicitly provided
  let computedStatus = status || 'nominal';
  if (!status) {
    if (metrics.temperature_c > 85 || metrics.vibration_g > 1.2 || metrics.cpu_usage_pct > 95) {
      computedStatus = 'critical';
    } else if (metrics.temperature_c > 75 || metrics.vibration_g > 0.8 || metrics.cpu_usage_pct > 85) {
      computedStatus = 'warning';
    }
  }

  return {
    timestamp: dateObj,
    metadata: {
      deviceId: String(metadata.deviceId).trim(),
      deviceType: metadata.deviceType ? String(metadata.deviceType).trim() : 'sensor_node',
      facilityId: metadata.facilityId ? String(metadata.facilityId).trim() : 'default_facility',
      rack: metadata.rack || null,
      slot: metadata.slot || null,
      firmwareVersion: metadata.firmwareVersion || null,
      ...metadata
    },
    metrics,
    status: computedStatus
  };
}

/**
 * Middleware for single telemetry record
 */
export function validateSingleTelemetry(req, res, next) {
  try {
    req.validatedDoc = normalizeTelemetryDoc(req.body);
    next();
  } catch (err) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: err.message
    });
  }
}

/**
 * Middleware for batch telemetry array
 */
export function validateBatchTelemetry(req, res, next) {
  const items = Array.isArray(req.body) ? req.body : req.body.readings;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Batch payload must be a non-empty array of readings or an object with a "readings" array'
    });
  }

  if (items.length > 10000) {
    return res.status(413).json({
      success: false,
      error: 'Batch payload exceeds maximum allowed size of 10,000 readings per request'
    });
  }

  const validatedDocs = [];
  const errors = [];

  for (let i = 0; i < items.length; i++) {
    try {
      validatedDocs.push(normalizeTelemetryDoc(items[i]));
    } catch (err) {
      errors.push({ index: i, error: err.message });
      // If error rate is high on large payloads, abort early
      if (errors.length > 50) {
        return res.status(400).json({
          success: false,
          error: 'Excessive validation errors in batch',
          errors
        });
      }
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: `Validation failed for ${errors.length} items in batch`,
      errors
    });
  }

  req.validatedDocs = validatedDocs;
  next();
}

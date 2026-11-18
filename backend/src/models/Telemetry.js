import mongoose from 'mongoose';
import { config } from '../config/env.js';

const telemetrySchema = new mongoose.Schema(
  {
    timestamp: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    metadata: {
      deviceId: { type: String, required: true, index: true },
      metric: { type: String, required: true, index: true },
      unit: { type: String, default: '' },
      source: { type: String, default: 'simulator' },
      tags: { type: [String], default: [] },
    },
    value: {
      type: Number,
      required: true,
    },
  },
  {
    collection: config.telemetryCollection,
    versionKey: false,
  }
);

telemetrySchema.index({ 'metadata.deviceId': 1, 'metadata.metric': 1, timestamp: -1 });

export const Telemetry = mongoose.model('Telemetry', telemetrySchema);

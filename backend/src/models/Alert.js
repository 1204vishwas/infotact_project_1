import mongoose from 'mongoose';

const alertSchema = new mongoose.Schema(
  {
    nodeId: { type: String, required: true, index: true },
    runtimeId: { type: String, default: null, index: true },
    graphId: { type: String, default: null, index: true },
    ruleName: { type: String, default: '' },
    ownerId: { type: String, default: null, index: true },
    ownerEmail: { type: String, default: null },
    kind: { type: String, default: 'log', index: true },
    label: { type: String, default: '' },
    target: { type: String, default: null },
    channel: { type: String, default: null },
    message: { type: String, default: '' },
    payload: { type: mongoose.Schema.Types.Mixed, default: null },
    triggeredAt: { type: Date, required: true, default: Date.now, index: true },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

alertSchema.index({ triggeredAt: -1 });
alertSchema.index({ nodeId: 1, triggeredAt: -1 });
alertSchema.index({ ownerId: 1, triggeredAt: -1 });
alertSchema.index({ runtimeId: 1, triggeredAt: -1 });

export const Alert = mongoose.model('Alert', alertSchema);

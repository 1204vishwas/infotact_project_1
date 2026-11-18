import mongoose from 'mongoose';

const savedGraphSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    ownerEmail: { type: String, default: null },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    graph: {
      version: { type: Number, default: 2 },
      nodes: { type: [mongoose.Schema.Types.Mixed], default: [] },
      edges: { type: [mongoose.Schema.Types.Mixed], default: [] },
    },
    summary: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

savedGraphSchema.index({ owner: 1, updatedAt: -1 });
savedGraphSchema.index({ updatedAt: -1 });
savedGraphSchema.index({ name: 1 });

export const SavedGraph = mongoose.model('SavedGraph', savedGraphSchema);

import mongoose from 'mongoose';
import { SavedGraph } from '../models/SavedGraph.js';
import { normalizeGraph, validateGraph } from '../compiler/graphCompiler.js';
import { ruleEngine } from '../services/ruleEngine.js';

const LIST_PROJECTION = {
  name: 1,
  description: 1,
  updatedAt: 1,
  createdAt: 1,
  summary: 1,
};

function validId(id) {
  return mongoose.isValidObjectId(id);
}

export async function listSavedGraphs(req, res) {
  try {
    const items = await SavedGraph.find({ owner: req.user.id }, LIST_PROJECTION)
      .sort({ updatedAt: -1 })
      .limit(100)
      .lean();
    return res.json({ items, count: items.length });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to list saved graphs', detail: error.message });
  }
}

export async function createSavedGraph(req, res) {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Graph name is required' });

    const rawGraph = req.body?.graph ?? req.body;
    const graph = normalizeGraph(rawGraph);
    const validation = validateGraph(graph);

    const doc = await SavedGraph.create({
      owner: req.user.id,
      ownerEmail: req.user.email,
      name,
      description: String(req.body?.description || ''),
      graph: { version: graph.version ?? 2, nodes: graph.nodes, edges: graph.edges },
      summary: validation.summary,
    });

    return res.status(201).json({
      ok: true,
      item: doc.toObject(),
      validation: { ok: validation.ok, errors: validation.errors, warnings: validation.warnings },
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to save graph', detail: error.message });
  }
}

export async function getSavedGraph(req, res) {
  try {
    if (!validId(req.params.id)) {
      return res.status(404).json({ error: 'Saved graph not found' });
    }
    const item = await SavedGraph.findOne({ _id: req.params.id, owner: req.user.id }).lean();
    if (!item) return res.status(404).json({ error: 'Saved graph not found' });
    return res.json({ ok: true, item });
  } catch (error) {
    return res.status(400).json({ error: 'Failed to load saved graph', detail: error.message });
  }
}

export async function updateSavedGraph(req, res) {
  try {
    if (!validId(req.params.id)) {
      return res.status(404).json({ error: 'Saved graph not found' });
    }
    const existing = await SavedGraph.findOne({ _id: req.params.id, owner: req.user.id });
    if (!existing) return res.status(404).json({ error: 'Saved graph not found' });

    if (req.body?.name != null) existing.name = String(req.body.name).trim() || existing.name;
    if (req.body?.description != null) existing.description = String(req.body.description);
    if (req.body?.graph != null) {
      const graph = normalizeGraph(req.body.graph);
      existing.graph = { version: graph.version ?? 2, nodes: graph.nodes, edges: graph.edges };
      existing.summary = validateGraph(graph).summary;
    }

    await existing.save();
    return res.json({ ok: true, item: existing.toObject() });
  } catch (error) {
    return res.status(400).json({ error: 'Failed to update saved graph', detail: error.message });
  }
}

export async function deleteSavedGraph(req, res) {
  try {
    if (!validId(req.params.id)) {
      return res.status(404).json({ error: 'Saved graph not found' });
    }
    const deleted = await SavedGraph.findOneAndDelete({ _id: req.params.id, owner: req.user.id }).lean();
    if (!deleted) return res.status(404).json({ error: 'Saved graph not found' });

    const runtimeId = `graph:${String(deleted._id)}`;
    const stopped = ruleEngine.stop(runtimeId);

    return res.json({
      ok: true,
      deleted: { id: String(deleted._id), name: deleted.name },
      deactivated: stopped,
    });
  } catch (error) {
    return res.status(400).json({ error: 'Failed to delete saved graph', detail: error.message });
  }
}

export async function activateSavedGraph(req, res) {
  try {
    if (!validId(req.params.id)) {
      return res.status(404).json({ error: 'Saved graph not found' });
    }
    const item = await SavedGraph.findOne({ _id: req.params.id, owner: req.user.id }).lean();
    if (!item) return res.status(404).json({ error: 'Saved graph not found' });

    const result = ruleEngine.activate(item.graph, {
      graphId: String(item._id),
      name: item.name,
      ownerId: req.user.id,
      ownerEmail: req.user.email,
    });

    if (!result.ok) {
      return res.status(400).json({
        ok: false,
        errors: result.errors,
        warnings: result.warnings,
        summary: result.summary,
      });
    }

    return res.json({
      ok: true,
      activated: true,
      runtimeId: result.runtimeId,
      graphId: String(item._id),
      summary: result.summary,
      status: result.status,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to activate saved graph', detail: error.message });
  }
}

export async function deactivateSavedGraph(req, res) {
  try {
    if (!validId(req.params.id)) {
      return res.status(404).json({ error: 'Saved graph not found' });
    }
    const item = await SavedGraph.findOne({ _id: req.params.id, owner: req.user.id }).lean();
    if (!item) return res.status(404).json({ error: 'Saved graph not found' });

    const runtimeId = `graph:${String(item._id)}`;
    const deactivated = ruleEngine.stop(runtimeId);
    return res.json({
      ok: true,
      deactivated,
      runtimeId,
      status: ruleEngine.getStatus(req.user.id),
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to deactivate saved graph', detail: error.message });
  }
}

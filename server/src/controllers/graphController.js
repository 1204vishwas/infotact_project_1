import mongoose from 'mongoose';
import { simulateGraph, validateGraph } from '../compiler/graphCompiler.js';
import { SavedGraph } from '../models/SavedGraph.js';
import { ruleEngine } from '../services/ruleEngine.js';

const MAX_SIMULATION_EVENTS = 500;

/**
 * A client may only activate against a saved graph it owns. This prevents one
 * user from passing another user's graph id and replacing their runtime.
 */
async function ownedGraphId(rawId, userId) {
  if (rawId == null || rawId === '') return null;
  const id = String(rawId);
  if (!mongoose.isValidObjectId(id)) return null;
  const owned = await SavedGraph.exists({ _id: id, owner: userId });
  return owned ? id : null;
}

function compileResponse(result, { activated = false } = {}) {
  return {
    ok: true,
    errors: [],
    warnings: result.warnings,
    summary: result.summary,
    compiled: result.compiled,
    activated,
    runtimeId: activated ? result.runtimeId : null,
    activeGraph: activated ? result.status?.activeGraph ?? null : null,
    status: activated ? result.status : null,
  };
}

export async function validateGraphHandler(req, res) {
  try {
    const result = validateGraph(req.body?.graph ?? req.body);
    return res.json({
      ok: result.ok,
      errors: result.errors,
      warnings: result.warnings,
      summary: result.summary,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to validate graph', detail: error.message });
  }
}

export async function compileGraphHandler(req, res) {
  try {
    const input = req.body?.graph ?? req.body;
    const shouldActivate = Boolean(req.body?.activate);

    if (shouldActivate) {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required to activate a rule' });
      }

      const graphId = await ownedGraphId(req.body?.graphId, req.user.id);
      if (req.body?.graphId != null && req.body?.graphId !== '' && !graphId) {
        return res.status(404).json({ error: 'Saved graph not found' });
      }

      const result = ruleEngine.activate(input, {
        graphId,
        name: req.body?.name,
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
      return res.json(compileResponse(result, { activated: true }));
    }

    const result = ruleEngine.compile(input);
    if (!result.ok) {
      return res.status(400).json({
        ok: false,
        errors: result.errors,
        warnings: result.warnings,
        summary: result.summary,
      });
    }
    return res.json(compileResponse(result, { activated: false }));
  } catch (error) {
    return res.status(500).json({ error: 'Failed to compile graph', detail: error.message });
  }
}

export async function simulateGraphHandler(req, res) {
  try {
    const input = req.body?.graph ?? req.body;
    const events = Array.isArray(req.body?.events) ? req.body.events : [];
    if (events.length > MAX_SIMULATION_EVENTS) {
      return res.status(413).json({
        error: `Simulation supports at most ${MAX_SIMULATION_EVENTS} events per request`,
      });
    }
    const result = simulateGraph(input, events, { traceLimit: req.body?.traceLimit });
    if (!result.ok) {
      return res.status(400).json(result);
    }
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to simulate graph', detail: error.message });
  }
}

export async function getActiveGraphHandler(req, res) {
  return res.json(ruleEngine.getStatus(req.user.id));
}

export async function deactivateGraphHandler(req, res) {
  const runtimeId = req.body?.runtimeId ? String(req.body.runtimeId) : null;
  const stopAll = Boolean(req.body?.all) || !runtimeId;
  let deactivated = 0;

  if (stopAll) {
    deactivated = ruleEngine.stopAll({ ownerId: req.user.id });
  } else {
    const record = ruleEngine.getRule(runtimeId);
    if (record && String(record.ownerId ?? '') !== String(req.user.id)) {
      // Do not reveal another user's runtime id.
      return res.status(404).json({ error: 'Active rule not found' });
    }
    deactivated = ruleEngine.stop(runtimeId) ? 1 : 0;
  }

  const status = ruleEngine.getStatus(req.user.id);
  return res.json({
    ok: true,
    deactivated,
    active: status.active,
    status,
  });
}

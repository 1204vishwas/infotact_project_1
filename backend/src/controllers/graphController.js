import { simulateGraph, validateGraph } from '../compiler/graphCompiler.js';
import { ruleEngine } from '../services/ruleEngine.js';

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

      const result = ruleEngine.activate(input, {
        graphId: req.body?.graphId,
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
    const result = simulateGraph(input, events, { traceLimit: req.body?.traceLimit });
    if (!result.ok) {
      return res.status(400).json(result);
    }
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to simulate graph', detail: error.message });
  }
}

export async function getActiveGraphHandler(_req, res) {
  return res.json(ruleEngine.getStatus());
}

export async function deactivateGraphHandler(req, res) {
  const runtimeId = req.body?.runtimeId ? String(req.body.runtimeId) : null;
  const stopAll = Boolean(req.body?.all) || !runtimeId;

  const deactivated = stopAll
    ? ruleEngine.stopAll()
    : (ruleEngine.stop(runtimeId) ? 1 : 0);

  return res.json({
    ok: true,
    deactivated,
    active: ruleEngine.isActive(),
    status: ruleEngine.getStatus(),
  });
}

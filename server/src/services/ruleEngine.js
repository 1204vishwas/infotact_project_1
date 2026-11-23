import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { compileGraph } from '../compiler/graphCompiler.js';

/**
 * Owns every active compiled RxJS pipeline.
 *
 * Each activation produces an independent runtime keyed by its saved graph id
 * (or a generated id for ad-hoc canvas rules). Telemetry ingestion fans the
 * same points out to all runtimes, so many rules can evaluate concurrently.
 */
class RuleEngine extends EventEmitter {
  constructor() {
    super();
    this.runtimes = new Map();
  }

  isActive() {
    return this.runtimes.size > 0;
  }

  count() {
    return this.runtimes.size;
  }

  compile(input) {
    return compileGraph(input);
  }

  static runtimeIdFor(meta = {}) {
    if (meta.runtimeId) return String(meta.runtimeId);
    if (meta.graphId) return `graph:${String(meta.graphId)}`;
    return `adhoc:${randomUUID()}`;
  }

  activate(input, meta = {}) {
    const result = compileGraph(input);
    if (!result.ok) {
      return { ...result, activated: false, status: this.getStatus(meta.ownerId ?? null) };
    }

    const runtimeId = RuleEngine.runtimeIdFor(meta);

    // Re-activating a saved graph replaces its previous runtime silently.
    if (this.runtimes.has(runtimeId)) {
      this.stop(runtimeId, { emit: false });
    }

    const runtime = result.runtimeFactory();
    const actionSubscription = runtime.actions$.subscribe({
      next: (action) => this.emit('alert', {
        ...action,
        runtimeId,
        graphId: meta.graphId != null ? String(meta.graphId) : null,
        ruleName: meta.name || action.label || 'Rule',
        ownerId: meta.ownerId != null ? String(meta.ownerId) : null,
        ownerEmail: meta.ownerEmail || null,
      }),
      error: (error) => this.emit('runtime.error', { runtimeId, error }),
    });

    this.runtimes.set(runtimeId, {
      runtimeId,
      graphId: meta.graphId != null ? String(meta.graphId) : null,
      name: String(meta.name || 'Ad-hoc rule'),
      ownerId: meta.ownerId != null ? String(meta.ownerId) : null,
      ownerEmail: meta.ownerEmail || null,
      compiled: result,
      runtime,
      actionSubscription,
      activatedAt: new Date().toISOString(),
    });

    const ownerId = meta.ownerId != null ? String(meta.ownerId) : null;
    const status = this.getStatus(ownerId);
    this.emit('activated', status, { ownerId, runtimeId });
    return { ...result, activated: true, runtimeId, status };
  }

  stop(runtimeId, { emit = true } = {}) {
    const key = String(runtimeId);
    const record = this.runtimes.get(key);
    if (!record) return false;

    const ownerId = record.ownerId != null ? String(record.ownerId) : null;

    try { record.actionSubscription?.unsubscribe(); } catch {}
    try { record.runtime.destroy(); } catch {}
    this.runtimes.delete(key);

    if (emit) {
      this.emit('deactivated', this.getStatus(ownerId), { ownerId, runtimeId: key });
    }
    return true;
  }

  /**
   * Stops every runtime, or only the runtimes owned by `ownerId`. Passing an
   * owner keeps one authenticated user from stopping another user's rules.
   */
  stopAll({ emit = true, ownerId = null } = {}) {
    const scope = ownerId != null ? String(ownerId) : null;
    const stoppedOwners = new Set();
    let stopped = 0;

    for (const [runtimeId, record] of [...this.runtimes.entries()]) {
      if (scope != null && String(record.ownerId ?? '') !== scope) continue;
      if (this.stop(runtimeId, { emit: false })) {
        stopped += 1;
        stoppedOwners.add(record.ownerId != null ? String(record.ownerId) : '');
      }
    }

    if (emit && stopped > 0) {
      if (scope != null) {
        this.emit('deactivated', this.getStatus(scope), { ownerId: scope });
      } else {
        for (const owner of stoppedOwners) {
          this.emit('deactivated', this.getStatus(owner || null), { ownerId: owner || null });
        }
      }
    }
    return stopped;
  }

  getRule(runtimeId) {
    return this.runtimes.get(String(runtimeId)) || null;
  }

  push(point, targetNodeId = null) {
    if (this.runtimes.size === 0) {
      return { rules: 0, delivered: 0 };
    }

    let delivered = 0;
    for (const record of this.runtimes.values()) {
      try {
        record.runtime.push(point, targetNodeId);
        delivered += 1;
      } catch (error) {
        this.emit('runtime.error', { runtimeId: record.runtimeId, error });
      }
    }
    return { rules: this.runtimes.size, delivered };
  }

  pushBatch(points, targetNodeId = null) {
    if (this.runtimes.size === 0) {
      return { points: 0, rules: 0, evaluations: 0 };
    }

    let pointsPushed = 0;
    for (const point of points) {
      const result = this.push(point, targetNodeId);
      if (result.delivered > 0) pointsPushed += 1;
    }

    return {
      points: pointsPushed,
      rules: this.runtimes.size,
      evaluations: pointsPushed * this.runtimes.size,
    };
  }

  /**
   * Returns rule status. When `ownerId` is supplied the result only contains
   * that owner's runtimes, so one user cannot discover another user's rules.
   */
  getStatus(ownerId = null) {
    const scope = ownerId != null ? String(ownerId) : null;
    const rules = [...this.runtimes.values()]
      .filter((record) => scope == null || String(record.ownerId ?? '') === scope)
      .map((record) => ({
        runtimeId: record.runtimeId,
        graphId: record.graphId,
        name: record.name,
        ownerId: record.ownerId,
        ownerEmail: record.ownerEmail,
        activatedAt: record.activatedAt,
        nodeCount: record.runtime.nodeIds.length,
        summary: record.compiled.summary,
        activeGraph: {
          nodeIds: record.runtime.nodeIds,
          sourceNodeIds: record.runtime.sourceNodeIds,
          actionNodeIds: record.runtime.actionNodeIds,
        },
      }));

    const first = rules[0] || null;
    return {
      active: rules.length > 0,
      count: rules.length,
      rules,
      // Convenience mirror of the first rule for older clients.
      activatedAt: first?.activatedAt || null,
      summary: first?.summary || null,
      activeGraph: first?.activeGraph || null,
    };
  }
}

export const ruleEngine = new RuleEngine();

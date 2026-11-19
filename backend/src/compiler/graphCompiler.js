import { Subject } from 'rxjs';
import { filter, map, scan, catchError } from 'rxjs/operators';

// Canonical node categories
export const SOURCE_TYPES = new Set(['dataSource', 'source', 'sensor', 'simulator', 'gateway']);
export const MATH_TYPES = new Set(['mathOperation', 'filter', 'math', 'operation', 'transform']);
export const ACTION_TYPES = new Set(['actionTrigger', 'action', 'trigger', 'sink', 'alert']);

// Registry for extensible math and action handlers
const CUSTOM_MATH_OPERATIONS = new Map();
const CUSTOM_ACTION_HANDLERS = new Map();
const CUSTOM_NODE_HANDLERS = new Map();

export function isSourceType(type) {
  return SOURCE_TYPES.has(String(type || '').trim());
}

export function isMathType(type) {
  return MATH_TYPES.has(String(type || '').trim()) || CUSTOM_MATH_OPERATIONS.has(String(type || '').trim());
}

export function isActionType(type) {
  return ACTION_TYPES.has(String(type || '').trim()) || CUSTOM_ACTION_HANDLERS.has(String(type || '').trim());
}

export function categoryOf(type) {
  const t = String(type || '').trim();
  if (isSourceType(t)) return 'dataSource';
  if (isMathType(t)) return 'mathOperation';
  if (isActionType(t)) return 'actionTrigger';
  if (CUSTOM_NODE_HANDLERS.has(t)) return 'custom';
  return 'unknown';
}

export function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function compare(operator, left, right, secondary = null) {
  const op = String(operator || '>').trim();
  switch (op) {
    case '>':
      return left > right;
    case '>=':
      return left >= right;
    case '<':
      return left < right;
    case '<=':
      return left <= right;
    case '==':
    case '===':
      return left === right;
    case '!=':
    case '!==':
      return left !== right;
    case 'between': {
      const min = Math.min(right, secondary ?? right);
      const max = Math.max(right, secondary ?? right);
      return left >= min && left <= max;
    }
    case 'outside': {
      const min = Math.min(right, secondary ?? right);
      const max = Math.max(right, secondary ?? right);
      return left < min || left > max;
    }
    default:
      return left > right;
  }
}

/**
 * Safely parse a React Flow JSON input in any standard format:
 * - JSON string representation
 * - Object with { nodes, edges }
 * - Object wrapped with { graph: { nodes, edges } } or { data: { nodes, edges } }
 * - Mongoose SavedGraph document with graph property
 */
export function parseReactFlow(input) {
  if (input === null || input === undefined) {
    throw new Error('Graph input cannot be null or undefined');
  }

  let parsed = input;
  if (typeof input === 'string') {
    try {
      parsed = JSON.parse(input);
    } catch (err) {
      throw new Error(`Failed to parse React Flow JSON string: ${err.message}`);
    }
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Parsed React Flow graph must be an object');
  }

  // Handle wrappers like { graph: { nodes, edges } }, { data: { nodes, edges } }, or Mongoose doc
  let graphObj = parsed;
  if (parsed.graph && typeof parsed.graph === 'object') {
    graphObj = parsed.graph;
  } else if (parsed.data && typeof parsed.data === 'object' && Array.isArray(parsed.data.nodes)) {
    graphObj = parsed.data;
  }

  return normalizeGraph(graphObj, parsed);
}

/**
 * Normalizes graph structure into a clean, predictable schema
 */
export function normalizeGraph(input, rootContext = {}) {
  let graph = input;
  if (typeof input === 'string') {
    try {
      graph = JSON.parse(input);
    } catch {
      graph = {};
    }
  } else if (input && typeof input === 'object') {
    if (input.graph && typeof input.graph === 'object') {
      graph = input.graph;
    }
  } else {
    graph = {};
  }

  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph.edges) ? graph.edges : [];

  return {
    id: String(rootContext.id || rootContext._id || graph.id || ''),
    name: String(rootContext.name || graph.name || 'Untitled Pipeline'),
    version: graph.version ?? rootContext.version ?? 2,
    viewport: graph.viewport && typeof graph.viewport === 'object'
      ? { x: toNumber(graph.viewport.x, 0), y: toNumber(graph.viewport.y, 0), zoom: toNumber(graph.viewport.zoom, 1) }
      : { x: 0, y: 0, zoom: 1 },
    nodes: nodes.map((n) => {
      const id = String(n?.id ?? '').trim();
      const rawType = String(n?.type ?? '').trim();
      return {
        id,
        type: rawType || 'passthrough',
        position: n?.position && typeof n.position === 'object'
          ? { x: toNumber(n.position.x, 0), y: toNumber(n.position.y, 0) }
          : { x: 0, y: 0 },
        data: n?.data && typeof n.data === 'object' ? { ...n.data } : {},
        selected: Boolean(n?.selected),
        draggable: n?.draggable ?? true,
      };
    }),
    edges: edges.map((e, i) => {
      const source = String(e?.source ?? '').trim();
      const target = String(e?.target ?? '').trim();
      return {
        id: String(e?.id ?? `e-${source || 's'}-${target || 't'}-${i}`),
        source,
        target,
        sourceHandle: e?.sourceHandle ? String(e.sourceHandle) : null,
        targetHandle: e?.targetHandle ? String(e.targetHandle) : null,
        type: String(e?.type ?? 'default'),
        animated: Boolean(e?.animated),
        data: e?.data && typeof e.data === 'object' ? { ...e.data } : {},
      };
    }),
  };
}

/**
 * Validates graph structure, node connectivity, acyclicity (DAG check), and types.
 */
export function validateGraph(input) {
  let graph;
  try {
    graph = parseReactFlow(input);
  } catch (err) {
    return {
      ok: false,
      errors: [err.message],
      warnings: [],
      graph: { version: 2, nodes: [], edges: [] },
      summary: {
        nodeCount: 0,
        edgeCount: 0,
        sourceNodes: [],
        mathNodes: [],
        actionNodes: [],
        topoOrder: [],
      },
    };
  }

  const errors = [];
  const warnings = [];

  const nodeMap = new Map();
  for (const node of graph.nodes) {
    if (!node.id) {
      errors.push('Every node must have a non-empty string id');
      continue;
    }
    if (nodeMap.has(node.id)) {
      errors.push(`Duplicate node id: "${node.id}"`);
      continue;
    }
    if (categoryOf(node.type) === 'unknown') {
      errors.push(`Unsupported node type "${node.type}" on node ${node.id}`);
    }
    nodeMap.set(node.id, node);
  }

  const incoming = new Map(graph.nodes.map((n) => [n.id, 0]));
  const outgoing = new Map(graph.nodes.map((n) => [n.id, 0]));
  const seenEdges = new Set();

  for (const edge of graph.edges) {
    if (!edge.source || !edge.target) {
      errors.push(`Edge "${edge.id}" must have valid source and target identifiers`);
      continue;
    }

    if (edge.source === edge.target) {
      errors.push(`Edge "${edge.id}" is a self-loop on node "${edge.source}"; self-references are forbidden`);
      continue;
    }

    const edgeKey = `${edge.source}->${edge.target}:${edge.sourceHandle || ''}:${edge.targetHandle || ''}`;
    if (seenEdges.has(edgeKey)) {
      warnings.push(`Duplicate edge detected between node "${edge.source}" and "${edge.target}"`);
    }
    seenEdges.add(edgeKey);

    if (!nodeMap.has(edge.source)) {
      errors.push(`Edge "${edge.id}" references missing source node "${edge.source}"`);
    }
    if (!nodeMap.has(edge.target)) {
      errors.push(`Edge "${edge.id}" references missing target node "${edge.target}"`);
    }

    if (nodeMap.has(edge.source) && nodeMap.has(edge.target)) {
      outgoing.set(edge.source, (outgoing.get(edge.source) || 0) + 1);
      incoming.set(edge.target, (incoming.get(edge.target) || 0) + 1);

      const s = nodeMap.get(edge.source);
      const t = nodeMap.get(edge.target);
      if (isActionType(s.type)) {
        errors.push(`Action node "${s.id}" cannot be a source of edge "${edge.id}"; actions are terminal sinks`);
      }
      if (isSourceType(t.type)) {
        warnings.push(`Edge "${edge.id}" targets data source "${t.id}"; data sources are expected to be stream roots`);
      }
    }
  }

  // Disconnected / orphan node checks
  const isolatedNodes = [];
  const deadEnds = [];
  for (const node of graph.nodes) {
    const cat = categoryOf(node.type);
    const inCount = incoming.get(node.id) || 0;
    const outCount = outgoing.get(node.id) || 0;

    if (inCount === 0 && outCount === 0) {
      isolatedNodes.push(node.id);
      warnings.push(`Node "${node.id}" (${node.type}) is completely isolated with no incoming or outgoing connections`);
    } else if (cat === 'dataSource' && inCount > 0) {
      warnings.push(`Data source "${node.id}" has incoming edges; upstream inputs will be ignored or merged`);
    } else if (cat === 'actionTrigger' && outCount > 0) {
      warnings.push(`Action trigger "${node.id}" has outgoing edges; actions are terminal sinks`);
    } else if ((isMathType(node.type) || isActionType(node.type)) && inCount === 0) {
      warnings.push(`Node "${node.id}" (${node.type}) has no upstream input connection`);
    } else if (isMathType(node.type) && outCount === 0) {
      deadEnds.push(node.id);
      warnings.push(`Math node "${node.id}" is a dead end with no downstream action or transform`);
    }
  }

  // Cycle detection and topological sort using Kahn's algorithm
  const inDegree = new Map(graph.nodes.map((n) => [n.id, 0]));
  const adjacency = new Map(graph.nodes.map((n) => [n.id, []]));

  for (const edge of graph.edges) {
    if (nodeMap.has(edge.source) && nodeMap.has(edge.target)) {
      adjacency.get(edge.source).push(edge.target);
      inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
    }
  }

  const queue = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(id);
  }

  let visitedCount = 0;
  const topoOrder = [];

  while (queue.length > 0) {
    const current = queue.shift();
    topoOrder.push(current);
    visitedCount += 1;

    for (const neighbor of adjacency.get(current) || []) {
      const newDeg = (inDegree.get(neighbor) || 0) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) {
        queue.push(neighbor);
      }
    }
  }

  if (visitedCount !== graph.nodes.length && graph.nodes.length > 0) {
    const cycleNodes = [];
    for (const [id, deg] of inDegree.entries()) {
      if (deg > 0) cycleNodes.push(id);
    }
    errors.push(`Graph contains a cycle involving nodes: [${cycleNodes.join(', ')}]; pipelines must be acyclic (DAG)`);
  }

  const sourceNodes = graph.nodes.filter((n) => isSourceType(n.type)).map((n) => n.id);
  if (graph.nodes.length > 0 && sourceNodes.length === 0) {
    warnings.push('No data source nodes found; runtime input must be pushed manually by node id');
  }

  const mathNodes = graph.nodes.filter((n) => isMathType(n.type)).map((n) => n.id);
  const actionNodes = graph.nodes.filter((n) => isActionType(n.type)).map((n) => n.id);

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    graph,
    summary: {
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
      sourceNodes,
      mathNodes,
      actionNodes,
      isolatedNodes,
      deadEnds,
      topoOrder: visitedCount === graph.nodes.length ? topoOrder : [],
    },
  };
}

/**
 * Matches incoming raw telemetry event against a DataSourceNode configuration.
 */
export function matchesSource(node, event) {
  if (!event || typeof event !== 'object') return false;
  const nodeDevice = node.data?.deviceId;
  const nodeMetric = node.data?.metric;

  const evDevice = event.deviceId ?? event?.metadata?.deviceId;
  const evMetric = event.metric ?? event?.metadata?.metric;

  // Wildcard or exact matching
  if (nodeDevice && nodeDevice !== '*' && String(evDevice) !== String(nodeDevice)) {
    return false;
  }
  if (nodeMetric && nodeMetric !== '*' && String(evMetric) !== String(nodeMetric)) {
    return false;
  }
  return true;
}

/**
 * Builds an RxJS transformation pipeline for a math/operation node.
 */
export function buildMathPipeline(stream$, node, errors$ = null) {
  const kind = String(node.data?.kind || node.data?.operation || node.type || 'passthrough').trim();

  // Check custom math operations first
  if (CUSTOM_MATH_OPERATIONS.has(kind)) {
    const customFn = CUSTOM_MATH_OPERATIONS.get(kind);
    return stream$.pipe(
      map((evt) => {
        try {
          return customFn(evt, node.data, node);
        } catch (err) {
          errors$?.next({ nodeId: node.id, error: err.message, event: evt, at: new Date().toISOString() });
          return evt;
        }
      })
    );
  }

  if (kind === 'movingAverage') {
    const windowSize = Math.max(1, Math.floor(toNumber(node.data?.windowSize, 5)));
    return stream$.pipe(
      scan(
        (acc, evt) => {
          const val = toNumber(evt.value);
          const values = acc.values.concat(val);
          const window = values.slice(-windowSize);
          const avg = window.reduce((a, b) => a + b, 0) / window.length;
          return {
            values: window,
            out: {
              ...evt,
              value: avg,
              meta: {
                ...(evt.meta || {}),
                movingAverage: {
                  windowSize,
                  count: window.length,
                  rawValues: window,
                  avg,
                },
              },
            },
          };
        },
        { values: [], out: null }
      ),
      filter((s) => s.out !== null),
      map((s) => s.out)
    );
  }

  if (kind === 'threshold' || kind === 'comparison' || node.type === 'filter') {
    const operator = String(node.data?.operator || '>');
    const threshold = toNumber(node.data?.threshold, 80);
    const secondary = node.data?.secondaryThreshold != null ? toNumber(node.data.secondaryThreshold, threshold) : null;
    const field = String(node.data?.field || 'value');

    return stream$.pipe(
      filter((evt) => {
        const val = toNumber(evt[field], toNumber(evt.value));
        return compare(operator, val, threshold, secondary);
      }),
      map((evt) => ({
        ...evt,
        meta: {
          ...(evt.meta || {}),
          threshold: {
            operator,
            threshold,
            secondary,
            field,
            actualValue: toNumber(evt[field], toNumber(evt.value)),
            matched: true,
            nodeId: node.id,
          },
        },
      }))
    );
  }

  if (kind === 'scale') {
    const factor = toNumber(node.data?.factor, 1);
    const offset = toNumber(node.data?.offset, 0);
    return stream$.pipe(
      map((evt) => {
        const original = toNumber(evt.value);
        const scaled = original * factor + offset;
        return {
          ...evt,
          value: scaled,
          meta: {
            ...(evt.meta || {}),
            scale: { factor, offset, originalValue: original, scaledValue: scaled },
          },
        };
      })
    );
  }

  if (kind === 'delta') {
    return stream$.pipe(
      scan(
        (acc, evt) => {
          const value = toNumber(evt.value);
          const delta = acc.hasPrev ? value - acc.prev : 0;
          return {
            hasPrev: true,
            prev: value,
            out: {
              ...evt,
              value,
              delta,
              meta: {
                ...(evt.meta || {}),
                delta: { change: delta, previous: acc.hasPrev ? acc.prev : null },
              },
            },
          };
        },
        { hasPrev: false, prev: 0, out: null }
      ),
      filter((s) => s.out !== null),
      map((s) => s.out)
    );
  }

  if (kind === 'rateOfChange') {
    return stream$.pipe(
      scan(
        (acc, evt) => {
          const value = toNumber(evt.value);
          const time = evt.timestamp ? new Date(evt.timestamp).getTime() : Date.now();
          let rate = 0;
          if (acc.hasPrev) {
            const dt = (time - acc.prevTime) / 1000;
            rate = dt > 0 ? (value - acc.prevValue) / dt : 0;
          }
          return {
            hasPrev: true,
            prevValue: value,
            prevTime: time,
            out: {
              ...evt,
              rateOfChange: rate,
              meta: {
                ...(evt.meta || {}),
                rateOfChange: { rate, unitPerSecond: rate },
              },
            },
          };
        },
        { hasPrev: false, prevValue: 0, prevTime: 0, out: null }
      ),
      filter((s) => s.out !== null),
      map((s) => s.out)
    );
  }

  if (kind === 'min' || kind === 'max') {
    const isMin = kind === 'min';
    return stream$.pipe(
      scan(
        (acc, evt) => {
          const value = toNumber(evt.value);
          const extremum = acc.hasPrev
            ? (isMin ? Math.min(acc.val, value) : Math.max(acc.val, value))
            : value;
          return {
            hasPrev: true,
            val: extremum,
            out: {
              ...evt,
              [kind]: extremum,
              meta: {
                ...(evt.meta || {}),
                [kind]: extremum,
              },
            },
          };
        },
        { hasPrev: false, val: 0, out: null }
      ),
      filter((s) => s.out !== null),
      map((s) => s.out)
    );
  }

  if (kind === 'passthrough' || kind === 'math' || kind === 'operation') {
    return stream$.pipe(map((evt) => ({ ...evt })));
  }

  return stream$.pipe(
    map((evt) => ({
      ...evt,
      meta: { ...(evt.meta || {}), unknownMathKind: kind },
    }))
  );
}

/**
 * Builds an Action dispatcher with template string interpolation.
 */
export function buildActionHandler(node, actionsSubject, errors$ = null) {
  const kind = String(node.data?.kind || node.data?.channel || 'log').trim();
  const rawMessage = node.data?.message || `Alert from ${node.id}`;

  return (evt) => {
    try {
      // Dynamic message templating: replace {deviceId}, {metric}, {value}, {threshold}
      const templatedMessage = rawMessage.replace(/\{(\w+)\}/g, (match, key) => {
        if (key === 'value') return Number(evt.value).toFixed(2);
        if (key === 'deviceId') return evt.deviceId ?? 'unknown';
        if (key === 'metric') return evt.metric ?? 'unknown';
        if (key === 'threshold') return node.data?.threshold ?? '';
        return evt[key] !== undefined ? String(evt[key]) : match;
      });

      const action = {
        id: `${node.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        nodeId: node.id,
        kind,
        label: node.data?.label || 'Action Trigger',
        target: node.data?.target || node.data?.url || node.data?.phone || null,
        channel: node.data?.channel || kind,
        message: templatedMessage,
        payload: evt,
        severity: node.data?.severity || (evt.meta?.threshold ? 'critical' : 'warning'),
        triggeredAt: new Date().toISOString(),
      };

      // Check custom action handler
      if (CUSTOM_ACTION_HANDLERS.has(kind)) {
        try {
          CUSTOM_ACTION_HANDLERS.get(kind)(action, node.data);
        } catch (handlerErr) {
          errors$?.next({ nodeId: node.id, error: handlerErr.message, action, at: new Date().toISOString() });
        }
      }

      actionsSubject.next(action);
    } catch (err) {
      errors$?.next({ nodeId: node.id, error: err.message, event: evt, at: new Date().toISOString() });
    }
  };
}

/**
 * An instantiated, active RxJS pipeline runtime managing all stream subscriptions,
 * ingress routing, action triggers, event tracing, and clean teardown.
 */
export class RxJSRuntime {
  constructor(graph, ctx) {
    this.graph = graph;
    this.graphId = graph.id || null;
    this.name = graph.name || 'RxJS Runtime';
    this.isDestroyed = false;

    this.nodesById = ctx?.nodesById || new Map(graph.nodes.map((n) => [n.id, n]));
    this.outgoing = ctx?.outgoing || new Map(graph.nodes.map((n) => [n.id, []]));
    this.incoming = ctx?.incoming || new Map(graph.nodes.map((n) => [n.id, []]));
    this.topoOrder = ctx?.topoOrder || graph.nodes.map((n) => n.id);

    this.nodeIds = graph.nodes.map((n) => n.id);
    this.sourceNodeIds = graph.nodes.filter((n) => isSourceType(n.type)).map((n) => n.id);
    this.actionNodeIds = graph.nodes.filter((n) => isActionType(n.type)).map((n) => n.id);

    this.ingress$ = new Subject();
    this.actions$ = new Subject();
    this.traces$ = new Subject();
    this.errors$ = new Subject();

    this.nodeInputs = new Map();
    this.nodeStreams = new Map();
    this.subscriptions = [];

    this._initializeStreams();
  }

  _initializeStreams() {
    for (const node of this.graph.nodes) {
      this.nodeInputs.set(node.id, new Subject());
    }

    // Build node streams in topological order
    for (const id of this.topoOrder) {
      const node = this.nodesById.get(id);
      if (!node) continue;
      const in$ = this.nodeInputs.get(id);

      let out$;
      if (isSourceType(node.type)) {
        out$ = in$.pipe(
          filter((evt) => matchesSource(node, evt)),
          map((evt) => ({
            timestamp: evt.timestamp || new Date().toISOString(),
            deviceId: evt.deviceId ?? evt?.metadata?.deviceId ?? node.data?.deviceId ?? null,
            metric: evt.metric ?? evt?.metadata?.metric ?? node.data?.metric ?? null,
            unit: evt.unit ?? evt?.metadata?.unit ?? node.data?.unit ?? null,
            value: toNumber(evt.value),
            raw: evt,
            sourceNodeId: node.id,
            meta: { ...(evt.meta || {}), sourceNodeId: node.id },
          })),
          catchError((err, caught) => {
            this.errors$.next({ nodeId: id, error: err.message, at: new Date().toISOString() });
            return caught;
          })
        );
        this.nodeStreams.set(id, out$);
      } else if (isMathType(node.type)) {
        out$ = buildMathPipeline(in$, node, this.errors$);
        this.nodeStreams.set(id, out$);
      } else if (isActionType(node.type)) {
        out$ = in$;
        this.nodeStreams.set(id, out$);
        this.subscriptions.push(
          in$.subscribe({
            next: buildActionHandler(node, this.actions$, this.errors$),
            error: (err) => this.errors$.next({ nodeId: id, error: err.message, at: new Date().toISOString() }),
          })
        );
      } else {
        out$ = in$.pipe(map((evt) => evt));
        this.nodeStreams.set(id, out$);
      }

      // Tap every node stream for execution traces
      this.subscriptions.push(
        out$.subscribe({
          next: (evt) => {
            this.traces$.next({
              nodeId: id,
              type: node.type,
              at: new Date().toISOString(),
              event: evt,
            });
          },
          error: (err) => this.errors$.next({ nodeId: id, error: err.message, at: new Date().toISOString() }),
        })
      );
    }

    // Wire edges: upstream output -> downstream input
    for (const [sourceId, targets] of this.outgoing.entries()) {
      const out$ = this.nodeStreams.get(sourceId);
      if (!out$) continue;
      for (const targetId of targets) {
        const in$ = this.nodeInputs.get(targetId);
        if (!in$) continue;
        this.subscriptions.push(
          out$.subscribe({
            next: (evt) => in$.next(evt),
            error: (err) => this.errors$.next({ sourceId, targetId, error: err.message, at: new Date().toISOString() }),
          })
        );
      }
    }

    // Global ingress routes to matching sources (or directly to a targetNodeId)
    this.subscriptions.push(
      this.ingress$.subscribe({
        next: ({ targetNodeId, event }) => {
          if (targetNodeId && this.nodeInputs.has(targetNodeId)) {
            this.nodeInputs.get(targetNodeId).next(event);
            return;
          }
          for (const node of this.graph.nodes) {
            if (isSourceType(node.type) && matchesSource(node, event)) {
              this.nodeInputs.get(node.id).next(event);
            }
          }
        },
        error: (err) => this.errors$.next({ type: 'ingress_error', error: err.message, at: new Date().toISOString() }),
      })
    );
  }

  /**
   * Pushes a single event into the graph.
   */
  push(event, targetNodeId = null) {
    if (this.isDestroyed) {
      throw new Error(`Cannot push event to destroyed runtime for graph "${this.graphId || this.name}"`);
    }
    this.ingress$.next({ targetNodeId, event });
  }

  /**
   * Pushes multiple events into the graph in sequence.
   */
  pushBatch(events = []) {
    const list = Array.isArray(events) ? events : [events];
    for (const evt of list) {
      this.push(evt);
    }
  }

  /**
   * Injects an event directly into a specific node's input stream.
   */
  pushToNode(nodeId, event) {
    if (this.isDestroyed) {
      throw new Error(`Cannot push event to destroyed runtime for graph "${this.graphId || this.name}"`);
    }
    this.ingress$.next({ targetNodeId: String(nodeId), event });
  }

  /**
   * Returns the observable stream for an individual node.
   */
  getNodeStream(nodeId) {
    return this.nodeStreams.get(String(nodeId)) || null;
  }

  /**
   * Cleanly terminates all RxJS subscriptions and subjects.
   */
  destroy() {
    if (this.isDestroyed) return;
    this.isDestroyed = true;

    for (const sub of this.subscriptions) {
      try {
        sub.unsubscribe();
      } catch {}
    }
    this.subscriptions.length = 0;

    for (const subj of this.nodeInputs.values()) {
      try {
        subj.complete();
      } catch {}
    }
    this.nodeInputs.clear();

    try { this.ingress$.complete(); } catch {}
    try { this.actions$.complete(); } catch {}
    try { this.traces$.complete(); } catch {}
    try { this.errors$.complete(); } catch {}
  }
}

/**
 * Creates an instantiated runtime from a validated graph.
 */
export function createRuntime(graph, ctx) {
  return new RxJSRuntime(graph, ctx);
}

/**
 * Compiles a React Flow JSON graph into executable RxJS pipelines.
 */
export function compileGraph(input) {
  const validation = validateGraph(input);
  if (!validation.ok) {
    return { ...validation, compiled: null };
  }

  const { graph, summary } = validation;
  const nodesById = new Map(graph.nodes.map((n) => [n.id, n]));
  const outgoing = new Map(graph.nodes.map((n) => [n.id, []]));
  const incoming = new Map(graph.nodes.map((n) => [n.id, []]));

  for (const edge of graph.edges) {
    if (nodesById.has(edge.source) && nodesById.has(edge.target)) {
      outgoing.get(edge.source).push(edge.target);
      incoming.get(edge.target).push(edge.source);
    }
  }

  const compiledNodes = graph.nodes.map((node) => ({
    id: node.id,
    type: node.type,
    category: categoryOf(node.type),
    kind: node.data?.kind || node.data?.operation || node.data?.channel || null,
    inputCount: (incoming.get(node.id) || []).length,
    outputCount: (outgoing.get(node.id) || []).length,
    config: node.data,
  }));

  // Trace linear pipelines from each source node to terminal action sinks
  const pipelines = summary.sourceNodes.map((sourceId) => {
    const queue = [sourceId];
    const seen = new Set([sourceId]);
    const chain = [];
    while (queue.length > 0) {
      const id = queue.shift();
      chain.push(id);
      for (const next of outgoing.get(id) || []) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    return {
      sourceId,
      nodeIds: chain,
      terminalActionIds: chain.filter((id) => isActionType(nodesById.get(id)?.type)),
    };
  });

  const runtimeContext = { nodesById, outgoing, incoming, topoOrder: summary.topoOrder };
  const runtimeFactory = () => new RxJSRuntime(graph, runtimeContext);

  return {
    ok: true,
    errors: [],
    warnings: validation.warnings,
    graph,
    summary,
    compiled: {
      nodes: compiledNodes,
      pipelines,
      edgeCount: graph.edges.length,
      executable: true,
      engine: 'rxjs',
    },
    runtimeFactory,
  };
}

/**
 * Simulates running events against a graph without persistent state.
 */
export function simulateGraph(input, events = [], options = {}) {
  const startTime = Date.now();
  const compiled = compileGraph(input);
  if (!compiled.ok) {
    return {
      ok: false,
      errors: compiled.errors,
      warnings: compiled.warnings,
      actions: [],
      trace: [],
      stats: { eventsIn: 0, actionsOut: 0, traceCount: 0, durationMs: 0 },
    };
  }

  const runtime = compiled.runtimeFactory();
  const actions = [];
  const trace = [];
  const traceLimit = Math.max(0, Math.min(toNumber(options.traceLimit, 200), 5000));
  const maxActions = Math.max(1, Math.min(toNumber(options.maxActions, 1000), 10000));

  const subs = [];
  subs.push(
    runtime.actions$.subscribe({
      next: (a) => {
        if (actions.length < maxActions) actions.push(a);
      },
    })
  );
  subs.push(
    runtime.traces$.subscribe({
      next: (t) => {
        if (trace.length < traceLimit) trace.push(t);
      },
    })
  );

  const list = Array.isArray(events) ? events : [events];
  for (const event of list) {
    if (event && event.targetNodeId && event.payload) {
      runtime.pushToNode(String(event.targetNodeId), event.payload);
    } else {
      runtime.push(event);
    }
  }

  for (const sub of subs) {
    try {
      sub.unsubscribe();
    } catch {}
  }
  runtime.destroy();

  const durationMs = Date.now() - startTime;

  return {
    ok: true,
    errors: [],
    warnings: compiled.warnings,
    summary: compiled.summary,
    compiled: compiled.compiled,
    actions,
    trace,
    stats: {
      eventsIn: list.length,
      actionsOut: actions.length,
      traceCount: trace.length,
      durationMs,
    },
  };
}

/**
 * High-level LogicCompiler class providing static methods and registry hooks.
 */
export class LogicCompiler {
  static parse(input) {
    return parseReactFlow(input);
  }

  static validate(input) {
    return validateGraph(input);
  }

  static normalize(input) {
    return normalizeGraph(input);
  }

  static compile(input) {
    return compileGraph(input);
  }

  static simulate(input, events, options) {
    return simulateGraph(input, events, options);
  }

  static createRuntime(graph, ctx) {
    return createRuntime(graph, ctx);
  }

  static registerMathOperation(kind, fn) {
    if (typeof fn !== 'function') throw new TypeError('Math operation handler must be a function');
    CUSTOM_MATH_OPERATIONS.set(String(kind).trim(), fn);
  }

  static unregisterMathOperation(kind) {
    CUSTOM_MATH_OPERATIONS.delete(String(kind).trim());
  }

  static registerActionHandler(channel, fn) {
    if (typeof fn !== 'function') throw new TypeError('Action handler must be a function');
    CUSTOM_ACTION_HANDLERS.set(String(channel).trim(), fn);
  }

  static unregisterActionHandler(channel) {
    CUSTOM_ACTION_HANDLERS.delete(String(channel).trim());
  }

  static registerNodeHandler(type, fn) {
    if (typeof fn !== 'function') throw new TypeError('Node handler must be a function');
    CUSTOM_NODE_HANDLERS.set(String(type).trim(), fn);
  }
}

export default LogicCompiler;

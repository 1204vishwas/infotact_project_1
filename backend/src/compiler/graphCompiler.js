import { Subject } from 'rxjs';
import { filter, map, scan } from 'rxjs/operators';

const SOURCE_TYPES = new Set(['dataSource', 'source', 'sensor']);
const MATH_TYPES = new Set(['mathOperation', 'filter', 'math', 'operation']);
const ACTION_TYPES = new Set(['actionTrigger', 'action', 'trigger']);

function isSourceType(type) {
  return SOURCE_TYPES.has(String(type || ''));
}

function isMathType(type) {
  return MATH_TYPES.has(String(type || ''));
}

function isActionType(type) {
  return ACTION_TYPES.has(String(type || ''));
}

function categoryOf(type) {
  if (isSourceType(type)) return 'dataSource';
  if (isMathType(type)) return 'mathOperation';
  if (isActionType(type)) return 'actionTrigger';
  return 'unknown';
}

function compare(operator, left, right) {
  switch (operator) {
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
    default:
      return left > right;
  }
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function normalizeGraph(input) {
  const graph = input && typeof input === 'object' ? input : {};
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph.edges) ? graph.edges : [];
  return {
    version: graph.version ?? 1,
    nodes: nodes.map((n) => ({
      id: String(n?.id ?? ''),
      type: String(n?.type ?? ''),
      position: n?.position && typeof n.position === 'object' ? n.position : { x: 0, y: 0 },
      data: n?.data && typeof n.data === 'object' ? { ...n.data } : {},
    })),
    edges: edges.map((e, i) => ({
      id: String(e?.id ?? `e-${i}`),
      source: String(e?.source ?? ''),
      target: String(e?.target ?? ''),
      sourceHandle: e?.sourceHandle ?? null,
      targetHandle: e?.targetHandle ?? null,
      type: e?.type ?? 'default',
    })),
  };
}

export function validateGraph(input) {
  const graph = normalizeGraph(input);
  const errors = [];
  const warnings = [];

  if (!Array.isArray(input?.nodes)) errors.push('Graph must include a nodes array');
  if (!Array.isArray(input?.edges)) errors.push('Graph must include an edges array');

  const nodeMap = new Map();
  for (const node of graph.nodes) {
    if (!node.id) {
      errors.push('Every node must have an id');
      continue;
    }
    if (nodeMap.has(node.id)) {
      errors.push(`Duplicate node id: ${node.id}`);
      continue;
    }
    if (categoryOf(node.type) === 'unknown') {
      errors.push(`Unsupported node type "${node.type}" on node ${node.id}`);
    }
    nodeMap.set(node.id, node);
  }

  const incoming = new Map(graph.nodes.map((n) => [n.id, 0]));
  const outgoing = new Map(graph.nodes.map((n) => [n.id, 0]));
  for (const edge of graph.edges) {
    if (!edge.source || !edge.target) {
      errors.push(`Edge ${edge.id} must have source and target`);
      continue;
    }
    if (!nodeMap.has(edge.source)) errors.push(`Edge ${edge.id} references missing source node ${edge.source}`);
    if (!nodeMap.has(edge.target)) errors.push(`Edge ${edge.id} references missing target node ${edge.target}`);
    if (nodeMap.has(edge.source) && nodeMap.has(edge.target)) {
      outgoing.set(edge.source, (outgoing.get(edge.source) || 0) + 1);
      incoming.set(edge.target, (incoming.get(edge.target) || 0) + 1);
      const s = nodeMap.get(edge.source);
      const t = nodeMap.get(edge.target);
      if (isActionType(s.type)) errors.push(`Action node ${s.id} cannot be a source of edge ${edge.id}`);
      if (isSourceType(t.type)) warnings.push(`Edge ${edge.id} targets data source ${t.id}; sources are expected to be roots`);
    }
  }

  for (const node of graph.nodes) {
    const cat = categoryOf(node.type);
    if (cat === 'dataSource' && (incoming.get(node.id) || 0) > 0) {
      warnings.push(`Data source ${node.id} has incoming edges; upstream inputs will be ignored`);
    }
    if (cat === 'actionTrigger' && (outgoing.get(node.id) || 0) > 0) {
      warnings.push(`Action trigger ${node.id} has outgoing edges; actions are terminal sinks`);
    }
    if ((isMathType(node.type) || isActionType(node.type)) && (incoming.get(node.id) || 0) === 0) {
      warnings.push(`Node ${node.id} (${node.type}) has no input connection`);
    }
  }

  // cycle detection (Kahn)
  const indeg = new Map(graph.nodes.map((n) => [n.id, 0]));
  const adj = new Map(graph.nodes.map((n) => [n.id, []]));
  for (const edge of graph.edges) {
    if (nodeMap.has(edge.source) && nodeMap.has(edge.target)) {
      adj.get(edge.source).push(edge.target);
      indeg.set(edge.target, (indeg.get(edge.target) || 0) + 1);
    }
  }
  const queue = [];
  for (const [id, d] of indeg.entries()) if (d === 0) queue.push(id);
  let visited = 0;
  const topo = [];
  while (queue.length) {
    const id = queue.shift();
    topo.push(id);
    visited += 1;
    for (const nb of adj.get(id) || []) {
      indeg.set(nb, (indeg.get(nb) || 0) - 1);
      if (indeg.get(nb) === 0) queue.push(nb);
    }
  }
  if (visited !== graph.nodes.length && graph.nodes.length > 0) {
    errors.push('Graph contains a cycle; pipelines must be acyclic');
  }

  const sourceNodes = graph.nodes.filter((n) => isSourceType(n.type)).map((n) => n.id);
  if (graph.nodes.length > 0 && sourceNodes.length === 0) {
    warnings.push('No data source nodes found; runtime input must be pushed manually by node id');
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    graph,
    summary: {
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
      sourceNodes,
      mathNodes: graph.nodes.filter((n) => isMathType(n.type)).map((n) => n.id),
      actionNodes: graph.nodes.filter((n) => isActionType(n.type)).map((n) => n.id),
      topoOrder: visited === graph.nodes.length ? topo : [],
    },
  };
}

function buildMathPipeline(stream$, node) {
  const kind = String(node.data?.kind || node.data?.operation || node.type || 'passthrough');
  if (kind === 'movingAverage') {
    const windowSize = Math.max(1, Math.floor(toNumber(node.data?.windowSize, 5)));
    return stream$.pipe(
      scan((acc, evt) => {
        const values = acc.values.concat(toNumber(evt.value));
        const window = values.slice(-windowSize);
        const avg = window.reduce((a, b) => a + b, 0) / window.length;
        return { values: window, out: { ...evt, value: avg, meta: { ...(evt.meta || {}), movingAverage: { windowSize, count: window.length } } } };
      }, { values: [], out: null }),
      filter((s) => s.out != null),
      map((s) => s.out)
    );
  }
  if (kind === 'threshold' || kind === 'comparison' || node.type === 'filter') {
    const operator = String(node.data?.operator || '>');
    const threshold = toNumber(node.data?.threshold, 80);
    const field = String(node.data?.field || 'value');
    return stream$.pipe(
      filter((evt) => compare(operator, toNumber(evt[field], toNumber(evt.value)), threshold)),
      map((evt) => ({
        ...evt,
        meta: { ...(evt.meta || {}), threshold: { operator, threshold, field, matched: true, nodeId: node.id } },
      }))
    );
  }
  if (kind === 'scale') {
    const factor = toNumber(node.data?.factor, 1);
    const offset = toNumber(node.data?.offset, 0);
    return stream$.pipe(map((evt) => ({ ...evt, value: toNumber(evt.value) * factor + offset })));
  }
  if (kind === 'delta') {
    return stream$.pipe(
      scan((acc, evt) => {
        const value = toNumber(evt.value);
        const delta = acc.hasPrev ? value - acc.prev : 0;
        return { hasPrev: true, prev: value, out: { ...evt, value, delta, meta: { ...(evt.meta || {}), delta } } };
      }, { hasPrev: false, prev: 0, out: null }),
      filter((s) => s.out != null),
      map((s) => s.out)
    );
  }
  if (kind === 'passthrough' || kind === 'math' || kind === 'operation') {
    return stream$.pipe(map((evt) => ({ ...evt })));
  }
  return stream$.pipe(map((evt) => ({ ...evt, meta: { ...(evt.meta || {}), unknownMathKind: kind } })));
}

function buildActionHandler(node, actionsSubject) {
  const kind = String(node.data?.kind || node.data?.channel || 'log');
  return (evt) => {
    const action = {
      id: `${node.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      nodeId: node.id,
      kind,
      label: node.data?.label || 'Action Trigger',
      target: node.data?.target || node.data?.url || node.data?.phone || null,
      channel: node.data?.channel || kind,
      message: node.data?.message || `Alert from ${node.id}`,
      payload: evt,
      triggeredAt: new Date().toISOString(),
    };
    actionsSubject.next(action);
  };
}

function matchesSource(node, event) {
  if (!event || typeof event !== 'object') return false;
  const deviceId = node.data?.deviceId;
  const metric = node.data?.metric;
  const evDevice = event.deviceId ?? event?.metadata?.deviceId;
  const evMetric = event.metric ?? event?.metadata?.metric;
  if (deviceId && String(evDevice) !== String(deviceId)) return false;
  if (metric && String(evMetric) !== String(metric)) return false;
  return true;
}

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

  const pipelines = summary.sourceNodes.map((sourceId) => {
    const queue = [sourceId];
    const seen = new Set([sourceId]);
    const chain = [];
    while (queue.length) {
      const id = queue.shift();
      chain.push(id);
      for (const next of outgoing.get(id) || []) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    return { sourceId, nodeIds: chain, terminalActionIds: chain.filter((id) => isActionType(nodesById.get(id)?.type)) };
  });

  const runtimeFactory = () => createRuntime(graph, { nodesById, outgoing, incoming, topoOrder: summary.topoOrder });

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

export function createRuntime(graph, ctx) {
  const nodesById = ctx?.nodesById || new Map(graph.nodes.map((n) => [n.id, n]));
  const outgoing = ctx?.outgoing || new Map(graph.nodes.map((n) => [n.id, []]));
  const incoming = ctx?.incoming || new Map(graph.nodes.map((n) => [n.id, []]));
  const topoOrder = ctx?.topoOrder || graph.nodes.map((n) => n.id);

  const ingress$ = new Subject();
  const actions$ = new Subject();
  const traces$ = new Subject();
  const nodeInputs = new Map();
  const nodeStreams = new Map();
  const subscriptions = [];

  for (const node of graph.nodes) {
    nodeInputs.set(node.id, new Subject());
  }

  // build streams in topological order
  for (const id of topoOrder) {
    const node = nodesById.get(id);
    if (!node) continue;
    const in$ = nodeInputs.get(id);
    if (isSourceType(node.type)) {
      const out$ = in$.pipe(
        filter((evt) => matchesSource(node, evt)),
        map((evt) => ({
          timestamp: evt.timestamp || new Date().toISOString(),
          deviceId: evt.deviceId ?? evt?.metadata?.deviceId ?? node.data?.deviceId ?? null,
          metric: evt.metric ?? evt?.metadata?.metric ?? node.data?.metric ?? null,
          unit: evt.unit ?? evt?.metadata?.unit ?? node.data?.unit ?? null,
          value: toNumber(evt.value),
          raw: evt,
          sourceNodeId: node.id,
        }))
      );
      nodeStreams.set(id, out$);
    } else if (isMathType(node.type)) {
      nodeStreams.set(id, buildMathPipeline(in$, node));
    } else if (isActionType(node.type)) {
      nodeStreams.set(id, in$);
      subscriptions.push(in$.subscribe({ next: buildActionHandler(node, actions$) }));
    } else {
      nodeStreams.set(id, in$.pipe(map((evt) => evt)));
    }

    subscriptions.push(
      nodeStreams.get(id).subscribe({
        next: (evt) => traces$.next({ nodeId: id, type: node.type, at: new Date().toISOString(), event: evt }),
      })
    );
  }

  // wire edges: upstream output -> downstream input
  for (const [sourceId, targets] of outgoing.entries()) {
    const out$ = nodeStreams.get(sourceId);
    if (!out$) continue;
    for (const targetId of targets) {
      const in$ = nodeInputs.get(targetId);
      if (!in$) continue;
      subscriptions.push(out$.subscribe({ next: (evt) => in$.next(evt) }));
    }
  }

  // global ingress routes to source nodes (and optionally any node by id via pushToNode)
  subscriptions.push(
    ingress$.subscribe({
      next: ({ targetNodeId, event }) => {
        if (targetNodeId && nodeInputs.has(targetNodeId)) {
          nodeInputs.get(targetNodeId).next(event);
          return;
        }
        for (const node of graph.nodes) {
          if (isSourceType(node.type) && matchesSource(node, event)) {
            nodeInputs.get(node.id).next(event);
          }
        }
      },
    })
  );

  const push = (event, targetNodeId = null) => ingress$.next({ targetNodeId, event });
  const pushToNode = (nodeId, event) => ingress$.next({ targetNodeId: nodeId, event });

  const destroy = () => {
    for (const sub of subscriptions) {
      try { sub.unsubscribe(); } catch {}
    }
    for (const subj of nodeInputs.values()) {
      try { subj.complete(); } catch {}
    }
    try { ingress$.complete(); } catch {}
    try { actions$.complete(); } catch {}
    try { traces$.complete(); } catch {}
  };

  return {
    graphId: graph.id || null,
    nodeIds: graph.nodes.map((n) => n.id),
    sourceNodeIds: graph.nodes.filter((n) => isSourceType(n.type)).map((n) => n.id),
    actionNodeIds: graph.nodes.filter((n) => isActionType(n.type)).map((n) => n.id),
    ingress$,
    actions$,
    traces$,
    push,
    pushToNode,
    destroy,
  };
}

export function simulateGraph(input, events = [], options = {}) {
  const compiled = compileGraph(input);
  if (!compiled.ok) {
    return { ok: false, errors: compiled.errors, warnings: compiled.warnings, actions: [], trace: [] };
  }

  const runtime = compiled.runtimeFactory();
  const actions = [];
  const trace = [];
  const traceLimit = Math.max(0, Math.min(toNumber(options.traceLimit, 200), 2000));
  const subs = [];
  subs.push(runtime.actions$.subscribe({ next: (a) => actions.push(a) }));
  subs.push(runtime.traces$.subscribe({ next: (t) => { if (trace.length < traceLimit) trace.push(t); } }));

  const list = Array.isArray(events) ? events : [events];
  for (const event of list) {
    if (event && event.targetNodeId && event.payload) {
      runtime.pushToNode(String(event.targetNodeId), event.payload);
    } else {
      runtime.push(event);
    }
  }

  // allow synchronous propagation; RxJS Subjects are sync by default
  for (const sub of subs) sub.unsubscribe();
  runtime.destroy();

  return {
    ok: true,
    errors: [],
    warnings: compiled.warnings,
    summary: compiled.summary,
    compiled: compiled.compiled,
    actions,
    trace,
    stats: { eventsIn: list.length, actionsOut: actions.length, traceCount: trace.length },
  };
}

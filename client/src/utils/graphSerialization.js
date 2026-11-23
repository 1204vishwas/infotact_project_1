/**
 * Produce the canonical graph JSON accepted by the `/api/graphs/*` endpoints.
 *
 * React Flow keeps runtime-only fields (selection, measured dimensions,
 * internal node state) on nodes and edges. Only the fields the compiler needs
 * are exported so the payload stays stable and reviewable.
 */
export function serializeGraph({ nodes = [], edges = [] } = {}, now = new Date()) {
  const timestamp = now instanceof Date ? now : new Date(now);

  return {
    version: 2,
    exportedAt: timestamp.toISOString(),
    nodes: nodes.map(({ id, type, position, data }) => ({ id, type, position, data })),
    edges: edges.map(({ id, source, target, sourceHandle, targetHandle, type }) => ({
      id,
      source,
      target,
      sourceHandle: sourceHandle ?? null,
      targetHandle: targetHandle ?? null,
      type: type ?? 'default',
    })),
  };
}
